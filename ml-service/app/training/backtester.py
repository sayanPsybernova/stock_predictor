import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Callable, Optional
from dateutil.relativedelta import relativedelta
import logging

from app.models.xgboost_model import GainerPredictor
from app.config import TRAIN_MONTHS, VAL_MONTHS, STEP_MONTHS

logger = logging.getLogger(__name__)


class WalkForwardBacktester:
    """
    Walk-forward validation for time series prediction.

    Method:
    1. Train on N months of data
    2. Validate on next M months
    3. Slide window forward by S months
    4. Repeat until end of data
    """

    def __init__(
        self,
        train_months: int = TRAIN_MONTHS,
        val_months: int = VAL_MONTHS,
        step_months: int = STEP_MONTHS
    ):
        self.train_months = train_months
        self.val_months = val_months
        self.step_months = step_months
        self.results: List[Dict] = []

    def run(
        self,
        data: pd.DataFrame,
        feature_cols: List[str],
        target_col: str = 'Target',
        progress_callback: Optional[Callable] = None
    ) -> Dict:
        """
        Run walk-forward backtest.

        Args:
            data: DataFrame with features and target, indexed by date
            feature_cols: List of feature column names
            target_col: Name of target column
            progress_callback: Optional callback for progress updates

        Returns:
            Dict with aggregated backtest metrics
        """
        self.results = []

        # Ensure datetime index
        if not isinstance(data.index, pd.DatetimeIndex):
            data.index = pd.to_datetime(data.index)

        data = data.sort_index()

        # Calculate window dates
        min_date = data.index.min()
        max_date = data.index.max()

        train_start = min_date
        total_windows = 0

        # Count total windows for progress
        temp_start = train_start
        while True:
            train_end = temp_start + relativedelta(months=self.train_months)
            val_end = train_end + relativedelta(months=self.val_months)
            if val_end > max_date:
                break
            total_windows += 1
            temp_start += relativedelta(months=self.step_months)

        logger.info(f"Running {total_windows} walk-forward windows")

        # Run backtest
        window_num = 0
        train_start = min_date

        while True:
            train_end = train_start + relativedelta(months=self.train_months)
            val_start = train_end
            val_end = val_start + relativedelta(months=self.val_months)

            # Check if we have enough data
            if val_end > max_date:
                break

            # Split data
            train_data = data[(data.index >= train_start) & (data.index < train_end)]
            val_data = data[(data.index >= val_start) & (data.index < val_end)]

            if len(train_data) < 100 or len(val_data) < 20:
                logger.warning(f"Skipping window {window_num}: insufficient data")
                train_start += relativedelta(months=self.step_months)
                continue

            # Train model
            X_train = train_data[feature_cols]
            y_train = train_data[target_col]
            X_val = val_data[feature_cols]
            y_val = val_data[target_col]

            model = GainerPredictor()
            model.train(X_train, y_train, X_val, y_val)

            # Evaluate on validation set
            val_proba = model.predict_proba(X_val)
            val_pred = (val_proba >= 0.5).astype(int)

            # Calculate metrics
            window_result = self._calculate_window_metrics(
                y_val, val_pred, val_proba,
                train_start, train_end, val_start, val_end,
                window_num
            )
            self.results.append(window_result)

            # Progress callback
            window_num += 1
            if progress_callback:
                progress = 0.3 + (0.6 * window_num / max(total_windows, 1))
                progress_callback(progress, f"Completed window {window_num}/{total_windows}")

            logger.info(f"Window {window_num}: Precision@10={window_result['precision_at_10']:.3f}, "
                       f"AUC={window_result['auc']:.3f}")

            # Slide window forward
            train_start += relativedelta(months=self.step_months)

        # Aggregate results
        return self._aggregate_results()

    def _calculate_window_metrics(
        self,
        y_true: pd.Series,
        y_pred: np.ndarray,
        y_proba: np.ndarray,
        train_start: datetime,
        train_end: datetime,
        val_start: datetime,
        val_end: datetime,
        window_num: int
    ) -> Dict:
        """Calculate metrics for a single backtest window."""
        from sklearn.metrics import roc_auc_score, precision_score, recall_score

        # Basic metrics
        accuracy = (y_pred == y_true).mean()

        try:
            auc = roc_auc_score(y_true, y_proba)
        except:
            auc = 0.5

        precision = precision_score(y_true, y_pred, zero_division=0)
        recall = recall_score(y_true, y_pred, zero_division=0)

        # Precision @ top N predictions
        n_predictions = [5, 10, 20]
        precision_at_n = {}

        for n in n_predictions:
            # Get top N by probability
            top_n_idx = np.argsort(y_proba)[-n:]
            top_n_actual = y_true.iloc[top_n_idx]
            precision_at_n[f'precision_at_{n}'] = top_n_actual.mean()

        # Profit factor simulation
        # Assume we buy top 10 predictions, hold for 1 day
        top_10_idx = np.argsort(y_proba)[-10:]
        hits = y_true.iloc[top_10_idx].sum()
        profit_factor = hits / 10  # Simplified: % of correct predictions

        return {
            'window': window_num,
            'train_start': str(train_start.date()),
            'train_end': str(train_end.date()),
            'val_start': str(val_start.date()),
            'val_end': str(val_end.date()),
            'n_train': len(y_true),
            'n_val': len(y_true),
            'positive_ratio': float(y_true.mean()),
            'accuracy': float(accuracy),
            'auc': float(auc),
            'precision': float(precision),
            'recall': float(recall),
            'precision_at_5': float(precision_at_n['precision_at_5']),
            'precision_at_10': float(precision_at_n['precision_at_10']),
            'precision_at_20': float(precision_at_n['precision_at_20']),
            'profit_factor': float(profit_factor)
        }

    def _aggregate_results(self) -> Dict:
        """Aggregate results across all windows."""
        if not self.results:
            return {
                'n_windows': 0,
                'error': 'No backtest windows completed'
            }

        df = pd.DataFrame(self.results)

        return {
            'n_windows': len(self.results),
            'mean_accuracy': float(df['accuracy'].mean()),
            'mean_auc': float(df['auc'].mean()),
            'mean_precision': float(df['precision'].mean()),
            'mean_recall': float(df['recall'].mean()),
            'mean_precision_at_5': float(df['precision_at_5'].mean()),
            'mean_precision_at_10': float(df['precision_at_10'].mean()),
            'mean_precision_at_20': float(df['precision_at_20'].mean()),
            'mean_profit_factor': float(df['profit_factor'].mean()),
            'std_auc': float(df['auc'].std()),
            'min_auc': float(df['auc'].min()),
            'max_auc': float(df['auc'].max()),
            'window_details': self.results
        }
