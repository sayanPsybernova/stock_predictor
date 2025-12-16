"""
Pro Trader Prediction API Routes
Provides endpoints for ML predictions using the trained XGBoost model
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import pandas as pd
import yfinance as yf
import logging
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from models.pro_trainer import ProTrader, DailyTrainer, NIFTY50_SYMBOLS
from services.scheduler import AsyncTrainingScheduler, get_scheduler

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/api/v1/pro", tags=["Pro Trader"])

# Global instances
_pro_trader: Optional[ProTrader] = None
_async_scheduler: Optional[AsyncTrainingScheduler] = None


def get_pro_trader() -> ProTrader:
    """Get or create ProTrader instance"""
    global _pro_trader
    if _pro_trader is None:
        _pro_trader = ProTrader()
        try:
            _pro_trader.load()
            logger.info("Loaded existing Pro Trader model")
        except FileNotFoundError:
            logger.warning("No trained model found - training required")
    return _pro_trader


def get_async_scheduler() -> AsyncTrainingScheduler:
    """Get or create async scheduler"""
    global _async_scheduler
    if _async_scheduler is None:
        _async_scheduler = AsyncTrainingScheduler()
    return _async_scheduler


# Request/Response Models
class PredictionRequest(BaseModel):
    symbol: str = Field(..., description="Stock symbol (e.g., RELIANCE.NS, ^NSEI)")
    include_features: bool = Field(default=False, description="Include feature values in response")


class TrainingRequest(BaseModel):
    symbols: Optional[List[str]] = Field(default=None, description="Symbols to train on")
    symbols_count: int = Field(default=30, description="Number of NIFTY50 symbols to use")
    period: str = Field(default="5y", description="Historical period")
    force: bool = Field(default=False, description="Force training even if recent")


class PredictionResponse(BaseModel):
    symbol: str
    probability: float
    signal: str
    confidence: str
    direction: str
    reasoning: List[str]
    pattern_score: float
    bullish_patterns: float
    bearish_patterns: float
    feature_importance: Optional[Dict[str, float]] = None
    model_version: Optional[str] = None


class TrainingResponse(BaseModel):
    status: str
    message: str
    metrics: Optional[Dict[str, Any]] = None
    version: Optional[str] = None


class SchedulerStatus(BaseModel):
    is_running: bool
    training_in_progress: bool
    scheduled_time: str
    next_training: Optional[str]
    last_training: Optional[str]
    symbols_count: int
    period: str


# Helper functions
def fetch_stock_data(symbol: str, period: str = '1y') -> pd.DataFrame:
    """Fetch stock data from Yahoo Finance"""
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period)

        if df.empty:
            raise ValueError(f"No data found for {symbol}")

        df.columns = [c.lower() for c in df.columns]
        df = df[['open', 'high', 'low', 'close', 'volume']].copy()
        df.index.name = 'date'

        return df

    except Exception as e:
        logger.error(f"Error fetching data for {symbol}: {e}")
        raise HTTPException(status_code=400, detail=f"Could not fetch data for {symbol}: {str(e)}")


# API Endpoints
@router.get("/health")
async def health_check():
    """Check if pro trader service is healthy"""
    pro_trader = get_pro_trader()
    model_loaded = pro_trader.model is not None

    return {
        "status": "healthy" if model_loaded else "model_not_loaded",
        "model_loaded": model_loaded,
        "model_metadata": pro_trader.model_metadata if model_loaded else None
    }


@router.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Get ML prediction for a stock

    The prediction is based on:
    - 40+ technical indicators
    - 50+ candlestick patterns
    - Rolling statistics and momentum
    - Volume analysis

    Returns probability of upward movement (0-1)
    """
    pro_trader = get_pro_trader()

    if pro_trader.model is None:
        raise HTTPException(
            status_code=503,
            detail="Model not trained. Please train the model first using /train endpoint"
        )

    try:
        # Fetch historical data (need enough for indicators)
        df = fetch_stock_data(request.symbol, period='1y')

        if len(df) < 252:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient historical data for {request.symbol}. Need at least 252 trading days."
            )

        # Get prediction
        prediction = pro_trader.predict(df)

        return PredictionResponse(
            symbol=request.symbol,
            probability=prediction['probability'],
            signal=prediction['signal'],
            confidence=prediction['confidence'],
            direction=prediction['direction'],
            reasoning=prediction['reasoning'],
            pattern_score=prediction['pattern_score'],
            bullish_patterns=prediction['bullish_patterns'],
            bearish_patterns=prediction['bearish_patterns'],
            feature_importance=prediction['feature_importance'] if request.include_features else None,
            model_version=pro_trader.model_metadata.get('version')
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction error for {request.symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.get("/predict/{symbol}")
async def predict_simple(symbol: str):
    """Simple GET endpoint for prediction"""
    return await predict(PredictionRequest(symbol=symbol))


@router.post("/train", response_model=TrainingResponse)
async def train_model(request: TrainingRequest, background_tasks: BackgroundTasks):
    """
    Train the Pro Trader model

    This will:
    1. Fetch 5 years of historical data for specified symbols
    2. Extract 150+ features (indicators + patterns)
    3. Train XGBoost classifier
    4. Save model with version

    Training runs in background and may take 10-30 minutes depending on symbols count.
    """
    scheduler = get_async_scheduler()
    status = scheduler.get_status()

    if status['training_in_progress']:
        return TrainingResponse(
            status="in_progress",
            message="Training is already in progress. Please wait."
        )

    # Determine symbols
    symbols = request.symbols
    if symbols is None:
        symbols = NIFTY50_SYMBOLS[:request.symbols_count]

    # Run training in background
    async def train_task():
        try:
            result = await scheduler.force_train(symbols)
            logger.info(f"Background training completed: {result}")
        except Exception as e:
            logger.error(f"Background training failed: {e}")

    background_tasks.add_task(train_task)

    return TrainingResponse(
        status="started",
        message=f"Training started in background with {len(symbols)} symbols. "
                f"This may take 10-30 minutes. Check /scheduler/status for progress."
    )


@router.post("/train/sync", response_model=TrainingResponse)
async def train_model_sync(request: TrainingRequest):
    """
    Train model synchronously (waits for completion)
    Warning: This may take a long time!
    """
    pro_trader = get_pro_trader()

    symbols = request.symbols
    if symbols is None:
        symbols = NIFTY50_SYMBOLS[:request.symbols_count]

    try:
        metrics = pro_trader.train(symbols=symbols, period=request.period)
        pro_trader.save()

        return TrainingResponse(
            status="success",
            message=f"Model trained successfully on {len(symbols)} symbols",
            metrics=metrics,
            version=pro_trader.model_metadata.get('version')
        )

    except Exception as e:
        logger.error(f"Training failed: {e}")
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


@router.get("/model/info")
async def get_model_info():
    """Get information about the current model"""
    pro_trader = get_pro_trader()

    if pro_trader.model is None:
        return {
            "loaded": False,
            "message": "No model loaded"
        }

    return {
        "loaded": True,
        "version": pro_trader.model_metadata.get('version'),
        "trained_at": pro_trader.model_metadata.get('trained_at'),
        "period": pro_trader.model_metadata.get('period'),
        "symbols_count": len(pro_trader.model_metadata.get('symbols_used', [])),
        "feature_count": pro_trader.model_metadata.get('metrics', {}).get('feature_count'),
        "metrics": pro_trader.model_metadata.get('metrics'),
        "top_features": pro_trader.get_feature_importance(top_n=10)
    }


@router.get("/model/features")
async def get_feature_importance(top_n: int = 30):
    """Get feature importance from the trained model"""
    pro_trader = get_pro_trader()

    if pro_trader.model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    importance = pro_trader.get_feature_importance(top_n=top_n)

    return {
        "feature_count": len(pro_trader.feature_names),
        "top_features": importance
    }


@router.get("/scheduler/status", response_model=SchedulerStatus)
async def get_scheduler_status():
    """Get training scheduler status"""
    scheduler = get_async_scheduler()
    return scheduler.get_status()


@router.post("/scheduler/start")
async def start_scheduler():
    """Start the daily training scheduler"""
    scheduler = get_async_scheduler()
    await scheduler.start()

    return {
        "status": "started",
        "message": "Daily training scheduler started"
    }


@router.post("/scheduler/stop")
async def stop_scheduler():
    """Stop the daily training scheduler"""
    scheduler = get_async_scheduler()
    await scheduler.stop()

    return {
        "status": "stopped",
        "message": "Daily training scheduler stopped"
    }


@router.get("/symbols")
async def get_available_symbols():
    """Get list of available symbols for training"""
    return {
        "nifty50": NIFTY50_SYMBOLS,
        "indices": ['^NSEI', '^NSEBANK', '^BSESN'],
        "count": len(NIFTY50_SYMBOLS)
    }


# Batch prediction endpoint
class BatchPredictionRequest(BaseModel):
    symbols: List[str] = Field(..., description="List of symbols to predict")


@router.post("/predict/batch")
async def batch_predict(request: BatchPredictionRequest):
    """Get predictions for multiple symbols"""
    pro_trader = get_pro_trader()

    if pro_trader.model is None:
        raise HTTPException(status_code=503, detail="Model not trained")

    results = []
    errors = []

    for symbol in request.symbols:
        try:
            df = fetch_stock_data(symbol, period='1y')
            if len(df) >= 252:
                prediction = pro_trader.predict(df)
                results.append({
                    'symbol': symbol,
                    'probability': prediction['probability'],
                    'signal': prediction['signal'],
                    'direction': prediction['direction']
                })
            else:
                errors.append({'symbol': symbol, 'error': 'Insufficient data'})
        except Exception as e:
            errors.append({'symbol': symbol, 'error': str(e)})

    return {
        'predictions': results,
        'errors': errors,
        'success_count': len(results),
        'error_count': len(errors)
    }
