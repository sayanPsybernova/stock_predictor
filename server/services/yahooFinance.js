const YahooFinance = require('yahoo-finance2').default;
const yahoo = new YahooFinance();

// Exchange suffix mappings for different markets
const EXCHANGE_SUFFIXES = {
    'US': '',       // US stocks - no suffix
    'NSE': '.NS',   // National Stock Exchange of India
    'BSE': '.BO',   // Bombay Stock Exchange
    'AUTO': null    // Auto-detect mode
};

// Cache for resolved symbols to avoid repeated lookups
const symbolCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolves a stock symbol by trying different exchange suffixes.
 * Useful for Indian stocks that need .NS or .BO suffix.
 * @param {string} symbol - The base stock symbol (e.g., 'BHEL', 'AAPL')
 * @param {string} exchange - Preferred exchange: 'US', 'NSE', 'BSE', or 'AUTO'
 * @returns {Promise<{symbol: string, exchange: string, displayName: string}>}
 */
async function resolveSymbol(symbol, exchange = 'AUTO') {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const cacheKey = `${normalizedSymbol}:${exchange}`;

    // Check cache first
    const cached = symbolCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }

    // If specific exchange requested, try only that
    if (exchange !== 'AUTO' && EXCHANGE_SUFFIXES[exchange] !== undefined) {
        const suffix = EXCHANGE_SUFFIXES[exchange];
        const testSymbol = normalizedSymbol + suffix;

        try {
            const quote = await yahoo.quote(testSymbol);
            if (quote && quote.regularMarketPrice) {
                const result = {
                    symbol: testSymbol,
                    exchange: exchange,
                    displayName: quote.shortName || quote.longName || testSymbol
                };
                symbolCache.set(cacheKey, { data: result, timestamp: Date.now() });
                return result;
            }
        } catch (e) {
            throw new Error(`Symbol ${normalizedSymbol} not found on ${exchange} exchange`);
        }
    }

    // AUTO mode: Try multiple exchanges in order of priority
    const suffixesToTry = ['', '.NS', '.BO']; // US first, then Indian exchanges
    const exchangeNames = ['US', 'NSE', 'BSE'];

    for (let i = 0; i < suffixesToTry.length; i++) {
        const testSymbol = normalizedSymbol + suffixesToTry[i];

        try {
            const quote = await yahoo.quote(testSymbol);
            if (quote && quote.regularMarketPrice) {
                const result = {
                    symbol: testSymbol,
                    exchange: exchangeNames[i],
                    displayName: quote.shortName || quote.longName || testSymbol
                };
                symbolCache.set(cacheKey, { data: result, timestamp: Date.now() });
                console.log(`Resolved ${normalizedSymbol} to ${testSymbol} (${exchangeNames[i]})`);
                return result;
            }
        } catch (e) {
            // Symbol not found with this suffix, try next
            continue;
        }
    }

    throw new Error(`Symbol ${normalizedSymbol} not found on any supported exchange (US, NSE, BSE)`);
}

/**
 * Fetches historical price data for a given stock symbol.
 * @param {string} symbol - The stock symbol (e.g., 'AAPL', 'BHEL').
 * @param {string} exchange - Optional exchange: 'US', 'NSE', 'BSE', or 'AUTO'
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of historical data points.
 */
async function getHistoricalData(symbol, exchange = 'AUTO') {
    try {
        // Resolve the symbol to get the correct exchange suffix
        const resolved = await resolveSymbol(symbol, exchange);
        const resolvedSymbol = resolved.symbol;

        const today = new Date();
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(today.getFullYear() - 5);

        const queryOptions = {
            period1: fiveYearsAgo.toISOString().split('T')[0],
            period2: today.toISOString().split('T')[0],
            interval: '1d',
        };

        const result = await yahoo.historical(resolvedSymbol, queryOptions);

        if (!result || result.length === 0) {
            throw new Error('No historical data returned');
        }

        // Return data with resolved symbol info
        const historicalData = result.map(item => ({
            date: item.date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
        }));

        // Attach resolved symbol metadata
        historicalData.resolvedSymbol = resolved.symbol;
        historicalData.exchange = resolved.exchange;

        return historicalData;
    } catch (error) {
        console.error(`Error fetching historical data for ${symbol}:`, error.message);
        throw new Error(`Failed to fetch historical data for ${symbol}. Please check if the symbol is valid.`);
    }
}

/**
 * Fetches fundamental data for a given stock symbol.
 * @param {string} symbol - The stock symbol (e.g., 'AAPL', 'BHEL').
 * @param {string} exchange - Optional exchange: 'US', 'NSE', 'BSE', or 'AUTO'
 * @returns {Promise<Object>} A promise that resolves to an object containing fundamental data.
 */
async function getFundamentalData(symbol, exchange = 'AUTO') {
    try {
        // Resolve the symbol to get the correct exchange suffix
        const resolved = await resolveSymbol(symbol, exchange);
        const resolvedSymbol = resolved.symbol;

        const quote = await yahoo.quote(resolvedSymbol);
        const summaryDetail = await yahoo.quoteSummary(resolvedSymbol, {
            modules: ["summaryDetail", "defaultKeyStatistics", "financialData"]
        });

        // FIX: Get actual revenue growth from financialData module, not daily price change
        const revenueGrowth = summaryDetail.financialData?.revenueGrowth || null;
        const earningsGrowth = summaryDetail.financialData?.earningsGrowth || null;

        return {
            peRatio: summaryDetail.summaryDetail?.trailingPE || null,
            pbRatio: summaryDetail.defaultKeyStatistics?.priceToBook || null,
            debtToEquity: summaryDetail.financialData?.debtToEquity || null,
            roe: summaryDetail.financialData?.returnOnEquity || null,
            revenueGrowth: revenueGrowth,
            profitGrowth: earningsGrowth,
            grossMargins: summaryDetail.financialData?.grossMargins || null,
            operatingMargins: summaryDetail.financialData?.operatingMargins || null,
            marketCap: quote.marketCap || null,
            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || null,
            fiftyTwoWeekLow: quote.fiftyTwoWeekLow || null,
            averageVolume: quote.averageDailyVolume10Day || null,
            shortName: quote.shortName || null,
            longName: quote.longName || null,
            symbol: quote.symbol || resolvedSymbol,
            resolvedSymbol: resolvedSymbol,
            exchange: resolved.exchange,
            regularMarketPrice: quote.regularMarketPrice || null,
            regularMarketChange: quote.regularMarketChange || null,
            regularMarketChangePercent: quote.regularMarketChangePercent || null,
            currency: quote.currency || (resolved.exchange === 'NSE' || resolved.exchange === 'BSE' ? 'INR' : 'USD'),
        };
    } catch (error) {
        console.error(`Error fetching fundamental data for ${symbol}:`, error.message);
        throw new Error(`Failed to fetch fundamental data for ${symbol}. Please check if the symbol is valid.`);
    }
}


/**
 * Fetches intraday price data for 1D chart view.
 * @param {string} symbol - The stock symbol (e.g., 'AAPL', 'BHEL').
 * @param {string} exchange - Optional exchange: 'US', 'NSE', 'BSE', or 'AUTO'
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of intraday data points.
 */
async function getIntradayData(symbol, exchange = 'AUTO') {
    try {
        // Resolve the symbol to get the correct exchange suffix
        const resolved = await resolveSymbol(symbol, exchange);
        const resolvedSymbol = resolved.symbol;

        // Use chart API for intraday data with 1-minute intervals for real-time accuracy
        const result = await yahoo.chart(resolvedSymbol, {
            period1: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
            period2: new Date(),
            interval: '1m', // 1-minute intervals for accurate real-time data
        });

        if (!result || !result.quotes || result.quotes.length === 0) {
            // Fallback: try 2-minute intervals
            const fallbackResult = await yahoo.chart(resolvedSymbol, {
                period1: new Date(Date.now() - 24 * 60 * 60 * 1000),
                period2: new Date(),
                interval: '2m',
            });

            if (!fallbackResult || !fallbackResult.quotes || fallbackResult.quotes.length === 0) {
                // Second fallback: try 5-minute intervals
                const fallback5m = await yahoo.chart(resolvedSymbol, {
                    period1: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    period2: new Date(),
                    interval: '5m',
                });

                if (!fallback5m || !fallback5m.quotes || fallback5m.quotes.length === 0) {
                    throw new Error('No intraday data returned');
                }

                return fallback5m.quotes
                    .filter(item => item.close !== null)
                    .map(item => ({
                        date: item.date,
                        open: item.open,
                        high: item.high,
                        low: item.low,
                        close: item.close,
                        volume: item.volume,
                    }));
            }

            return fallbackResult.quotes
                .filter(item => item.close !== null)
                .map(item => ({
                    date: item.date,
                    open: item.open,
                    high: item.high,
                    low: item.low,
                    close: item.close,
                    volume: item.volume,
                }));
        }

        return result.quotes
            .filter(item => item.close !== null)
            .map(item => ({
                date: item.date,
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close,
                volume: item.volume,
            }));
    } catch (error) {
        console.error(`Error fetching intraday data for ${symbol}:`, error.message);
        // Return empty array instead of throwing - intraday might not be available for all stocks
        return [];
    }
}

/**
 * Search for stocks by query string - provides autocomplete suggestions
 * @param {string} query - Search query (e.g., 'su', 'reliance', 'apple')
 * @returns {Promise<Array<Object>>} Array of matching stocks
 */
async function searchStocks(query) {
    if (!query || query.length < 1) {
        return [];
    }

    try {
        // Use Yahoo Finance search API
        const results = await yahoo.search(query, {
            quotesCount: 15,
            newsCount: 0,
            enableFuzzyQuery: true,
            quotesQueryId: 'tss_match_phrase_query',
        });

        if (!results || !results.quotes || results.quotes.length === 0) {
            return [];
        }

        // Filter and format results - prioritize stocks (EQUITY type)
        return results.quotes
            .filter(item => item.quoteType === 'EQUITY' || item.quoteType === 'ETF')
            .map(item => ({
                symbol: item.symbol,
                name: item.shortname || item.longname || item.symbol,
                exchange: item.exchange || 'Unknown',
                exchangeDisplay: getExchangeDisplay(item.exchange),
                type: item.quoteType,
                isIndian: item.symbol?.endsWith('.NS') || item.symbol?.endsWith('.BO'),
            }))
            .slice(0, 10); // Limit to 10 results
    } catch (error) {
        console.error(`Error searching stocks for "${query}":`, error.message);
        return [];
    }
}

/**
 * Get display name for exchange
 */
function getExchangeDisplay(exchange) {
    const exchangeMap = {
        'NSI': 'NSE',
        'NSE': 'NSE',
        'BOM': 'BSE',
        'BSE': 'BSE',
        'NMS': 'NASDAQ',
        'NYQ': 'NYSE',
        'NGM': 'NASDAQ',
        'PCX': 'NYSE',
    };
    return exchangeMap[exchange] || exchange || 'Unknown';
}

module.exports = {
    getHistoricalData,
    getFundamentalData,
    getIntradayData,
    resolveSymbol,
    searchStocks,
    EXCHANGE_SUFFIXES
};
