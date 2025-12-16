import pandas as pd
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def calculate_atr(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 14
) -> pd.Series:
    """
    Calculate Average True Range (ATR).

    Returns:
        Series of ATR values
    """
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())

    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = true_range.ewm(span=period, adjust=False).mean()

    return atr


def calculate_bollinger_bands(
    prices: pd.Series,
    period: int = 20,
    std_dev: int = 2
) -> tuple:
    """
    Calculate Bollinger Bands.

    Returns:
        Tuple of (upper band, middle band, lower band)
    """
    middle = prices.rolling(window=period).mean()
    std = prices.rolling(window=period).std()

    upper = middle + (std * std_dev)
    lower = middle - (std * std_dev)

    return upper, middle, lower


def calculate_bollinger_width(upper: pd.Series, lower: pd.Series, middle: pd.Series) -> pd.Series:
    """
    Calculate Bollinger Band width.

    Returns:
        Series of band widths as percentage of middle band
    """
    return (upper - lower) / middle * 100


def calculate_bollinger_position(
    prices: pd.Series,
    upper: pd.Series,
    lower: pd.Series
) -> pd.Series:
    """
    Calculate price position within Bollinger Bands.

    Returns:
        Series of position values (0 = at lower band, 1 = at upper band)
    """
    return (prices - lower) / (upper - lower)


def calculate_historical_volatility(prices: pd.Series, period: int = 20) -> pd.Series:
    """
    Calculate historical volatility (annualized standard deviation of returns).

    Returns:
        Series of annualized volatility percentages
    """
    log_returns = np.log(prices / prices.shift(1))
    volatility = log_returns.rolling(window=period).std() * np.sqrt(252) * 100

    return volatility


def generate_volatility_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate all volatility-based features.

    Args:
        df: DataFrame with OHLCV data

    Returns:
        DataFrame with volatility features added
    """
    result = df.copy()

    # ATR (normalized by price)
    atr = calculate_atr(df['High'], df['Low'], df['Close'], period=14)
    result['ATR_14'] = atr / df['Close'] * 100  # ATR as percentage of price

    # Bollinger Bands
    upper, middle, lower = calculate_bollinger_bands(df['Close'])
    result['Bollinger_Width'] = calculate_bollinger_width(upper, lower, middle)
    result['Bollinger_Position'] = calculate_bollinger_position(df['Close'], upper, lower)

    # Historical volatility
    result['Historical_Vol_20'] = calculate_historical_volatility(df['Close'], 20)

    logger.debug(f"Generated 4 volatility features")

    return result
