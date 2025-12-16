/**
 * Option Quantitative Analysis Service
 * Provides quantitative analysis for options including:
 * - PCR (Put-Call Ratio) analysis
 * - Max Pain calculation and interpretation
 * - OI (Open Interest) buildup analysis
 * - IV (Implied Volatility) analysis and skew
 * - Support/Resistance from OI data
 */

const { fetchOptionChain } = require('./optionDataService');

/**
 * Complete quantitative analysis for a symbol
 * @param {string} symbol - Stock/Index symbol
 * @param {string} expiry - Optional expiry date
 * @returns {Promise<Object>} Quantitative analysis results
 */
async function analyseQuant(symbol, expiry = null) {
    try {
        const chainData = await fetchOptionChain(symbol, expiry);
        if (!chainData) return null;

        // PCR Analysis
        const pcrAnalysis = analysePCR(chainData.metrics.pcr, chainData.metrics.oiChange);

        // Max Pain Analysis
        const maxPainAnalysis = analyseMaxPain(
            chainData.metrics.maxPain,
            chainData.spotPrice,
            chainData.topOIStrikes
        );

        // OI Analysis
        const oiAnalysis = analyseOI(chainData);

        // IV Analysis
        const ivAnalysis = analyseIV(chainData);

        // Support/Resistance from OI
        const levels = identifyLevels(chainData);

        // Calculate overall quant score (0-100)
        const quantScore = calculateQuantScore(pcrAnalysis, maxPainAnalysis, oiAnalysis, ivAnalysis);

        return {
            symbol: chainData.symbol,
            spotPrice: chainData.spotPrice,
            expiry: chainData.selectedExpiry,
            daysToExpiry: chainData.metrics.daysToExpiry,

            pcr: pcrAnalysis,
            maxPain: maxPainAnalysis,
            oi: oiAnalysis,
            iv: ivAnalysis,
            levels,

            score: quantScore.score,
            signal: quantScore.signal,
            confidence: quantScore.confidence,
            reasoning: quantScore.reasoning,

            timestamp: chainData.timestamp
        };

    } catch (error) {
        console.error(`Quant analysis error for ${symbol}:`, error);
        return null;
    }
}

/**
 * Analyse PCR (Put-Call Ratio)
 */
function analysePCR(pcr, oiChange) {
    const pcrOI = pcr.oi;
    const pcrVolume = pcr.volume;

    let signal = 'NEUTRAL';
    let strength = 'Moderate';
    let interpretation = '';

    // PCR OI interpretation
    if (pcrOI > 1.5) {
        signal = 'BULLISH';
        strength = 'Strong';
        interpretation = 'Very high PCR indicates extreme put writing. Market likely to move up.';
    } else if (pcrOI > 1.2) {
        signal = 'BULLISH';
        strength = 'Moderate';
        interpretation = 'High PCR suggests bullish sentiment. Put writers confident of support.';
    } else if (pcrOI > 1.0) {
        signal = 'MILDLY_BULLISH';
        strength = 'Weak';
        interpretation = 'PCR above 1 indicates slightly bullish sentiment.';
    } else if (pcrOI > 0.8) {
        signal = 'MILDLY_BEARISH';
        strength = 'Weak';
        interpretation = 'PCR below 1 indicates slightly bearish sentiment.';
    } else if (pcrOI > 0.5) {
        signal = 'BEARISH';
        strength = 'Moderate';
        interpretation = 'Low PCR suggests bearish sentiment. Call writers dominant.';
    } else {
        signal = 'BEARISH';
        strength = 'Strong';
        interpretation = 'Very low PCR indicates extreme call writing. Market likely to fall.';
    }

    // OI change context
    const oiChangeContext = [];
    if (oiChange.put > 0 && oiChange.call < 0) {
        oiChangeContext.push('Fresh put writing with call unwinding - Bullish');
    } else if (oiChange.put < 0 && oiChange.call > 0) {
        oiChangeContext.push('Fresh call writing with put unwinding - Bearish');
    } else if (oiChange.put > 0 && oiChange.call > 0) {
        oiChangeContext.push('Both sides adding positions - Range bound likely');
    }

    return {
        oi: pcrOI,
        volume: pcrVolume,
        signal,
        strength,
        interpretation,
        oiChangeContext,
        score: calculatePCRScore(pcrOI)
    };
}

/**
 * Calculate PCR score (0-100, higher = more bullish)
 */
function calculatePCRScore(pcrOI) {
    // PCR < 0.5 = 0, PCR = 1 = 50, PCR > 1.5 = 100
    if (pcrOI <= 0.5) return 0;
    if (pcrOI >= 1.5) return 100;
    return Math.round((pcrOI - 0.5) * 100);
}

/**
 * Analyse Max Pain
 */
function analyseMaxPain(maxPain, spotPrice, topOIStrikes) {
    const distanceFromMaxPain = ((spotPrice - maxPain) / maxPain * 100).toFixed(2);
    const distanceAbs = Math.abs(parseFloat(distanceFromMaxPain));

    let signal = 'NEUTRAL';
    let interpretation = '';
    let expectedMove = 'sideways';

    if (spotPrice > maxPain) {
        if (distanceAbs > 2) {
            signal = 'BEARISH';
            interpretation = `Spot is ${distanceFromMaxPain}% above Max Pain. Market likely to pull back towards ${maxPain}.`;
            expectedMove = 'down';
        } else {
            signal = 'MILDLY_BEARISH';
            interpretation = `Spot slightly above Max Pain. May consolidate or drift lower.`;
            expectedMove = 'sideways_down';
        }
    } else if (spotPrice < maxPain) {
        if (distanceAbs > 2) {
            signal = 'BULLISH';
            interpretation = `Spot is ${Math.abs(distanceFromMaxPain)}% below Max Pain. Market likely to move up towards ${maxPain}.`;
            expectedMove = 'up';
        } else {
            signal = 'MILDLY_BULLISH';
            interpretation = `Spot slightly below Max Pain. May consolidate or drift higher.`;
            expectedMove = 'sideways_up';
        }
    } else {
        interpretation = 'Spot at Max Pain. Expect range-bound movement.';
    }

    // Identify immediate support/resistance from top OI
    const resistance = topOIStrikes.callStrikes[0]?.strike || maxPain + (spotPrice * 0.02);
    const support = topOIStrikes.putStrikes[0]?.strike || maxPain - (spotPrice * 0.02);

    return {
        maxPain,
        spotPrice,
        distancePercent: parseFloat(distanceFromMaxPain),
        signal,
        interpretation,
        expectedMove,
        levels: {
            immediateResistance: resistance,
            immediateSupport: support,
            maxPainTarget: maxPain
        },
        score: calculateMaxPainScore(distanceFromMaxPain, spotPrice, maxPain)
    };
}

/**
 * Calculate Max Pain score (0-100)
 */
function calculateMaxPainScore(distancePercent, spot, maxPain) {
    const dist = parseFloat(distancePercent);

    // If spot below max pain, bullish (score > 50)
    // If spot above max pain, bearish (score < 50)
    if (spot < maxPain) {
        return Math.min(100, 50 + Math.abs(dist) * 10);
    } else {
        return Math.max(0, 50 - Math.abs(dist) * 10);
    }
}

/**
 * Analyse OI (Open Interest)
 */
function analyseOI(chainData) {
    const oiChange = chainData.metrics.oiChange;
    const oiAnalysis = chainData.oiChangeAnalysis;
    const topStrikes = chainData.topOIStrikes;

    // Determine OI buildup pattern
    let pattern = oiAnalysis.dominant.pattern;
    let signal = 'NEUTRAL';

    switch (pattern) {
        case 'longBuildup':
            signal = 'BULLISH';
            break;
        case 'shortBuildup':
            signal = 'BEARISH';
            break;
        case 'shortCovering':
            signal = 'BULLISH';
            break;
        case 'longUnwinding':
            signal = 'BEARISH';
            break;
    }

    // Analyse top OI concentration
    const callOIConcentration = topStrikes.callStrikes.slice(0, 3);
    const putOIConcentration = topStrikes.putStrikes.slice(0, 3);

    const strongResistance = callOIConcentration[0]?.strike;
    const strongSupport = putOIConcentration[0]?.strike;

    return {
        totalCallOI: chainData.metrics.totalOI.call,
        totalPutOI: chainData.metrics.totalOI.put,
        callOIChange: oiChange.call,
        putOIChange: oiChange.put,
        netOIChange: oiChange.net,

        pattern,
        patternInterpretation: oiAnalysis.dominant.interpretation,
        signal,

        concentration: {
            callStrikes: callOIConcentration,
            putStrikes: putOIConcentration
        },

        keyLevels: {
            strongResistance,
            strongSupport,
            interpretation: `Strong resistance at ${strongResistance} (highest Call OI), Strong support at ${strongSupport} (highest Put OI)`
        },

        score: calculateOIScore(signal, oiChange)
    };
}

/**
 * Calculate OI score (0-100)
 */
function calculateOIScore(signal, oiChange) {
    let score = 50;

    if (signal === 'BULLISH') score += 25;
    else if (signal === 'BEARISH') score -= 25;

    // Adjust based on net OI change
    if (oiChange.net > 0) score += 10; // Put OI increasing more
    else if (oiChange.net < 0) score -= 10; // Call OI increasing more

    return Math.max(0, Math.min(100, score));
}

/**
 * Analyse IV (Implied Volatility)
 */
function analyseIV(chainData) {
    const avgIV = chainData.metrics.avgIV;
    const chain = chainData.chain;

    // Find ATM IV
    const atmStrike = chain.find(s => s.isATM);
    const atmCallIV = atmStrike?.call?.iv || avgIV.call;
    const atmPutIV = atmStrike?.put?.iv || avgIV.put;

    // Calculate IV skew (OTM Put IV - OTM Call IV)
    const otmPuts = chain.filter(s => s.put && s.strikePrice < chainData.spotPrice * 0.97);
    const otmCalls = chain.filter(s => s.call && s.strikePrice > chainData.spotPrice * 1.03);

    const avgOtmPutIV = otmPuts.length > 0
        ? otmPuts.reduce((sum, s) => sum + (s.put?.iv || 0), 0) / otmPuts.length
        : atmPutIV;
    const avgOtmCallIV = otmCalls.length > 0
        ? otmCalls.reduce((sum, s) => sum + (s.call?.iv || 0), 0) / otmCalls.length
        : atmCallIV;

    const ivSkew = avgOtmPutIV - avgOtmCallIV;

    // Interpret IV
    let ivSignal = 'NEUTRAL';
    let interpretation = '';

    if (ivSkew > 5) {
        ivSignal = 'BEARISH';
        interpretation = 'High put IV skew indicates fear/hedging demand. Bearish sentiment.';
    } else if (ivSkew > 2) {
        ivSignal = 'MILDLY_BEARISH';
        interpretation = 'Moderate put skew suggests some downside protection demand.';
    } else if (ivSkew < -5) {
        ivSignal = 'BULLISH';
        interpretation = 'Call IV higher than Put IV. Bullish call buying activity.';
    } else if (ivSkew < -2) {
        ivSignal = 'MILDLY_BULLISH';
        interpretation = 'Slight call IV premium indicates bullish interest.';
    } else {
        interpretation = 'IV skew normal. No significant directional bias from IV.';
    }

    // IV level interpretation
    const ivLevel = (atmCallIV + atmPutIV) / 2;
    let ivLevelInterpretation = '';

    if (ivLevel > 25) {
        ivLevelInterpretation = 'High IV - Options expensive. Consider selling strategies.';
    } else if (ivLevel > 18) {
        ivLevelInterpretation = 'Moderate IV - Normal option pricing.';
    } else {
        ivLevelInterpretation = 'Low IV - Options cheap. Consider buying strategies.';
    }

    return {
        atmIV: {
            call: atmCallIV,
            put: atmPutIV,
            average: parseFloat(ivLevel.toFixed(2))
        },
        avgIV,
        skew: {
            value: parseFloat(ivSkew.toFixed(2)),
            signal: ivSignal,
            interpretation
        },
        level: {
            value: parseFloat(ivLevel.toFixed(2)),
            interpretation: ivLevelInterpretation
        },
        score: calculateIVScore(ivSkew, ivLevel)
    };
}

/**
 * Calculate IV score (0-100)
 */
function calculateIVScore(ivSkew, ivLevel) {
    let score = 50;

    // Skew impact
    if (ivSkew < -2) score += 15;
    else if (ivSkew > 2) score -= 15;

    // High IV often precedes reversals (contrarian)
    if (ivLevel > 25) score += 5; // Extreme fear may lead to bounce

    return Math.max(0, Math.min(100, score));
}

/**
 * Identify key support/resistance levels from OI
 */
function identifyLevels(chainData) {
    const topStrikes = chainData.topOIStrikes;

    return {
        resistance: topStrikes.callStrikes.map(s => ({
            level: s.strike,
            oi: s.oi,
            oiChange: s.oiChange,
            strength: s.oi > 1000000 ? 'Strong' : s.oi > 500000 ? 'Moderate' : 'Weak'
        })),
        support: topStrikes.putStrikes.map(s => ({
            level: s.strike,
            oi: s.oi,
            oiChange: s.oiChange,
            strength: s.oi > 1000000 ? 'Strong' : s.oi > 500000 ? 'Moderate' : 'Weak'
        }))
    };
}

/**
 * Calculate overall quantitative score
 */
function calculateQuantScore(pcr, maxPain, oi, iv) {
    const pcrScore = pcr.score;
    const maxPainScore = maxPain.score;
    const oiScore = oi.score;
    const ivScore = iv.score;

    // Weighted average (PCR and OI most important)
    const weightedScore = (
        pcrScore * 0.30 +
        maxPainScore * 0.25 +
        oiScore * 0.30 +
        ivScore * 0.15
    );

    const score = Math.round(weightedScore);

    let signal = 'NEUTRAL';
    let confidence = 'Low';

    if (score >= 70) {
        signal = 'BULLISH';
        confidence = score >= 80 ? 'High' : 'Moderate';
    } else if (score >= 55) {
        signal = 'MILDLY_BULLISH';
        confidence = 'Moderate';
    } else if (score <= 30) {
        signal = 'BEARISH';
        confidence = score <= 20 ? 'High' : 'Moderate';
    } else if (score <= 45) {
        signal = 'MILDLY_BEARISH';
        confidence = 'Moderate';
    } else {
        confidence = 'Low';
    }

    // Build reasoning
    const reasoning = [];
    reasoning.push(`PCR: ${pcr.signal} (${pcr.oi.toFixed(2)})`);
    reasoning.push(`Max Pain: ${maxPain.signal} (${maxPain.distancePercent}% from spot)`);
    reasoning.push(`OI Pattern: ${oi.patternInterpretation}`);
    reasoning.push(`IV Skew: ${iv.skew.interpretation}`);

    return { score, signal, confidence, reasoning };
}

/**
 * Get detailed Max Pain analysis with chart data
 */
async function getMaxPainAnalysis(symbol, expiry = null) {
    const chainData = await fetchOptionChain(symbol, expiry);
    if (!chainData) return null;

    const maxPainAnalysis = analyseMaxPain(
        chainData.metrics.maxPain,
        chainData.spotPrice,
        chainData.topOIStrikes
    );

    // Build chart data showing pain at each strike
    const painAtStrikes = chainData.chain.map(strike => {
        let pain = 0;

        chainData.chain.forEach(s => {
            if (s.call && strike.strikePrice > s.strikePrice) {
                pain += (strike.strikePrice - s.strikePrice) * (s.call.oi || 0);
            }
            if (s.put && strike.strikePrice < s.strikePrice) {
                pain += (s.strikePrice - strike.strikePrice) * (s.put.oi || 0);
            }
        });

        return {
            strike: strike.strikePrice,
            pain,
            isMaxPain: strike.strikePrice === chainData.metrics.maxPain
        };
    });

    return {
        ...maxPainAnalysis,
        chartData: painAtStrikes,
        expiry: chainData.selectedExpiry
    };
}

/**
 * Get detailed PCR analysis
 */
async function getPCRAnalysis(symbol, expiry = null) {
    const chainData = await fetchOptionChain(symbol, expiry);
    if (!chainData) return null;

    return analysePCR(chainData.metrics.pcr, chainData.metrics.oiChange);
}

/**
 * Get detailed OI analysis
 */
async function getOIAnalysis(symbol, expiry = null) {
    const chainData = await fetchOptionChain(symbol, expiry);
    if (!chainData) return null;

    const oiAnalysis = analyseOI(chainData);

    // Add strike-by-strike OI data for chart
    const oiByStrike = chainData.chain.map(s => ({
        strike: s.strikePrice,
        callOI: s.call?.oi || 0,
        putOI: s.put?.oi || 0,
        callOIChange: s.call?.oiChange || 0,
        putOIChange: s.put?.oiChange || 0
    }));

    return {
        ...oiAnalysis,
        byStrike: oiByStrike,
        expiry: chainData.selectedExpiry
    };
}

/**
 * Get detailed IV analysis
 */
async function getIVAnalysis(symbol, expiry = null) {
    const chainData = await fetchOptionChain(symbol, expiry);
    if (!chainData) return null;

    const ivAnalysis = analyseIV(chainData);

    // Add IV surface data
    const ivSurface = chainData.chain.map(s => ({
        strike: s.strikePrice,
        callIV: s.call?.iv || 0,
        putIV: s.put?.iv || 0,
        moneyness: ((s.strikePrice / chainData.spotPrice) - 1) * 100
    }));

    return {
        ...ivAnalysis,
        surface: ivSurface,
        spotPrice: chainData.spotPrice,
        expiry: chainData.selectedExpiry
    };
}

module.exports = {
    analyseQuant,
    getMaxPainAnalysis,
    getPCRAnalysis,
    getOIAnalysis,
    getIVAnalysis
};
