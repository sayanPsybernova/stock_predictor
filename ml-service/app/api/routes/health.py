from fastapi import APIRouter
from datetime import datetime
from pathlib import Path
import joblib

from app.config import MODEL_FILE, CURRENT_MODEL_VERSION

router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint for the ML service."""
    model_loaded = MODEL_FILE.exists()
    model_info = None

    if model_loaded:
        try:
            model_data = joblib.load(MODEL_FILE)
            model_info = {
                "version": CURRENT_MODEL_VERSION,
                "trained_at": model_data.get("trained_at", "unknown"),
                "metrics": model_data.get("metrics", {})
            }
        except Exception:
            model_loaded = False

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "model_loaded": model_loaded,
        "model_info": model_info,
        "version": CURRENT_MODEL_VERSION
    }

@router.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Stock Analysis ML Service",
        "version": CURRENT_MODEL_VERSION,
        "status": "running",
        "endpoints": {
            "health": "/health",
            "predict_stock": "/api/v1/predict/stock",
            "predict_batch": "/api/v1/predict/batch",
            "train": "/api/v1/train",
            "metrics": "/api/v1/model/metrics"
        }
    }
