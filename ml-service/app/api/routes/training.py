from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import logging
import uuid

from app.training.trainer import ModelTrainer
from app.config import MODEL_FILE

router = APIRouter()
logger = logging.getLogger(__name__)

# Track training jobs
training_jobs = {}


class TrainRequest(BaseModel):
    force: bool = False
    symbols: Optional[list] = None  # If None, use default Nifty 500 stocks
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class TrainResponse(BaseModel):
    status: str
    job_id: str
    message: str


class TrainStatusResponse(BaseModel):
    status: str
    progress: float
    message: str
    metrics: Optional[dict] = None
    error: Optional[str] = None


async def run_training(job_id: str, request: TrainRequest):
    """Background task for model training."""
    try:
        training_jobs[job_id]["status"] = "running"
        training_jobs[job_id]["progress"] = 0.1
        training_jobs[job_id]["message"] = "Initializing trainer..."

        trainer = ModelTrainer()

        # Update progress callback
        def progress_callback(progress: float, message: str):
            training_jobs[job_id]["progress"] = progress
            training_jobs[job_id]["message"] = message

        trainer.set_progress_callback(progress_callback)

        # Run training
        metrics = trainer.train(
            symbols=request.symbols,
            start_date=request.start_date,
            end_date=request.end_date
        )

        training_jobs[job_id]["status"] = "completed"
        training_jobs[job_id]["progress"] = 1.0
        training_jobs[job_id]["message"] = "Training completed successfully"
        training_jobs[job_id]["metrics"] = metrics
        training_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        logger.error(f"Training failed for job {job_id}: {str(e)}")
        training_jobs[job_id]["status"] = "failed"
        training_jobs[job_id]["error"] = str(e)
        training_jobs[job_id]["message"] = f"Training failed: {str(e)}"


@router.post("/train", response_model=TrainResponse)
async def start_training(request: TrainRequest, background_tasks: BackgroundTasks):
    """
    Start model training in the background.

    Args:
        force: Force retrain even if recent model exists
        symbols: Optional list of symbols (defaults to Nifty 500)
        start_date: Training data start date (default: 5 years ago)
        end_date: Training data end date (default: today)
    """
    # Check if training already in progress
    for job_id, job in training_jobs.items():
        if job["status"] == "running":
            raise HTTPException(
                status_code=409,
                detail=f"Training already in progress. Job ID: {job_id}"
            )

    # Check if recent model exists and force is False
    if not request.force and MODEL_FILE.exists():
        # Check model age
        import os
        model_age_days = (datetime.now().timestamp() - os.path.getmtime(MODEL_FILE)) / 86400
        if model_age_days < 7:  # Less than 7 days old
            raise HTTPException(
                status_code=400,
                detail=f"Model is only {model_age_days:.1f} days old. Use force=true to retrain."
            )

    # Create new job
    job_id = str(uuid.uuid4())[:8]
    training_jobs[job_id] = {
        "status": "pending",
        "progress": 0.0,
        "message": "Job queued",
        "started_at": datetime.utcnow().isoformat(),
        "metrics": None,
        "error": None
    }

    # Start background training
    background_tasks.add_task(run_training, job_id, request)

    return TrainResponse(
        status="started",
        job_id=job_id,
        message="Training job started. Check /api/v1/train/status/{job_id} for progress."
    )


@router.get("/train/status/{job_id}", response_model=TrainStatusResponse)
async def get_training_status(job_id: str):
    """Get the status of a training job."""
    if job_id not in training_jobs:
        raise HTTPException(
            status_code=404,
            detail=f"Training job {job_id} not found"
        )

    job = training_jobs[job_id]

    return TrainStatusResponse(
        status=job["status"],
        progress=job["progress"],
        message=job["message"],
        metrics=job.get("metrics"),
        error=job.get("error")
    )


@router.get("/train/jobs")
async def list_training_jobs():
    """List all training jobs."""
    return {
        "jobs": [
            {
                "job_id": job_id,
                "status": job["status"],
                "progress": job["progress"],
                "started_at": job["started_at"]
            }
            for job_id, job in training_jobs.items()
        ]
    }
