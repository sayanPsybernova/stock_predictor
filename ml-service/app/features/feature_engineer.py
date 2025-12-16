"""
ML Feature Engineering Pipeline
Combines candlestick patterns, technical indicators, and market features
into a comprehensive feature set for XGBoost training
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
import yfinance as yf
from datetime import datetime, timedelta

from .candlestick_patterns import CandlestickPatterns
from .technical_indicators import TechnicalIndicators


class FeatureEngineer:
    """
    Professional-grade feature engineering for stock prediction
    Creates 150+ features from OHLCV data
    """

    def __init__(self, df: pd.DataFrame):
        """
        Initialize with OHLCV DataFrame
        Required columns: open, high, low, close, volume
        """
        self.df = df.copy()
        self.df.columns = [c.lower() for c in self.df.columns]
        self._validate_data()

    def _validate_data(self):
        """Validate required columns"""
        required = ['open', 'high', 'low', 'close', 'volume']
        for col in required:
            if col not in self.df.columns:
                raise ValueError(f"Missing required column: {col}")

    def create_all_features(self) -> pd.DataFrame:
        """
        Create all features for ML training
        Returns DataFrame with 150+ features
        """
        result = self.df.copy()

        # 1. Price-based features
        result = self._add_price_features(result)

        # 2. Volume-based features
        result = self._add_volume_features(result)

        # 3. Technical indicators (40+ features)
        result = self._add_technical_indicators(result)

        # 4. Candlestick patterns (50+ features)
        result = self._add_candlestick_patterns(result)

        # 5. Lag features
        result = self._add_lag_features(result)

        # 6. Rolling statistics
        result = self._add_rolling_features(result)

        # 7. Date/Time features
        result = self._add_datetime_features(result)

        # 8. Target variable (for training)
        result = self._add_target(result)

        return result

    def _add_price_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add price-derived features"""
        # Returns
        df['return_1d'] = df['close'].pct_change(1)
        df['return_2d'] = df['close'].pct_change(2)
        df['return_5d'] = df['close'].pct_change(5)
        df['return_10d'] = df['close'].pct_change(10)
        df['return_20d'] = df['close'].pct_change(20)

        # Log returns
        df['log_return'] = np.log(df['close'] / df['close'].shift(1))
        df['log_return_5d'] = np.log(df['close'] / df['close'].shift(5))

        # Price ratios
        df['high_low_ratio'] = df['high'] / df['low']
        df['close_open_ratio'] = df['close'] / df['open']
        df['high_close_ratio'] = df['high'] / df['close']
        df['low_close_ratio'] = df['low'] / df['close']

        # Candle body and shadow
        df['body'] = abs(df['close'] - df['open'])
        df['body_pct'] = df['body'] / df['close'] * 100
        df['upper_shadow'] = df['high'] - df[['open', 'close']].max(axis=1)
        df['lower_shadow'] = df[['open', 'close']].min(axis=1) - df['low']
        df['shadow_ratio'] = df['upper_shadow'] / (df['lower_shadow'] + 0.0001)

        # Range
        df['range'] = df['high'] - df['low']
        df['range_pct'] = df['range'] / df['close'] * 100

        # Gap
        df['gap'] = df['open'] - df['close'].shift(1)
        df['gap_pct'] = df['gap'] / df['close'].shift(1) * 100

        # Distance from high/low
        rolling_high = df['high'].rolling(20).max()
        rolling_low = df['low'].rolling(20).min()
        df['dist_from_high'] = (rolling_high - df['close']) / rolling_high * 100
        df['dist_from_low'] = (df['close'] - rolling_low) / rolling_low * 100

        # Price position in range
        df['price_position'] = (df['close'] - rolling_low) / (rolling_high - rolling_low + 0.0001)

        return df

    def _add_volume_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add volume-derived features"""
        # Volume change
        df['volume_change'] = df['volume'].pct_change()
        df['volume_change_5d'] = df['volume'].pct_change(5)

        # Volume moving averages
        df['volume_ma_5'] = df['volume'].rolling(5).mean()
        df['volume_ma_10'] = df['volume'].rolling(10).mean()
        df['volume_ma_20'] = df['volume'].rolling(20).mean()

        # Volume ratios
        df['volume_ratio_5'] = df['volume'] / df['volume_ma_5']
        df['volume_ratio_10'] = df['volume'] / df['volume_ma_10']
        df['volume_ratio_20'] = df['volume'] / df['volume_ma_20']

        # Volume trend
        df['volume_trend'] = df['volume_ma_5'] / df['volume_ma_20']

        # Price-Volume relationship
        df['pv_trend'] = df['close'] * df['volume']
        df['pv_trend_ma'] = df['pv_trend'].rolling(10).mean()

        # Volume spike detection
        volume_std = df['volume'].rolling(20).std()
        df['volume_zscore'] = (df['volume'] - df['volume_ma_20']) / (volume_std + 0.0001)

        # Up/Down volume
        df['up_volume'] = np.where(df['close'] > df['open'], df['volume'], 0)
        df['down_volume'] = np.where(df['close'] < df['open'], df['volume'], 0)
        df['up_down_volume_ratio'] = df['up_volume'].rolling(10).sum() / \
                                      (df['down_volume'].rolling(10).sum() + 1)

        return df

    def _add_technical_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add all technical indicators"""
        ti = TechnicalIndicators(df)

        # Moving Averages
        df['sma_5'] = ti.sma(5)
        df['sma_10'] = ti.sma(10)
        df['sma_20'] = ti.sma(20)
        df['sma_50'] = ti.sma(50)
        df['sma_200'] = ti.sma(200)
        df['ema_9'] = ti.ema(9)
        df['ema_12'] = ti.ema(12)
        df['ema_21'] = ti.ema(21)
        df['ema_26'] = ti.ema(26)

        # MA crossover features
        df['sma_5_20_cross'] = (df['sma_5'] > df['sma_20']).astype(int)
        df['sma_20_50_cross'] = (df['sma_20'] > df['sma_50']).astype(int)
        df['sma_50_200_cross'] = (df['sma_50'] > df['sma_200']).astype(int)
        df['ema_9_21_cross'] = (df['ema_9'] > df['ema_21']).astype(int)

        # Price distance from MAs
        df['close_sma_20_dist'] = (df['close'] - df['sma_20']) / df['sma_20'] * 100
        df['close_sma_50_dist'] = (df['close'] - df['sma_50']) / df['sma_50'] * 100
        df['close_sma_200_dist'] = (df['close'] - df['sma_200']) / df['sma_200'] * 100

        # MACD
        macd = ti.macd()
        df['macd'] = macd['macd']
        df['macd_signal'] = macd['signal']
        df['macd_histogram'] = macd['histogram']
        df['macd_cross'] = (df['macd'] > df['macd_signal']).astype(int)

        # RSI
        df['rsi_7'] = ti.rsi(7)
        df['rsi_14'] = ti.rsi(14)
        df['rsi_21'] = ti.rsi(21)

        # RSI zones
        df['rsi_oversold'] = (df['rsi_14'] < 30).astype(int)
        df['rsi_overbought'] = (df['rsi_14'] > 70).astype(int)
        df['rsi_bullish_div'] = ((df['close'] < df['close'].shift(5)) &
                                  (df['rsi_14'] > df['rsi_14'].shift(5))).astype(int)
        df['rsi_bearish_div'] = ((df['close'] > df['close'].shift(5)) &
                                  (df['rsi_14'] < df['rsi_14'].shift(5))).astype(int)

        # Stochastic
        stoch = ti.stochastic()
        df['stoch_k'] = stoch['stoch_k']
        df['stoch_d'] = stoch['stoch_d']
        df['stoch_cross'] = (df['stoch_k'] > df['stoch_d']).astype(int)
        df['stoch_oversold'] = (df['stoch_k'] < 20).astype(int)
        df['stoch_overbought'] = (df['stoch_k'] > 80).astype(int)

        # ADX
        adx = ti.adx()
        df['adx'] = adx['adx']
        df['adx_plus_di'] = adx['plus_di']
        df['adx_minus_di'] = adx['minus_di']
        df['adx_strong_trend'] = (df['adx'] > 25).astype(int)
        df['adx_bullish'] = (df['adx_plus_di'] > df['adx_minus_di']).astype(int)

        # Bollinger Bands
        bb = ti.bollinger_bands()
        df['bb_upper'] = bb['bb_upper']
        df['bb_middle'] = bb['bb_middle']
        df['bb_lower'] = bb['bb_lower']
        df['bb_bandwidth'] = bb['bb_bandwidth']
        df['bb_percent_b'] = bb['bb_percent_b']
        df['bb_squeeze'] = (df['bb_bandwidth'] < df['bb_bandwidth'].rolling(50).mean()).astype(int)

        # ATR
        df['atr'] = ti.atr()
        df['atr_percent'] = df['atr'] / df['close'] * 100
        df['atr_ma_ratio'] = df['atr'] / df['atr'].rolling(20).mean()

        # Williams %R
        df['williams_r'] = ti.williams_r()

        # CCI
        df['cci'] = ti.cci()
        df['cci_oversold'] = (df['cci'] < -100).astype(int)
        df['cci_overbought'] = (df['cci'] > 100).astype(int)

        # MFI
        df['mfi'] = ti.mfi()
        df['mfi_oversold'] = (df['mfi'] < 20).astype(int)
        df['mfi_overbought'] = (df['mfi'] > 80).astype(int)

        # OBV
        df['obv'] = ti.obv()
        df['obv_ma'] = df['obv'].rolling(20).mean()
        df['obv_trend'] = (df['obv'] > df['obv_ma']).astype(int)

        # CMF
        df['cmf'] = ti.cmf()
        df['cmf_bullish'] = (df['cmf'] > 0).astype(int)

        # Force Index
        df['force_index'] = ti.force_index()

        # ROC
        df['roc'] = ti.roc()
        df['momentum'] = ti.momentum()

        # TSI
        df['tsi'] = ti.tsi()

        # Awesome Oscillator
        df['ao'] = ti.awesome_oscillator()

        # Aroon
        aroon = ti.aroon()
        df['aroon_up'] = aroon['aroon_up']
        df['aroon_down'] = aroon['aroon_down']
        df['aroon_osc'] = aroon['aroon_osc']
        df['aroon_bullish'] = (df['aroon_up'] > df['aroon_down']).astype(int)

        # Choppiness Index
        df['choppiness'] = ti.choppiness_index()
        df['choppy_market'] = (df['choppiness'] > 61.8).astype(int)

        # Elder Ray
        elder = ti.elder_ray()
        df['bull_power'] = elder['bull_power']
        df['bear_power'] = elder['bear_power']

        # Ichimoku (key levels)
        ichimoku = ti.ichimoku()
        df['ichimoku_tenkan'] = ichimoku['tenkan_sen']
        df['ichimoku_kijun'] = ichimoku['kijun_sen']
        df['ichimoku_cloud_bullish'] = (ichimoku['senkou_span_a'] > ichimoku['senkou_span_b']).astype(int)
        df['price_above_cloud'] = (df['close'] > ichimoku['senkou_span_a']).astype(int)

        # Historical Volatility
        df['hist_volatility'] = ti.historical_volatility()

        return df

    def _add_candlestick_patterns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add all candlestick pattern features"""
        cp = CandlestickPatterns(df)

        # Single candle patterns
        df['pattern_doji'] = cp.doji().astype(int)
        df['pattern_long_legged_doji'] = cp.long_legged_doji().astype(int)
        df['pattern_dragonfly_doji'] = cp.dragonfly_doji().astype(int)
        df['pattern_gravestone_doji'] = cp.gravestone_doji().astype(int)
        df['pattern_hammer'] = cp.hammer().astype(int)
        df['pattern_inverted_hammer'] = cp.inverted_hammer().astype(int)
        df['pattern_hanging_man'] = cp.hanging_man().astype(int)
        df['pattern_shooting_star'] = cp.shooting_star().astype(int)
        df['pattern_marubozu_bullish'] = cp.bullish_marubozu().astype(int)
        df['pattern_marubozu_bearish'] = cp.bearish_marubozu().astype(int)
        df['pattern_spinning_top'] = cp.spinning_top().astype(int)

        # Double candle patterns
        df['pattern_engulfing_bullish'] = cp.bullish_engulfing().astype(int)
        df['pattern_engulfing_bearish'] = cp.bearish_engulfing().astype(int)
        df['pattern_harami_bullish'] = cp.bullish_harami().astype(int)
        df['pattern_harami_bearish'] = cp.bearish_harami().astype(int)
        df['pattern_piercing'] = cp.piercing_line().astype(int)
        df['pattern_dark_cloud'] = cp.dark_cloud_cover().astype(int)
        df['pattern_tweezer_top'] = cp.tweezer_top().astype(int)
        df['pattern_tweezer_bottom'] = cp.tweezer_bottom().astype(int)

        # Triple candle patterns
        df['pattern_morning_star'] = cp.morning_star().astype(int)
        df['pattern_evening_star'] = cp.evening_star().astype(int)
        df['pattern_three_white_soldiers'] = cp.three_white_soldiers().astype(int)
        df['pattern_three_black_crows'] = cp.three_black_crows().astype(int)
        df['pattern_three_inside_up'] = cp.three_inside_up().astype(int)
        df['pattern_three_inside_down'] = cp.three_inside_down().astype(int)
        df['pattern_three_outside_up'] = cp.three_outside_up().astype(int)
        df['pattern_three_outside_down'] = cp.three_outside_down().astype(int)

        # Pattern scores
        df['bullish_pattern_score'] = cp.bullish_pattern_score()
        df['bearish_pattern_score'] = cp.bearish_pattern_score()
        df['pattern_score'] = cp.pattern_score()

        return df

    def _add_lag_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add lagged features"""
        for col in ['close', 'volume', 'return_1d', 'rsi_14']:
            if col in df.columns:
                for lag in [1, 2, 3, 5, 10]:
                    df[f'{col}_lag_{lag}'] = df[col].shift(lag)

        # Lagged pattern scores
        if 'pattern_score' in df.columns:
            for lag in [1, 2, 3]:
                df[f'pattern_score_lag_{lag}'] = df['pattern_score'].shift(lag)

        return df

    def _add_rolling_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add rolling statistics"""
        # Rolling returns
        for window in [5, 10, 20]:
            df[f'return_mean_{window}'] = df['return_1d'].rolling(window).mean()
            df[f'return_std_{window}'] = df['return_1d'].rolling(window).std()
            df[f'return_skew_{window}'] = df['return_1d'].rolling(window).skew()
            df[f'return_kurt_{window}'] = df['return_1d'].rolling(window).kurt()

            # High/Low range
            df[f'high_max_{window}'] = df['high'].rolling(window).max()
            df[f'low_min_{window}'] = df['low'].rolling(window).min()
            df[f'range_{window}'] = df[f'high_max_{window}'] - df[f'low_min_{window}']

        # Cumulative returns
        df['cumulative_return_5'] = (1 + df['return_1d']).rolling(5).apply(np.prod, raw=True) - 1
        df['cumulative_return_10'] = (1 + df['return_1d']).rolling(10).apply(np.prod, raw=True) - 1
        df['cumulative_return_20'] = (1 + df['return_1d']).rolling(20).apply(np.prod, raw=True) - 1

        # Streak features
        df['up_streak'] = df.groupby((df['return_1d'] <= 0).cumsum()).cumcount()
        df['down_streak'] = df.groupby((df['return_1d'] >= 0).cumsum()).cumcount()

        return df

    def _add_datetime_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add date/time features"""
        if df.index.name == 'date' or isinstance(df.index, pd.DatetimeIndex):
            idx = df.index
        elif 'date' in df.columns:
            idx = pd.to_datetime(df['date'])
        else:
            return df

        df['day_of_week'] = idx.dayofweek
        df['day_of_month'] = idx.day
        df['week_of_year'] = idx.isocalendar().week.values
        df['month'] = idx.month
        df['quarter'] = idx.quarter

        # Cyclical encoding
        df['day_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
        df['day_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)

        # Special days
        df['is_month_start'] = idx.is_month_start.astype(int)
        df['is_month_end'] = idx.is_month_end.astype(int)
        df['is_quarter_start'] = idx.is_quarter_start.astype(int)
        df['is_quarter_end'] = idx.is_quarter_end.astype(int)

        return df

    def _add_target(self, df: pd.DataFrame, horizon: int = 1) -> pd.DataFrame:
        """
        Add target variable for ML training
        target = 1 if next day close > today close, else 0
        """
        df['target'] = (df['close'].shift(-horizon) > df['close']).astype(int)

        # Additional targets for multi-horizon
        df['target_3d'] = (df['close'].shift(-3) > df['close']).astype(int)
        df['target_5d'] = (df['close'].shift(-5) > df['close']).astype(int)

        # Return magnitude target
        df['target_return'] = df['close'].shift(-1) / df['close'] - 1

        return df


class DataCollector:
    """
    Collects historical data for ML training
    Supports multiple symbols and timeframes
    """

    def __init__(self):
        self.cache = {}

    def fetch_historical_data(self, symbol: str, period: str = '5y',
                              interval: str = '1d') -> Optional[pd.DataFrame]:
        """
        Fetch historical OHLCV data from Yahoo Finance

        Args:
            symbol: Stock symbol (e.g., 'RELIANCE.NS', '^NSEI')
            period: Data period ('1y', '5y', 'max')
            interval: Data interval ('1d', '1h', '5m')

        Returns:
            DataFrame with OHLCV data
        """
        cache_key = f"{symbol}_{period}_{interval}"
        if cache_key in self.cache:
            return self.cache[cache_key]

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, interval=interval)

            if df.empty:
                print(f"No data found for {symbol}")
                return None

            # Standardize column names
            df.columns = [c.lower() for c in df.columns]
            df = df[['open', 'high', 'low', 'close', 'volume']].copy()
            df.index.name = 'date'

            self.cache[cache_key] = df
            return df

        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return None

    def fetch_multiple_symbols(self, symbols: List[str], period: str = '5y',
                               interval: str = '1d') -> Dict[str, pd.DataFrame]:
        """Fetch data for multiple symbols"""
        data = {}
        for symbol in symbols:
            df = self.fetch_historical_data(symbol, period, interval)
            if df is not None:
                data[symbol] = df
        return data

    def prepare_training_data(self, symbol: str, period: str = '5y') -> Optional[pd.DataFrame]:
        """
        Fetch data and prepare features for training

        Returns:
            DataFrame with all features and target
        """
        df = self.fetch_historical_data(symbol, period)
        if df is None:
            return None

        fe = FeatureEngineer(df)
        features_df = fe.create_all_features()

        # Drop rows with NaN (from indicators that need history)
        features_df = features_df.dropna()

        return features_df


# Default Indian market symbols for training
NIFTY50_SYMBOLS = [
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
    'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'KOTAKBANK.NS', 'ITC.NS',
    'LT.NS', 'AXISBANK.NS', 'ASIANPAINT.NS', 'MARUTI.NS', 'SUNPHARMA.NS',
    'TITAN.NS', 'ULTRACEMCO.NS', 'BAJFINANCE.NS', 'NESTLEIND.NS', 'WIPRO.NS',
    'HCLTECH.NS', 'M&M.NS', 'NTPC.NS', 'POWERGRID.NS', 'TATAMOTORS.NS',
    'ADANIENT.NS', 'ADANIPORTS.NS', 'COALINDIA.NS', 'JSWSTEEL.NS', 'TATASTEEL.NS',
    'TECHM.NS', 'BAJAJFINSV.NS', 'ONGC.NS', 'GRASIM.NS', 'DRREDDY.NS',
    'DIVISLAB.NS', 'CIPLA.NS', 'BPCL.NS', 'EICHERMOT.NS', 'TATACONSUM.NS',
    'APOLLOHOSP.NS', 'BRITANNIA.NS', 'HEROMOTOCO.NS', 'INDUSINDBK.NS', 'SBILIFE.NS',
    'HDFCLIFE.NS', 'UPL.NS', 'HINDALCO.NS', 'BAJAJ-AUTO.NS', 'LTIM.NS'
]

INDICES = [
    '^NSEI',  # Nifty 50
    '^NSEBANK',  # Bank Nifty
    '^BSESN'  # Sensex
]


def get_feature_list() -> List[str]:
    """
    Returns list of all feature names created by FeatureEngineer
    Useful for model training and feature selection
    """
    # Create dummy data to get feature names
    dates = pd.date_range(start='2020-01-01', periods=300, freq='D')
    dummy_data = pd.DataFrame({
        'open': np.random.randn(300).cumsum() + 100,
        'high': np.random.randn(300).cumsum() + 102,
        'low': np.random.randn(300).cumsum() + 98,
        'close': np.random.randn(300).cumsum() + 100,
        'volume': np.random.randint(1000000, 10000000, 300)
    }, index=dates)

    dummy_data['high'] = dummy_data[['open', 'high', 'close']].max(axis=1) + 1
    dummy_data['low'] = dummy_data[['open', 'low', 'close']].min(axis=1) - 1

    fe = FeatureEngineer(dummy_data)
    features_df = fe.create_all_features()

    # Exclude original OHLCV columns
    exclude = ['open', 'high', 'low', 'close', 'volume', 'date']
    feature_names = [c for c in features_df.columns if c not in exclude]

    return feature_names
