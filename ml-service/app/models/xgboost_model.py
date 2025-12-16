import pandas as pd
import numpy as np
from xgboost import XGBClassifier
import joblib
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict
import logging

from app.config import XGBOOST_PARAMS, CURRENT_MODEL_VERSION
from app.features.pipeline import FeaturePipeline

logger = logging.getLogger(__name__)


class GainerPredictor:
    """
    XGBoost-based classifier for predicting 5%+ stock gainers.
    """

    def __init__(self):
        self.model: Optional[XGBClassifier] = None
        self.version = CURRENT_MODEL_VERSION
        self.trained_at: Optional[str] = None
        self.metrics: Dict = {}
        self.feature_names: List[str] = []
        self._loaded = False

    def is_loaded(self) -> bool:
        """Check if model is loaded and ready for predictions."""
        return self._loaded and self.model is not None

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None
    ) -> Dict:
        """
        Train the XGBoost model.

        Args:
            X_train: Training features
            y_train: Training labels (0 or 1)
            X_val: Validation features (optional, for early stopping)
            y_val: Validation labels

        Returns:
            Dict of training metrics
        """
        logger.info(f"Training XGBoost with {len(X_train)} samples")
        logger.info(f"Positive class ratio: {y_train.mean():.4f}")

        self.model = XGBClassifier(**XGBOOST_PARAMS)
        self.feature_names = list(X_train.columns)

        # Setup evaluation set for early stopping
        eval_set = None
        if X_val is not None and y_val is not None:
            eval_set = [(X_val, y_val)]

        # Fit model
        self.model.fit(
            X_train,
            y_train,
            eval_set=eval_set,
            verbose=100
        )

        self.trained_at = datetime.utcnow().isoformat()
        self._loaded = True

        # Calculate training metrics
        train_pred = self.model.predict(X_train)
        train_proba = self.model.predict_proba(X_train)[:, 1]

        self.metrics = {
            "train_accuracy": float((train_pred == y_train).mean()),
            "train_precision": self._calculate_precision(y_train, train_pred),
            "train_recall": self._calculate_recall(y_train, train_pred),
            "train_auc": self._calculate_auc(y_train, train_proba),
            "positive_ratio": float(y_train.mean()),
            "n_samples": len(X_train),
            "n_features": len(self.feature_names)
        }

        if X_val is not None:
            val_pred = self.model.predict(X_val)
            val_proba = self.model.predict_proba(X_val)[:, 1]
            self.metrics.update({
                "val_accuracy": float((val_pred == y_val).mean()),
                "val_precision": self._calculate_precision(y_val, val_pred),
                "val_recall": self._calculate_recall(y_val, val_pred),
                "val_auc": self._calculate_auc(y_val, val_proba)
            })

        logger.info(f"Training complete. Metrics: {self.metrics}")

        return self.metrics

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict class labels (0 or 1).

        Returns:
            Array of predictions
        """
        if not self.is_loaded():
            raise RuntimeError("Model not loaded")

        return self.model.predict(X[self.feature_names])

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict probability of being a 5%+ gainer.

        Returns:
            Array of probabilities (0 to 1)
        """
        if not self.is_loaded():
            raise RuntimeError("Model not loaded")

        # Ensure we use the correct feature order
        X_ordered = X[self.feature_names] if set(self.feature_names).issubset(X.columns) else X

        return self.model.predict_proba(X_ordered)[:, 1]

    def get_feature_importance(self) -> Dict[str, float]:
        """
        Get feature importance scores.

        Returns:
            Dict mapping feature names to importance scores
        """
        if not self.is_loaded():
            return {}

        importance = self.model.feature_importances_
        return dict(sorted(
            zip(self.feature_names, importance),
            key=lambda x: x[1],
            reverse=True
        ))

    def generate_reasoning(self, features: pd.Series, probability: float) -> List[str]:
        """
        Generate human-readable reasoning for a prediction.

        Args:
            features: Series of feature values for single stock
            probability: Predicted probability

        Returns:
            List of reasoning strings
        """
        reasoning = []

        # Get top features by importance
        importance = self.get_feature_importance()
        top_features = list(importance.keys())[:10]

        for feature in top_features:
            if feature not in features.index:
                continue

            value = features[feature]

            # Generate explanation based on feature type and value
            if feature == 'RSI_14':
                if value < 30:
                    reasoning.append(f"RSI is oversold ({value:.1f}), potential bounce")
                elif value > 70:
                    reasoning.append(f"RSI is overbought ({value:.1f}), caution advised")
                elif 50 < value < 70:
                    reasoning.append(f"RSI shows bullish momentum ({value:.1f})")

            elif feature == 'Volume_Ratio_10D':
                if value > 2:
                    reasoning.append(f"Volume spike detected ({value:.1f}x average)")
                elif value > 1.5:
                    reasoning.append(f"Above average volume ({value:.1f}x)")

            elif feature == 'Distance_52W_High':
                if value < 5:
                    reasoning.append(f"Near 52-week high ({value:.1f}% away), breakout potential")
                elif value > 30:
                    reasoning.append(f"Far from 52-week high ({value:.1f}% below)")

            elif feature == 'MACD_Histogram':
                if value > 0:
                    reasoning.append("MACD showing bullish momentum")
                else:
                    reasoning.append("MACD showing bearish momentum")

            elif feature == 'Trend_Strength':
                if value >= 2:
                    reasoning.append("Strong uptrend (price above key moving averages)")
                elif value <= -2:
                    reasoning.append("Strong downtrend (price below key moving averages)")

            elif feature == 'Breakout_Score':
                if value >= 4:
                    reasoning.append("High breakout potential detected")
                elif value >= 2:
                    reasoning.append("Moderate breakout signals present")

            elif feature == 'Reversal_Signal':
                if value >= 3:
                    reasoning.append("Strong reversal signals detected")

            # Limit to 5 reasons
            if len(reasoning) >= 5:
                break

        # Add probability-based summary
        if probability >= 0.7:
            reasoning.insert(0, f"High probability ({probability:.1%}) of 5%+ gain")
        elif probability >= 0.5:
            reasoning.insert(0, f"Moderate probability ({probability:.1%}) of 5%+ gain")
        else:
            reasoning.insert(0, f"Lower probability ({probability:.1%}) of significant gain")

        return reasoning if reasoning else ["Insufficient signals for detailed reasoning"]

    def save(self, path: Path):
        """Save model to disk."""
        if not self.is_loaded():
            raise RuntimeError("No model to save")

        model_data = {
            "model": self.model,
            "version": self.version,
            "trained_at": self.trained_at,
            "metrics": self.metrics,
            "feature_names": self.feature_names
        }

        joblib.dump(model_data, path)
        logger.info(f"Model saved to {path}")

    def load(self, path: Path):
        """Load model from disk."""
        if not path.exists():
            raise FileNotFoundError(f"Model file not found: {path}")

        model_data = joblib.load(path)

        self.model = model_data["model"]
        self.version = model_data.get("version", "unknown")
        self.trained_at = model_data.get("trained_at")
        self.metrics = model_data.get("metrics", {})
        self.feature_names = model_data.get("feature_names", [])
        self._loaded = True

        logger.info(f"Model loaded from {path} (version: {self.version})")

    def _calculate_precision(self, y_true, y_pred) -> float:
        """Calculate precision score."""
        true_positives = ((y_pred == 1) & (y_true == 1)).sum()
        predicted_positives = (y_pred == 1).sum()
        return float(true_positives / predicted_positives) if predicted_positives > 0 else 0.0

    def _calculate_recall(self, y_true, y_pred) -> float:
        """Calculate recall score."""
        true_positives = ((y_pred == 1) & (y_true == 1)).sum()
        actual_positives = (y_true == 1).sum()
        return float(true_positives / actual_positives) if actual_positives > 0 else 0.0

    def _calculate_auc(self, y_true, y_proba) -> float:
        """Calculate AUC-ROC score."""
        try:
            from sklearn.metrics import roc_auc_score
            return float(roc_auc_score(y_true, y_proba))
        except:
            return 0.0
