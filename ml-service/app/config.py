import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = DATA_DIR / "models"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

# Create directories if they don't exist
for dir_path in [DATA_DIR, MODELS_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# Server settings
HOST = os.getenv("ML_SERVICE_HOST", "0.0.0.0")
PORT = int(os.getenv("ML_SERVICE_PORT", 8000))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Model settings
CURRENT_MODEL_VERSION = os.getenv("MODEL_VERSION", "v1.0.0")
MODEL_FILE = MODELS_DIR / f"xgboost_{CURRENT_MODEL_VERSION}.joblib"

# Feature settings
LOOKBACK_DAYS = 252  # 1 year of trading days for features
HISTORY_YEARS = 5    # Years of data for training

# Target settings
TARGET_GAIN_THRESHOLD = 0.05  # 5% gain threshold for classification

# Training settings
TRAIN_MONTHS = 24     # 2 years training window
VAL_MONTHS = 3        # 3 months validation window
STEP_MONTHS = 1       # 1 month step for walk-forward

# XGBoost hyperparameters
XGBOOST_PARAMS = {
    "n_estimators": 500,
    "max_depth": 6,
    "learning_rate": 0.01,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "gamma": 0.1,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "scale_pos_weight": 10,  # Handle class imbalance
    "objective": "binary:logistic",
    "eval_metric": "auc",
    "random_state": 42,
    "n_jobs": -1
}
