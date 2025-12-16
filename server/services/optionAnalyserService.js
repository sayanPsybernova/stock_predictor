/**
 * Option Analyser Service - Main Orchestrator
 * Combines Quantitative, Technical, ML, and News analysis
 * to provide comprehensive option trading recommendations
 *
 * Analysis Weights:
 * - Quantitative: 40% (OI, PCR, Max Pain, IV)
 * - Technical: 30% (Trend, Momentum, Support/Resistance)
 * - ML Prediction: 20% (XGBoost model probability)
 * - News Sentiment: 10% (Gemini AI analysis)
 */

const optionQuantService = require('./optionQuantService');
const optionTechnicalService = require('./optionTechnicalService');
const mlService = require('./mlIntegrationService');
const { generateMarketSentiment } = require('./geminiService');
const { fetchOptionChain } = require('./optionDataService');

// Analysis weights
const WEIGHTS = {
    QUANT: 0.40,
    TECHNICAL: 0.30,
    ML: 0.20,
    NEWS: 0.10
};

/**
 * Complete analysis for a symbol
 * @param {string} symbol - Stock/Index symbol
 * @param {string} expiry - Optional expiry date
 * @returns {Promise<Object>} Complete analysis with recommendation
 */
async function analyseSymbol(symbol, expiry = null) {
    try {
        console.log(`🔍 Starting comprehensive analysis for ${symbol}...`);

        // Fetch option chain first for basic data
        const chainData = await fetchOptionChain(symbol, expiry);
        if (!chainData) {
            console.error(`Could not fetch option chain for ${symbol}`);
            return null;
        }

        // Run all analyses in parallel
        const [quantAnalysis, technicalAnalysis, mlPrediction, newsAnalysis] = await Promise.all([
            optionQuantService.analyseQuant(symbol, expiry),
            optionTechnicalService.analyseTechnical(symbol),
            getMLPrediction(symbol),
            getNewsAnalysis(symbol, chainData.spotPrice)
        ]);

        // Calculate individual scores (normalized 0-100)
        const scores = {
            quant: quantAnalysis?.score || 50,
            technical: technicalAnalysis?.score || 50,
            ml: mlPrediction?.score || 50,
            news: newsAnalysis?.score || 50
        };

        // Calculate weighted final score
        const finalScore = Math.round(
            scores.quant * WEIGHTS.QUANT +
            scores.technical * WEIGHTS.TECHNICAL +
            scores.ml * WEIGHTS.ML +
            scores.news * WEIGHTS.NEWS
        );

        // Determine direction and confidence
        const decision = generateDecision(finalScore, scores, quantAnalysis, technicalAnalysis);

        // Generate recommendation
        const recommendation = generateRecommendation(
            decision,
            chainData,
            quantAnalysis,
            technicalAnalysis
        );

        // Compile all reasoning
        const reasoning = compileReasoning(
            quantAnalysis,
            technicalAnalysis,
            mlPrediction,
            newsAnalysis
        );

        return {
            symbol: chainData.symbol,
            spotPrice: chainData.spotPrice,
            expiry: chainData.selectedExpiry,
            daysToExpiry: chainData.metrics.daysToExpiry,

            // Decision
            decision: {
                direction: decision.direction,
                confidence: decision.confidence,
                confidencePercent: decision.confidencePercent,
                score: finalScore
            },

            // Recommendation
            recommendation,

            // Individual analysis scores
            scores: {
                final: finalScore,
                breakdown: {
                    quantitative: {
                        score: scores.quant,
                        weight: `${WEIGHTS.QUANT * 100}%`,
                        contribution: Math.round(scores.quant * WEIGHTS.QUANT)
                    },
                    technical: {
                        score: scores.technical,
                        weight: `${WEIGHTS.TECHNICAL * 100}%`,
                        contribution: Math.round(scores.technical * WEIGHTS.TECHNICAL)
                    },
                    ml: {
                        score: scores.ml,
                        weight: `${WEIGHTS.ML * 100}%`,
                        contribution: Math.round(scores.ml * WEIGHTS.ML)
                    },
                    news: {
                        score: scores.news,
                        weight: `${WEIGHTS.NEWS * 100}%`,
                        contribution: Math.round(scores.news * WEIGHTS.NEWS)
                    }
                }
            },

            // Detailed analysis
            analysis: {
                quantitative: quantAnalysis,
                technical: technicalAnalysis,
                ml: mlPrediction,
                news: newsAnalysis
            },

            // Combined reasoning
            reasoning,

            // Key levels
            keyLevels: {
                spotPrice: chainData.spotPrice,
                maxPain: chainData.metrics.maxPain,
                atmStrike: chainData.atmStrike,
                resistance: quantAnalysis?.levels?.resistance?.slice(0, 3) || [],
                support: quantAnalysis?.levels?.support?.slice(0, 3) || []
            },

            // Option chain summary
            chainSummary: {
                pcr: chainData.metrics.pcr,
                totalOI: chainData.metrics.totalOI,
                sentiment: chainData.metrics.sentiment
            },

            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error(`Analysis error for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get ML prediction for symbol
 */
async function getMLPrediction(symbol) {
    try {
        // Check if ML service is available
        if (!mlService.isAvailable) {
            return {
                available: false,
                score: 50,
                signal: 'NEUTRAL',
                reasoning: ['ML service unavailable - using neutral score']
            };
        }

        // Get ML prediction
        const yahooSymbol = symbol.endsWith('.NS') ? symbol : `${symbol}.NS`;
        const prediction = await mlService.getStockPrediction(yahooSymbol, true);

        if (!prediction) {
            return {
                available: false,
                score: 50,
                signal: 'NEUTRAL',
                reasoning: ['ML prediction unavailable']
            };
        }

        // Convert probability to score (0-100)
        const score = Math.round(prediction.probability * 100);

        let signal = 'NEUTRAL';
        if (score >= 65) signal = 'BULLISH';
        else if (score >= 55) signal = 'MILDLY_BULLISH';
        else if (score <= 35) signal = 'BEARISH';
        else if (score <= 45) signal = 'MILDLY_BEARISH';

        return {
            available: true,
            score,
            probability: prediction.probability,
            confidence: prediction.confidence,
            signal,
            reasoning: prediction.reasoning || [`ML probability: ${(prediction.probability * 100).toFixed(1)}%`]
        };

    } catch (error) {
        console.error('ML prediction error:', error);
        return {
            available: false,
            score: 50,
            signal: 'NEUTRAL',
            reasoning: ['ML prediction error']
        };
    }
}

/**
 * Get news sentiment analysis
 */
async function getNewsAnalysis(symbol, spotPrice) {
    try {
        // Create a mock response object for sentiment analysis
        const mockResponse = {
            symbol,
            marketPrice: spotPrice,
            technicalAnalysis: {
                summary: { trend: 'Unknown' }
            }
        };

        const sentiment = await generateMarketSentiment(mockResponse);

        if (!sentiment) {
            return {
                available: false,
                score: 50,
                signal: 'NEUTRAL',
                reasoning: ['News sentiment unavailable']
            };
        }

        // Convert sentiment to score
        let score = 50;
        let signal = 'NEUTRAL';

        if (sentiment.sentiment === 'Bullish') {
            score = 50 + (sentiment.strength * 50);
            signal = sentiment.strength > 0.5 ? 'BULLISH' : 'MILDLY_BULLISH';
        } else if (sentiment.sentiment === 'Bearish') {
            score = 50 - (sentiment.strength * 50);
            signal = sentiment.strength > 0.5 ? 'BEARISH' : 'MILDLY_BEARISH';
        }

        return {
            available: true,
            score: Math.round(score),
            sentiment: sentiment.sentiment,
            strength: sentiment.strength,
            signal,
            signals: sentiment.signals,
            reasoning: [`News sentiment: ${sentiment.sentiment} (${(sentiment.strength * 100).toFixed(0)}% strength)`]
        };

    } catch (error) {
        console.error('News analysis error:', error);
        return {
            available: false,
            score: 50,
            signal: 'NEUTRAL',
            reasoning: ['News analysis error']
        };
    }
}

/**
 * Generate decision based on scores
 */
function generateDecision(finalScore, scores, quantAnalysis, technicalAnalysis) {
    let direction = 'NEUTRAL';
    let confidence = 'Low';
    let confidencePercent = Math.abs(finalScore - 50) * 2;

    // Determine direction
    if (finalScore >= 65) {
        direction = 'BULLISH';
        confidence = finalScore >= 75 ? 'High' : 'Moderate';
    } else if (finalScore >= 55) {
        direction = 'MILDLY_BULLISH';
        confidence = 'Moderate';
    } else if (finalScore <= 35) {
        direction = 'BEARISH';
        confidence = finalScore <= 25 ? 'High' : 'Moderate';
    } else if (finalScore <= 45) {
        direction = 'MILDLY_BEARISH';
        confidence = 'Moderate';
    }

    // Check for conflicting signals (reduces confidence)
    const signalsAligned = checkSignalAlignment(scores, quantAnalysis, technicalAnalysis);
    if (!signalsAligned && confidence === 'High') {
        confidence = 'Moderate';
        confidencePercent = Math.max(confidencePercent - 15, 40);
    }

    return {
        direction,
        confidence,
        confidencePercent: Math.min(100, Math.max(0, confidencePercent))
    };
}

/**
 * Check if major signals are aligned
 */
function checkSignalAlignment(scores, quantAnalysis, technicalAnalysis) {
    const quantBullish = scores.quant > 55;
    const techBullish = scores.technical > 55;
    const quantBearish = scores.quant < 45;
    const techBearish = scores.technical < 45;

    // Aligned if both bullish or both bearish
    if ((quantBullish && techBullish) || (quantBearish && techBearish)) {
        return true;
    }

    // Not aligned if one bullish and other bearish
    if ((quantBullish && techBearish) || (quantBearish && techBullish)) {
        return false;
    }

    // Neutral range - considered aligned
    return true;
}

/**
 * Generate trading recommendation
 */
function generateRecommendation(decision, chainData, quantAnalysis, technicalAnalysis) {
    const spotPrice = chainData.spotPrice;
    const maxPain = chainData.metrics.maxPain;
    const atmStrike = chainData.atmStrike;
    const daysToExpiry = chainData.metrics.daysToExpiry;

    let action = 'WAIT';
    let optionType = null;
    let strike = null;
    let target = null;
    let stopLoss = null;
    let rationale = '';

    // Get support/resistance levels
    const resistance = quantAnalysis?.levels?.resistance?.[0]?.level || spotPrice * 1.02;
    const support = quantAnalysis?.levels?.support?.[0]?.level || spotPrice * 0.98;

    if (decision.direction === 'BULLISH' && decision.confidence !== 'Low') {
        action = 'BUY';
        optionType = 'CE';

        // Choose strike based on confidence
        if (decision.confidence === 'High') {
            strike = atmStrike; // ATM for higher delta
        } else {
            strike = findNearestStrike(chainData.chain, spotPrice * 1.01); // Slight OTM
        }

        target = Math.min(resistance, maxPain > spotPrice ? maxPain : spotPrice * 1.03);
        stopLoss = Math.max(support, spotPrice * 0.98);
        rationale = 'Bullish signals from multiple indicators suggest upside potential.';

    } else if (decision.direction === 'BEARISH' && decision.confidence !== 'Low') {
        action = 'BUY';
        optionType = 'PE';

        if (decision.confidence === 'High') {
            strike = atmStrike;
        } else {
            strike = findNearestStrike(chainData.chain, spotPrice * 0.99);
        }

        target = Math.max(support, maxPain < spotPrice ? maxPain : spotPrice * 0.97);
        stopLoss = Math.min(resistance, spotPrice * 1.02);
        rationale = 'Bearish signals indicate downside risk. Consider protective puts.';

    } else if (decision.direction.includes('MILDLY')) {
        action = 'WAIT_FOR_CONFIRMATION';
        rationale = 'Mixed signals. Wait for clearer directional confirmation before taking position.';

    } else {
        action = 'NO_TRADE';
        rationale = 'No clear directional bias. Consider range-bound strategies like Iron Condor.';
    }

    // Adjust for days to expiry
    let expiryNote = '';
    if (daysToExpiry <= 2) {
        expiryNote = 'Very short expiry - high theta decay risk. Consider next week expiry.';
    } else if (daysToExpiry <= 5) {
        expiryNote = 'Short expiry - be mindful of time decay.';
    }

    return {
        action,
        optionType,
        strike,
        target: target ? parseFloat(target.toFixed(2)) : null,
        stopLoss: stopLoss ? parseFloat(stopLoss.toFixed(2)) : null,
        rationale,
        expiryNote,
        riskReward: target && stopLoss ? calculateRiskReward(spotPrice, target, stopLoss) : null
    };
}

/**
 * Find nearest strike price
 */
function findNearestStrike(chain, targetPrice) {
    let nearestStrike = chain[0]?.strikePrice || targetPrice;
    let minDiff = Infinity;

    chain.forEach(s => {
        const diff = Math.abs(s.strikePrice - targetPrice);
        if (diff < minDiff) {
            minDiff = diff;
            nearestStrike = s.strikePrice;
        }
    });

    return nearestStrike;
}

/**
 * Calculate risk-reward ratio
 */
function calculateRiskReward(entry, target, stopLoss) {
    const reward = Math.abs(target - entry);
    const risk = Math.abs(entry - stopLoss);

    if (risk === 0) return null;

    return {
        ratio: parseFloat((reward / risk).toFixed(2)),
        reward: parseFloat(reward.toFixed(2)),
        risk: parseFloat(risk.toFixed(2))
    };
}

/**
 * Compile all reasoning into unified list
 */
function compileReasoning(quantAnalysis, technicalAnalysis, mlPrediction, newsAnalysis) {
    const reasoning = [];

    // Quantitative reasoning
    if (quantAnalysis?.reasoning) {
        reasoning.push({
            source: 'Quantitative (40%)',
            points: quantAnalysis.reasoning
        });
    }

    // Technical reasoning
    if (technicalAnalysis?.reasoning) {
        reasoning.push({
            source: 'Technical (30%)',
            points: technicalAnalysis.reasoning
        });
    }

    // ML reasoning
    if (mlPrediction?.reasoning) {
        reasoning.push({
            source: 'ML Model (20%)',
            points: mlPrediction.reasoning
        });
    }

    // News reasoning
    if (newsAnalysis?.reasoning) {
        reasoning.push({
            source: 'News Sentiment (10%)',
            points: newsAnalysis.reasoning
        });
    }

    return reasoning;
}

module.exports = {
    analyseSymbol,
    WEIGHTS
};
