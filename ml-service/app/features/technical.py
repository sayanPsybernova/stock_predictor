import pandas as pd
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """
    Calculate Relative Strength Index (RSI).

    Args:
        prices: Series of closing prices
        period: RSI period (default 14)

    Returns:
        Series of RSI values (0-100)
    """
    delta = prices.diff()

    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)

    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))

    return rsi


def calculate_macd(
    prices: pd.Series,
    fast_period: int = 12,
    slow_period: int = 26,
    signal_period: int = 9
) -> tuple:
    """
    Calculate MACD (Moving Average Convergence Divergence).

    Returns:
        Tuple of (MACD line, Signal line, Histogram)
    """
    ema_fast = prices.ewm(span=fast_period, adjust=False).mean()
    ema_slow = prices.ewm(span=slow_period, adjust=False).mean()

    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
    histogram = macd_line - signal_line

    return macd_line, signal_line, histogram


def calculate_stochastic(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    k_period: int = 14,
    d_period: int = 3
) -> tuple:
    """
    Calculate Stochastic Oscillator (%K and %D).

    Returns:
        Tuple of (%K, %D)
    """
    lowest_low = low.rolling(window=k_period).min()
    highest_high = high.rolling(window=k_period).max()

    stoch_k = 100 * (close - lowest_low) / (highest_high - lowest_low)
    stoch_d = stoch_k.rolling(window=d_period).mean()

    return stoch_k, stoch_d


def calculate_williams_r(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 14
) -> pd.Series:
    """
    Calculate Williams %R.

    Returns:
        Series of Williams %R values (-100 to 0)
    """
    highest_high = high.rolling(window=period).max()
    lowest_low = low.rolling(window=period).min()

    williams_r = -100 * (highest_high - close) / (highest_high - lowest_low)

    return williams_r


def calculate_cci(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 20
) -> pd.Series:
    """
    Calculate Commodity Channel Index (CCI).

    Returns:
        Series of CCI values
    """
    typical_price = (high + low + close) / 3
    sma = typical_price.rolling(window=period).mean()
    mean_deviation = typical_price.rolling(window=period).apply(
        lambda x: np.abs(x - x.mean()).mean()
    )

    cci = (typical_price - sma) / (0.015 * mean_deviation)

    return cci


def calculate_adx(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 14
) -> pd.Series:
    """
    Calculate Average Directional Index (ADX).

    Returns:
        Series of ADX values (0-100)
    """
    plus_dm = high.diff()
    minus_dm = low.diff()

    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
    minus_dm = (-minus_dm).where((minus_dm > plus_dm) & (minus_dm > 0), 0)

    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.ewm(span=period, adjust=False).mean()

    plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr)

    dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di)
    adx = dx.ewm(span=period, adjust=False).mean()

    return adx


def generate_technical_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Generate all technical indicator features.

    Args:
        df: DataFrame with OHLCV data (Open, High, Low, Close, Volume)

    Returns:
        DataFrame with technical features added
    """
    result = df.copy()

    # RSI features
    result['RSI_14'] = calculate_rsi(df['Close'], period=14)
    result['RSI_7'] = calculate_rsi(df['Close'], period=7)

    # MACD features
    macd, signal, hist = calculate_macd(df['Close'])
    result['MACD'] = macd
    result['MACD_Signal'] = signal
    result['MACD_Histogram'] = hist

    # Stochastic features
    stoch_k, stoch_d = calculate_stochastic(df['High'], df['Low'], df['Close'])
    result['Stochastic_K'] = stoch_k
    result['Stochastic_D'] = stoch_d

    # Williams %R
    result['Williams_R'] = calculate_williams_r(df['High'], df['Low'], df['Close'])

    # CCI
    result['CCI'] = calculate_cci(df['High'], df['Low'], df['Close'])

    # ADX
    result['ADX'] = calculate_adx(df['High'], df['Low'], df['Close'])

    logger.debug(f"Generated 10 technical features")

    return result
