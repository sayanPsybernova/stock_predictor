"""
Options-specific feature engineering for ML predictions.

Features generated:
- PCR trends and changes
- OI concentration metrics
- IV metrics (skew, level, term structure)
- Greeks-derived features
- Max Pain distance
- Support/Resistance proximity
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class OptionsFeatureGenerator:
    """
    Generate ML features from options data.
    """

    # Feature column names
    FEATURE_COLUMNS = [
        # PCR Features (4)
        'PCR_OI', 'PCR_Volume', 'PCR_OI_Change', 'PCR_Signal',

        # OI Features (6)
        'Total_Call_OI', 'Total_Put_OI', 'Call_OI_Change_Pct',
        'Put_OI_Change_Pct', 'OI_Concentration_CE', 'OI_Concentration_PE',

        # IV Features (5)
        'ATM_IV', 'IV_Skew', 'Call_IV_Avg', 'Put_IV_Avg', 'IV_Level_Signal',

        # Max Pain Features (3)
        'Max_Pain_Distance', 'Max_Pain_Direction', 'Spot_vs_MaxPain_Pct',

        # Support/Resistance Features (4)
        'Distance_to_Resistance', 'Distance_to_Support',
        'Resistance_Strength', 'Support_Strength',

        # OI Pattern Features (4)
        'Long_Buildup_Count', 'Short_Buildup_Count',
        'Long_Unwinding_Count', 'Short_Covering_Count',

        # Time Features (2)
        'Days_to_Expiry', 'Theta_Decay_Factor'
    ]

    def __init__(self):
        pass

    def generate_features(self, option_data: Dict) -> Optional[pd.DataFrame]:
        """
        Generate features from option chain data.

        Args:
            option_data: Dictionary containing option chain analysis

        Returns:
            DataFrame with features or None if insufficient data
        """
        try:
            if not option_data:
                return None

            features = {}

            # PCR Features
            pcr_features = self._generate_pcr_features(option_data)
            features.update(pcr_features)

            # OI Features
            oi_features = self._generate_oi_features(option_data)
            features.update(oi_features)

            # IV Features
            iv_features = self._generate_iv_features(option_data)
            features.update(iv_features)

            # Max Pain Features
            max_pain_features = self._generate_max_pain_features(option_data)
            features.update(max_pain_features)

            # Support/Resistance Features
            sr_features = self._generate_sr_features(option_data)
            features.update(sr_features)

            # OI Pattern Features
            pattern_features = self._generate_pattern_features(option_data)
            features.update(pattern_features)

            # Time Features
            time_features = self._generate_time_features(option_data)
            features.update(time_features)

            # Create DataFrame
            df = pd.DataFrame([features])

            # Ensure all columns exist
            for col in self.FEATURE_COLUMNS:
                if col not in df.columns:
                    df[col] = 0

            return df[self.FEATURE_COLUMNS]

        except Exception as e:
            logger.error(f"Feature generation error: {str(e)}")
            return None

    def _generate_pcr_features(self, data: Dict) -> Dict:
        """Generate PCR-related features."""
        metrics = data.get('metrics', {})
        pcr = metrics.get('pcr', {})
        oi_change = metrics.get('oiChange', {})

        pcr_oi = pcr.get('oi', 1.0)
        pcr_volume = pcr.get('volume', 1.0)

        # PCR OI change (put change - call change normalized)
        call_oi_change = oi_change.get('call', 0)
        put_oi_change = oi_change.get('put', 0)
        total_oi = metrics.get('totalOI', {}).get('total', 1)
        pcr_oi_change = (put_oi_change - call_oi_change) / max(total_oi, 1) * 100

        # PCR Signal (1=bullish, -1=bearish, 0=neutral)
        if pcr_oi > 1.2:
            pcr_signal = 1
        elif pcr_oi < 0.8:
            pcr_signal = -1
        else:
            pcr_signal = 0

        return {
            'PCR_OI': pcr_oi,
            'PCR_Volume': pcr_volume,
            'PCR_OI_Change': pcr_oi_change,
            'PCR_Signal': pcr_signal
        }

    def _generate_oi_features(self, data: Dict) -> Dict:
        """Generate OI-related features."""
        metrics = data.get('metrics', {})
        total_oi = metrics.get('totalOI', {})
        oi_change = metrics.get('oiChange', {})
        top_strikes = data.get('topOIStrikes', {})

        total_call_oi = total_oi.get('call', 0)
        total_put_oi = total_oi.get('put', 0)

        # OI change percentages
        call_oi_change_pct = (oi_change.get('call', 0) / max(total_call_oi, 1)) * 100
        put_oi_change_pct = (oi_change.get('put', 0) / max(total_put_oi, 1)) * 100

        # OI concentration (top 3 strikes / total)
        call_strikes = top_strikes.get('callStrikes', [])
        put_strikes = top_strikes.get('putStrikes', [])

        top_call_oi = sum(s.get('oi', 0) for s in call_strikes[:3])
        top_put_oi = sum(s.get('oi', 0) for s in put_strikes[:3])

        oi_conc_ce = top_call_oi / max(total_call_oi, 1)
        oi_conc_pe = top_put_oi / max(total_put_oi, 1)

        return {
            'Total_Call_OI': np.log1p(total_call_oi),  # Log scale for large numbers
            'Total_Put_OI': np.log1p(total_put_oi),
            'Call_OI_Change_Pct': call_oi_change_pct,
            'Put_OI_Change_Pct': put_oi_change_pct,
            'OI_Concentration_CE': oi_conc_ce,
            'OI_Concentration_PE': oi_conc_pe
        }

    def _generate_iv_features(self, data: Dict) -> Dict:
        """Generate IV-related features."""
        metrics = data.get('metrics', {})
        avg_iv = metrics.get('avgIV', {})
        chain = data.get('chain', [])
        spot_price = data.get('spotPrice', 0)

        call_iv = avg_iv.get('call', 15)
        put_iv = avg_iv.get('put', 15)
        atm_iv = (call_iv + put_iv) / 2

        # Calculate IV skew (OTM Put IV - OTM Call IV)
        otm_put_ivs = []
        otm_call_ivs = []

        for strike_data in chain:
            strike = strike_data.get('strikePrice', 0)
            call_data = strike_data.get('call', {})
            put_data = strike_data.get('put', {})

            if strike < spot_price * 0.97 and put_data:
                iv = put_data.get('iv', 0)
                if iv > 0:
                    otm_put_ivs.append(iv)
            elif strike > spot_price * 1.03 and call_data:
                iv = call_data.get('iv', 0)
                if iv > 0:
                    otm_call_ivs.append(iv)

        avg_otm_put_iv = np.mean(otm_put_ivs) if otm_put_ivs else put_iv
        avg_otm_call_iv = np.mean(otm_call_ivs) if otm_call_ivs else call_iv
        iv_skew = avg_otm_put_iv - avg_otm_call_iv

        # IV level signal (high IV = 1, normal = 0, low = -1)
        if atm_iv > 25:
            iv_level_signal = 1  # High IV
        elif atm_iv < 15:
            iv_level_signal = -1  # Low IV
        else:
            iv_level_signal = 0

        return {
            'ATM_IV': atm_iv,
            'IV_Skew': iv_skew,
            'Call_IV_Avg': call_iv,
            'Put_IV_Avg': put_iv,
            'IV_Level_Signal': iv_level_signal
        }

    def _generate_max_pain_features(self, data: Dict) -> Dict:
        """Generate Max Pain-related features."""
        metrics = data.get('metrics', {})
        spot_price = data.get('spotPrice', 0)
        max_pain = metrics.get('maxPain', spot_price)

        # Distance from max pain
        if spot_price > 0:
            distance = ((spot_price - max_pain) / spot_price) * 100
        else:
            distance = 0

        # Direction (1 = spot above max pain, -1 = below)
        direction = 1 if spot_price > max_pain else -1 if spot_price < max_pain else 0

        return {
            'Max_Pain_Distance': abs(distance),
            'Max_Pain_Direction': direction,
            'Spot_vs_MaxPain_Pct': distance
        }

    def _generate_sr_features(self, data: Dict) -> Dict:
        """Generate Support/Resistance features."""
        spot_price = data.get('spotPrice', 0)
        top_strikes = data.get('topOIStrikes', {})

        call_strikes = top_strikes.get('callStrikes', [])
        put_strikes = top_strikes.get('putStrikes', [])

        # Immediate resistance (highest call OI above spot)
        resistance = None
        resistance_oi = 0
        for s in call_strikes:
            if s.get('strike', 0) > spot_price:
                resistance = s.get('strike')
                resistance_oi = s.get('oi', 0)
                break

        # Immediate support (highest put OI below spot)
        support = None
        support_oi = 0
        for s in put_strikes:
            if s.get('strike', 0) < spot_price:
                support = s.get('strike')
                support_oi = s.get('oi', 0)
                break

        # Distance to levels
        dist_to_resistance = ((resistance - spot_price) / spot_price * 100) if resistance else 2
        dist_to_support = ((spot_price - support) / spot_price * 100) if support else 2

        # Strength (normalized OI)
        max_oi = max(resistance_oi, support_oi, 1)
        resistance_strength = resistance_oi / max_oi if resistance_oi else 0
        support_strength = support_oi / max_oi if support_oi else 0

        return {
            'Distance_to_Resistance': dist_to_resistance,
            'Distance_to_Support': dist_to_support,
            'Resistance_Strength': resistance_strength,
            'Support_Strength': support_strength
        }

    def _generate_pattern_features(self, data: Dict) -> Dict:
        """Generate OI pattern features."""
        oi_analysis = data.get('oiChangeAnalysis', {})
        patterns = oi_analysis.get('patterns', {})

        return {
            'Long_Buildup_Count': patterns.get('longBuildup', 0),
            'Short_Buildup_Count': patterns.get('shortBuildup', 0),
            'Long_Unwinding_Count': patterns.get('longUnwinding', 0),
            'Short_Covering_Count': patterns.get('shortCovering', 0)
        }

    def _generate_time_features(self, data: Dict) -> Dict:
        """Generate time-related features."""
        metrics = data.get('metrics', {})
        days_to_expiry = metrics.get('daysToExpiry', 7)

        # Theta decay factor (accelerates near expiry)
        if days_to_expiry <= 0:
            theta_factor = 1.0
        elif days_to_expiry <= 3:
            theta_factor = 0.9  # High decay
        elif days_to_expiry <= 7:
            theta_factor = 0.7
        elif days_to_expiry <= 14:
            theta_factor = 0.5
        else:
            theta_factor = 0.3

        return {
            'Days_to_Expiry': days_to_expiry,
            'Theta_Decay_Factor': theta_factor
        }


# Singleton instance
options_feature_generator = OptionsFeatureGenerator()
