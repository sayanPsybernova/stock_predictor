"""
Options ML API Routes

Endpoints for options direction prediction using ML model.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
import logging

from app.models.options_model import options_predictor
from app.features.options import options_feature_generator

logger = logging.getLogger(__name__)
router = APIRouter()


class OptionChainData(BaseModel):
    """Request body for option chain prediction."""
    symbol: str
    spotPrice: float
    chain: List[Dict[str, Any]]
    metrics: Dict[str, Any]
    topOIStrikes: Optional[Dict[str, Any]] = None
    oiChangeAnalysis: Optional[Dict[str, Any]] = None


class PredictionResponse(BaseModel):
    """Response for prediction endpoint."""
    symbol: str
    direction: str
    probability: float
    confidence: str
    score: int
    reasoning: List[str]
    model_version: str


class FeaturesResponse(BaseModel):
    """Response for features endpoint."""
    symbol: str
    features: Dict[str, float]
    feature_count: int


@router.post("/predict", response_model=PredictionResponse)
async def predict_direction(data: OptionChainData):
    """
    Predict market direction from option chain data.

    Uses XGBoost model trained on historical options data patterns.
    """
    try:
        # Convert to dict for feature generation
        option_data = data.dict()

        # Get prediction
        prediction = options_predictor.predict_direction(option_data)

        return PredictionResponse(
            symbol=data.symbol,
            direction=prediction["direction"],
            probability=prediction["probability"],
            confidence=prediction["confidence"],
            score=prediction["score"],
            reasoning=prediction["reasoning"],
            model_version=prediction["model_version"]
        )

    except Exception as e:
        logger.error(f"Prediction error for {data.symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/features", response_model=FeaturesResponse)
async def get_features(data: OptionChainData):
    """
    Get computed ML features from option chain data.

    Returns all features used by the ML model for transparency.
    """
    try:
        option_data = data.dict()

        # Generate features
        features_df = options_feature_generator.generate_features(option_data)

        if features_df is None or len(features_df) == 0:
            raise HTTPException(
                status_code=400,
                detail="Could not generate features from provided data"
            )

        # Convert to dict
        features = features_df.iloc[0].to_dict()

        return FeaturesResponse(
            symbol=data.symbol,
            features=features,
            feature_count=len(features)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Feature generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Feature generation failed: {str(e)}")


@router.get("/model/info")
async def get_model_info():
    """
    Get information about the options ML model.
    """
    return {
        "model_type": "XGBoost Classifier",
        "version": options_predictor.version,
        "is_loaded": options_predictor.is_loaded(),
        "trained_at": options_predictor.trained_at,
        "metrics": options_predictor.metrics,
        "feature_count": len(options_feature_generator.FEATURE_COLUMNS),
        "features": options_feature_generator.FEATURE_COLUMNS
    }


@router.get("/model/feature-importance")
async def get_feature_importance():
    """
    Get feature importance from the trained model.
    """
    if not options_predictor.is_loaded():
        raise HTTPException(
            status_code=503,
            detail="Options model not loaded"
        )

    importance = options_predictor.get_feature_importance()

    return {
        "feature_importance": importance,
        "top_features": list(importance.keys())[:10]
    }
