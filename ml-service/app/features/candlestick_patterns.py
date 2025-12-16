"""
Comprehensive Candlestick Pattern Detection
Detects 50+ candlestick patterns used by professional traders

Pattern Categories:
- Single Candle: Doji, Hammer, Shooting Star, Marubozu, Spinning Top, etc.
- Double Candle: Engulfing, Harami, Piercing, Dark Cloud, Tweezer, etc.
- Triple Candle: Morning Star, Evening Star, Three Soldiers, Three Crows, etc.
- Complex: Rising/Falling Three Methods, etc.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional


class CandlestickPatternDetector:
    """
    Professional-grade candlestick pattern detector
    Detects 50+ patterns with confidence scores
    """

    def __init__(self):
        self.patterns_detected = []

    def detect_all_patterns(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Detect all candlestick patterns and add as columns

        Args:
            df: DataFrame with OHLCV data (open, high, low, close, volume)

        Returns:
            DataFrame with pattern columns added
        """
        df = df.copy()

        # Calculate basic candle metrics
        df['body'] = df['close'] - df['open']
        df['body_abs'] = abs(df['body'])
        df['range'] = df['high'] - df['low']
        df['upper_shadow'] = df['high'] - df[['open', 'close']].max(axis=1)
        df['lower_shadow'] = df[['open', 'close']].min(axis=1) - df['low']
        df['body_pct'] = df['body_abs'] / df['range'].replace(0, np.nan)
        df['is_bullish'] = df['close'] > df['open']
        df['is_bearish'] = df['close'] < df['open']

        # Average body size for relative comparisons
        df['avg_body'] = df['body_abs'].rolling(20).mean()
        df['avg_range'] = df['range'].rolling(20).mean()

        # ==================== SINGLE CANDLE PATTERNS ====================

        # 1. Doji (indecision)
        df['doji'] = (df['body_abs'] < df['range'] * 0.1).astype(int)

        # 2. Long-legged Doji
        df['long_legged_doji'] = (
            (df['body_abs'] < df['range'] * 0.1) &
            (df['upper_shadow'] > df['range'] * 0.3) &
            (df['lower_shadow'] > df['range'] * 0.3)
        ).astype(int)

        # 3. Dragonfly Doji (bullish)
        df['dragonfly_doji'] = (
            (df['body_abs'] < df['range'] * 0.1) &
            (df['upper_shadow'] < df['range'] * 0.1) &
            (df['lower_shadow'] > df['range'] * 0.6)
        ).astype(int)

        # 4. Gravestone Doji (bearish)
        df['gravestone_doji'] = (
            (df['body_abs'] < df['range'] * 0.1) &
            (df['lower_shadow'] < df['range'] * 0.1) &
            (df['upper_shadow'] > df['range'] * 0.6)
        ).astype(int)

        # 5. Hammer (bullish reversal)
        df['hammer'] = (
            (df['lower_shadow'] > df['body_abs'] * 2) &
            (df['upper_shadow'] < df['body_abs'] * 0.5) &
            (df['body_abs'] > 0)
        ).astype(int)

        # 6. Inverted Hammer (bullish reversal)
        df['inverted_hammer'] = (
            (df['upper_shadow'] > df['body_abs'] * 2) &
            (df['lower_shadow'] < df['body_abs'] * 0.5) &
            (df['body_abs'] > 0)
        ).astype(int)

        # 7. Hanging Man (bearish reversal - same as hammer but in uptrend)
        df['hanging_man'] = (
            (df['lower_shadow'] > df['body_abs'] * 2) &
            (df['upper_shadow'] < df['body_abs'] * 0.5) &
            (df['close'].shift(1) < df['close'].shift(5))  # In uptrend
        ).astype(int)

        # 8. Shooting Star (bearish reversal)
        df['shooting_star'] = (
            (df['upper_shadow'] > df['body_abs'] * 2) &
            (df['lower_shadow'] < df['body_abs'] * 0.5) &
            (df['close'].shift(1) < df['close'].shift(5))  # In uptrend
        ).astype(int)

        # 9. Marubozu (strong trend)
        df['bullish_marubozu'] = (
            (df['is_bullish']) &
            (df['upper_shadow'] < df['range'] * 0.05) &
            (df['lower_shadow'] < df['range'] * 0.05)
        ).astype(int)

        df['bearish_marubozu'] = (
            (df['is_bearish']) &
            (df['upper_shadow'] < df['range'] * 0.05) &
            (df['lower_shadow'] < df['range'] * 0.05)
        ).astype(int)

        # 10. Spinning Top (indecision)
        df['spinning_top'] = (
            (df['body_abs'] < df['range'] * 0.3) &
            (df['upper_shadow'] > df['body_abs']) &
            (df['lower_shadow'] > df['body_abs']) &
            ~df['doji'].astype(bool)
        ).astype(int)

        # 11. High Wave (extreme indecision)
        df['high_wave'] = (
            (df['body_abs'] < df['range'] * 0.2) &
            (df['upper_shadow'] > df['range'] * 0.35) &
            (df['lower_shadow'] > df['range'] * 0.35)
        ).astype(int)

        # 12. Belt Hold
        df['bullish_belt_hold'] = (
            (df['is_bullish']) &
            (df['lower_shadow'] < df['range'] * 0.05) &
            (df['body_abs'] > df['avg_body'] * 1.5)
        ).astype(int)

        df['bearish_belt_hold'] = (
            (df['is_bearish']) &
            (df['upper_shadow'] < df['range'] * 0.05) &
            (df['body_abs'] > df['avg_body'] * 1.5)
        ).astype(int)

        # ==================== DOUBLE CANDLE PATTERNS ====================

        # 13. Bullish Engulfing
        df['bullish_engulfing'] = (
            (df['is_bearish'].shift(1)) &
            (df['is_bullish']) &
            (df['open'] < df['close'].shift(1)) &
            (df['close'] > df['open'].shift(1)) &
            (df['body_abs'] > df['body_abs'].shift(1))
        ).astype(int)

        # 14. Bearish Engulfing
        df['bearish_engulfing'] = (
            (df['is_bullish'].shift(1)) &
            (df['is_bearish']) &
            (df['open'] > df['close'].shift(1)) &
            (df['close'] < df['open'].shift(1)) &
            (df['body_abs'] > df['body_abs'].shift(1))
        ).astype(int)

        # 15. Bullish Harami
        df['bullish_harami'] = (
            (df['is_bearish'].shift(1)) &
            (df['is_bullish']) &
            (df['open'] > df['close'].shift(1)) &
            (df['close'] < df['open'].shift(1)) &
            (df['body_abs'] < df['body_abs'].shift(1) * 0.5)
        ).astype(int)

        # 16. Bearish Harami
        df['bearish_harami'] = (
            (df['is_bullish'].shift(1)) &
            (df['is_bearish']) &
            (df['open'] < df['close'].shift(1)) &
            (df['close'] > df['open'].shift(1)) &
            (df['body_abs'] < df['body_abs'].shift(1) * 0.5)
        ).astype(int)

        # 17. Harami Cross
        df['bullish_harami_cross'] = (
            (df['is_bearish'].shift(1)) &
            (df['doji']) &
            (df['high'] < df['open'].shift(1)) &
            (df['low'] > df['close'].shift(1))
        ).astype(int)

        df['bearish_harami_cross'] = (
            (df['is_bullish'].shift(1)) &
            (df['doji']) &
            (df['high'] < df['close'].shift(1)) &
            (df['low'] > df['open'].shift(1))
        ).astype(int)

        # 18. Piercing Line (bullish)
        df['piercing_line'] = (
            (df['is_bearish'].shift(1)) &
            (df['is_bullish']) &
            (df['open'] < df['low'].shift(1)) &
            (df['close'] > (df['open'].shift(1) + df['close'].shift(1)) / 2) &
            (df['close'] < df['open'].shift(1))
        ).astype(int)

        # 19. Dark Cloud Cover (bearish)
        df['dark_cloud_cover'] = (
            (df['is_bullish'].shift(1)) &
            (df['is_bearish']) &
            (df['open'] > df['high'].shift(1)) &
            (df['close'] < (df['open'].shift(1) + df['close'].shift(1)) / 2) &
            (df['close'] > df['open'].shift(1))
        ).astype(int)

        # 20. Tweezer Tops (bearish)
        df['tweezer_top'] = (
            (df['is_bullish'].shift(1)) &
            (df['is_bearish']) &
            (abs(df['high'] - df['high'].shift(1)) < df['avg_range'] * 0.05)
        ).astype(int)

        # 21. Tweezer Bottoms (bullish)
        df['tweezer_bottom'] = (
            (df['is_bearish'].shift(1)) &
            (df['is_bullish']) &
            (abs(df['low'] - df['low'].shift(1)) < df['avg_range'] * 0.05)
        ).astype(int)

        # 22. Kicking (strong trend signal)
        df['bullish_kicking'] = (
            (df['bearish_marubozu'].shift(1).astype(bool)) &
            (df['bullish_marubozu'].astype(bool)) &
            (df['open'] > df['open'].shift(1))
        ).astype(int)

        df['bearish_kicking'] = (
            (df['bullish_marubozu'].shift(1).astype(bool)) &
            (df['bearish_marubozu'].astype(bool)) &
            (df['open'] < df['open'].shift(1))
        ).astype(int)

        # 23. Meeting Lines
        df['bullish_meeting_lines'] = (
            (df['is_bearish'].shift(1)) &
            (df['is_bullish']) &
            (abs(df['close'] - df['close'].shift(1)) < df['avg_range'] * 0.03)
        ).astype(int)

        df['bearish_meeting_lines'] = (
            (df['is_bullish'].shift(1)) &
            (df['is_bearish']) &
            (abs(df['close'] - df['close'].shift(1)) < df['avg_range'] * 0.03)
        ).astype(int)

        # ==================== TRIPLE CANDLE PATTERNS ====================

        # 24. Morning Star (bullish reversal)
        df['morning_star'] = (
            (df['is_bearish'].shift(2)) &
            (df['body_abs'].shift(2) > df['avg_body']) &
            (df['body_abs'].shift(1) < df['avg_body'] * 0.5) &
            (df['is_bullish']) &
            (df['close'] > (df['open'].shift(2) + df['close'].shift(2)) / 2)
        ).astype(int)

        # 25. Evening Star (bearish reversal)
        df['evening_star'] = (
            (df['is_bullish'].shift(2)) &
            (df['body_abs'].shift(2) > df['avg_body']) &
            (df['body_abs'].shift(1) < df['avg_body'] * 0.5) &
            (df['is_bearish']) &
            (df['close'] < (df['open'].shift(2) + df['close'].shift(2)) / 2)
        ).astype(int)

        # 26. Morning Doji Star
        df['morning_doji_star'] = (
            (df['is_bearish'].shift(2)) &
            (df['doji'].shift(1).astype(bool)) &
            (df['is_bullish']) &
            (df['close'] > (df['open'].shift(2) + df['close'].shift(2)) / 2)
        ).astype(int)

        # 27. Evening Doji Star
        df['evening_doji_star'] = (
            (df['is_bullish'].shift(2)) &
            (df['doji'].shift(1).astype(bool)) &
            (df['is_bearish']) &
            (df['close'] < (df['open'].shift(2) + df['close'].shift(2)) / 2)
        ).astype(int)

        # 28. Three White Soldiers (bullish)
        df['three_white_soldiers'] = (
            (df['is_bullish']) &
            (df['is_bullish'].shift(1)) &
            (df['is_bullish'].shift(2)) &
            (df['close'] > df['close'].shift(1)) &
            (df['close'].shift(1) > df['close'].shift(2)) &
            (df['open'] > df['open'].shift(1)) &
            (df['open'].shift(1) > df['open'].shift(2)) &
            (df['upper_shadow'] < df['body_abs'] * 0.3) &
            (df['upper_shadow'].shift(1) < df['body_abs'].shift(1) * 0.3)
        ).astype(int)

        # 29. Three Black Crows (bearish)
        df['three_black_crows'] = (
            (df['is_bearish']) &
            (df['is_bearish'].shift(1)) &
            (df['is_bearish'].shift(2)) &
            (df['close'] < df['close'].shift(1)) &
            (df['close'].shift(1) < df['close'].shift(2)) &
            (df['open'] < df['open'].shift(1)) &
            (df['open'].shift(1) < df['open'].shift(2)) &
            (df['lower_shadow'] < df['body_abs'] * 0.3) &
            (df['lower_shadow'].shift(1) < df['body_abs'].shift(1) * 0.3)
        ).astype(int)

        # 30. Three Inside Up (bullish)
        df['three_inside_up'] = (
            (df['bullish_harami'].shift(1).astype(bool)) &
            (df['is_bullish']) &
            (df['close'] > df['high'].shift(2))
        ).astype(int)

        # 31. Three Inside Down (bearish)
        df['three_inside_down'] = (
            (df['bearish_harami'].shift(1).astype(bool)) &
            (df['is_bearish']) &
            (df['close'] < df['low'].shift(2))
        ).astype(int)

        # 32. Three Outside Up (bullish)
        df['three_outside_up'] = (
            (df['bullish_engulfing'].shift(1).astype(bool)) &
            (df['is_bullish']) &
            (df['close'] > df['close'].shift(1))
        ).astype(int)

        # 33. Three Outside Down (bearish)
        df['three_outside_down'] = (
            (df['bearish_engulfing'].shift(1).astype(bool)) &
            (df['is_bearish']) &
            (df['close'] < df['close'].shift(1))
        ).astype(int)

        # 34. Abandoned Baby (reversal)
        df['bullish_abandoned_baby'] = (
            (df['is_bearish'].shift(2)) &
            (df['doji'].shift(1).astype(bool)) &
            (df['low'].shift(1) > df['high'].shift(2)) &
            (df['is_bullish']) &
            (df['low'] > df['high'].shift(1))
        ).astype(int)

        df['bearish_abandoned_baby'] = (
            (df['is_bullish'].shift(2)) &
            (df['doji'].shift(1).astype(bool)) &
            (df['high'].shift(1) < df['low'].shift(2)) &
            (df['is_bearish']) &
            (df['high'] < df['low'].shift(1))
        ).astype(int)

        # 35. Tri-Star (reversal)
        df['bullish_tri_star'] = (
            (df['doji']) &
            (df['doji'].shift(1).astype(bool)) &
            (df['doji'].shift(2).astype(bool)) &
            (df['low'].shift(1) < df['low'].shift(2)) &
            (df['low'] > df['low'].shift(1))
        ).astype(int)

        df['bearish_tri_star'] = (
            (df['doji']) &
            (df['doji'].shift(1).astype(bool)) &
            (df['doji'].shift(2).astype(bool)) &
            (df['high'].shift(1) > df['high'].shift(2)) &
            (df['high'] < df['high'].shift(1))
        ).astype(int)

        # ==================== COMPLEX PATTERNS ====================

        # 36. Rising Three Methods (bullish continuation)
        df['rising_three_methods'] = (
            (df['is_bullish'].shift(4)) &
            (df['body_abs'].shift(4) > df['avg_body']) &
            (df['is_bearish'].shift(3)) &
            (df['is_bearish'].shift(2)) &
            (df['is_bearish'].shift(1)) &
            (df['low'].shift(1) > df['low'].shift(4)) &
            (df['high'].shift(1) < df['high'].shift(4)) &
            (df['is_bullish']) &
            (df['close'] > df['close'].shift(4))
        ).astype(int)

        # 37. Falling Three Methods (bearish continuation)
        df['falling_three_methods'] = (
            (df['is_bearish'].shift(4)) &
            (df['body_abs'].shift(4) > df['avg_body']) &
            (df['is_bullish'].shift(3)) &
            (df['is_bullish'].shift(2)) &
            (df['is_bullish'].shift(1)) &
            (df['high'].shift(1) < df['high'].shift(4)) &
            (df['low'].shift(1) > df['low'].shift(4)) &
            (df['is_bearish']) &
            (df['close'] < df['close'].shift(4))
        ).astype(int)

        # 38. Upside Gap Two Crows
        df['upside_gap_two_crows'] = (
            (df['is_bullish'].shift(2)) &
            (df['is_bearish'].shift(1)) &
            (df['open'].shift(1) > df['close'].shift(2)) &
            (df['is_bearish']) &
            (df['open'] > df['open'].shift(1)) &
            (df['close'] < df['close'].shift(1)) &
            (df['close'] > df['close'].shift(2))
        ).astype(int)

        # 39. Mat Hold (bullish continuation)
        df['mat_hold'] = (
            (df['is_bullish'].shift(4)) &
            (df['body_abs'].shift(4) > df['avg_body']) &
            (df['open'].shift(3) > df['close'].shift(4)) &
            (df['is_bearish'].shift(2)) &
            (df['is_bearish'].shift(1)) &
            (df['low'].shift(1) > df['low'].shift(4)) &
            (df['is_bullish']) &
            (df['close'] > df['high'].shift(4))
        ).astype(int)

        # 40. Breakaway (bullish)
        df['bullish_breakaway'] = (
            (df['is_bearish'].shift(4)) &
            (df['is_bearish'].shift(3)) &
            (df['open'].shift(3) < df['close'].shift(4)) &
            (df['is_bearish'].shift(2)) &
            (df['body_abs'].shift(1) < df['avg_body'] * 0.5) &
            (df['is_bullish']) &
            (df['close'] > df['close'].shift(3)) &
            (df['close'] < df['close'].shift(4))
        ).astype(int)

        # 41. On-Neck Line (bearish continuation)
        df['on_neck_line'] = (
            (df['is_bearish'].shift(1)) &
            (df['is_bullish']) &
            (df['open'] < df['low'].shift(1)) &
            (abs(df['close'] - df['low'].shift(1)) < df['avg_range'] * 0.03)
        ).astype(int)

        # 42. In-Neck Line (bearish continuation)
        df['in_neck_line'] = (
            (df['is_bearish'].shift(1)) &
            (df['is_bullish']) &
            (df['open'] < df['low'].shift(1)) &
            (df['close'] > df['low'].shift(1)) &
            (df['close'] < df['close'].shift(1) + df['body_abs'].shift(1) * 0.2)
        ).astype(int)

        # 43. Thrusting Line (weak bullish)
        df['thrusting_line'] = (
            (df['is_bearish'].shift(1)) &
            (df['is_bullish']) &
            (df['open'] < df['low'].shift(1)) &
            (df['close'] > df['close'].shift(1)) &
            (df['close'] < (df['open'].shift(1) + df['close'].shift(1)) / 2)
        ).astype(int)

        # 44. Advance Block (bearish warning in uptrend)
        df['advance_block'] = (
            (df['is_bullish']) &
            (df['is_bullish'].shift(1)) &
            (df['is_bullish'].shift(2)) &
            (df['body_abs'] < df['body_abs'].shift(1)) &
            (df['body_abs'].shift(1) < df['body_abs'].shift(2)) &
            (df['upper_shadow'] > df['upper_shadow'].shift(1))
        ).astype(int)

        # 45. Deliberation (bearish warning)
        df['deliberation'] = (
            (df['is_bullish']) &
            (df['is_bullish'].shift(1)) &
            (df['is_bullish'].shift(2)) &
            (df['body_abs'].shift(2) > df['avg_body']) &
            (df['body_abs'].shift(1) > df['avg_body']) &
            (df['body_abs'] < df['avg_body'] * 0.5)
        ).astype(int)

        # ==================== GAP PATTERNS ====================

        # 46. Up Gap (bullish)
        df['up_gap'] = (df['low'] > df['high'].shift(1)).astype(int)

        # 47. Down Gap (bearish)
        df['down_gap'] = (df['high'] < df['low'].shift(1)).astype(int)

        # 48. Tasuki Gap (continuation)
        df['upward_tasuki_gap'] = (
            (df['is_bullish'].shift(2)) &
            (df['is_bullish'].shift(1)) &
            (df['low'].shift(1) > df['high'].shift(2)) &
            (df['is_bearish']) &
            (df['open'] > df['open'].shift(1)) &
            (df['close'] < df['close'].shift(1)) &
            (df['close'] > df['high'].shift(2))
        ).astype(int)

        df['downward_tasuki_gap'] = (
            (df['is_bearish'].shift(2)) &
            (df['is_bearish'].shift(1)) &
            (df['high'].shift(1) < df['low'].shift(2)) &
            (df['is_bullish']) &
            (df['open'] < df['open'].shift(1)) &
            (df['close'] > df['close'].shift(1)) &
            (df['close'] < df['low'].shift(2))
        ).astype(int)

        # 49. Side-by-Side White Lines (bullish continuation)
        df['side_by_side_white'] = (
            (df['is_bullish'].shift(2)) &
            (df['is_bullish'].shift(1)) &
            (df['is_bullish']) &
            (df['low'].shift(1) > df['high'].shift(2)) &
            (abs(df['open'] - df['open'].shift(1)) < df['avg_range'] * 0.05) &
            (abs(df['close'] - df['close'].shift(1)) < df['avg_range'] * 0.05)
        ).astype(int)

        # 50. Stick Sandwich (bullish reversal)
        df['stick_sandwich'] = (
            (df['is_bearish'].shift(2)) &
            (df['is_bullish'].shift(1)) &
            (df['is_bearish']) &
            (abs(df['close'] - df['close'].shift(2)) < df['avg_range'] * 0.03)
        ).astype(int)

        # ==================== PATTERN SCORING ====================

        # Calculate overall bullish/bearish pattern score
        bullish_patterns = [
            'dragonfly_doji', 'hammer', 'inverted_hammer', 'bullish_marubozu',
            'bullish_belt_hold', 'bullish_engulfing', 'bullish_harami',
            'bullish_harami_cross', 'piercing_line', 'tweezer_bottom',
            'bullish_kicking', 'bullish_meeting_lines', 'morning_star',
            'morning_doji_star', 'three_white_soldiers', 'three_inside_up',
            'three_outside_up', 'bullish_abandoned_baby', 'bullish_tri_star',
            'rising_three_methods', 'mat_hold', 'bullish_breakaway',
            'upward_tasuki_gap', 'side_by_side_white', 'stick_sandwich', 'up_gap'
        ]

        bearish_patterns = [
            'gravestone_doji', 'hanging_man', 'shooting_star', 'bearish_marubozu',
            'bearish_belt_hold', 'bearish_engulfing', 'bearish_harami',
            'bearish_harami_cross', 'dark_cloud_cover', 'tweezer_top',
            'bearish_kicking', 'bearish_meeting_lines', 'evening_star',
            'evening_doji_star', 'three_black_crows', 'three_inside_down',
            'three_outside_down', 'bearish_abandoned_baby', 'bearish_tri_star',
            'falling_three_methods', 'upside_gap_two_crows', 'on_neck_line',
            'in_neck_line', 'advance_block', 'deliberation',
            'downward_tasuki_gap', 'down_gap'
        ]

        # Sum bullish patterns (weighted)
        df['bullish_pattern_score'] = sum(
            df[p].fillna(0) * (2 if 'engulfing' in p or 'star' in p else 1)
            for p in bullish_patterns if p in df.columns
        )

        # Sum bearish patterns (weighted)
        df['bearish_pattern_score'] = sum(
            df[p].fillna(0) * (2 if 'engulfing' in p or 'star' in p else 1)
            for p in bearish_patterns if p in df.columns
        )

        # Net pattern score (-100 to +100)
        df['pattern_score'] = (
            (df['bullish_pattern_score'] - df['bearish_pattern_score']) /
            (df['bullish_pattern_score'] + df['bearish_pattern_score'] + 1) * 100
        ).fillna(0)

        # Clean up intermediate columns
        cols_to_drop = ['body', 'body_abs', 'range', 'upper_shadow', 'lower_shadow',
                       'body_pct', 'is_bullish', 'is_bearish', 'avg_body', 'avg_range']
        df = df.drop(columns=[c for c in cols_to_drop if c in df.columns], errors='ignore')

        return df

    def get_pattern_names(self) -> List[str]:
        """Return list of all pattern column names"""
        return [
            # Single candle
            'doji', 'long_legged_doji', 'dragonfly_doji', 'gravestone_doji',
            'hammer', 'inverted_hammer', 'hanging_man', 'shooting_star',
            'bullish_marubozu', 'bearish_marubozu', 'spinning_top', 'high_wave',
            'bullish_belt_hold', 'bearish_belt_hold',
            # Double candle
            'bullish_engulfing', 'bearish_engulfing', 'bullish_harami', 'bearish_harami',
            'bullish_harami_cross', 'bearish_harami_cross', 'piercing_line',
            'dark_cloud_cover', 'tweezer_top', 'tweezer_bottom',
            'bullish_kicking', 'bearish_kicking',
            'bullish_meeting_lines', 'bearish_meeting_lines',
            # Triple candle
            'morning_star', 'evening_star', 'morning_doji_star', 'evening_doji_star',
            'three_white_soldiers', 'three_black_crows',
            'three_inside_up', 'three_inside_down',
            'three_outside_up', 'three_outside_down',
            'bullish_abandoned_baby', 'bearish_abandoned_baby',
            'bullish_tri_star', 'bearish_tri_star',
            # Complex
            'rising_three_methods', 'falling_three_methods',
            'upside_gap_two_crows', 'mat_hold', 'bullish_breakaway',
            'on_neck_line', 'in_neck_line', 'thrusting_line',
            'advance_block', 'deliberation',
            # Gap patterns
            'up_gap', 'down_gap', 'upward_tasuki_gap', 'downward_tasuki_gap',
            'side_by_side_white', 'stick_sandwich',
            # Scores
            'bullish_pattern_score', 'bearish_pattern_score', 'pattern_score'
        ]
