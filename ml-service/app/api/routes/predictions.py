from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging

from app.models.xgboost_model import GainerPredictor
from app.features.pipeline import FeaturePipeline
from app.data.yahoo_fetcher import fetcher
from app.config import MODEL_FILE

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize model and pipeline
predictor = GainerPredictor()
pipeline = FeaturePipeline()


class StockPredictionRequest(BaseModel):
    symbol: str
    include_features: bool = False


class BatchPredictionRequest(BaseModel):
    symbols: List[str]
    top_n: int = 10
    min_probability: float = 0.5


class PredictionResponse(BaseModel):
    symbol: str
    probability: float
    confidence: str
    predicted_class: int
    reasoning: List[str]
    features: Optional[dict] = None


class BatchPredictionResponse(BaseModel):
    predictions: List[PredictionResponse]
    model_version: str
    generated_at: str
    total_analyzed: int


@router.post("/predict/stock", response_model=PredictionResponse)
async def predict_stock(request: StockPredictionRequest):
    """
    Predict if a single stock will gain 5%+ in the next trading day.
    """
    try:
        # Load model if not loaded
        if not predictor.is_loaded():
            if not MODEL_FILE.exists():
                raise HTTPException(
                    status_code=503,
                    detail="Model not trained yet. Please run /api/v1/train first."
                )
            predictor.load(MODEL_FILE)

        # Fetch stock data
        df = fetcher.get_historical_data(request.symbol, period="1y")
        if df is None or len(df) < 50:
            raise HTTPException(
                status_code=404,
                detail=f"Insufficient data for {request.symbol}"
            )

        # Generate features
        features = pipeline.generate_features(df)
        if features is None:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate features"
            )

        # Get latest features (last row)
        latest_features = features.iloc[-1:].copy()

        # Predict
        probability = predictor.predict_proba(latest_features)[0]
        predicted_class = 1 if probability >= 0.5 else 0

        # Determine confidence
        if probability >= 0.7 or probability <= 0.3:
            confidence = "high"
        elif probability >= 0.6 or probability <= 0.4:
            confidence = "medium"
        else:
            confidence = "low"

        # Generate reasoning
        reasoning = predictor.generate_reasoning(latest_features.iloc[0], probability)

        response = PredictionResponse(
            symbol=request.symbol,
            probability=round(probability, 4),
            confidence=confidence,
            predicted_class=predicted_class,
            reasoning=reasoning,
            features=latest_features.iloc[0].to_dict() if request.include_features else None
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction error for {request.symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict/batch", response_model=BatchPredictionResponse)
async def predict_batch(request: BatchPredictionRequest):
    """
    Predict top gainer probabilities for multiple stocks.
    Returns top N stocks sorted by probability.
    """
    try:
        # Load model if not loaded
        if not predictor.is_loaded():
            if not MODEL_FILE.exists():
                raise HTTPException(
                    status_code=503,
                    detail="Model not trained yet. Please run /api/v1/train first."
                )
            predictor.load(MODEL_FILE)

        predictions = []

        for symbol in request.symbols:
            try:
                # Fetch data
                df = fetcher.get_historical_data(symbol, period="1y")
                if df is None or len(df) < 50:
                    continue

                # Generate features
                features = pipeline.generate_features(df)
                if features is None:
                    continue

                latest_features = features.iloc[-1:].copy()

                # Predict
                probability = predictor.predict_proba(latest_features)[0]

                if probability < request.min_probability:
                    continue

                predicted_class = 1 if probability >= 0.5 else 0

                # Confidence
                if probability >= 0.7:
                    confidence = "high"
                elif probability >= 0.6:
                    confidence = "medium"
                else:
                    confidence = "low"

                # Generate reasoning
                reasoning = predictor.generate_reasoning(latest_features.iloc[0], probability)

                predictions.append(PredictionResponse(
                    symbol=symbol,
                    probability=round(probability, 4),
                    confidence=confidence,
                    predicted_class=predicted_class,
                    reasoning=reasoning,
                    features=None
                ))

            except Exception as e:
                logger.warning(f"Skipping {symbol}: {str(e)}")
                continue

        # Sort by probability (descending) and take top N
        predictions.sort(key=lambda x: x.probability, reverse=True)
        top_predictions = predictions[:request.top_n]

        return BatchPredictionResponse(
            predictions=top_predictions,
            model_version=predictor.version,
            generated_at=datetime.utcnow().isoformat(),
            total_analyzed=len(request.symbols)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/model/metrics")
async def get_model_metrics():
    """Get current model performance metrics."""
    if not predictor.is_loaded():
        if MODEL_FILE.exists():
            predictor.load(MODEL_FILE)
        else:
            raise HTTPException(
                status_code=503,
                detail="Model not trained yet"
            )

    return {
        "version": predictor.version,
        "trained_at": predictor.trained_at,
        "metrics": predictor.metrics,
        "feature_importance": predictor.get_feature_importance()
    }
