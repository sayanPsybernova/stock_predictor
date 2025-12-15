/**
 * Global Indices Service - US & Asian Market Data
 * Fetches global market data for gap prediction
 *
 * Key Markets:
 * - US: Dow Jones, S&P 500, NASDAQ, VIX
 * - Asia: SGX Nifty, Nikkei 225, Hang Seng, Shanghai
 * - Europe: FTSE 100, DAX
 * - Commodities: Gold, Crude Oil
 */

const axios = require('axios');

// Use Yahoo Finance for global indices
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Global indices symbols
const GLOBAL_INDICES = {
    us: {
        'DJI': { name: 'Dow Jones', symbol: '^DJI', weight: 0.3 },
        'SPX': { name: 'S&P 500', symbol: '^GSPC', weight: 0.3 },
        'IXIC': { name: 'NASDAQ', symbol: '^IXIC', weight: 0.25 },
        'VIX': { name: 'VIX (Fear Index)', symbol: '^VIX', weight: 0.15 }
    },
    asia: {
        'N225': { name: 'Nikkei 225', symbol: '^N225', weight: 0.35 },
        'HSI': { name: 'Hang Seng', symbol: '^HSI', weight: 0.35 },
        'SSEC': { name: 'Shanghai Composite', symbol: '000001.SS', weight: 0.15 },
        'STI': { name: 'Straits Times', symbol: '^STI', weight: 0.15 }
    },
    europe: {
        'FTSE': { name: 'FTSE 100', symbol: '^FTSE', weight: 0.5 },
        'GDAXI': { name: 'DAX', symbol: '^GDAXI', weight: 0.5 }
    },
    commodities: {
        'GC': { name: 'Gold', symbol: 'GC=F', weight: 0.5 },
        'CL': { name: 'Crude Oil', symbol: 'CL=F', weight: 0.5 }
    },
    sgxNifty: {
        'SGXNIFTY': { name: 'SGX Nifty', symbol: 'SGX_NIFTY', weight: 1.0 }
    }
};

/**
 * Fetch data for a single index
 */
async function fetchIndexData(symbol, name) {
    try {
        const quote = await yahooFinance.quote(symbol);

        if (!quote) return null;

        return {
            name,
            symbol,
            price: quote.regularMarketPrice,
            change: quote.regularMarketChange,
            changePercent: quote.regularMarketChangePercent,
            previousClose: quote.regularMarketPreviousClose,
            open: quote.regularMarketOpen,
            high: quote.regularMarketDayHigh,
            low: quote.regularMarketDayLow,
            status: quote.regularMarketChangePercent > 0 ? 'Bullish' :
                    quote.regularMarketChangePercent < 0 ? 'Bearish' : 'Flat',
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error(`Error fetching ${name}:`, error.message);
        return null;
    }
}

/**
 * Fetch all US market indices
 */
async function fetchUSMarkets() {
    console.log('Fetching US market data...');

    const results = {};
    let weightedChange = 0;
    let totalWeight = 0;

    for (const [key, index] of Object.entries(GLOBAL_INDICES.us)) {
        const data = await fetchIndexData(index.symbol, index.name);
        if (data) {
            results[key] = data;

            // Skip VIX for weighted average (inverse relationship)
            if (key !== 'VIX') {
                weightedChange += data.changePercent * index.weight;
                totalWeight += index.weight;
            }
        }
    }

    // VIX interpretation (fear gauge)
    if (results.VIX) {
        const vix = results.VIX.price;
        results.VIX.interpretation = vix < 15 ? 'Low Fear (Complacent)' :
                                      vix < 20 ? 'Normal' :
                                      vix < 25 ? 'Elevated Fear' :
                                      vix < 30 ? 'High Fear' : 'Extreme Fear';

        // High VIX is bearish for stocks
        if (vix > 25) {
            weightedChange -= 0.5;
        }
    }

    const avgChange = totalWeight > 0 ? weightedChange / totalWeight : 0;

    return {
        indices: results,
        avgChange: avgChange.toFixed(2),
        sentiment: avgChange > 0.5 ? 'Bullish' :
                   avgChange > 0 ? 'Mildly Bullish' :
                   avgChange < -0.5 ? 'Bearish' :
                   avgChange < 0 ? 'Mildly Bearish' : 'Neutral',
        gapPrediction: predictGap(avgChange),
        timestamp: new Date().toISOString()
    };
}

/**
 * Fetch all Asian market indices
 */
async function fetchAsianMarkets() {
    console.log('Fetching Asian market data...');

    const results = {};
    let weightedChange = 0;
    let totalWeight = 0;

    for (const [key, index] of Object.entries(GLOBAL_INDICES.asia)) {
        const data = await fetchIndexData(index.symbol, index.name);
        if (data) {
            results[key] = data;
            weightedChange += data.changePercent * index.weight;
            totalWeight += index.weight;
        }
    }

    const avgChange = totalWeight > 0 ? weightedChange / totalWeight : 0;

    return {
        indices: results,
        avgChange: avgChange.toFixed(2),
        sentiment: avgChange > 0.5 ? 'Bullish' :
                   avgChange > 0 ? 'Mildly Bullish' :
                   avgChange < -0.5 ? 'Bearish' :
                   avgChange < 0 ? 'Mildly Bearish' : 'Neutral',
        timestamp: new Date().toISOString()
    };
}

/**
 * Fetch European market indices
 */
async function fetchEuropeanMarkets() {
    console.log('Fetching European market data...');

    const results = {};
    let weightedChange = 0;
    let totalWeight = 0;

    for (const [key, index] of Object.entries(GLOBAL_INDICES.europe)) {
        const data = await fetchIndexData(index.symbol, index.name);
        if (data) {
            results[key] = data;
            weightedChange += data.changePercent * index.weight;
            totalWeight += index.weight;
        }
    }

    const avgChange = totalWeight > 0 ? weightedChange / totalWeight : 0;

    return {
        indices: results,
        avgChange: avgChange.toFixed(2),
        sentiment: avgChange > 0.5 ? 'Bullish' :
                   avgChange > 0 ? 'Mildly Bullish' :
                   avgChange < -0.5 ? 'Bearish' :
                   avgChange < 0 ? 'Mildly Bearish' : 'Neutral',
        timestamp: new Date().toISOString()
    };
}

/**
 * Fetch commodity prices
 */
async function fetchCommodities() {
    console.log('Fetching commodity data...');

    const results = {};

    for (const [key, commodity] of Object.entries(GLOBAL_INDICES.commodities)) {
        const data = await fetchIndexData(commodity.symbol, commodity.name);
        if (data) {
            results[key] = data;
        }
    }

    // Gold interpretation
    if (results.GC) {
        const goldChange = results.GC.changePercent;
        results.GC.interpretation = goldChange > 1 ? 'Risk-Off (Safety Buying)' :
                                     goldChange < -1 ? 'Risk-On' : 'Neutral';
    }

    // Crude interpretation
    if (results.CL) {
        const crudeChange = results.CL.changePercent;
        results.CL.interpretation = crudeChange > 2 ? 'Energy Bullish' :
                                     crudeChange < -2 ? 'Energy Bearish' : 'Stable';
    }

    return {
        commodities: results,
        timestamp: new Date().toISOString()
    };
}

/**
 * Fetch SGX Nifty (Gift Nifty) - Pre-market indicator
 * Note: SGX Nifty is now traded as Gift Nifty
 */
async function fetchSGXNifty() {
    try {
        console.log('Fetching SGX Nifty / Gift Nifty...');

        // Gift Nifty symbol on Yahoo Finance
        const symbols = ['NIFTY_F.NS', '^NSEI'];

        for (const symbol of symbols) {
            try {
                const quote = await yahooFinance.quote(symbol);
                if (quote && quote.regularMarketPrice) {
                    return {
                        name: 'Gift Nifty / SGX Nifty',
                        symbol,
                        price: quote.regularMarketPrice,
                        change: quote.regularMarketChange,
                        changePercent: quote.regularMarketChangePercent,
                        previousClose: quote.regularMarketPreviousClose,
                        gapIndication: quote.regularMarketChangePercent > 0.3 ? 'Gap Up Expected' :
                                       quote.regularMarketChangePercent < -0.3 ? 'Gap Down Expected' :
                                       'Flat Opening Expected',
                        timestamp: new Date().toISOString()
                    };
                }
            } catch (e) {
                continue;
            }
        }

        return null;
    } catch (error) {
        console.error('Error fetching SGX Nifty:', error.message);
        return null;
    }
}

/**
 * Predict Indian market gap based on global cues
 */
function predictGap(globalChange) {
    if (globalChange > 1) return { direction: 'Gap Up', magnitude: 'Strong', expected: '+0.5% to +1%' };
    if (globalChange > 0.5) return { direction: 'Gap Up', magnitude: 'Moderate', expected: '+0.2% to +0.5%' };
    if (globalChange > 0) return { direction: 'Flat/Mild Gap Up', magnitude: 'Weak', expected: '0% to +0.2%' };
    if (globalChange < -1) return { direction: 'Gap Down', magnitude: 'Strong', expected: '-0.5% to -1%' };
    if (globalChange < -0.5) return { direction: 'Gap Down', magnitude: 'Moderate', expected: '-0.2% to -0.5%' };
    if (globalChange < 0) return { direction: 'Flat/Mild Gap Down', magnitude: 'Weak', expected: '0% to -0.2%' };
    return { direction: 'Flat', magnitude: 'None', expected: '±0.1%' };
}

/**
 * Get comprehensive global market summary
 */
async function getGlobalMarketSummary() {
    console.log('Fetching global market summary...');

    const [usData, asiaData, europeData, commodityData, sgxData] = await Promise.all([
        fetchUSMarkets(),
        fetchAsianMarkets(),
        fetchEuropeanMarkets(),
        fetchCommodities(),
        fetchSGXNifty()
    ]);

    // Calculate overall global sentiment
    const sentimentScores = {
        'Bullish': 2,
        'Mildly Bullish': 1,
        'Neutral': 0,
        'Mildly Bearish': -1,
        'Bearish': -2
    };

    let totalScore = 0;
    let count = 0;

    [usData, asiaData, europeData].forEach(data => {
        if (data && data.sentiment) {
            totalScore += sentimentScores[data.sentiment] || 0;
            count++;
        }
    });

    const avgScore = count > 0 ? totalScore / count : 0;
    const overallSentiment = avgScore > 1 ? 'Strong Bullish' :
                             avgScore > 0.3 ? 'Bullish' :
                             avgScore > -0.3 ? 'Neutral' :
                             avgScore > -1 ? 'Bearish' : 'Strong Bearish';

    // Global cues impact on Indian market
    let indianMarketImpact = 'Neutral';
    let impactScore = 0;

    // US market has highest weightage for Indian market
    if (usData) {
        impactScore += parseFloat(usData.avgChange) * 0.5;
    }
    // Asian markets
    if (asiaData) {
        impactScore += parseFloat(asiaData.avgChange) * 0.3;
    }
    // Europe
    if (europeData) {
        impactScore += parseFloat(europeData.avgChange) * 0.2;
    }

    if (impactScore > 0.5) indianMarketImpact = 'Positive';
    else if (impactScore < -0.5) indianMarketImpact = 'Negative';

    return {
        us: usData,
        asia: asiaData,
        europe: europeData,
        commodities: commodityData,
        sgxNifty: sgxData,
        overallSentiment,
        indianMarketImpact,
        impactScore: impactScore.toFixed(2),
        gapPrediction: predictGap(impactScore),
        timestamp: new Date().toISOString(),
        summary: generateGlobalSummary(usData, asiaData, europeData, commodityData)
    };
}

/**
 * Generate human-readable global market summary
 */
function generateGlobalSummary(us, asia, europe, commodities) {
    const lines = [];

    if (us) {
        lines.push(`US Markets: ${us.sentiment} (Avg: ${us.avgChange}%)`);
        if (us.indices.VIX) {
            lines.push(`VIX: ${us.indices.VIX.price?.toFixed(2)} - ${us.indices.VIX.interpretation}`);
        }
    }

    if (asia) {
        lines.push(`Asian Markets: ${asia.sentiment} (Avg: ${asia.avgChange}%)`);
    }

    if (europe) {
        lines.push(`European Markets: ${europe.sentiment} (Avg: ${europe.avgChange}%)`);
    }

    if (commodities && commodities.commodities) {
        const gold = commodities.commodities.GC;
        const crude = commodities.commodities.CL;
        if (gold) lines.push(`Gold: ${gold.changePercent?.toFixed(2)}% - ${gold.interpretation}`);
        if (crude) lines.push(`Crude: ${crude.changePercent?.toFixed(2)}% - ${crude.interpretation}`);
    }

    return lines.join(' | ');
}

/**
 * Get global cues score for top gainer prediction
 */
function getGlobalCuesScore(globalData) {
    if (!globalData) return { score: 0, signals: [] };

    let score = 0;
    const signals = [];

    // US market impact (highest weight)
    if (globalData.us) {
        const usChange = parseFloat(globalData.us.avgChange);
        if (usChange > 1) {
            score += 20;
            signals.push('Strong US Rally');
        } else if (usChange > 0) {
            score += 10;
            signals.push('US Markets Positive');
        } else if (usChange < -1) {
            score -= 20;
            signals.push('US Markets Weak');
        }
    }

    // Asian market impact
    if (globalData.asia) {
        const asiaChange = parseFloat(globalData.asia.avgChange);
        if (asiaChange > 0.5) {
            score += 10;
            signals.push('Asian Markets Up');
        } else if (asiaChange < -0.5) {
            score -= 10;
            signals.push('Asian Markets Down');
        }
    }

    // SGX Nifty gap indication
    if (globalData.sgxNifty) {
        if (globalData.sgxNifty.changePercent > 0.5) {
            score += 15;
            signals.push('Gap Up Expected');
        } else if (globalData.sgxNifty.changePercent < -0.5) {
            score -= 15;
            signals.push('Gap Down Expected');
        }
    }

    // VIX impact
    if (globalData.us?.indices?.VIX) {
        const vix = globalData.us.indices.VIX.price;
        if (vix > 25) {
            score -= 10;
            signals.push('High VIX (Fear)');
        } else if (vix < 15) {
            score += 5;
            signals.push('Low VIX (Calm)');
        }
    }

    return {
        score: Math.min(40, Math.max(-40, score)),
        signals,
        sentiment: globalData.overallSentiment
    };
}

module.exports = {
    fetchUSMarkets,
    fetchAsianMarkets,
    fetchEuropeanMarkets,
    fetchCommodities,
    fetchSGXNifty,
    getGlobalMarketSummary,
    getGlobalCuesScore,
    GLOBAL_INDICES
};
