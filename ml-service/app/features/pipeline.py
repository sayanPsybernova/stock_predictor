import pandas as pd
import numpy as np
from typing import Optional, List
import logging

from .technical import generate_technical_features
from .volume import generate_volume_features
from .price import generate_price_features
from .momentum import generate_momentum_features
from .volatility import generate_volatility_features

logger = logging.getLogger(__name__)


class FeaturePipeline:
    """
    Feature engineering pipeline that combines all feature generators.
    """

    # List of all feature columns (36 total)
    FEATURE_COLUMNS = [
        # Technical (10)
        'RSI_14', 'RSI_7', 'MACD', 'MACD_Signal', 'MACD_Histogram',
        'Stochastic_K', 'Stochastic_D', 'Williams_R', 'CCI', 'ADX',

        # Volume (6)
        'Volume_Ratio_10D', 'Volume_Ratio_20D', 'OBV_Change',
        'Volume_Trend', 'VWAP_Distance', 'Volume_Spike',

        # Price (8)
        'Price_vs_SMA20', 'Price_vs_SMA50', 'Price_vs_SMA200',
        'Distance_52W_High', 'Distance_52W_Low', 'Price_Position',
        'Gap_Up_Pct', 'Intraday_Range',

        # Momentum (5)
        'Return_1D', 'Return_5D', 'Return_10D', 'Momentum_Score', 'Acceleration',

        # Volatility (4)
        'ATR_14', 'Bollinger_Width', 'Bollinger_Position', 'Historical_Vol_20',

        # Derived (3) - calculated in this pipeline
        'Trend_Strength', 'Reversal_Signal', 'Breakout_Score'
    ]

    def __init__(self):
        self.min_data_points = 252  # Minimum 1 year of data for features

    def _calculate_derived_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate derived features that combine multiple indicators.
        """
        result = df.copy()

        # Trend Strength: Combination of price vs SMAs alignment
        # Score from -3 to +3 based on price above/below each SMA
        trend_strength = np.zeros(len(df))

        if 'Price_vs_SMA20' in df.columns:
            trend_strength += np.sign(df['Price_vs_SMA20'])
        if 'Price_vs_SMA50' in df.columns:
            trend_strength += np.sign(df['Price_vs_SMA50'])
        if 'Price_vs_SMA200' in df.columns:
            trend_strength += np.sign(df['Price_vs_SMA200'])

        result['Trend_Strength'] = trend_strength

        # Reversal Signal: Combination of oversold RSI + high volume + price near lows
        reversal_signal = np.zeros(len(df))

        if 'RSI_14' in df.columns:
            # RSI < 30 contributes positively to reversal signal
            reversal_signal += ((df['RSI_14'] < 30).astype(int) * 2)
            # RSI < 20 contributes even more
            reversal_signal += ((df['RSI_14'] < 20).astype(int) * 1)

        if 'Volume_Spike' in df.columns:
            reversal_signal += df['Volume_Spike']

        if 'Price_Position' in df.columns:
            # Price near 52w low (position < 0.2) contributes to reversal
            reversal_signal += ((df['Price_Position'] < 0.2).astype(int) * 1)

        result['Reversal_Signal'] = reversal_signal

        # Breakout Score: Price near resistance + volume increase + positive momentum
        breakout_score = np.zeros(len(df))

        if 'Distance_52W_High' in df.columns:
            # Close to 52w high (< 5% away) contributes to breakout
            breakout_score += ((df['Distance_52W_High'] < 5).astype(int) * 2)

        if 'Volume_Ratio_10D' in df.columns:
            # Volume > 1.5x average contributes to breakout
            breakout_score += ((df['Volume_Ratio_10D'] > 1.5).astype(int) * 1)

        if 'RSI_14' in df.columns:
            # RSI in momentum zone (55-75) contributes to breakout
            breakout_score += (((df['RSI_14'] > 55) & (df['RSI_14'] < 75)).astype(int) * 1)

        if 'MACD_Histogram' in df.columns:
            # Positive MACD histogram contributes to breakout
            breakout_score += ((df['MACD_Histogram'] > 0).astype(int) * 1)

        result['Breakout_Score'] = breakout_score

        return result

    def generate_features(
        self,
        df: pd.DataFrame,
        include_target: bool = False
    ) -> Optional[pd.DataFrame]:
        """
        Generate all features from OHLCV data.

        Args:
            df: DataFrame with columns: Open, High, Low, Close, Volume
            include_target: If True, add target column (5%+ gain next day)

        Returns:
            DataFrame with all features, or None if insufficient data
        """
        if len(df) < self.min_data_points:
            logger.warning(f"Insufficient data: {len(df)} rows, need {self.min_data_points}")
            return None

        try:
            # Generate all feature categories
            result = df.copy()

            # Technical indicators
            result = generate_technical_features(result)

            # Volume features
            result = generate_volume_features(result)

            # Price features
            result = generate_price_features(result)

            # Momentum features
            result = generate_momentum_features(result)

            # Volatility features
            result = generate_volatility_features(result)

            # Derived features
            result = self._calculate_derived_features(result)

            # Add target if requested
            if include_target:
                # Target: 1 if next day's return >= 5%, else 0
                next_day_return = df['Close'].shift(-1) / df['Close'] - 1
                result['Target'] = (next_day_return >= 0.05).astype(int)

            # Select only feature columns (and target if present)
            feature_cols = [c for c in self.FEATURE_COLUMNS if c in result.columns]
            if include_target:
                feature_cols.append('Target')

            result = result[feature_cols]

            # Drop rows with NaN (from rolling calculations)
            result = result.dropna()

            logger.info(f"Generated {len(feature_cols)} features for {len(result)} rows")

            return result

        except Exception as e:
            logger.error(f"Feature generation failed: {str(e)}")
            return None

    def get_feature_names(self) -> List[str]:
        """Return list of feature column names."""
        return self.FEATURE_COLUMNS.copy()

    def validate_features(self, df: pd.DataFrame) -> bool:
        """
        Validate that all required features are present and valid.

        Returns:
            True if valid, False otherwise
        """
        missing_cols = [c for c in self.FEATURE_COLUMNS if c not in df.columns]
        if missing_cols:
            logger.warning(f"Missing features: {missing_cols}")
            return False

        # Check for infinite values
        inf_cols = df.columns[df.isin([np.inf, -np.inf]).any()].tolist()
        if inf_cols:
            logger.warning(f"Infinite values in: {inf_cols}")
            return False

        # Check for NaN values
        nan_cols = df.columns[df.isna().any()].tolist()
        if nan_cols:
            logger.warning(f"NaN values in: {nan_cols}")
            return False

        return True
