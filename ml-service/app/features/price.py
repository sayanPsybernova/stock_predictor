import pandas as pd
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def calculate_sma(prices: pd.Series, period: int) -> pd.Series:
    """Calculate Simple Moving Average."""
    return prices.rolling(window=period).mean()


def calculate_ema(prices: pd.Series, period: int) -> pd.Series:
    """Calculate Exponential Moving Average."""
    return prices.ewm(span=period, adjust=False).mean()


def calculate_price_vs_sma(prices: pd.Series, period: int) -> pd.Series:
    """
    Calculate price relative to SMA as percentage.

    Returns:
        Series of percentage distances from SMA
    """
    sma = calculate_sma(prices, period)
    return (prices - sma) / sma * 100


def calculate_52w_high_low(df: pd.DataFrame, period: int = 252) -> tuple:
    """
    Calculate 52-week (or specified period) high and low.

    Returns:
        Tuple of (52w_high Series, 52w_low Series)
    """
    high_52w = df['High'].rolling(window=period).max()
    low_52w = df['Low'].rolling(window=period).min()

    return high_52w, low_52w


def calculate_price_position(close: pd.Series, high_52w: pd.Series, low_52w: pd.Series) -> pd.Series:
    """
    Calculate price position within 52-week range.

    Returns:
        Series of position values (0 to 1)
    """
    return (close - low_52w) / (high_52w - low_52w)


def calculate_gap(open_price: pd.Series, prev_close: pd.Series) -> pd.Series:
    """
    Calculate opening gap percentage.

    Returns:
        Series of gap percentages
    """
    return (open_price - prev_close) / prev_close * 100


def calculate_intraday_range(
    open_price: pd.Series,
    high: pd.Series,
    low: pd.Series
) -> pd.Series:
    """
    Calculate intraday trading range relative to open.

    Returns:
        Series of intraday range percentages
    """
    return (high - low) / open_price * 100


def generate_price_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate all price-based features.

    Args:
        df: DataFrame with OHLCV data

    Returns:
        DataFrame with price features added
    """
    result = df.copy()

    # Price vs SMA features
    result['Price_vs_SMA20'] = calculate_price_vs_sma(df['Close'], 20)
    result['Price_vs_SMA50'] = calculate_price_vs_sma(df['Close'], 50)
    result['Price_vs_SMA200'] = calculate_price_vs_sma(df['Close'], 200)

    # 52-week high/low features
    high_52w, low_52w = calculate_52w_high_low(df)
    result['Distance_52W_High'] = (high_52w - df['Close']) / high_52w * 100
    result['Distance_52W_Low'] = (df['Close'] - low_52w) / low_52w * 100
    result['Price_Position'] = calculate_price_position(df['Close'], high_52w, low_52w)

    # Gap feature
    prev_close = df['Close'].shift(1)
    result['Gap_Up_Pct'] = calculate_gap(df['Open'], prev_close)

    # Intraday range
    result['Intraday_Range'] = calculate_intraday_range(df['Open'], df['High'], df['Low'])

    logger.debug(f"Generated 8 price features")

    return result
