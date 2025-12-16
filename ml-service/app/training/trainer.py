import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Callable, Optional
import logging
from pathlib import Path

from app.models.xgboost_model import GainerPredictor
from app.features.pipeline import FeaturePipeline
from app.data.yahoo_fetcher import fetcher
from app.training.backtester import WalkForwardBacktester
from app.config import (
    MODEL_FILE, HISTORY_YEARS, MODELS_DIR,
    CURRENT_MODEL_VERSION
)

logger = logging.getLogger(__name__)

# Default Nifty 500 symbols (subset for faster training)
DEFAULT_SYMBOLS = [
    # Nifty 50 large caps
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
    'HINDUNILVR.NS', 'ITC.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'KOTAKBANK.NS',
    'LT.NS', 'AXISBANK.NS', 'ASIANPAINT.NS', 'MARUTI.NS', 'TITAN.NS',
    'SUNPHARMA.NS', 'ULTRACEMCO.NS', 'BAJFINANCE.NS', 'WIPRO.NS', 'HCLTECH.NS',
    'NESTLEIND.NS', 'ONGC.NS', 'NTPC.NS', 'POWERGRID.NS', 'M&M.NS',
    'TATAMOTORS.NS', 'ADANIENT.NS', 'ADANIPORTS.NS', 'JSWSTEEL.NS', 'TATASTEEL.NS',
    'BAJAJFINSV.NS', 'TECHM.NS', 'INDUSINDBK.NS', 'GRASIM.NS', 'HINDALCO.NS',
    'DRREDDY.NS', 'CIPLA.NS', 'BRITANNIA.NS', 'EICHERMOT.NS', 'APOLLOHOSP.NS',
    'DIVISLAB.NS', 'COALINDIA.NS', 'BPCL.NS', 'HEROMOTOCO.NS', 'BAJAJ-AUTO.NS',
    'SBILIFE.NS', 'TATACONSUM.NS', 'HDFCLIFE.NS', 'UPL.NS', 'SHRIRAMFIN.NS',

    # Additional mid-caps for diversity
    'VEDL.NS', 'TRENT.NS', 'ZOMATO.NS', 'POLYCAB.NS', 'PIIND.NS',
    'PERSISTENT.NS', 'TATACOMM.NS', 'ABCAPITAL.NS', 'CANBK.NS', 'BANKBARODA.NS',
    'PNB.NS', 'FEDERALBNK.NS', 'IDFCFIRSTB.NS', 'RECLTD.NS', 'PFC.NS',
    'IRFC.NS', 'HAL.NS', 'BEL.NS', 'BHEL.NS', 'SAIL.NS',
    'NMDC.NS', 'GAIL.NS', 'IOC.NS', 'JINDALSTEL.NS', 'TATAPOWER.NS',
    'ADANIGREEN.NS', 'ADANIPOWER.NS', 'TORNTPHARM.NS', 'LUPIN.NS', 'ZYDUSLIFE.NS',
    'AUROPHARMA.NS', 'BIOCON.NS', 'MAXHEALTH.NS', 'FORTIS.NS', 'METROPOLIS.NS',
    'DMART.NS', 'PAGEIND.NS', 'MUTHOOTFIN.NS', 'CHOLAFIN.NS', 'LICHSGFIN.NS',
    'SBICARD.NS', 'IRCTC.NS', 'INDIANHOTELS.NS', 'JUBLFOOD.NS', 'MCDOWELL-N.NS'
]


class ModelTrainer:
    """
    Orchestrates model training with walk-forward validation.
    """

    def __init__(self):
        self.pipeline = FeaturePipeline()
        self.progress_callback: Optional[Callable] = None

    def set_progress_callback(self, callback: Callable[[float, str], None]):
        """Set callback for progress updates."""
        self.progress_callback = callback

    def _update_progress(self, progress: float, message: str):
        """Update progress if callback is set."""
        if self.progress_callback:
            self.progress_callback(progress, message)
        logger.info(f"[{progress:.1%}] {message}")

    def train(
        self,
        symbols: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict:
        """
        Train model on historical data with walk-forward validation.

        Args:
            symbols: List of stock symbols to train on
            start_date: Training data start date (YYYY-MM-DD)
            end_date: Training data end date (YYYY-MM-DD)

        Returns:
            Dict with training and backtest metrics
        """
        symbols = symbols or DEFAULT_SYMBOLS
        end_date = end_date or datetime.now().strftime('%Y-%m-%d')

        if start_date is None:
            start = datetime.now() - timedelta(days=HISTORY_YEARS * 365)
            start_date = start.strftime('%Y-%m-%d')

        self._update_progress(0.05, f"Starting training with {len(symbols)} symbols")

        # Step 1: Fetch data and generate features
        all_features = []
        successful_symbols = 0

        for i, symbol in enumerate(symbols):
            try:
                # Fetch historical data
                df = fetcher.get_historical_data(symbol, period=f"{HISTORY_YEARS}y")

                if df is None or len(df) < 300:
                    logger.warning(f"Skipping {symbol}: insufficient data")
                    continue

                # Generate features with target
                features = self.pipeline.generate_features(df, include_target=True)

                if features is None or len(features) < 200:
                    continue

                # Add symbol identifier
                features['Symbol'] = symbol

                all_features.append(features)
                successful_symbols += 1

                # Update progress
                progress = 0.05 + (0.20 * (i + 1) / len(symbols))
                self._update_progress(progress, f"Processed {symbol} ({successful_symbols}/{i+1})")

            except Exception as e:
                logger.warning(f"Error processing {symbol}: {str(e)}")
                continue

        if not all_features:
            raise ValueError("No valid training data generated")

        # Combine all features
        self._update_progress(0.25, "Combining features from all symbols")
        combined_data = pd.concat(all_features, ignore_index=False)
        combined_data = combined_data.sort_index()

        logger.info(f"Combined data shape: {combined_data.shape}")
        logger.info(f"Positive class ratio: {combined_data['Target'].mean():.4f}")

        # Step 2: Run walk-forward backtest
        self._update_progress(0.30, "Starting walk-forward backtest")

        feature_cols = [c for c in self.pipeline.FEATURE_COLUMNS if c in combined_data.columns]

        backtester = WalkForwardBacktester()
        backtest_results = backtester.run(
            combined_data,
            feature_cols,
            target_col='Target',
            progress_callback=self.progress_callback
        )

        self._update_progress(0.90, "Training final model on full dataset")

        # Step 3: Train final model on all data (for deployment)
        # Use last 80% for training, 20% for final validation
        split_idx = int(len(combined_data) * 0.8)
        train_data = combined_data.iloc[:split_idx]
        val_data = combined_data.iloc[split_idx:]

        X_train = train_data[feature_cols]
        y_train = train_data['Target']
        X_val = val_data[feature_cols]
        y_val = val_data['Target']

        final_model = GainerPredictor()
        final_metrics = final_model.train(X_train, y_train, X_val, y_val)

        # Step 4: Save model
        self._update_progress(0.95, "Saving model")

        final_model.save(MODEL_FILE)

        # Combine all results
        results = {
            "status": "completed",
            "timestamp": datetime.utcnow().isoformat(),
            "model_version": CURRENT_MODEL_VERSION,
            "model_path": str(MODEL_FILE),
            "training_summary": {
                "n_symbols": successful_symbols,
                "n_samples": len(combined_data),
                "n_features": len(feature_cols),
                "positive_ratio": float(combined_data['Target'].mean()),
                "date_range": {
                    "start": str(combined_data.index.min().date()),
                    "end": str(combined_data.index.max().date())
                }
            },
            "final_model_metrics": final_metrics,
            "backtest_metrics": backtest_results,
            "feature_importance": final_model.get_feature_importance()
        }

        self._update_progress(1.0, "Training complete")

        return results
