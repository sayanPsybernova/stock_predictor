"""
Professional XGBoost Training System
Trains on 5 years of historical data from multiple stocks
Implements daily auto-training with model versioning
"""

import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split, TimeSeriesSplit, cross_val_score
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from sklearn.preprocessing import StandardScaler
import joblib
import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import feature engineering
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from features.feature_engineer import FeatureEngineer, DataCollector, NIFTY50_SYMBOLS, INDICES


class ProTrader:
    """
    Professional ML Trader - XGBoost-based stock prediction model
    Trained on 5 years of data with 150+ features
    """

    def __init__(self, model_dir: str = None):
        """Initialize ProTrader"""
        self.model_dir = model_dir or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            'models', 'trained'
        )
        os.makedirs(self.model_dir, exist_ok=True)

        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = []
        self.model_metadata = {}
        self.data_collector = DataCollector()

        # XGBoost parameters optimized for stock prediction
        self.xgb_params = {
            'objective': 'binary:logistic',
            'eval_metric': ['logloss', 'auc'],
            'max_depth': 6,
            'learning_rate': 0.05,
            'n_estimators': 500,
            'min_child_weight': 3,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'gamma': 0.1,
            'reg_alpha': 0.1,
            'reg_lambda': 1.0,
            'scale_pos_weight': 1,
            'random_state': 42,
            'n_jobs': -1,
            'early_stopping_rounds': 50
        }

    def collect_training_data(self, symbols: List[str] = None,
                              period: str = '5y') -> pd.DataFrame:
        """
        Collect and prepare training data from multiple symbols

        Args:
            symbols: List of stock symbols to use
            period: Historical period ('5y', 'max')

        Returns:
            Combined DataFrame with all features
        """
        symbols = symbols or NIFTY50_SYMBOLS[:30]  # Use top 30 by default
        all_data = []

        logger.info(f"Collecting data for {len(symbols)} symbols...")

        for i, symbol in enumerate(symbols):
            try:
                logger.info(f"[{i+1}/{len(symbols)}] Processing {symbol}...")

                df = self.data_collector.fetch_historical_data(symbol, period)
                if df is None or len(df) < 252:  # Need at least 1 year
                    logger.warning(f"Insufficient data for {symbol}, skipping")
                    continue

                # Create features
                fe = FeatureEngineer(df)
                features_df = fe.create_all_features()

                # Add symbol identifier
                features_df['symbol'] = symbol

                # Drop NaN rows (from rolling calculations)
                features_df = features_df.dropna()

                if len(features_df) > 0:
                    all_data.append(features_df)
                    logger.info(f"  Added {len(features_df)} samples from {symbol}")

            except Exception as e:
                logger.error(f"Error processing {symbol}: {e}")
                continue

        if not all_data:
            raise ValueError("No valid data collected for training")

        # Combine all data
        combined_df = pd.concat(all_data, ignore_index=True)
        logger.info(f"Total training samples: {len(combined_df)}")

        return combined_df

    def prepare_features(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Prepare features and target for training

        Returns:
            (X features DataFrame, y target Series)
        """
        # Exclude non-feature columns
        exclude_cols = ['open', 'high', 'low', 'close', 'volume', 'date',
                        'symbol', 'target', 'target_3d', 'target_5d', 'target_return']

        feature_cols = [c for c in df.columns if c not in exclude_cols]
        self.feature_names = feature_cols

        X = df[feature_cols].copy()
        y = df['target'].copy()

        # Replace infinities with NaN and fill
        X = X.replace([np.inf, -np.inf], np.nan)
        X = X.fillna(0)

        return X, y

    def train(self, symbols: List[str] = None, period: str = '5y',
              validation_split: float = 0.2) -> Dict[str, Any]:
        """
        Train the XGBoost model on historical data

        Args:
            symbols: List of stock symbols
            period: Historical period
            validation_split: Fraction for validation

        Returns:
            Training metrics dictionary
        """
        logger.info("=" * 50)
        logger.info("Starting Pro Trader Training")
        logger.info("=" * 50)

        # Collect data
        df = self.collect_training_data(symbols, period)

        # Prepare features
        X, y = self.prepare_features(df)

        logger.info(f"Feature count: {len(self.feature_names)}")
        logger.info(f"Sample count: {len(X)}")
        logger.info(f"Class distribution: {y.value_counts().to_dict()}")

        # Time-based split (more realistic for financial data)
        split_idx = int(len(X) * (1 - validation_split))
        X_train, X_val = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_val = y.iloc[:split_idx], y.iloc[split_idx:]

        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)

        # Create DMatrix for XGBoost
        dtrain = xgb.DMatrix(X_train_scaled, label=y_train,
                             feature_names=self.feature_names)
        dval = xgb.DMatrix(X_val_scaled, label=y_val,
                           feature_names=self.feature_names)

        # Training parameters
        params = {
            'objective': self.xgb_params['objective'],
            'eval_metric': self.xgb_params['eval_metric'],
            'max_depth': self.xgb_params['max_depth'],
            'learning_rate': self.xgb_params['learning_rate'],
            'min_child_weight': self.xgb_params['min_child_weight'],
            'subsample': self.xgb_params['subsample'],
            'colsample_bytree': self.xgb_params['colsample_bytree'],
            'gamma': self.xgb_params['gamma'],
            'reg_alpha': self.xgb_params['reg_alpha'],
            'reg_lambda': self.xgb_params['reg_lambda'],
            'random_state': self.xgb_params['random_state'],
        }

        # Train model
        logger.info("Training XGBoost model...")
        evals_result = {}

        self.model = xgb.train(
            params,
            dtrain,
            num_boost_round=self.xgb_params['n_estimators'],
            evals=[(dtrain, 'train'), (dval, 'validation')],
            early_stopping_rounds=self.xgb_params['early_stopping_rounds'],
            evals_result=evals_result,
            verbose_eval=50
        )

        # Evaluate
        y_pred_proba = self.model.predict(dval)
        y_pred = (y_pred_proba > 0.5).astype(int)

        metrics = {
            'accuracy': accuracy_score(y_val, y_pred),
            'precision': precision_score(y_val, y_pred, zero_division=0),
            'recall': recall_score(y_val, y_pred, zero_division=0),
            'f1': f1_score(y_val, y_pred, zero_division=0),
            'roc_auc': roc_auc_score(y_val, y_pred_proba),
            'best_iteration': self.model.best_iteration,
            'train_samples': len(X_train),
            'val_samples': len(X_val),
            'feature_count': len(self.feature_names)
        }

        logger.info("=" * 50)
        logger.info("Training Results:")
        for metric, value in metrics.items():
            logger.info(f"  {metric}: {value}")
        logger.info("=" * 50)

        # Save metadata
        self.model_metadata = {
            'trained_at': datetime.now().isoformat(),
            'symbols_used': symbols or NIFTY50_SYMBOLS[:30],
            'period': period,
            'metrics': metrics,
            'feature_names': self.feature_names,
            'xgb_params': self.xgb_params
        }

        return metrics

    def cross_validate(self, df: pd.DataFrame, n_splits: int = 5) -> Dict[str, float]:
        """
        Perform time-series cross-validation

        Returns:
            Cross-validation metrics
        """
        X, y = self.prepare_features(df)

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Time series split
        tscv = TimeSeriesSplit(n_splits=n_splits)

        accuracies = []
        roc_aucs = []

        for fold, (train_idx, val_idx) in enumerate(tscv.split(X_scaled)):
            X_train, X_val = X_scaled[train_idx], X_scaled[val_idx]
            y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]

            # Train fold model
            dtrain = xgb.DMatrix(X_train, label=y_train)
            dval = xgb.DMatrix(X_val, label=y_val)

            params = {
                'objective': 'binary:logistic',
                'eval_metric': 'auc',
                'max_depth': 6,
                'learning_rate': 0.05,
            }

            model = xgb.train(
                params, dtrain, num_boost_round=200,
                evals=[(dval, 'val')],
                early_stopping_rounds=20,
                verbose_eval=False
            )

            y_pred_proba = model.predict(dval)
            y_pred = (y_pred_proba > 0.5).astype(int)

            accuracies.append(accuracy_score(y_val, y_pred))
            roc_aucs.append(roc_auc_score(y_val, y_pred_proba))

            logger.info(f"Fold {fold+1}: Accuracy={accuracies[-1]:.4f}, ROC-AUC={roc_aucs[-1]:.4f}")

        return {
            'cv_accuracy_mean': np.mean(accuracies),
            'cv_accuracy_std': np.std(accuracies),
            'cv_roc_auc_mean': np.mean(roc_aucs),
            'cv_roc_auc_std': np.std(roc_aucs)
        }

    def predict(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Make prediction for new data

        Args:
            df: OHLCV DataFrame (needs at least 250 rows for indicator calculation)

        Returns:
            Prediction dictionary with probability and signals
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() or load() first.")

        # Create features
        fe = FeatureEngineer(df)
        features_df = fe.create_all_features()
        features_df = features_df.dropna()

        if len(features_df) == 0:
            raise ValueError("Insufficient data for prediction")

        # Get latest row for prediction
        latest = features_df.iloc[[-1]]

        # Prepare features
        exclude_cols = ['open', 'high', 'low', 'close', 'volume', 'date',
                        'symbol', 'target', 'target_3d', 'target_5d', 'target_return']
        feature_cols = [c for c in latest.columns if c not in exclude_cols]

        X = latest[feature_cols].copy()
        X = X.replace([np.inf, -np.inf], np.nan).fillna(0)

        # Scale
        X_scaled = self.scaler.transform(X)

        # Predict
        dtest = xgb.DMatrix(X_scaled, feature_names=self.feature_names)
        probability = float(self.model.predict(dtest)[0])

        # Determine signal
        if probability >= 0.65:
            signal = 'STRONG_BULLISH'
            confidence = 'High'
        elif probability >= 0.55:
            signal = 'BULLISH'
            confidence = 'Moderate'
        elif probability <= 0.35:
            signal = 'STRONG_BEARISH'
            confidence = 'High'
        elif probability <= 0.45:
            signal = 'BEARISH'
            confidence = 'Moderate'
        else:
            signal = 'NEUTRAL'
            confidence = 'Low'

        # Get feature importance for reasoning
        importance = self.get_feature_importance(top_n=10)
        reasoning = self._generate_reasoning(features_df.iloc[-1], importance)

        return {
            'probability': probability,
            'signal': signal,
            'confidence': confidence,
            'direction': 'UP' if probability > 0.5 else 'DOWN',
            'reasoning': reasoning,
            'feature_importance': importance,
            'pattern_score': float(features_df.iloc[-1].get('pattern_score', 0)),
            'bullish_patterns': float(features_df.iloc[-1].get('bullish_pattern_score', 0)),
            'bearish_patterns': float(features_df.iloc[-1].get('bearish_pattern_score', 0))
        }

    def _generate_reasoning(self, features: pd.Series,
                            importance: Dict[str, float]) -> List[str]:
        """Generate human-readable reasoning from features"""
        reasoning = []

        # RSI reasoning
        if 'rsi_14' in features:
            rsi = features['rsi_14']
            if rsi < 30:
                reasoning.append(f"RSI({rsi:.1f}) indicates oversold - potential reversal up")
            elif rsi > 70:
                reasoning.append(f"RSI({rsi:.1f}) indicates overbought - potential reversal down")
            else:
                reasoning.append(f"RSI({rsi:.1f}) in neutral zone")

        # MACD reasoning
        if 'macd_histogram' in features:
            macd_hist = features['macd_histogram']
            if macd_hist > 0:
                reasoning.append(f"MACD histogram positive - bullish momentum")
            else:
                reasoning.append(f"MACD histogram negative - bearish momentum")

        # Trend reasoning
        if 'sma_50_200_cross' in features:
            if features['sma_50_200_cross'] == 1:
                reasoning.append("Golden cross (50 SMA > 200 SMA) - long-term bullish")
            else:
                reasoning.append("Death cross (50 SMA < 200 SMA) - long-term bearish")

        # Pattern reasoning
        if 'pattern_score' in features:
            pattern_score = features['pattern_score']
            if pattern_score > 2:
                reasoning.append(f"Multiple bullish candlestick patterns detected (score: {pattern_score})")
            elif pattern_score < -2:
                reasoning.append(f"Multiple bearish candlestick patterns detected (score: {pattern_score})")

        # Bollinger Bands
        if 'bb_percent_b' in features:
            bb_pct = features['bb_percent_b']
            if bb_pct < 0:
                reasoning.append("Price below lower Bollinger Band - oversold")
            elif bb_pct > 1:
                reasoning.append("Price above upper Bollinger Band - overbought")

        # ADX trend strength
        if 'adx' in features:
            adx = features['adx']
            if adx > 25:
                reasoning.append(f"Strong trend (ADX: {adx:.1f})")
            else:
                reasoning.append(f"Weak/ranging market (ADX: {adx:.1f})")

        # Volume
        if 'volume_ratio_20' in features:
            vol_ratio = features['volume_ratio_20']
            if vol_ratio > 1.5:
                reasoning.append(f"High volume ({vol_ratio:.1f}x average) - strong conviction")

        return reasoning[:5]  # Return top 5 reasons

    def get_feature_importance(self, top_n: int = 20) -> Dict[str, float]:
        """Get top N important features"""
        if self.model is None:
            return {}

        importance = self.model.get_score(importance_type='gain')

        # Sort by importance
        sorted_imp = sorted(importance.items(), key=lambda x: x[1], reverse=True)

        return dict(sorted_imp[:top_n])

    def save(self, version: str = None):
        """Save model and metadata"""
        version = version or datetime.now().strftime('%Y%m%d_%H%M%S')

        model_path = os.path.join(self.model_dir, f'pro_trader_{version}.json')
        scaler_path = os.path.join(self.model_dir, f'scaler_{version}.joblib')
        metadata_path = os.path.join(self.model_dir, f'metadata_{version}.json')

        # Save model
        self.model.save_model(model_path)
        logger.info(f"Model saved to {model_path}")

        # Save scaler
        joblib.dump(self.scaler, scaler_path)
        logger.info(f"Scaler saved to {scaler_path}")

        # Save metadata
        self.model_metadata['version'] = version
        with open(metadata_path, 'w') as f:
            json.dump(self.model_metadata, f, indent=2, default=str)
        logger.info(f"Metadata saved to {metadata_path}")

        # Update latest symlinks
        latest_model = os.path.join(self.model_dir, 'pro_trader_latest.json')
        latest_scaler = os.path.join(self.model_dir, 'scaler_latest.joblib')
        latest_metadata = os.path.join(self.model_dir, 'metadata_latest.json')

        # Copy as latest (Windows compatible)
        import shutil
        shutil.copy(model_path, latest_model)
        shutil.copy(scaler_path, latest_scaler)
        shutil.copy(metadata_path, latest_metadata)

        logger.info(f"Latest model updated: {version}")

    def load(self, version: str = 'latest'):
        """Load model and metadata"""
        model_path = os.path.join(self.model_dir, f'pro_trader_{version}.json')
        scaler_path = os.path.join(self.model_dir, f'scaler_{version}.joblib')
        metadata_path = os.path.join(self.model_dir, f'metadata_{version}.json')

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found: {model_path}")

        # Load model
        self.model = xgb.Booster()
        self.model.load_model(model_path)
        logger.info(f"Model loaded from {model_path}")

        # Load scaler
        self.scaler = joblib.load(scaler_path)
        logger.info(f"Scaler loaded from {scaler_path}")

        # Load metadata
        with open(metadata_path, 'r') as f:
            self.model_metadata = json.load(f)
        self.feature_names = self.model_metadata.get('feature_names', [])
        logger.info(f"Metadata loaded from {metadata_path}")

        return self.model_metadata


class DailyTrainer:
    """
    Automated daily training scheduler
    Retrains model with latest market data
    """

    def __init__(self, model_dir: str = None):
        self.pro_trader = ProTrader(model_dir)
        self.training_log = []

    def should_train_today(self) -> bool:
        """Check if training is needed today"""
        # Check if model exists
        latest_metadata = os.path.join(
            self.pro_trader.model_dir, 'metadata_latest.json'
        )

        if not os.path.exists(latest_metadata):
            return True

        # Check last training date
        with open(latest_metadata, 'r') as f:
            metadata = json.load(f)

        last_trained = datetime.fromisoformat(metadata.get('trained_at', '2000-01-01'))
        days_since = (datetime.now() - last_trained).days

        # Train if more than 1 day old
        return days_since >= 1

    def run_daily_training(self, symbols: List[str] = None,
                           force: bool = False) -> Optional[Dict[str, Any]]:
        """
        Run daily training job

        Args:
            symbols: List of symbols to train on
            force: Force training even if recently trained

        Returns:
            Training metrics or None if skipped
        """
        if not force and not self.should_train_today():
            logger.info("Model is up to date, skipping training")
            return None

        logger.info("Starting daily training job...")

        try:
            # Train model
            metrics = self.pro_trader.train(symbols=symbols, period='5y')

            # Save model
            self.pro_trader.save()

            # Log training
            self.training_log.append({
                'timestamp': datetime.now().isoformat(),
                'metrics': metrics,
                'status': 'success'
            })

            logger.info("Daily training completed successfully!")
            return metrics

        except Exception as e:
            logger.error(f"Daily training failed: {e}")
            self.training_log.append({
                'timestamp': datetime.now().isoformat(),
                'error': str(e),
                'status': 'failed'
            })
            raise

    def get_training_history(self) -> List[Dict]:
        """Get training history log"""
        return self.training_log


# CLI interface for manual training
if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Pro Trader Training System')
    parser.add_argument('--train', action='store_true', help='Train new model')
    parser.add_argument('--symbols', type=int, default=30,
                        help='Number of symbols to use')
    parser.add_argument('--period', type=str, default='5y',
                        help='Historical period')
    parser.add_argument('--daily', action='store_true',
                        help='Run daily training check')

    args = parser.parse_args()

    if args.train:
        trainer = ProTrader()
        symbols = NIFTY50_SYMBOLS[:args.symbols]
        metrics = trainer.train(symbols=symbols, period=args.period)
        trainer.save()
        print("\nTraining complete!")
        print(f"Accuracy: {metrics['accuracy']:.4f}")
        print(f"ROC-AUC: {metrics['roc_auc']:.4f}")

    elif args.daily:
        daily = DailyTrainer()
        result = daily.run_daily_training()
        if result:
            print(f"Training complete! Accuracy: {result['accuracy']:.4f}")
        else:
            print("Training skipped - model is up to date")
