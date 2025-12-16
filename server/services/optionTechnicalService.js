/**
 * Option Technical Analysis Service
 * Provides technical analysis for the underlying asset
 *
 * Features:
 * - Trend analysis (SMA crossovers, price position)
 * - Momentum indicators (RSI, MACD)
 * - Support/Resistance detection
 * - Candlestick patterns
 * - VWAP analysis
 */

const YahooFinance = require('yahoo-finance2').default;

// Index to Yahoo symbol mapping
const SYMBOL_MAP = {
    'NIFTY': '^NSEI',
    'BANKNIFTY': '^NSEBANK',
    'FINNIFTY': 'NIFTY_FIN_SERVICE.NS'
};

/**
 * Complete technical analysis for underlying
 * @param {string} symbol - Stock/Index symbol
 * @returns {Promise<Object>} Technical analysis results
 */
async function analyseTechnical(symbol) {
    try {
        const yahooSymbol = SYMBOL_MAP[symbol] || (symbol.endsWith('.NS') ? symbol : `${symbol}.NS`);

        // Fetch historical data (60 days for calculations)
        const history = await YahooFinance.chart(yahooSymbol, {
            period1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            period2: new Date(),
            interval: '1d'
        });

        if (!history || !history.quotes || history.quotes.length < 30) {
            console.error(`Insufficient data for ${symbol}`);
            return null;
        }

        const quotes = history.quotes.filter(q => q && q.close && q.volume);
        const closes = quotes.map(q => q.close);
        const highs = quotes.map(q => q.high);
        const lows = quotes.map(q => q.low);
        const volumes = quotes.map(q => q.volume);

        const currentPrice = closes[closes.length - 1];
        const previousClose = closes[closes.length - 2];

        // Calculate all indicators
        const trend = analyseTrend(closes, highs, lows);
        const momentum = analyseMomentum(closes);
        const supportResistance = findSupportResistance(highs, lows, closes);
        const volumeAnalysis = analyseVolume(volumes, closes);
        const patterns = detectPatterns(quotes.slice(-5));

        // Calculate overall technical score
        const techScore = calculateTechScore(trend, momentum, volumeAnalysis, patterns);

        return {
            symbol,
            currentPrice,
            dayChange: ((currentPrice - previousClose) / previousClose * 100).toFixed(2),

            trend,
            momentum,
            supportResistance,
            volume: volumeAnalysis,
            patterns,

            score: techScore.score,
            signal: techScore.signal,
            confidence: techScore.confidence,
            reasoning: techScore.reasoning,

            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error(`Technical analysis error for ${symbol}:`, error);
        return null;
    }
}

/**
 * Analyse trend using moving averages
 */
function analyseTrend(closes, highs, lows) {
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const ema9 = calculateEMA(closes, 9);

    const currentPrice = closes[closes.length - 1];

    // Trend direction
    let direction = 'SIDEWAYS';
    let strength = 'Weak';

    const aboveSMA20 = currentPrice > sma20;
    const aboveSMA50 = currentPrice > sma50;
    const sma20AboveSMA50 = sma20 > sma50;
    const priceAboveEMA9 = currentPrice > ema9;

    // Count bullish conditions
    const bullishCount = [aboveSMA20, aboveSMA50, sma20AboveSMA50, priceAboveEMA9].filter(Boolean).length;

    if (bullishCount >= 4) {
        direction = 'UPTREND';
        strength = 'Strong';
    } else if (bullishCount >= 3) {
        direction = 'UPTREND';
        strength = 'Moderate';
    } else if (bullishCount <= 1) {
        direction = 'DOWNTREND';
        strength = bullishCount === 0 ? 'Strong' : 'Moderate';
    }

    // Price distance from SMAs
    const distanceFromSMA20 = ((currentPrice - sma20) / sma20 * 100).toFixed(2);
    const distanceFromSMA50 = ((currentPrice - sma50) / sma50 * 100).toFixed(2);

    // Recent trend (last 5 days)
    const recentCloses = closes.slice(-5);
    const recentTrend = recentCloses[4] > recentCloses[0] ? 'UP' : recentCloses[4] < recentCloses[0] ? 'DOWN' : 'FLAT';

    return {
        direction,
        strength,
        indicators: {
            sma20,
            sma50,
            ema9,
            currentPrice
        },
        position: {
            aboveSMA20,
            aboveSMA50,
            sma20AboveSMA50,
            priceAboveEMA9
        },
        distance: {
            fromSMA20: parseFloat(distanceFromSMA20),
            fromSMA50: parseFloat(distanceFromSMA50)
        },
        recentTrend,
        interpretation: getTrendInterpretation(direction, strength, distanceFromSMA20),
        score: calculateTrendScore(bullishCount, distanceFromSMA20)
    };
}

/**
 * Analyse momentum indicators
 */
function analyseMomentum(closes) {
    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);

    // RSI interpretation
    let rsiSignal = 'NEUTRAL';
    let rsiInterpretation = '';

    if (rsi > 70) {
        rsiSignal = 'OVERBOUGHT';
        rsiInterpretation = 'RSI overbought - potential reversal or consolidation';
    } else if (rsi > 60) {
        rsiSignal = 'BULLISH';
        rsiInterpretation = 'RSI showing bullish momentum';
    } else if (rsi < 30) {
        rsiSignal = 'OVERSOLD';
        rsiInterpretation = 'RSI oversold - potential bounce expected';
    } else if (rsi < 40) {
        rsiSignal = 'BEARISH';
        rsiInterpretation = 'RSI showing bearish momentum';
    } else {
        rsiInterpretation = 'RSI in neutral zone';
    }

    // MACD interpretation
    let macdSignal = 'NEUTRAL';
    let macdInterpretation = '';

    if (macd.histogram > 0 && macd.macdLine > macd.signalLine) {
        macdSignal = 'BULLISH';
        macdInterpretation = 'MACD above signal line with positive histogram - bullish';
    } else if (macd.histogram < 0 && macd.macdLine < macd.signalLine) {
        macdSignal = 'BEARISH';
        macdInterpretation = 'MACD below signal line with negative histogram - bearish';
    } else if (macd.histogram > 0) {
        macdSignal = 'MILDLY_BULLISH';
        macdInterpretation = 'MACD histogram positive but momentum weakening';
    } else {
        macdSignal = 'MILDLY_BEARISH';
        macdInterpretation = 'MACD histogram negative but may be improving';
    }

    return {
        rsi: {
            value: parseFloat(rsi.toFixed(2)),
            signal: rsiSignal,
            interpretation: rsiInterpretation
        },
        macd: {
            macdLine: parseFloat(macd.macdLine.toFixed(2)),
            signalLine: parseFloat(macd.signalLine.toFixed(2)),
            histogram: parseFloat(macd.histogram.toFixed(2)),
            signal: macdSignal,
            interpretation: macdInterpretation
        },
        overallSignal: getMomentumSignal(rsiSignal, macdSignal),
        score: calculateMomentumScore(rsi, macd)
    };
}

/**
 * Find support and resistance levels
 */
function findSupportResistance(highs, lows, closes) {
    const currentPrice = closes[closes.length - 1];

    // Recent highs as resistance
    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);

    // Find pivot points
    const pivotHigh = Math.max(...recentHighs);
    const pivotLow = Math.min(...recentLows);

    // Calculate key levels using pivot points
    const range = pivotHigh - pivotLow;
    const pivot = (pivotHigh + pivotLow + closes[closes.length - 1]) / 3;

    const r1 = 2 * pivot - pivotLow;
    const r2 = pivot + range;
    const s1 = 2 * pivot - pivotHigh;
    const s2 = pivot - range;

    // Find psychological levels (round numbers)
    const nearestRoundUp = Math.ceil(currentPrice / 100) * 100;
    const nearestRoundDown = Math.floor(currentPrice / 100) * 100;

    return {
        pivot: parseFloat(pivot.toFixed(2)),
        resistance: {
            r1: parseFloat(r1.toFixed(2)),
            r2: parseFloat(r2.toFixed(2)),
            recent20DayHigh: parseFloat(pivotHigh.toFixed(2))
        },
        support: {
            s1: parseFloat(s1.toFixed(2)),
            s2: parseFloat(s2.toFixed(2)),
            recent20DayLow: parseFloat(pivotLow.toFixed(2))
        },
        psychological: {
            nearestResistance: nearestRoundUp,
            nearestSupport: nearestRoundDown
        },
        position: {
            abovePivot: currentPrice > pivot,
            percentFromR1: ((r1 - currentPrice) / currentPrice * 100).toFixed(2),
            percentFromS1: ((currentPrice - s1) / currentPrice * 100).toFixed(2)
        }
    };
}

/**
 * Analyse volume patterns
 */
function analyseVolume(volumes, closes) {
    const avgVolume10 = volumes.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / avgVolume10;

    const previousClose = closes[closes.length - 2];
    const currentClose = closes[closes.length - 1];
    const priceUp = currentClose > previousClose;

    let signal = 'NEUTRAL';
    let interpretation = '';

    if (volumeRatio > 2) {
        if (priceUp) {
            signal = 'BULLISH';
            interpretation = 'Very high volume with price up - strong buying interest';
        } else {
            signal = 'BEARISH';
            interpretation = 'Very high volume with price down - distribution/selling';
        }
    } else if (volumeRatio > 1.5) {
        if (priceUp) {
            signal = 'MILDLY_BULLISH';
            interpretation = 'Above average volume on up day - accumulation';
        } else {
            signal = 'MILDLY_BEARISH';
            interpretation = 'Above average volume on down day - selling pressure';
        }
    } else if (volumeRatio < 0.5) {
        interpretation = 'Very low volume - lack of conviction in current move';
    } else {
        interpretation = 'Normal volume - no significant signal';
    }

    return {
        currentVolume,
        avgVolume10: Math.round(avgVolume10),
        volumeRatio: parseFloat(volumeRatio.toFixed(2)),
        signal,
        interpretation,
        priceVolumeConfirmation: (priceUp && volumeRatio > 1) || (!priceUp && volumeRatio < 1),
        score: calculateVolumeScore(volumeRatio, priceUp)
    };
}

/**
 * Detect candlestick patterns
 */
function detectPatterns(recentQuotes) {
    const patterns = [];
    const lastCandle = recentQuotes[recentQuotes.length - 1];
    const prevCandle = recentQuotes[recentQuotes.length - 2];

    if (!lastCandle || !prevCandle) return { patterns, signal: 'NEUTRAL' };

    const lastBody = Math.abs(lastCandle.close - lastCandle.open);
    const lastRange = lastCandle.high - lastCandle.low;
    const lastUpperShadow = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const lastLowerShadow = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;

    const isBullishCandle = lastCandle.close > lastCandle.open;
    const isBearishCandle = lastCandle.close < lastCandle.open;

    // Doji
    if (lastBody < lastRange * 0.1) {
        patterns.push({
            name: 'Doji',
            type: 'reversal',
            signal: 'NEUTRAL',
            interpretation: 'Indecision - potential reversal'
        });
    }

    // Hammer (bullish reversal)
    if (lastLowerShadow > lastBody * 2 && lastUpperShadow < lastBody * 0.5) {
        patterns.push({
            name: 'Hammer',
            type: 'bullish_reversal',
            signal: 'BULLISH',
            interpretation: 'Potential bullish reversal after downtrend'
        });
    }

    // Shooting Star (bearish reversal)
    if (lastUpperShadow > lastBody * 2 && lastLowerShadow < lastBody * 0.5) {
        patterns.push({
            name: 'Shooting Star',
            type: 'bearish_reversal',
            signal: 'BEARISH',
            interpretation: 'Potential bearish reversal after uptrend'
        });
    }

    // Engulfing patterns
    if (prevCandle) {
        const prevBody = Math.abs(prevCandle.close - prevCandle.open);
        const prevBullish = prevCandle.close > prevCandle.open;

        // Bullish Engulfing
        if (!prevBullish && isBullishCandle &&
            lastCandle.open < prevCandle.close && lastCandle.close > prevCandle.open) {
            patterns.push({
                name: 'Bullish Engulfing',
                type: 'bullish_reversal',
                signal: 'BULLISH',
                interpretation: 'Strong bullish reversal signal'
            });
        }

        // Bearish Engulfing
        if (prevBullish && isBearishCandle &&
            lastCandle.open > prevCandle.close && lastCandle.close < prevCandle.open) {
            patterns.push({
                name: 'Bearish Engulfing',
                type: 'bearish_reversal',
                signal: 'BEARISH',
                interpretation: 'Strong bearish reversal signal'
            });
        }
    }

    // Determine overall pattern signal
    let signal = 'NEUTRAL';
    const bullishPatterns = patterns.filter(p => p.signal === 'BULLISH').length;
    const bearishPatterns = patterns.filter(p => p.signal === 'BEARISH').length;

    if (bullishPatterns > bearishPatterns) signal = 'BULLISH';
    else if (bearishPatterns > bullishPatterns) signal = 'BEARISH';

    return { patterns, signal };
}

// Helper functions for calculations

function calculateSMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }
    return ema;
}

function calculateRSI(data, period = 14) {
    if (data.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calculateMACD(data) {
    const ema12 = calculateEMA(data, 12);
    const ema26 = calculateEMA(data, 26);
    const macdLine = ema12 - ema26;

    // Signal line (9-day EMA of MACD)
    const macdValues = [];
    for (let i = 26; i <= data.length; i++) {
        const e12 = calculateEMA(data.slice(0, i), 12);
        const e26 = calculateEMA(data.slice(0, i), 26);
        macdValues.push(e12 - e26);
    }

    const signalLine = macdValues.length >= 9 ? calculateEMA(macdValues, 9) : macdLine;
    const histogram = macdLine - signalLine;

    return { macdLine, signalLine, histogram };
}

function getTrendInterpretation(direction, strength, distanceFromSMA20) {
    if (direction === 'UPTREND') {
        if (parseFloat(distanceFromSMA20) > 5) {
            return 'Strong uptrend but extended. Watch for pullback to SMA20.';
        }
        return `${strength} uptrend. Price above key moving averages.`;
    } else if (direction === 'DOWNTREND') {
        if (parseFloat(distanceFromSMA20) < -5) {
            return 'Strong downtrend but oversold. Watch for bounce.';
        }
        return `${strength} downtrend. Price below key moving averages.`;
    }
    return 'Sideways/consolidation. Wait for breakout direction.';
}

function getMomentumSignal(rsiSignal, macdSignal) {
    const signals = [rsiSignal, macdSignal];
    const bullish = signals.filter(s => s.includes('BULLISH')).length;
    const bearish = signals.filter(s => s.includes('BEARISH') || s === 'OVERBOUGHT').length;

    if (bullish > bearish) return 'BULLISH';
    if (bearish > bullish) return 'BEARISH';
    return 'NEUTRAL';
}

// Score calculation functions

function calculateTrendScore(bullishCount, distanceFromSMA20) {
    // Base score from bullish conditions
    let score = bullishCount * 20;

    // Adjust for distance from SMA20
    const dist = parseFloat(distanceFromSMA20);
    if (dist > 0 && dist < 3) score += 10;
    else if (dist > 5) score -= 5; // Extended

    return Math.max(0, Math.min(100, score));
}

function calculateMomentumScore(rsi, macd) {
    let score = 50;

    // RSI contribution
    if (rsi > 60 && rsi < 70) score += 15;
    else if (rsi < 40 && rsi > 30) score -= 15;
    else if (rsi < 30) score += 10; // Oversold bounce potential
    else if (rsi > 70) score -= 10; // Overbought reversal risk

    // MACD contribution
    if (macd.histogram > 0) score += 15;
    else score -= 15;

    if (macd.macdLine > macd.signalLine) score += 10;
    else score -= 10;

    return Math.max(0, Math.min(100, score));
}

function calculateVolumeScore(volumeRatio, priceUp) {
    let score = 50;

    if (volumeRatio > 1.5 && priceUp) score += 25;
    else if (volumeRatio > 1.5 && !priceUp) score -= 25;
    else if (volumeRatio < 0.5) score -= 10; // Low conviction

    return Math.max(0, Math.min(100, score));
}

function calculateTechScore(trend, momentum, volume, patterns) {
    const trendScore = trend.score;
    const momentumScore = momentum.score;
    const volumeScore = volume.score;

    // Pattern bonus
    let patternBonus = 0;
    if (patterns.signal === 'BULLISH') patternBonus = 10;
    else if (patterns.signal === 'BEARISH') patternBonus = -10;

    // Weighted average
    const weightedScore = (
        trendScore * 0.35 +
        momentumScore * 0.35 +
        volumeScore * 0.20 +
        (50 + patternBonus) * 0.10
    );

    const score = Math.round(weightedScore);

    let signal = 'NEUTRAL';
    let confidence = 'Low';

    if (score >= 65) {
        signal = 'BULLISH';
        confidence = score >= 75 ? 'High' : 'Moderate';
    } else if (score >= 55) {
        signal = 'MILDLY_BULLISH';
        confidence = 'Moderate';
    } else if (score <= 35) {
        signal = 'BEARISH';
        confidence = score <= 25 ? 'High' : 'Moderate';
    } else if (score <= 45) {
        signal = 'MILDLY_BEARISH';
        confidence = 'Moderate';
    }

    const reasoning = [];
    reasoning.push(`Trend: ${trend.direction} (${trend.strength})`);
    reasoning.push(`RSI: ${momentum.rsi.value} - ${momentum.rsi.signal}`);
    reasoning.push(`MACD: ${momentum.macd.signal}`);
    reasoning.push(`Volume: ${volume.interpretation}`);
    if (patterns.patterns.length > 0) {
        reasoning.push(`Patterns: ${patterns.patterns.map(p => p.name).join(', ')}`);
    }

    return { score, signal, confidence, reasoning };
}

module.exports = {
    analyseTechnical
};
