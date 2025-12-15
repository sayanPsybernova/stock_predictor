const { mean, standardDeviation: std } = require('simple-statistics');

/**
 * Calculates the Exponential Moving Average (EMA).
 * @param {number[]} closingPrices - Array of closing prices.
 * @param {number} period - The EMA period (e.g., 20, 50).
 * @returns {number[]} Array of EMA values.
 */
function calculateEMA(closingPrices, period) {
    if (!closingPrices || closingPrices.length === 0) {
        return [];
    }

    // FIX: Use SMA of first period values for proper initialization
    const k = 2 / (period + 1);
    const initialPeriod = Math.min(period, closingPrices.length);
    const sma = closingPrices.slice(0, initialPeriod).reduce((a, b) => a + b, 0) / initialPeriod;

    let emaArray = [sma];
    for (let i = 1; i < closingPrices.length; i++) {
        emaArray.push(closingPrices[i] * k + emaArray[i - 1] * (1 - k));
    }
    return emaArray;
}

/**
 * Calculates the Relative Strength Index (RSI).
 * @param {number[]} closingPrices - Array of closing prices.
 * @param {number} period - The RSI period (usually 14).
 * @returns {number[]} Array of RSI values.
 */
function calculateRSI(closingPrices, period = 14) {
    if (!closingPrices || closingPrices.length < period + 1) {
        return [];
    }

    let gains = [];
    let losses = [];
    for (let i = 1; i < closingPrices.length; i++) {
        const diff = closingPrices[i] - closingPrices[i-1];
        if (diff > 0) {
            gains.push(diff);
            losses.push(0);
        } else {
            gains.push(0);
            losses.push(Math.abs(diff));
        }
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // FIX: Use Array.fill() for proper initialization instead of sparse array
    let rsiArray = Array(period).fill(null);

    // FIX: Handle division by zero - RSI is 100 when avgLoss is 0
    if (avgLoss === 0) {
        rsiArray.push(avgGain === 0 ? 50 : 100); // 50 if no movement, 100 if all gains
    } else {
        let rs = avgGain / avgLoss;
        rsiArray.push(100 - (100 / (1 + rs)));
    }

    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

        // FIX: Handle division by zero in loop
        if (avgLoss === 0) {
            rsiArray.push(avgGain === 0 ? 50 : 100);
        } else {
            let rs = avgGain / avgLoss;
            rsiArray.push(100 - (100 / (1 + rs)));
        }
    }
    return rsiArray;
}


/**
 * Calculates the Moving Average Convergence Divergence (MACD).
 * @param {number[]} closingPrices - Array of closing prices.
 * @param {number} fastPeriod - Fast EMA period (usually 12).
 * @param {number} slowPeriod - Slow EMA period (usually 26).
 * @param {number} signalPeriod - Signal line EMA period (usually 9).
 * @returns {object} Object with MACD line, signal line, and histogram.
 */
function calculateMACD(closingPrices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!closingPrices || closingPrices.length < slowPeriod) {
        return { macdLine: [], signalLine: [], histogram: [] };
    }

    const emaFast = calculateEMA(closingPrices, fastPeriod);
    const emaSlow = calculateEMA(closingPrices, slowPeriod);

    const macdLine = emaFast.map((fast, i) => fast - emaSlow[i]);
    const signalLine = calculateEMA(macdLine, signalPeriod);
    const histogram = macdLine.map((macd, i) => macd - signalLine[i]);

    return { macdLine, signalLine, histogram };
}

/**
 * Calculates the Bollinger Bands.
 * @param {number[]} closingPrices - Array of closing prices.
 * @param {number} period - The period for the moving average (usually 20).
 * @param {number} stdDev - The number of standard deviations (usually 2).
 * @returns {object} Object with upper, middle, and lower bands.
 */
function calculateBollingerBands(closingPrices, period = 20, stdDev = 2) {
    if (!closingPrices || closingPrices.length < period) {
        return { upperBand: [], middleBand: [], lowerBand: [] };
    }

    let middleBand = [];
    let upperBand = [];
    let lowerBand = [];

    for (let i = period - 1; i < closingPrices.length; i++) {
        const slice = closingPrices.slice(i - period + 1, i + 1);
        const sma = mean(slice);
        const stdDeviation = std(slice);
        middleBand.push(sma);
        upperBand.push(sma + (stdDeviation * stdDev));
        lowerBand.push(sma - (stdDeviation * stdDev));
    }

    return { upperBand, middleBand, lowerBand };
}

/**
 * Analyzes the current trend strength.
 * @param {number[]} closingPrices - Array of closing prices.
 * @returns {string} 'Uptrend', 'Downtrend', or 'Sideways'.
 */
function analyzeTrend(closingPrices) {
    if (!closingPrices || closingPrices.length < 50) {
        return 'Unknown';
    }

    const ema20 = calculateEMA(closingPrices, 20);
    const ema50 = calculateEMA(closingPrices, 50);

    const lastEma20 = ema20[ema20.length - 1];
    const lastEma50 = ema50[ema50.length - 1];

    if (lastEma20 > lastEma50) return 'Uptrend';
    if (lastEma20 < lastEma50) return 'Downtrend';
    return 'Sideways';
}

/**
 * Identifies potential support and resistance levels.
 * @param {Array<Object>} historicalData - Array of historical data points {high, low}.
 * @returns {object} Object with support and resistance levels.
 */
function findSupportResistance(historicalData) {
    if (!historicalData || historicalData.length === 0) {
        return { support: null, resistance: null };
    }

    const recentData = historicalData.slice(-60); // Look at last 60 days
    const lows = recentData.map(d => d.low).filter(l => l != null && !isNaN(l));
    const highs = recentData.map(d => d.high).filter(h => h != null && !isNaN(h));

    if (lows.length === 0 || highs.length === 0) {
        return { support: null, resistance: null };
    }

    const support = Math.min(...lows);
    const resistance = Math.max(...highs);

    return { support, resistance };
}

/**
 * Determines the current volatility regime.
 * @param {number[]} closingPrices - Array of closing prices.
 * @returns {string} 'High', 'Medium', or 'Low'.
 */
function getVolatilityRegime(closingPrices) {
    if (!closingPrices || closingPrices.length < 20) {
        return 'Unknown';
    }

    const recentPrices = closingPrices.slice(-20); // Last 20 days
    const returns = [];
    for (let i = 1; i < recentPrices.length; i++) {
        returns.push((recentPrices[i] - recentPrices[i-1]) / recentPrices[i-1]);
    }

    if (returns.length === 0) return 'Unknown';

    const volatility = std(returns) * Math.sqrt(252); // Annualized volatility
    if (volatility > 0.4) return 'High';
    if (volatility > 0.2) return 'Medium';
    return 'Low';
}


/**
 * Main function to perform all technical analysis.
 * @param {Array<Object>} historicalData - Array of historical data points.
 * @returns {object} An object containing all technical analysis results.
 */
function performTechnicalAnalysis(historicalData) {
    if (!historicalData || historicalData.length === 0) {
        return {
            ema: { ema20: [], ema50: [] },
            rsi: [],
            macd: { macdLine: [], signalLine: [], histogram: [] },
            bollingerBands: { upperBand: [], middleBand: [], lowerBand: [] },
            trend: 'Unknown',
            supportResistance: { support: null, resistance: null },
            volatilityRegime: 'Unknown',
            summary: {
                trend: 'Unknown',
                rsi: 'N/A',
                macd_signal: 'N/A',
                volatility: 'Unknown'
            }
        };
    }

    const closingPrices = historicalData.map(d => d.close).filter(p => p != null && !isNaN(p));

    const ema20 = calculateEMA(closingPrices, 20);
    const ema50 = calculateEMA(closingPrices, 50);
    const rsi = calculateRSI(closingPrices);
    const macd = calculateMACD(closingPrices);
    const bollingerBands = calculateBollingerBands(closingPrices);
    const trend = analyzeTrend(closingPrices);
    const { support, resistance } = findSupportResistance(historicalData);
    const volatilityRegime = getVolatilityRegime(closingPrices);

    // FIX: Safe access to last values with null checks
    const lastRsi = rsi.length > 0 ? rsi.filter(r => r !== null).slice(-1)[0] : null;
    const lastHistogram = macd.histogram.length > 0 ? macd.histogram.slice(-1)[0] : 0;

    return {
        ema: {
            ema20: ema20.slice(-30), // Return last 30 values
            ema50: ema50.slice(-30),
        },
        rsi: rsi.slice(-30),
        macd: {
            macdLine: macd.macdLine.slice(-30),
            signalLine: macd.signalLine.slice(-30),
            histogram: macd.histogram.slice(-30),
        },
        bollingerBands: {
            upperBand: bollingerBands.upperBand.slice(-30),
            middleBand: bollingerBands.middleBand.slice(-30),
            lowerBand: bollingerBands.lowerBand.slice(-30),
        },
        trend,
        supportResistance: {
            support,
            resistance,
        },
        volatilityRegime,
        summary: {
            trend: trend,
            rsi: lastRsi !== null && lastRsi !== undefined ? lastRsi.toFixed(2) : 'N/A',
            macd_signal: lastHistogram > 0 ? "Bullish" : "Bearish",
            volatility: volatilityRegime
        }
    };
}

module.exports = {
    performTechnicalAnalysis,
};
