/**
 * Normalizes a value between 0 and 1.
 * @param {number} value - The value to normalize.
 * @param {number} min - The minimum of the range.
 * @param {number} max - The maximum of the range.
 * @param {boolean} lowerIsBetter - If true, a lower value gets a higher score.
 * @returns {number} The normalized score (0-1).
 */
function normalize(value, min, max, lowerIsBetter = false) {
    if (value === null || value === undefined) return 0;
    if (max - min === 0) return 0.5; // Avoid division by zero
    
    const clampedValue = Math.max(min, Math.min(value, max));
    const normalized = (clampedValue - min) / (max - min);

    return lowerIsBetter ? 1 - normalized : normalized;
}

/**
 * Calculates a fundamental score based on various metrics.
 * @param {object} fundamentalData - The fundamental data object from yahooFinance service.
 * @returns {object} An object containing the scores and final fundamental score.
 */
function calculateFundamentalScore(fundamentalData) {
    const {
        peRatio,
        pbRatio,
        debtToEquity,
        roe,
        revenueGrowth,
    } = fundamentalData;

    const scores = {
        peScore: normalize(peRatio, 5, 40, true), // Lower P/E is generally better, capped at 40
        pbScore: normalize(pbRatio, 0.5, 5, true), // Lower P/B is generally better, capped at 5
        deScore: normalize(debtToEquity, 0.1, 2, true), // Lower D/E is better, capped at 2
        roeScore: normalize(roe, 0.05, 0.25, false), // Higher ROE is better, 5%-25% range
        growthScore: normalize(revenueGrowth, 0, 0.2, false), // Higher growth is better, 0-20% range
    };

    const weights = {
        peScore: 0.25,
        pbScore: 0.2,
        deScore: 0.2,
        roeScore: 0.25,
        growthScore: 0.1,
    };

    const totalScore = Object.keys(scores).reduce((acc, key) => {
        return acc + (scores[key] * weights[key]);
    }, 0);
    
    let rating = 'Neutral';
    if(totalScore > 0.65) rating = 'Strong';
    else if (totalScore > 0.4) rating = 'Moderate';
    else if (totalScore < 0.25) rating = 'Weak';

    return {
        fundamentalScore: parseFloat(totalScore.toFixed(3)),
        rating: rating,
        metrics: {
            peRatio: peRatio ? parseFloat(peRatio.toFixed(2)) : 'N/A',
            pbRatio: pbRatio ? parseFloat(pbRatio.toFixed(2)) : 'N/A',
            debtToEquity: debtToEquity ? parseFloat(debtToEquity.toFixed(2)) : 'N/A',
            roe: roe ? `${(roe * 100).toFixed(2)}%` : 'N/A',
            revenueGrowth: revenueGrowth ? `${(revenueGrowth * 100).toFixed(2)}%` : 'N/A',
        },
        scores,
    };
}

/**
 * Main function to perform all fundamental analysis.
 * @param {object} fundamentalData - The fundamental data object from yahooFinance service.
 * @returns {object} An object containing all fundamental analysis results.
 */
function performFundamentalAnalysis(fundamentalData) {
    const scoreResult = calculateFundamentalScore(fundamentalData);

    return {
        ...scoreResult,
        summary: {
            rating: scoreResult.rating,
            score: scoreResult.fundamentalScore,
            peRatio: scoreResult.metrics.peRatio,
            roe: scoreResult.metrics.roe
        }
    };
}

module.exports = {
    performFundamentalAnalysis,
};
