/**
 * Chartink Service - Technical Scanner Integration
 * Fetches real-time technical scan data from Chartink
 *
 * Scans available:
 * - Volume Shockers (stocks with unusual volume)
 * - Bullish Breakouts
 * - RSI Oversold Bounce
 * - MACD Bullish Crossover
 */

const axios = require('axios');
const cheerio = require('cheerio');

const CHARTINK_BASE_URL = 'https://chartink.com/screener/';

// Pre-defined scan URLs for top gainer patterns
const SCAN_QUERIES = {
    volumeShockers: {
        name: 'Volume Shockers',
        // Chartink scan condition for volume > 2.5x average
        condition: '( {cash} ( latest volume > 2.5 * latest sma( volume,20 ) and latest close > 20 and latest volume > 100000 ) )'
    },
    bullishBreakout: {
        name: 'Bullish Breakout',
        // Price breaking 20-day high with volume
        condition: '( {cash} ( latest high = latest max( 20 , high ) and latest volume > 1.5 * latest sma( volume,20 ) and latest close > 50 ) )'
    },
    rsiOversoldBounce: {
        name: 'RSI Oversold Bounce',
        // RSI was below 30, now above 35
        condition: '( {cash} ( 1 day ago rsi( 14 ) < 30 and latest rsi( 14 ) > 35 and latest close > 20 ) )'
    },
    macdBullish: {
        name: 'MACD Bullish Crossover',
        // MACD line crosses above signal line
        condition: '( {cash} ( latest macd line( 26 , 12 , 9 ) > latest macd signal( 26 , 12 , 9 ) and 1 day ago macd line( 26 , 12 , 9 ) < 1 day ago macd signal( 26 , 12 , 9 ) ) )'
    },
    fiftyTwoWeekHigh: {
        name: '52 Week High Breakout',
        condition: '( {cash} ( latest high = latest max( 250 , high ) and latest volume > latest sma( volume,20 ) ) )'
    },
    bullishEngulfing: {
        name: 'Bullish Engulfing',
        condition: '( {cash} ( latest close > latest open and 1 day ago close < 1 day ago open and latest close > 1 day ago open and latest open < 1 day ago close and latest volume > latest sma( volume,20 ) ) )'
    }
};

/**
 * Fetch scan results from Chartink
 * @param {string} scanType - Type of scan to run
 * @returns {Promise<Array>} Array of stocks matching the scan
 */
async function fetchChartinkScan(scanType) {
    try {
        const scan = SCAN_QUERIES[scanType];
        if (!scan) {
            console.warn(`Unknown scan type: ${scanType}`);
            return [];
        }

        console.log(`Fetching Chartink scan: ${scan.name}...`);

        // Chartink requires a POST request with the scan condition
        const response = await axios.post(
            'https://chartink.com/screener/process',
            `scan_clause=${encodeURIComponent(scan.condition)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            }
        );

        if (response.data && response.data.data) {
            return response.data.data.map(stock => ({
                symbol: stock.nsecode + '.NS',
                name: stock.name,
                close: parseFloat(stock.close),
                percentChange: parseFloat(stock.per_chg),
                volume: parseInt(stock.volume) || 0,
                scanType: scanType,
                scanName: scan.name
            }));
        }

        return [];
    } catch (error) {
        console.error(`Chartink scan error (${scanType}):`, error.message);
        return [];
    }
}

/**
 * Run all technical scans and aggregate results
 * @returns {Promise<Object>} Aggregated scan results
 */
async function runAllScans() {
    console.log('Running all Chartink technical scans...');

    const results = {
        volumeShockers: [],
        bullishBreakout: [],
        rsiOversoldBounce: [],
        macdBullish: [],
        fiftyTwoWeekHigh: [],
        bullishEngulfing: [],
        lastUpdated: new Date().toISOString()
    };

    // Run scans in parallel for speed
    const scanPromises = Object.keys(SCAN_QUERIES).map(async (scanType) => {
        const scanResults = await fetchChartinkScan(scanType);
        results[scanType] = scanResults;
    });

    await Promise.all(scanPromises);

    // Create a consolidated list of stocks with their scan hits
    const stockScans = {};
    Object.keys(results).forEach(scanType => {
        if (Array.isArray(results[scanType])) {
            results[scanType].forEach(stock => {
                if (!stockScans[stock.symbol]) {
                    stockScans[stock.symbol] = {
                        ...stock,
                        scans: []
                    };
                }
                stockScans[stock.symbol].scans.push(scanType);
            });
        }
    });

    results.consolidatedStocks = Object.values(stockScans);
    results.totalScansRun = Object.keys(SCAN_QUERIES).length;

    return results;
}

/**
 * Check if a specific stock appears in any bullish scans
 * @param {string} symbol - Stock symbol (e.g., 'RELIANCE.NS')
 * @param {Object} scanResults - Results from runAllScans()
 * @returns {Object} Stock's scan analysis
 */
function analyzeStockScans(symbol, scanResults) {
    const normalizedSymbol = symbol.toUpperCase();
    const matchedScans = [];
    let totalScore = 0;

    const scanWeights = {
        volumeShockers: 25,
        bullishBreakout: 20,
        rsiOversoldBounce: 20,
        macdBullish: 15,
        fiftyTwoWeekHigh: 15,
        bullishEngulfing: 15
    };

    Object.keys(SCAN_QUERIES).forEach(scanType => {
        if (Array.isArray(scanResults[scanType])) {
            const found = scanResults[scanType].find(s =>
                s.symbol.toUpperCase() === normalizedSymbol
            );
            if (found) {
                matchedScans.push({
                    scan: SCAN_QUERIES[scanType].name,
                    type: scanType,
                    weight: scanWeights[scanType]
                });
                totalScore += scanWeights[scanType];
            }
        }
    });

    return {
        symbol,
        matchedScans,
        totalScore: Math.min(100, totalScore),
        scanCount: matchedScans.length,
        verdict: matchedScans.length >= 3 ? 'Strong Buy Signal' :
                 matchedScans.length >= 2 ? 'Moderate Buy Signal' :
                 matchedScans.length === 1 ? 'Weak Signal' : 'No Signal'
    };
}

module.exports = {
    fetchChartinkScan,
    runAllScans,
    analyzeStockScans,
    SCAN_QUERIES
};
