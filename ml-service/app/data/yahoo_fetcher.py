import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional, List
import logging

logger = logging.getLogger(__name__)

class YahooFinanceFetcher:
    """Fetches stock data from Yahoo Finance."""

    def __init__(self):
        self.cache = {}
        self.cache_expiry = {}
        self.cache_duration = timedelta(minutes=5)

    def _get_cache_key(self, symbol: str, period: str) -> str:
        return f"{symbol}_{period}"

    def _is_cache_valid(self, key: str) -> bool:
        if key not in self.cache_expiry:
            return False
        return datetime.now() < self.cache_expiry[key]

    def resolve_symbol(self, symbol: str) -> str:
        """
        Resolve symbol to Yahoo Finance format.
        Adds .NS suffix for Indian stocks without extension.
        """
        symbol = symbol.upper().strip()

        # Already has exchange suffix
        if symbol.endswith('.NS') or symbol.endswith('.BO'):
            return symbol

        # Common US stocks - no suffix needed
        us_stocks = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'TSLA', 'NVDA']
        if symbol in us_stocks:
            return symbol

        # Default to NSE for Indian stocks
        return f"{symbol}.NS"

    def get_historical_data(
        self,
        symbol: str,
        period: str = "5y",
        interval: str = "1d"
    ) -> Optional[pd.DataFrame]:
        """
        Fetch historical OHLCV data.

        Args:
            symbol: Stock symbol (e.g., 'RELIANCE.NS', 'AAPL')
            period: Data period ('1y', '2y', '5y', 'max')
            interval: Data interval ('1d', '1wk', '1mo')

        Returns:
            DataFrame with columns: Open, High, Low, Close, Volume, Adj Close
        """
        cache_key = self._get_cache_key(symbol, period)

        if self._is_cache_valid(cache_key):
            logger.debug(f"Cache hit for {symbol}")
            return self.cache[cache_key]

        try:
            resolved_symbol = self.resolve_symbol(symbol)
            logger.info(f"Fetching {resolved_symbol} data for period {period}")

            ticker = yf.Ticker(resolved_symbol)
            df = ticker.history(period=period, interval=interval)

            if df.empty:
                logger.warning(f"No data returned for {resolved_symbol}")
                return None

            # Ensure we have required columns
            required_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            if not all(col in df.columns for col in required_cols):
                logger.warning(f"Missing columns for {resolved_symbol}")
                return None

            # Cache the result
            self.cache[cache_key] = df
            self.cache_expiry[cache_key] = datetime.now() + self.cache_duration

            logger.info(f"Fetched {len(df)} rows for {resolved_symbol}")
            return df

        except Exception as e:
            logger.error(f"Error fetching {symbol}: {str(e)}")
            return None

    def get_current_data(self, symbol: str) -> Optional[dict]:
        """
        Get current/latest stock data.

        Returns:
            Dict with current price, volume, and basic info
        """
        try:
            resolved_symbol = self.resolve_symbol(symbol)
            ticker = yf.Ticker(resolved_symbol)

            info = ticker.info
            hist = ticker.history(period="5d")

            if hist.empty:
                return None

            latest = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) > 1 else latest

            return {
                "symbol": resolved_symbol,
                "price": float(latest['Close']),
                "open": float(latest['Open']),
                "high": float(latest['High']),
                "low": float(latest['Low']),
                "volume": int(latest['Volume']),
                "prev_close": float(prev['Close']),
                "change": float(latest['Close'] - prev['Close']),
                "change_pct": float((latest['Close'] - prev['Close']) / prev['Close'] * 100),
                "name": info.get('shortName', symbol),
                "sector": info.get('sector', 'Unknown'),
                "industry": info.get('industry', 'Unknown'),
                "market_cap": info.get('marketCap', 0),
                "52w_high": info.get('fiftyTwoWeekHigh', 0),
                "52w_low": info.get('fiftyTwoWeekLow', 0)
            }

        except Exception as e:
            logger.error(f"Error getting current data for {symbol}: {str(e)}")
            return None

    def get_batch_data(
        self,
        symbols: List[str],
        period: str = "1y"
    ) -> dict:
        """
        Fetch data for multiple symbols.

        Args:
            symbols: List of stock symbols
            period: Data period

        Returns:
            Dict mapping symbol to DataFrame
        """
        result = {}

        for symbol in symbols:
            df = self.get_historical_data(symbol, period)
            if df is not None:
                result[symbol] = df

        logger.info(f"Fetched data for {len(result)}/{len(symbols)} symbols")
        return result

    def clear_cache(self):
        """Clear the data cache."""
        self.cache.clear()
        self.cache_expiry.clear()
        logger.info("Cache cleared")


# Singleton instance
fetcher = YahooFinanceFetcher()
