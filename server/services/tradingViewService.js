/**
 * TradingView Service - Technical Analysis Signals
 * Fetches technical analysis recommendations from TradingView
 *
 * Provides:
 * - Technical analysis summary (Buy/Sell/Neutral)
 * - Moving averages signals
 * - Oscillator signals
 * - Pivot points
 */

const axios = require('axios');

// TradingView technical analysis API (unofficial)
const TV_SCAN_URL = 'https://scanner.tradingview.com/india/scan';

/**
 * Interval mappings for TradingView
 */
const INTERVALS = {
    '1m': '|1',
    '5m': '|5',
    '15m': '|15',
    '30m': '|30',
    '1h': '|60',
    '2h': '|120',
    '4h': '|240',
    '1d': '',
    '1w': '|1W',
    '1M': '|1M'
};

/**
 * Technical indicators to fetch
 */
const INDICATORS = [
    'Recommend.All',
    'Recommend.MA',
    'Recommend.Other',
    // Moving Averages
    'SMA10', 'SMA20', 'SMA30', 'SMA50', 'SMA100', 'SMA200',
    'EMA10', 'EMA20', 'EMA30', 'EMA50', 'EMA100', 'EMA200',
    // Oscillators
    'RSI', 'RSI[1]',
    'Stoch.K', 'Stoch.D',
    'CCI20', 'CCI20[1]',
    'ADX', 'ADX+DI', 'ADX-DI',
    'AO', 'AO[1]',
    'Mom', 'Mom[1]',
    'MACD.macd', 'MACD.signal',
    'Rec.Stoch.RSI', 'Rec.WR', 'Rec.BBPower', 'Rec.UO',
    // Price data
    'close', 'open', 'high', 'low', 'volume',
    'change', 'change_abs',
    // Pivot Points
    'Pivot.M.Classic.S3', 'Pivot.M.Classic.S2', 'Pivot.M.Classic.S1',
    'Pivot.M.Classic.Middle',
    'Pivot.M.Classic.R1', 'Pivot.M.Classic.R2', 'Pivot.M.Classic.R3',
    // Volatility
    'ATR', 'BB.lower', 'BB.upper',
    // Volume
    'volume', 'average_volume_10d_calc', 'average_volume_30d_calc'
];

/**
 * Convert symbol to TradingView format
 * @param {string} symbol - Stock symbol (e.g., 'RELIANCE.NS')
 */
function toTVSymbol(symbol) {
    // Remove .NS suffix and add NSE: prefix
    return 'NSE:' + symbol.replace('.NS', '').toUpperCase();
}

/**
 * Fetch technical analysis for a stock
 * @param {string} symbol - Stock symbol
 * @param {string} interval - Time interval (default: '1d')
 */
async function fetchTechnicalAnalysis(symbol, interval = '1d') {
    try {
        const tvSymbol = toTVSymbol(symbol);
        const intervalSuffix = INTERVALS[interval] || '';

        console.log(`Fetching TradingView analysis for ${tvSymbol}...`);

        const columns = INDICATORS.map(ind => ind + intervalSuffix);

        const response = await axios.post(TV_SCAN_URL, {
            symbols: { tickers: [tvSymbol], query: { types: [] } },
            columns: columns
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        if (!response.data || !response.data.data || response.data.data.length === 0) {
            return null;
        }

        const stockData = response.data.data[0];
        const values = stockData.d;

        // Parse the response
        const analysis = {
            symbol,
            tvSymbol,
            interval,
            timestamp: new Date().toISOString(),

            // Overall Recommendations
            summary: {
                recommendation: getRecommendation(values[0]),
                value: values[0],
                buy: countSignals(values, 'buy'),
                sell: countSignals(values, 'sell'),
                neutral: countSignals(values, 'neutral')
            },

            // Moving Averages
            movingAverages: {
                recommendation: getRecommendation(values[1]),
                value: values[1],
                sma10: values[3],
                sma20: values[4],
                sma50: values[6],
                sma200: values[8],
                ema10: values[9],
                ema20: values[10],
                ema50: values[12],
                ema200: values[14]
            },

            // Oscillators
            oscillators: {
                recommendation: getRecommendation(values[2]),
                value: values[2],
                rsi: values[15],
                rsiPrev: values[16],
                stochK: values[17],
                stochD: values[18],
                cci: values[19],
                adx: values[21],
                adxPlusDI: values[22],
                adxMinusDI: values[23],
                macdValue: values[27],
                macdSignal: values[28]
            },

            // Price Data
            price: {
                close: values[33],
                open: values[34],
                high: values[35],
                low: values[36],
                volume: values[37],
                change: values[38],
                changePercent: values[39]
            },

            // Pivot Points
            pivotPoints: {
                r3: values[46],
                r2: values[45],
                r1: values[44],
                pivot: values[43],
                s1: values[42],
                s2: values[41],
                s3: values[40]
            },

            // Volatility
            volatility: {
                atr: values[47],
                bbLower: values[48],
                bbUpper: values[49]
            },

            // Volume Analysis
            volumeAnalysis: {
                current: values[50],
                avg10Day: values[51],
                avg30Day: values[52],
                ratio: values[51] > 0 ? (values[50] / values[51]).toFixed(2) : 0
            }
        };

        // Generate signals summary
        analysis.signals = generateSignals(analysis);
        analysis.interpretation = generateInterpretation(analysis);

        return analysis;
    } catch (error) {
        console.error(`TradingView analysis error for ${symbol}:`, error.message);
        return null;
    }
}

/**
 * Convert numeric recommendation to text
 */
function getRecommendation(value) {
    if (value === null || value === undefined) return 'Neutral';
    if (value >= 0.5) return 'Strong Buy';
    if (value >= 0.1) return 'Buy';
    if (value <= -0.5) return 'Strong Sell';
    if (value <= -0.1) return 'Sell';
    return 'Neutral';
}

/**
 * Count buy/sell/neutral signals
 */
function countSignals(values, type) {
    // Simplified count based on recommendation values
    const recommendations = [values[0], values[1], values[2]].filter(v => v !== null);
    let count = 0;

    recommendations.forEach(v => {
        if (type === 'buy' && v > 0) count++;
        else if (type === 'sell' && v < 0) count++;
        else if (type === 'neutral' && v === 0) count++;
    });

    return count;
}

/**
 * Generate trading signals from analysis
 */
function generateSignals(analysis) {
    const signals = [];

    // RSI signals
    if (analysis.oscillators.rsi < 30) {
        signals.push({ type: 'bullish', indicator: 'RSI', message: `RSI Oversold (${analysis.oscillators.rsi?.toFixed(1)})` });
    } else if (analysis.oscillators.rsi > 70) {
        signals.push({ type: 'bearish', indicator: 'RSI', message: `RSI Overbought (${analysis.oscillators.rsi?.toFixed(1)})` });
    }

    // MACD signals
    if (analysis.oscillators.macdValue > analysis.oscillators.macdSignal) {
        signals.push({ type: 'bullish', indicator: 'MACD', message: 'MACD above Signal Line' });
    } else if (analysis.oscillators.macdValue < analysis.oscillators.macdSignal) {
        signals.push({ type: 'bearish', indicator: 'MACD', message: 'MACD below Signal Line' });
    }

    // Moving Average signals
    if (analysis.price.close > analysis.movingAverages.sma50) {
        signals.push({ type: 'bullish', indicator: 'SMA50', message: 'Price above 50 SMA' });
    }
    if (analysis.price.close > analysis.movingAverages.sma200) {
        signals.push({ type: 'bullish', indicator: 'SMA200', message: 'Price above 200 SMA' });
    }

    // Golden/Death Cross
    if (analysis.movingAverages.sma50 > analysis.movingAverages.sma200) {
        signals.push({ type: 'bullish', indicator: 'Cross', message: 'Golden Cross (50 SMA > 200 SMA)' });
    } else if (analysis.movingAverages.sma50 < analysis.movingAverages.sma200) {
        signals.push({ type: 'bearish', indicator: 'Cross', message: 'Death Cross (50 SMA < 200 SMA)' });
    }

    // ADX Trend Strength
    if (analysis.oscillators.adx > 25) {
        const trend = analysis.oscillators.adxPlusDI > analysis.oscillators.adxMinusDI ? 'bullish' : 'bearish';
        signals.push({ type: trend, indicator: 'ADX', message: `Strong Trend (ADX: ${analysis.oscillators.adx?.toFixed(1)})` });
    }

    // Volume
    if (analysis.volumeAnalysis.ratio > 2) {
        signals.push({ type: 'attention', indicator: 'Volume', message: `High Volume (${analysis.volumeAnalysis.ratio}x average)` });
    }

    // Bollinger Bands
    if (analysis.price.close < analysis.volatility.bbLower) {
        signals.push({ type: 'bullish', indicator: 'BB', message: 'Price below lower Bollinger Band' });
    } else if (analysis.price.close > analysis.volatility.bbUpper) {
        signals.push({ type: 'bearish', indicator: 'BB', message: 'Price above upper Bollinger Band' });
    }

    return signals;
}

/**
 * Generate human-readable interpretation
 */
function generateInterpretation(analysis) {
    const lines = [];

    // Overall summary
    lines.push(`Overall: ${analysis.summary.recommendation} (Score: ${analysis.summary.value?.toFixed(2)})`);

    // MA Summary
    lines.push(`Moving Averages: ${analysis.movingAverages.recommendation}`);

    // Oscillators Summary
    lines.push(`Oscillators: ${analysis.oscillators.recommendation}`);

    // RSI Status
    if (analysis.oscillators.rsi) {
        let rsiStatus = 'Neutral';
        if (analysis.oscillators.rsi < 30) rsiStatus = 'Oversold - Reversal Expected';
        else if (analysis.oscillators.rsi < 40) rsiStatus = 'Approaching Oversold';
        else if (analysis.oscillators.rsi > 70) rsiStatus = 'Overbought - Caution';
        else if (analysis.oscillators.rsi > 60) rsiStatus = 'Strong Momentum';
        lines.push(`RSI (${analysis.oscillators.rsi?.toFixed(1)}): ${rsiStatus}`);
    }

    // Key Levels
    if (analysis.pivotPoints.pivot) {
        lines.push(`Key Levels - Support: ${analysis.pivotPoints.s1?.toFixed(2)}, Pivot: ${analysis.pivotPoints.pivot?.toFixed(2)}, Resistance: ${analysis.pivotPoints.r1?.toFixed(2)}`);
    }

    return lines.join(' | ');
}

/**
 * Fetch analysis for multiple stocks
 * @param {Array<string>} symbols - Array of stock symbols
 * @param {string} interval - Time interval
 */
async function fetchMultipleAnalysis(symbols, interval = '1d') {
    const results = {};

    // Process in batches of 5 to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(symbol => fetchTechnicalAnalysis(symbol, interval))
        );

        batch.forEach((symbol, index) => {
            results[symbol] = batchResults[index];
        });

        // Small delay between batches
        if (i + batchSize < symbols.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return results;
}

/**
 * Get quick signal score for top gainer prediction
 */
function getSignalScore(analysis) {
    if (!analysis) return { score: 0, signals: [] };

    let score = 50; // Base score
    const signals = [];

    // Summary recommendation
    if (analysis.summary.value > 0.5) {
        score += 20;
        signals.push('Strong Buy Signal');
    } else if (analysis.summary.value > 0) {
        score += 10;
        signals.push('Buy Signal');
    } else if (analysis.summary.value < -0.5) {
        score -= 20;
        signals.push('Strong Sell Signal');
    } else if (analysis.summary.value < 0) {
        score -= 10;
        signals.push('Sell Signal');
    }

    // RSI
    if (analysis.oscillators.rsi < 35 && analysis.oscillators.rsi > analysis.oscillators.rsiPrev) {
        score += 15;
        signals.push('RSI Oversold Bounce');
    }

    // MACD Bullish
    if (analysis.oscillators.macdValue > analysis.oscillators.macdSignal) {
        score += 10;
        signals.push('MACD Bullish');
    }

    // Above key MAs
    if (analysis.price.close > analysis.movingAverages.sma50) {
        score += 5;
        signals.push('Above 50 SMA');
    }

    // Volume surge
    if (analysis.volumeAnalysis.ratio > 2) {
        score += 15;
        signals.push('High Volume');
    }

    return {
        score: Math.min(100, Math.max(0, score)),
        signals,
        recommendation: analysis.summary.recommendation
    };
}

module.exports = {
    fetchTechnicalAnalysis,
    fetchMultipleAnalysis,
    getSignalScore,
    toTVSymbol
};
