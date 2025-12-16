import pandas as pd
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def calculate_returns(prices: pd.Series, period: int) -> pd.Series:
    """
    Calculate returns over specified period.

    Args:
        prices: Series of closing prices
        period: Number of periods for return calculation

    Returns:
        Series of return percentages
    """
    return prices.pct_change(periods=period) * 100


def calculate_momentum_score(df: pd.DataFrame) -> pd.Series:
    """
    Calculate combined momentum score.

    Weighted combination of:
    - 1-day return (40%)
    - 5-day return (35%)
    - 10-day return (25%)

    Returns:
        Series of momentum scores
    """
    ret_1d = df['Close'].pct_change(1) * 100
    ret_5d = df['Close'].pct_change(5) * 100
    ret_10d = df['Close'].pct_change(10) * 100

    # Weighted score
    score = (ret_1d * 0.4) + (ret_5d * 0.35) + (ret_10d * 0.25)

    return score


def calculate_acceleration(prices: pd.Series, short_period: int = 5, long_period: int = 20) -> pd.Series:
    """
    Calculate momentum acceleration (rate of change of momentum).

    Measures if momentum is increasing or decreasing.

    Returns:
        Series of acceleration values
    """
    short_mom = prices.pct_change(short_period)
    long_mom = prices.pct_change(long_period)

    # Acceleration is the change in short-term momentum relative to long-term
    acceleration = short_mom - long_mom

    return acceleration * 100


def generate_momentum_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate all momentum-based features.

    Args:
        df: DataFrame with OHLCV data

    Returns:
        DataFrame with momentum features added
    """
    result = df.copy()

    # Return features
    result['Return_1D'] = calculate_returns(df['Close'], 1)
    result['Return_5D'] = calculate_returns(df['Close'], 5)
    result['Return_10D'] = calculate_returns(df['Close'], 10)

    # Combined momentum score
    result['Momentum_Score'] = calculate_momentum_score(df)

    # Momentum acceleration
    result['Acceleration'] = calculate_acceleration(df['Close'])

    logger.debug(f"Generated 5 momentum features")

    return result
