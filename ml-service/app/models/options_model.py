"""
Options Direction Prediction Model

XGBoost classifier to predict whether the underlying will move
bullish or bearish based on options data.

Target: 1 = Bullish move expected, 0 = Bearish/Neutral
"""

import pandas as pd
import numpy as np
from xgboost import XGBClassifier
import joblib
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict
import logging

from app.features.options import OptionsFeatureGenerator

logger = logging.getLogger(__name__)

# Model configuration
OPTIONS_MODEL_PARAMS = {
    'n_estimators': 200,
    'max_depth': 5,
    'learning_rate': 0.05,
    'scale_pos_weight': 1.5,  # Slight adjustment for imbalance
    'objective': 'binary:logistic',
    'eval_metric': 'auc',
    'early_stopping_rounds': 20,
    'random_state': 42
}


class OptionsDirectionPredictor:
    """
    XGBoost classifier for predicting market direction from options data.
    """

    def __init__(self):
        self.model: Optional[XGBClassifier] = None
        self.version = "1.0.0"
        self.trained_at: Optional[str] = None
        self.metrics: Dict = {}
        self.feature_generator = OptionsFeatureGenerator()
        self._loaded = False

    def is_loaded(self) -> bool:
        """Check if model is loaded and ready."""
        return self._loaded and self.model is not None

    def predict_direction(self, option_data: Dict) -> Dict:
        """
        Predict market direction from option chain data.

        Args:
            option_data: Dictionary containing option chain analysis

        Returns:
            Dictionary with prediction results
        """
        if not self.is_loaded():
            # Return neutral prediction if model not loaded
            return self._neutral_prediction("Model not loaded")

        try:
            # Generate features
            features = self.feature_generator.generate_features(option_data)

            if features is None or len(features) == 0:
                return self._neutral_prediction("Could not generate features")

            # Predict
            probability = self.model.predict_proba(features)[0]
            bullish_prob = probability[1]
            bearish_prob = probability[0]

            # Determine direction
            if bullish_prob >= 0.6:
                direction = "BULLISH"
                confidence = "High" if bullish_prob >= 0.7 else "Moderate"
            elif bullish_prob >= 0.5:
                direction = "MILDLY_BULLISH"
                confidence = "Low"
            elif bullish_prob <= 0.4:
                direction = "BEARISH"
                confidence = "High" if bullish_prob <= 0.3 else "Moderate"
            elif bullish_prob <= 0.5:
                direction = "MILDLY_BEARISH"
                confidence = "Low"
            else:
                direction = "NEUTRAL"
                confidence = "Low"

            # Generate reasoning
            reasoning = self._generate_reasoning(features, bullish_prob)

            return {
                "direction": direction,
                "probability": float(bullish_prob),
                "confidence": confidence,
                "score": int(bullish_prob * 100),
                "reasoning": reasoning,
                "model_version": self.version
            }

        except Exception as e:
            logger.error(f"Prediction error: {str(e)}")
            return self._neutral_prediction(f"Prediction error: {str(e)}")

    def _neutral_prediction(self, reason: str) -> Dict:
        """Return neutral prediction."""
        return {
            "direction": "NEUTRAL",
            "probability": 0.5,
            "confidence": "Low",
            "score": 50,
            "reasoning": [reason],
            "model_version": self.version
        }

    def _generate_reasoning(self, features: pd.DataFrame, probability: float) -> List[str]:
        """Generate reasoning for prediction."""
        reasoning = []
        row = features.iloc[0]

        # PCR reasoning
        pcr = row.get('PCR_OI', 1.0)
        if pcr > 1.2:
            reasoning.append(f"High PCR ({pcr:.2f}) suggests bullish sentiment")
        elif pcr < 0.8:
            reasoning.append(f"Low PCR ({pcr:.2f}) suggests bearish sentiment")

        # IV Skew reasoning
        iv_skew = row.get('IV_Skew', 0)
        if iv_skew > 3:
            reasoning.append(f"Put IV skew ({iv_skew:.1f}) indicates hedging demand")
        elif iv_skew < -3:
            reasoning.append(f"Call IV premium indicates bullish speculation")

        # Max Pain reasoning
        mp_direction = row.get('Max_Pain_Direction', 0)
        mp_distance = row.get('Max_Pain_Distance', 0)
        if mp_direction < 0 and mp_distance > 1:
            reasoning.append(f"Spot below Max Pain - potential upside")
        elif mp_direction > 0 and mp_distance > 1:
            reasoning.append(f"Spot above Max Pain - potential pullback")

        # OI Pattern reasoning
        long_buildup = row.get('Long_Buildup_Count', 0)
        short_buildup = row.get('Short_Buildup_Count', 0)
        if long_buildup > short_buildup * 1.5:
            reasoning.append("Long buildup pattern dominant - bullish")
        elif short_buildup > long_buildup * 1.5:
            reasoning.append("Short buildup pattern dominant - bearish")

        # Probability summary
        reasoning.insert(0, f"ML Direction Probability: {probability*100:.1f}% bullish")

        return reasoning[:5]  # Limit to 5 reasons

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None
    ) -> Dict:
        """
        Train the options model.

        Args:
            X_train: Training features
            y_train: Training labels (1=bullish, 0=bearish)
            X_val: Validation features
            y_val: Validation labels

        Returns:
            Training metrics
        """
        logger.info(f"Training Options Model with {len(X_train)} samples")

        self.model = XGBClassifier(**OPTIONS_MODEL_PARAMS)

        eval_set = None
        if X_val is not None and y_val is not None:
            eval_set = [(X_val, y_val)]

        self.model.fit(
            X_train,
            y_train,
            eval_set=eval_set,
            verbose=50
        )

        self.trained_at = datetime.utcnow().isoformat()
        self._loaded = True

        # Calculate metrics
        train_pred = self.model.predict(X_train)
        train_proba = self.model.predict_proba(X_train)[:, 1]

        self.metrics = {
            "train_accuracy": float((train_pred == y_train).mean()),
            "train_auc": self._calculate_auc(y_train, train_proba),
            "n_samples": len(X_train)
        }

        if X_val is not None:
            val_pred = self.model.predict(X_val)
            val_proba = self.model.predict_proba(X_val)[:, 1]
            self.metrics.update({
                "val_accuracy": float((val_pred == y_val).mean()),
                "val_auc": self._calculate_auc(y_val, val_proba)
            })

        return self.metrics

    def _calculate_auc(self, y_true, y_proba) -> float:
        """Calculate AUC-ROC."""
        try:
            from sklearn.metrics import roc_auc_score
            return float(roc_auc_score(y_true, y_proba))
        except:
            return 0.5

    def get_feature_importance(self) -> Dict[str, float]:
        """Get feature importance scores."""
        if not self.is_loaded():
            return {}

        importance = self.model.feature_importances_
        feature_names = self.feature_generator.FEATURE_COLUMNS

        return dict(sorted(
            zip(feature_names, importance),
            key=lambda x: x[1],
            reverse=True
        ))

    def save(self, path: Path):
        """Save model to disk."""
        if not self.is_loaded():
            raise RuntimeError("No model to save")

        model_data = {
            "model": self.model,
            "version": self.version,
            "trained_at": self.trained_at,
            "metrics": self.metrics
        }

        joblib.dump(model_data, path)
        logger.info(f"Options model saved to {path}")

    def load(self, path: Path):
        """Load model from disk."""
        if not path.exists():
            logger.warning(f"Options model not found at {path}")
            return False

        try:
            model_data = joblib.load(path)
            self.model = model_data["model"]
            self.version = model_data.get("version", "unknown")
            self.trained_at = model_data.get("trained_at")
            self.metrics = model_data.get("metrics", {})
            self._loaded = True
            logger.info(f"Options model loaded from {path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load options model: {str(e)}")
            return False


# Singleton instance
options_predictor = OptionsDirectionPredictor()
