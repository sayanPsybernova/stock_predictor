"""
Comprehensive Technical Indicators Module
Contains 40+ technical indicators used by professional traders
For ML feature engineering and trading signal generation
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple


class TechnicalIndicators:
    """
    Professional-grade technical indicator calculator
    All indicators return pandas Series or DataFrames for easy integration
    """

    def __init__(self, df: pd.DataFrame):
        """
        Initialize with OHLCV DataFrame
        Required columns: open, high, low, close, volume
        """
        self.df = df.copy()
        self._validate_data()

    def _validate_data(self):
        """Validate required columns exist"""
        required = ['open', 'high', 'low', 'close', 'volume']
        # Handle case-insensitive column names
        self.df.columns = [c.lower() for c in self.df.columns]
        for col in required:
            if col not in self.df.columns:
                raise ValueError(f"Missing required column: {col}")

    # ==================== TREND INDICATORS ====================

    def sma(self, period: int = 20, column: str = 'close') -> pd.Series:
        """Simple Moving Average"""
        return self.df[column].rolling(window=period).mean()

    def ema(self, period: int = 20, column: str = 'close') -> pd.Series:
        """Exponential Moving Average"""
        return self.df[column].ewm(span=period, adjust=False).mean()

    def wma(self, period: int = 20, column: str = 'close') -> pd.Series:
        """Weighted Moving Average"""
        weights = np.arange(1, period + 1)
        return self.df[column].rolling(window=period).apply(
            lambda x: np.dot(x, weights) / weights.sum(), raw=True
        )

    def dema(self, period: int = 20, column: str = 'close') -> pd.Series:
        """Double Exponential Moving Average"""
        ema1 = self.ema(period, column)
        ema2 = ema1.ewm(span=period, adjust=False).mean()
        return 2 * ema1 - ema2

    def tema(self, period: int = 20, column: str = 'close') -> pd.Series:
        """Triple Exponential Moving Average"""
        ema1 = self.ema(period, column)
        ema2 = ema1.ewm(span=period, adjust=False).mean()
        ema3 = ema2.ewm(span=period, adjust=False).mean()
        return 3 * ema1 - 3 * ema2 + ema3

    def hull_ma(self, period: int = 20, column: str = 'close') -> pd.Series:
        """Hull Moving Average - faster and smoother"""
        half_period = int(period / 2)
        sqrt_period = int(np.sqrt(period))

        wma_half = self.wma(half_period, column)
        wma_full = self.wma(period, column)

        raw_hma = 2 * wma_half - wma_full
        # Create temp df for WMA calculation
        temp_df = pd.DataFrame({'close': raw_hma})
        temp_ti = TechnicalIndicators.__new__(TechnicalIndicators)
        temp_ti.df = temp_df
        return temp_ti.wma(sqrt_period, 'close')

    def vwma(self, period: int = 20) -> pd.Series:
        """Volume Weighted Moving Average"""
        return (self.df['close'] * self.df['volume']).rolling(window=period).sum() / \
               self.df['volume'].rolling(window=period).sum()

    def macd(self, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
        """MACD - Moving Average Convergence Divergence"""
        ema_fast = self.ema(fast)
        ema_slow = self.ema(slow)
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line

        return pd.DataFrame({
            'macd': macd_line,
            'signal': signal_line,
            'histogram': histogram
        })

    def adx(self, period: int = 14) -> pd.DataFrame:
        """Average Directional Index - trend strength"""
        high = self.df['high']
        low = self.df['low']
        close = self.df['close']

        # True Range
        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(window=period).mean()

        # Directional Movement
        up_move = high - high.shift(1)
        down_move = low.shift(1) - low

        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0)

        plus_di = 100 * pd.Series(plus_dm).rolling(window=period).mean() / atr
        minus_di = 100 * pd.Series(minus_dm).rolling(window=period).mean() / atr

        dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di)
        adx = dx.rolling(window=period).mean()

        return pd.DataFrame({
            'adx': adx,
            'plus_di': plus_di,
            'minus_di': minus_di
        })

    def supertrend(self, period: int = 10, multiplier: float = 3.0) -> pd.DataFrame:
        """Supertrend Indicator"""
        hl2 = (self.df['high'] + self.df['low']) / 2
        atr = self.atr(period)

        upper_band = hl2 + (multiplier * atr)
        lower_band = hl2 - (multiplier * atr)

        supertrend = pd.Series(index=self.df.index, dtype=float)
        direction = pd.Series(index=self.df.index, dtype=int)

        for i in range(period, len(self.df)):
            if self.df['close'].iloc[i] > upper_band.iloc[i-1]:
                supertrend.iloc[i] = lower_band.iloc[i]
                direction.iloc[i] = 1
            elif self.df['close'].iloc[i] < lower_band.iloc[i-1]:
                supertrend.iloc[i] = upper_band.iloc[i]
                direction.iloc[i] = -1
            else:
                if direction.iloc[i-1] == 1:
                    supertrend.iloc[i] = max(lower_band.iloc[i], supertrend.iloc[i-1])
                    direction.iloc[i] = 1
                else:
                    supertrend.iloc[i] = min(upper_band.iloc[i], supertrend.iloc[i-1])
                    direction.iloc[i] = -1

        return pd.DataFrame({
            'supertrend': supertrend,
            'direction': direction
        })

    def parabolic_sar(self, af_start: float = 0.02, af_step: float = 0.02,
                      af_max: float = 0.2) -> pd.Series:
        """Parabolic SAR - Stop and Reverse"""
        high = self.df['high']
        low = self.df['low']
        close = self.df['close']

        psar = close.copy()
        af = af_start
        ep = low.iloc[0]
        trend = 1  # 1 for uptrend, -1 for downtrend

        for i in range(2, len(close)):
            if trend == 1:
                psar.iloc[i] = psar.iloc[i-1] + af * (ep - psar.iloc[i-1])
                psar.iloc[i] = min(psar.iloc[i], low.iloc[i-1], low.iloc[i-2])

                if high.iloc[i] > ep:
                    ep = high.iloc[i]
                    af = min(af + af_step, af_max)

                if low.iloc[i] < psar.iloc[i]:
                    trend = -1
                    psar.iloc[i] = ep
                    ep = low.iloc[i]
                    af = af_start
            else:
                psar.iloc[i] = psar.iloc[i-1] - af * (psar.iloc[i-1] - ep)
                psar.iloc[i] = max(psar.iloc[i], high.iloc[i-1], high.iloc[i-2])

                if low.iloc[i] < ep:
                    ep = low.iloc[i]
                    af = min(af + af_step, af_max)

                if high.iloc[i] > psar.iloc[i]:
                    trend = 1
                    psar.iloc[i] = ep
                    ep = high.iloc[i]
                    af = af_start

        return psar

    def ichimoku(self, tenkan: int = 9, kijun: int = 26,
                 senkou_b: int = 52) -> pd.DataFrame:
        """Ichimoku Cloud"""
        high = self.df['high']
        low = self.df['low']
        close = self.df['close']

        # Tenkan-sen (Conversion Line)
        tenkan_sen = (high.rolling(window=tenkan).max() +
                      low.rolling(window=tenkan).min()) / 2

        # Kijun-sen (Base Line)
        kijun_sen = (high.rolling(window=kijun).max() +
                     low.rolling(window=kijun).min()) / 2

        # Senkou Span A (Leading Span A)
        senkou_span_a = ((tenkan_sen + kijun_sen) / 2).shift(kijun)

        # Senkou Span B (Leading Span B)
        senkou_span_b = ((high.rolling(window=senkou_b).max() +
                          low.rolling(window=senkou_b).min()) / 2).shift(kijun)

        # Chikou Span (Lagging Span)
        chikou_span = close.shift(-kijun)

        return pd.DataFrame({
            'tenkan_sen': tenkan_sen,
            'kijun_sen': kijun_sen,
            'senkou_span_a': senkou_span_a,
            'senkou_span_b': senkou_span_b,
            'chikou_span': chikou_span
        })

    # ==================== MOMENTUM INDICATORS ====================

    def rsi(self, period: int = 14) -> pd.Series:
        """Relative Strength Index"""
        delta = self.df['close'].diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)

        avg_gain = gain.rolling(window=period).mean()
        avg_loss = loss.rolling(window=period).mean()

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def stochastic(self, k_period: int = 14, d_period: int = 3,
                   smooth_k: int = 3) -> pd.DataFrame:
        """Stochastic Oscillator"""
        low_min = self.df['low'].rolling(window=k_period).min()
        high_max = self.df['high'].rolling(window=k_period).max()

        stoch_k = 100 * (self.df['close'] - low_min) / (high_max - low_min)
        stoch_k = stoch_k.rolling(window=smooth_k).mean()  # Smoothed %K
        stoch_d = stoch_k.rolling(window=d_period).mean()

        return pd.DataFrame({
            'stoch_k': stoch_k,
            'stoch_d': stoch_d
        })

    def stochastic_rsi(self, rsi_period: int = 14, stoch_period: int = 14,
                       k_period: int = 3, d_period: int = 3) -> pd.DataFrame:
        """Stochastic RSI"""
        rsi = self.rsi(rsi_period)

        stoch_rsi = (rsi - rsi.rolling(window=stoch_period).min()) / \
                    (rsi.rolling(window=stoch_period).max() -
                     rsi.rolling(window=stoch_period).min())

        k = stoch_rsi.rolling(window=k_period).mean() * 100
        d = k.rolling(window=d_period).mean()

        return pd.DataFrame({
            'stoch_rsi_k': k,
            'stoch_rsi_d': d
        })

    def williams_r(self, period: int = 14) -> pd.Series:
        """Williams %R"""
        high_max = self.df['high'].rolling(window=period).max()
        low_min = self.df['low'].rolling(window=period).min()

        wr = -100 * (high_max - self.df['close']) / (high_max - low_min)
        return wr

    def cci(self, period: int = 20) -> pd.Series:
        """Commodity Channel Index"""
        tp = (self.df['high'] + self.df['low'] + self.df['close']) / 3
        sma_tp = tp.rolling(window=period).mean()
        mad = tp.rolling(window=period).apply(lambda x: np.abs(x - x.mean()).mean())

        cci = (tp - sma_tp) / (0.015 * mad)
        return cci

    def roc(self, period: int = 12) -> pd.Series:
        """Rate of Change"""
        return 100 * (self.df['close'] - self.df['close'].shift(period)) / \
               self.df['close'].shift(period)

    def momentum(self, period: int = 10) -> pd.Series:
        """Momentum Indicator"""
        return self.df['close'] - self.df['close'].shift(period)

    def tsi(self, long_period: int = 25, short_period: int = 13) -> pd.Series:
        """True Strength Index"""
        price_change = self.df['close'].diff()

        # Double smoothed price change
        smooth1 = price_change.ewm(span=long_period, adjust=False).mean()
        smooth2 = smooth1.ewm(span=short_period, adjust=False).mean()

        # Double smoothed absolute price change
        abs_smooth1 = abs(price_change).ewm(span=long_period, adjust=False).mean()
        abs_smooth2 = abs_smooth1.ewm(span=short_period, adjust=False).mean()

        tsi = 100 * smooth2 / abs_smooth2
        return tsi

    def awesome_oscillator(self) -> pd.Series:
        """Awesome Oscillator"""
        midpoint = (self.df['high'] + self.df['low']) / 2
        ao = midpoint.rolling(window=5).mean() - midpoint.rolling(window=34).mean()
        return ao

    def ultimate_oscillator(self, period1: int = 7, period2: int = 14,
                            period3: int = 28) -> pd.Series:
        """Ultimate Oscillator"""
        high = self.df['high']
        low = self.df['low']
        close = self.df['close']
        prev_close = close.shift(1)

        bp = close - pd.concat([low, prev_close], axis=1).min(axis=1)
        tr = pd.concat([high, prev_close], axis=1).max(axis=1) - \
             pd.concat([low, prev_close], axis=1).min(axis=1)

        avg1 = bp.rolling(window=period1).sum() / tr.rolling(window=period1).sum()
        avg2 = bp.rolling(window=period2).sum() / tr.rolling(window=period2).sum()
        avg3 = bp.rolling(window=period3).sum() / tr.rolling(window=period3).sum()

        uo = 100 * ((4 * avg1) + (2 * avg2) + avg3) / 7
        return uo

    # ==================== VOLATILITY INDICATORS ====================

    def atr(self, period: int = 14) -> pd.Series:
        """Average True Range"""
        high = self.df['high']
        low = self.df['low']
        close = self.df['close']

        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))

        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(window=period).mean()
        return atr

    def bollinger_bands(self, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
        """Bollinger Bands"""
        sma = self.sma(period)
        std = self.df['close'].rolling(window=period).std()

        upper = sma + (std_dev * std)
        lower = sma - (std_dev * std)
        bandwidth = (upper - lower) / sma * 100
        percent_b = (self.df['close'] - lower) / (upper - lower)

        return pd.DataFrame({
            'bb_upper': upper,
            'bb_middle': sma,
            'bb_lower': lower,
            'bb_bandwidth': bandwidth,
            'bb_percent_b': percent_b
        })

    def keltner_channel(self, ema_period: int = 20, atr_period: int = 10,
                        multiplier: float = 2.0) -> pd.DataFrame:
        """Keltner Channel"""
        ema = self.ema(ema_period)
        atr = self.atr(atr_period)

        upper = ema + (multiplier * atr)
        lower = ema - (multiplier * atr)

        return pd.DataFrame({
            'kc_upper': upper,
            'kc_middle': ema,
            'kc_lower': lower
        })

    def donchian_channel(self, period: int = 20) -> pd.DataFrame:
        """Donchian Channel"""
        upper = self.df['high'].rolling(window=period).max()
        lower = self.df['low'].rolling(window=period).min()
        middle = (upper + lower) / 2

        return pd.DataFrame({
            'dc_upper': upper,
            'dc_middle': middle,
            'dc_lower': lower
        })

    def chandelier_exit(self, period: int = 22, multiplier: float = 3.0) -> pd.DataFrame:
        """Chandelier Exit"""
        atr = self.atr(period)
        highest_high = self.df['high'].rolling(window=period).max()
        lowest_low = self.df['low'].rolling(window=period).min()

        long_exit = highest_high - (multiplier * atr)
        short_exit = lowest_low + (multiplier * atr)

        return pd.DataFrame({
            'chandelier_long': long_exit,
            'chandelier_short': short_exit
        })

    def historical_volatility(self, period: int = 20) -> pd.Series:
        """Historical Volatility (Annualized)"""
        log_return = np.log(self.df['close'] / self.df['close'].shift(1))
        hv = log_return.rolling(window=period).std() * np.sqrt(252) * 100
        return hv

    # ==================== VOLUME INDICATORS ====================

    def obv(self) -> pd.Series:
        """On-Balance Volume"""
        obv = pd.Series(index=self.df.index, dtype=float)
        obv.iloc[0] = self.df['volume'].iloc[0]

        for i in range(1, len(self.df)):
            if self.df['close'].iloc[i] > self.df['close'].iloc[i-1]:
                obv.iloc[i] = obv.iloc[i-1] + self.df['volume'].iloc[i]
            elif self.df['close'].iloc[i] < self.df['close'].iloc[i-1]:
                obv.iloc[i] = obv.iloc[i-1] - self.df['volume'].iloc[i]
            else:
                obv.iloc[i] = obv.iloc[i-1]

        return obv

    def ad_line(self) -> pd.Series:
        """Accumulation/Distribution Line"""
        clv = ((self.df['close'] - self.df['low']) -
               (self.df['high'] - self.df['close'])) / \
              (self.df['high'] - self.df['low'])
        clv = clv.fillna(0)
        ad = (clv * self.df['volume']).cumsum()
        return ad

    def cmf(self, period: int = 20) -> pd.Series:
        """Chaikin Money Flow"""
        mfv = ((self.df['close'] - self.df['low']) -
               (self.df['high'] - self.df['close'])) / \
              (self.df['high'] - self.df['low']) * self.df['volume']
        mfv = mfv.fillna(0)

        cmf = mfv.rolling(window=period).sum() / \
              self.df['volume'].rolling(window=period).sum()
        return cmf

    def mfi(self, period: int = 14) -> pd.Series:
        """Money Flow Index"""
        tp = (self.df['high'] + self.df['low'] + self.df['close']) / 3
        mf = tp * self.df['volume']

        positive_mf = pd.Series(np.where(tp > tp.shift(1), mf, 0), index=self.df.index)
        negative_mf = pd.Series(np.where(tp < tp.shift(1), mf, 0), index=self.df.index)

        mfr = positive_mf.rolling(window=period).sum() / \
              negative_mf.rolling(window=period).sum()

        mfi = 100 - (100 / (1 + mfr))
        return mfi

    def vwap(self) -> pd.Series:
        """Volume Weighted Average Price (intraday)"""
        tp = (self.df['high'] + self.df['low'] + self.df['close']) / 3
        vwap = (tp * self.df['volume']).cumsum() / self.df['volume'].cumsum()
        return vwap

    def force_index(self, period: int = 13) -> pd.Series:
        """Force Index"""
        fi = (self.df['close'] - self.df['close'].shift(1)) * self.df['volume']
        return fi.ewm(span=period, adjust=False).mean()

    def ease_of_movement(self, period: int = 14) -> pd.Series:
        """Ease of Movement"""
        dm = ((self.df['high'] + self.df['low']) / 2) - \
             ((self.df['high'].shift(1) + self.df['low'].shift(1)) / 2)
        br = self.df['volume'] / (self.df['high'] - self.df['low'])
        eom = dm / br
        return eom.rolling(window=period).mean()

    def volume_oscillator(self, short_period: int = 5,
                          long_period: int = 20) -> pd.Series:
        """Volume Oscillator"""
        short_ema = self.df['volume'].ewm(span=short_period, adjust=False).mean()
        long_ema = self.df['volume'].ewm(span=long_period, adjust=False).mean()
        return (short_ema - long_ema) / long_ema * 100

    # ==================== SUPPORT/RESISTANCE ====================

    def pivot_points(self) -> pd.DataFrame:
        """Standard Pivot Points"""
        high = self.df['high'].shift(1)
        low = self.df['low'].shift(1)
        close = self.df['close'].shift(1)

        pp = (high + low + close) / 3
        r1 = 2 * pp - low
        s1 = 2 * pp - high
        r2 = pp + (high - low)
        s2 = pp - (high - low)
        r3 = high + 2 * (pp - low)
        s3 = low - 2 * (high - pp)

        return pd.DataFrame({
            'pivot': pp,
            'r1': r1, 's1': s1,
            'r2': r2, 's2': s2,
            'r3': r3, 's3': s3
        })

    def fibonacci_pivot_points(self) -> pd.DataFrame:
        """Fibonacci Pivot Points"""
        high = self.df['high'].shift(1)
        low = self.df['low'].shift(1)
        close = self.df['close'].shift(1)

        pp = (high + low + close) / 3
        diff = high - low

        r1 = pp + 0.382 * diff
        r2 = pp + 0.618 * diff
        r3 = pp + diff
        s1 = pp - 0.382 * diff
        s2 = pp - 0.618 * diff
        s3 = pp - diff

        return pd.DataFrame({
            'pivot': pp,
            'r1': r1, 's1': s1,
            'r2': r2, 's2': s2,
            'r3': r3, 's3': s3
        })

    def fibonacci_retracement(self, lookback: int = 100) -> pd.DataFrame:
        """Fibonacci Retracement Levels"""
        high = self.df['high'].rolling(window=lookback).max()
        low = self.df['low'].rolling(window=lookback).min()
        diff = high - low

        levels = {
            'fib_0': low,
            'fib_236': low + 0.236 * diff,
            'fib_382': low + 0.382 * diff,
            'fib_500': low + 0.5 * diff,
            'fib_618': low + 0.618 * diff,
            'fib_786': low + 0.786 * diff,
            'fib_100': high
        }

        return pd.DataFrame(levels)

    # ==================== TREND STRENGTH ====================

    def aroon(self, period: int = 25) -> pd.DataFrame:
        """Aroon Indicator"""
        aroon_up = pd.Series(index=self.df.index, dtype=float)
        aroon_down = pd.Series(index=self.df.index, dtype=float)

        for i in range(period, len(self.df)):
            window = self.df.iloc[i-period:i+1]
            days_since_high = period - window['high'].values.argmax()
            days_since_low = period - window['low'].values.argmin()

            aroon_up.iloc[i] = ((period - days_since_high) / period) * 100
            aroon_down.iloc[i] = ((period - days_since_low) / period) * 100

        aroon_osc = aroon_up - aroon_down

        return pd.DataFrame({
            'aroon_up': aroon_up,
            'aroon_down': aroon_down,
            'aroon_osc': aroon_osc
        })

    def choppiness_index(self, period: int = 14) -> pd.Series:
        """Choppiness Index - Market choppiness"""
        atr_sum = self.atr(1).rolling(window=period).sum()
        high_max = self.df['high'].rolling(window=period).max()
        low_min = self.df['low'].rolling(window=period).min()

        ci = 100 * np.log10(atr_sum / (high_max - low_min)) / np.log10(period)
        return ci

    def elder_ray(self, period: int = 13) -> pd.DataFrame:
        """Elder Ray Index"""
        ema = self.ema(period)
        bull_power = self.df['high'] - ema
        bear_power = self.df['low'] - ema

        return pd.DataFrame({
            'bull_power': bull_power,
            'bear_power': bear_power
        })

    # ==================== CALCULATE ALL INDICATORS ====================

    def calculate_all(self) -> pd.DataFrame:
        """Calculate all indicators and return as DataFrame"""
        result = self.df.copy()

        # Moving Averages
        result['sma_5'] = self.sma(5)
        result['sma_10'] = self.sma(10)
        result['sma_20'] = self.sma(20)
        result['sma_50'] = self.sma(50)
        result['sma_200'] = self.sma(200)
        result['ema_9'] = self.ema(9)
        result['ema_12'] = self.ema(12)
        result['ema_21'] = self.ema(21)
        result['ema_26'] = self.ema(26)
        result['vwma_20'] = self.vwma(20)

        # MACD
        macd_df = self.macd()
        result['macd'] = macd_df['macd']
        result['macd_signal'] = macd_df['signal']
        result['macd_histogram'] = macd_df['histogram']

        # ADX
        adx_df = self.adx()
        result['adx'] = adx_df['adx']
        result['adx_plus_di'] = adx_df['plus_di']
        result['adx_minus_di'] = adx_df['minus_di']

        # RSI
        result['rsi_14'] = self.rsi(14)
        result['rsi_7'] = self.rsi(7)

        # Stochastic
        stoch_df = self.stochastic()
        result['stoch_k'] = stoch_df['stoch_k']
        result['stoch_d'] = stoch_df['stoch_d']

        # Stochastic RSI
        stoch_rsi_df = self.stochastic_rsi()
        result['stoch_rsi_k'] = stoch_rsi_df['stoch_rsi_k']
        result['stoch_rsi_d'] = stoch_rsi_df['stoch_rsi_d']

        # Other Momentum
        result['williams_r'] = self.williams_r()
        result['cci'] = self.cci()
        result['roc'] = self.roc()
        result['momentum'] = self.momentum()
        result['tsi'] = self.tsi()
        result['ao'] = self.awesome_oscillator()
        result['uo'] = self.ultimate_oscillator()

        # Volatility
        result['atr'] = self.atr()

        bb_df = self.bollinger_bands()
        result['bb_upper'] = bb_df['bb_upper']
        result['bb_middle'] = bb_df['bb_middle']
        result['bb_lower'] = bb_df['bb_lower']
        result['bb_bandwidth'] = bb_df['bb_bandwidth']
        result['bb_percent_b'] = bb_df['bb_percent_b']

        kc_df = self.keltner_channel()
        result['kc_upper'] = kc_df['kc_upper']
        result['kc_middle'] = kc_df['kc_middle']
        result['kc_lower'] = kc_df['kc_lower']

        result['hist_volatility'] = self.historical_volatility()

        # Volume
        result['obv'] = self.obv()
        result['ad_line'] = self.ad_line()
        result['cmf'] = self.cmf()
        result['mfi'] = self.mfi()
        result['vwap'] = self.vwap()
        result['force_index'] = self.force_index()
        result['volume_osc'] = self.volume_oscillator()

        # Trend Strength
        aroon_df = self.aroon()
        result['aroon_up'] = aroon_df['aroon_up']
        result['aroon_down'] = aroon_df['aroon_down']
        result['aroon_osc'] = aroon_df['aroon_osc']

        result['choppiness'] = self.choppiness_index()

        elder_df = self.elder_ray()
        result['bull_power'] = elder_df['bull_power']
        result['bear_power'] = elder_df['bear_power']

        # Ichimoku
        ichimoku_df = self.ichimoku()
        result['ichimoku_tenkan'] = ichimoku_df['tenkan_sen']
        result['ichimoku_kijun'] = ichimoku_df['kijun_sen']
        result['ichimoku_senkou_a'] = ichimoku_df['senkou_span_a']
        result['ichimoku_senkou_b'] = ichimoku_df['senkou_span_b']

        # Fibonacci
        fib_df = self.fibonacci_retracement()
        result['fib_382'] = fib_df['fib_382']
        result['fib_500'] = fib_df['fib_500']
        result['fib_618'] = fib_df['fib_618']

        # Pivot Points
        pivot_df = self.pivot_points()
        result['pivot'] = pivot_df['pivot']
        result['pivot_r1'] = pivot_df['r1']
        result['pivot_s1'] = pivot_df['s1']
        result['pivot_r2'] = pivot_df['r2']
        result['pivot_s2'] = pivot_df['s2']

        return result


def get_indicator_signals(ti: TechnicalIndicators) -> Dict[str, str]:
    """
    Generate trading signals from indicators
    Returns dictionary of indicator -> signal (BULLISH/BEARISH/NEUTRAL)
    """
    df = ti.df
    signals = {}

    # RSI Signal
    rsi = ti.rsi().iloc[-1]
    if rsi < 30:
        signals['rsi'] = 'BULLISH'
    elif rsi > 70:
        signals['rsi'] = 'BEARISH'
    else:
        signals['rsi'] = 'NEUTRAL'

    # MACD Signal
    macd_df = ti.macd()
    if macd_df['histogram'].iloc[-1] > 0 and macd_df['histogram'].iloc[-2] < 0:
        signals['macd'] = 'BULLISH'
    elif macd_df['histogram'].iloc[-1] < 0 and macd_df['histogram'].iloc[-2] > 0:
        signals['macd'] = 'BEARISH'
    else:
        signals['macd'] = 'BULLISH' if macd_df['histogram'].iloc[-1] > 0 else 'BEARISH'

    # Bollinger Bands
    bb_df = ti.bollinger_bands()
    close = df['close'].iloc[-1]
    if close < bb_df['bb_lower'].iloc[-1]:
        signals['bollinger'] = 'BULLISH'
    elif close > bb_df['bb_upper'].iloc[-1]:
        signals['bollinger'] = 'BEARISH'
    else:
        signals['bollinger'] = 'NEUTRAL'

    # Moving Average Trend
    sma20 = ti.sma(20).iloc[-1]
    sma50 = ti.sma(50).iloc[-1]
    if close > sma20 > sma50:
        signals['ma_trend'] = 'BULLISH'
    elif close < sma20 < sma50:
        signals['ma_trend'] = 'BEARISH'
    else:
        signals['ma_trend'] = 'NEUTRAL'

    # Stochastic
    stoch = ti.stochastic()
    if stoch['stoch_k'].iloc[-1] < 20:
        signals['stochastic'] = 'BULLISH'
    elif stoch['stoch_k'].iloc[-1] > 80:
        signals['stochastic'] = 'BEARISH'
    else:
        signals['stochastic'] = 'NEUTRAL'

    # ADX Trend Strength
    adx_df = ti.adx()
    adx_val = adx_df['adx'].iloc[-1]
    if adx_val > 25:
        if adx_df['plus_di'].iloc[-1] > adx_df['minus_di'].iloc[-1]:
            signals['adx'] = 'BULLISH'
        else:
            signals['adx'] = 'BEARISH'
    else:
        signals['adx'] = 'NEUTRAL'

    # MFI
    mfi = ti.mfi().iloc[-1]
    if mfi < 20:
        signals['mfi'] = 'BULLISH'
    elif mfi > 80:
        signals['mfi'] = 'BEARISH'
    else:
        signals['mfi'] = 'NEUTRAL'

    return signals


def calculate_indicator_score(ti: TechnicalIndicators) -> Tuple[float, List[str]]:
    """
    Calculate overall technical score (0-100) from all indicators
    Returns: (score, list of reasoning)
    """
    signals = get_indicator_signals(ti)
    reasoning = []

    bullish_count = sum(1 for s in signals.values() if s == 'BULLISH')
    bearish_count = sum(1 for s in signals.values() if s == 'BEARISH')
    total = len(signals)

    # Score calculation
    score = 50 + (bullish_count - bearish_count) * (50 / total)
    score = max(0, min(100, score))

    # Generate reasoning
    for indicator, signal in signals.items():
        if signal == 'BULLISH':
            reasoning.append(f"{indicator.upper()}: Bullish signal")
        elif signal == 'BEARISH':
            reasoning.append(f"{indicator.upper()}: Bearish signal")

    return score, reasoning
