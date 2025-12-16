from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config import HOST, PORT, LOG_LEVEL
from app.api.routes import health, predictions, training

# Create FastAPI app
app = FastAPI(
    title="Stock Analysis ML Service",
    description="XGBoost-based prediction service for top gainer stocks",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(predictions.router, prefix="/api/v1", tags=["Predictions"])
app.include_router(training.router, prefix="/api/v1", tags=["Training"])

@app.on_event("startup")
async def startup_event():
    """Initialize service on startup."""
    print(f"🚀 ML Service starting on {HOST}:{PORT}")
    print(f"📊 Log level: {LOG_LEVEL}")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    print("👋 ML Service shutting down")

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=HOST,
        port=PORT,
        reload=True,
        log_level=LOG_LEVEL.lower()
    )
