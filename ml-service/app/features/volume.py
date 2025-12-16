import pandas as pd
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def calculate_volume_ratio(volume: pd.Series, period: int) -> pd.Series:
    """
    Calculate volume ratio vs moving average.

    Args:
        volume: Series of volume data
        period: Moving average period

    Returns:
        Series of volume ratios
    """
    ma = volume.rolling(window=period).mean()
    return volume / ma


def calculate_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """
    Calculate On-Balance Volume (OBV).

    Returns:
        Series of cumulative OBV values
    """
    direction = np.sign(close.diff())
    obv = (direction * volume).cumsum()

    return obv


def calculate_volume_trend(volume: pd.Series, period: int = 20) -> pd.Series:
    """
    Calculate volume trend using linear regression slope.

    Returns:
        Series of volume trend slopes
    """
    def linear_slope(y):
        if len(y) < 2:
            return 0
        x = np.arange(len(y))
        try:
            slope = np.polyfit(x, y, 1)[0]
            return slope
        except:
            return 0

    return volume.rolling(window=period).apply(linear_slope, raw=True)


def calculate_vwap(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    volume: pd.Series
) -> pd.Series:
    """
    Calculate Volume Weighted Average Price (VWAP).

    Returns:
        Series of VWAP values
    """
    typical_price = (high + low + close) / 3
    vwap = (typical_price * volume).cumsum() / volume.cumsum()

    return vwap


def calculate_volume_spike(volume: pd.Series, threshold: float = 2.5, period: int = 20) -> pd.Series:
    """
    Calculate binary volume spike indicator.

    Args:
        volume: Series of volume data
        threshold: Multiple of average volume to trigger spike
        period: Moving average period

    Returns:
        Series of binary spike indicators (0 or 1)
    """
    ma = volume.rolling(window=period).mean()
    spike = (volume / ma) > threshold

    return spike.astype(int)


def generate_volume_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate all volume-based features.

    Args:
        df: DataFrame with OHLCV data

    Returns:
        DataFrame with volume features added
    """
    result = df.copy()

    # Volume ratios
    result['Volume_Ratio_10D'] = calculate_volume_ratio(df['Volume'], 10)
    result['Volume_Ratio_20D'] = calculate_volume_ratio(df['Volume'], 20)

    # On-Balance Volume
    result['OBV'] = calculate_obv(df['Close'], df['Volume'])

    # Normalize OBV to percentage change over 20 days
    result['OBV_Change'] = result['OBV'].pct_change(periods=20) * 100

    # Volume trend
    result['Volume_Trend'] = calculate_volume_trend(df['Volume'], 20)

    # Normalize volume trend
    result['Volume_Trend'] = result['Volume_Trend'] / df['Volume'].rolling(20).mean()

    # VWAP distance
    vwap = calculate_vwap(df['High'], df['Low'], df['Close'], df['Volume'])
    result['VWAP_Distance'] = (df['Close'] - vwap) / vwap * 100

    # Volume spike
    result['Volume_Spike'] = calculate_volume_spike(df['Volume'], threshold=2.5)

    logger.debug(f"Generated 6 volume features")

    return result
