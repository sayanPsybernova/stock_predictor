/**
 * Aggressive Scanner Service - Find 10%+ Potential Gainers
 * Scans 200+ Indian stocks to find potential big movers
 *
 * Focus Areas:
 * - Volume Shockers (5x+ average volume)
 * - Breakout from consolidation
 * - RSI extreme reversals
 * - Near circuit filter stocks
 * - Penny stock momentum
 * - News catalyst plays
 */

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Expanded stock universe - 200+ stocks across all segments
const EXPANDED_STOCK_UNIVERSE = {
    // Nifty 50 - Large Cap Blue Chips
    nifty50: [
        'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
        'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'BAJFINANCE.NS', 'KOTAKBANK.NS',
        'LT.NS', 'HCLTECH.NS', 'AXISBANK.NS', 'ASIANPAINT.NS', 'MARUTI.NS',
        'SUNPHARMA.NS', 'TITAN.NS', 'ULTRACEMCO.NS', 'WIPRO.NS', 'NTPC.NS',
        'TATAMOTORS.NS', 'M&M.NS', 'POWERGRID.NS', 'JSWSTEEL.NS', 'TATASTEEL.NS',
        'ADANIENT.NS', 'ADANIPORTS.NS', 'COALINDIA.NS', 'GRASIM.NS', 'BAJAJFINSV.NS',
        'TECHM.NS', 'ONGC.NS', 'NESTLEIND.NS', 'HDFCLIFE.NS', 'DIVISLAB.NS',
        'SBILIFE.NS', 'BRITANNIA.NS', 'HINDALCO.NS', 'BPCL.NS', 'CIPLA.NS',
        'TATACONSUM.NS', 'DRREDDY.NS', 'EICHERMOT.NS', 'APOLLOHOSP.NS', 'INDUSINDBK.NS',
        'HEROMOTOCO.NS', 'SHRIRAMFIN.NS', 'BAJAJ-AUTO.NS', 'LTIM.NS', 'TRENT.NS'
    ],

    // Nifty Next 50
    niftyNext50: [
        'BANKBARODA.NS', 'PNB.NS', 'CANBK.NS', 'UNIONBANK.NS', 'IOB.NS',
        'INDIANB.NS', 'CENTRALBK.NS', 'BANKINDIA.NS', 'UCOBANK.NS', 'PSB.NS',
        'GODREJCP.NS', 'DABUR.NS', 'MARICO.NS', 'COLPAL.NS', 'PIDILITIND.NS',
        'HAVELLS.NS', 'VOLTAS.NS', 'CROMPTON.NS', 'BLUESTARCO.NS', 'WHIRLPOOL.NS',
        'DLF.NS', 'GODREJPROP.NS', 'OBEROIRLTY.NS', 'PRESTIGE.NS', 'BRIGADE.NS',
        'SOBHA.NS', 'SUNTV.NS', 'ZEEL.NS', 'PVR.NS', 'INOXLEISUR.NS'
    ],

    // High Beta / Momentum Stocks
    highBeta: [
        'ADANIENT.NS', 'ADANIGREEN.NS', 'ADANIPOWER.NS', 'ADANITRANS.NS',
        'ZOMATO.NS', 'PAYTM.NS', 'NYKAA.NS', 'POLICYBZR.NS', 'DELHIVERY.NS',
        'IRCTC.NS', 'IRFC.NS', 'RVNL.NS', 'RAILTEL.NS', 'IRCON.NS',
        'COCHINSHIP.NS', 'GRSE.NS', 'BEL.NS', 'HAL.NS', 'BHEL.NS',
        'SAIL.NS', 'NMDC.NS', 'COALINDIA.NS', 'VEDL.NS', 'HINDZINC.NS'
    ],

    // Power & Energy - High Momentum Sector
    power: [
        'TATAPOWER.NS', 'NTPC.NS', 'POWERGRID.NS', 'ADANIGREEN.NS', 'ADANIPOWER.NS',
        'JSW.NS', 'NHPC.NS', 'SJVN.NS', 'TORNTPOWER.NS', 'CESC.NS',
        'PFC.NS', 'RECLTD.NS', 'HUDCO.NS', 'IREDA.NS', 'SUZLON.NS',
        'INOXWIND.NS', 'TATAPOWER.NS', 'JPPOWER.NS', 'RELINFRA.NS', 'RPOWER.NS'
    ],

    // PSU Banks - High Beta
    psuBanks: [
        'SBIN.NS', 'BANKBARODA.NS', 'PNB.NS', 'CANBK.NS', 'UNIONBANK.NS',
        'IOB.NS', 'INDIANB.NS', 'CENTRALBK.NS', 'BANKINDIA.NS', 'UCOBANK.NS',
        'PSB.NS', 'MAHABANK.NS', 'J&KBANK.NS', 'KTKBANK.NS', 'SOUTHBANK.NS'
    ],

    // Small & Micro Caps - Potential Multi-baggers
    smallCaps: [
        'YESBANK.NS', 'IDEA.NS', 'SUZLON.NS', 'RPOWER.NS', 'JPPOWER.NS',
        'GTLINFRA.NS', 'JPASSOCIAT.NS', 'UNITECH.NS', 'RCOM.NS', 'DHFL.NS',
        'IBREALEST.NS', 'GMRINFRA.NS', 'GVK.NS', 'LAXMIMACH.NS', 'HGS.NS'
    ],

    // IT & Tech - High Growth
    tech: [
        'TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS',
        'LTIM.NS', 'MPHASIS.NS', 'COFORGE.NS', 'PERSISTENT.NS', 'LTTS.NS',
        'HAPPSTMNDS.NS', 'ROUTE.NS', 'TATAELXSI.NS', 'KPITTECH.NS', 'CYIENT.NS',
        'ZENSAR.NS', 'BIRLASOFT.NS', 'SONATSOFTW.NS', 'MASTEK.NS', 'NEWGEN.NS'
    ],

    // Pharma - High Beta
    pharma: [
        'SUNPHARMA.NS', 'DRREDDY.NS', 'CIPLA.NS', 'DIVISLAB.NS', 'BIOCON.NS',
        'LUPIN.NS', 'AUROPHARMA.NS', 'ALKEM.NS', 'TORNTPHARM.NS', 'ZYDUSLIFE.NS',
        'GLAND.NS', 'LAURUSLABS.NS', 'GRANULES.NS', 'NATCOPHARM.NS', 'IPCALAB.NS'
    ],

    // Auto & EV - Momentum
    auto: [
        'TATAMOTORS.NS', 'M&M.NS', 'MARUTI.NS', 'BAJAJ-AUTO.NS', 'HEROMOTOCO.NS',
        'EICHERMOT.NS', 'ASHOKLEY.NS', 'TVSMOTOR.NS', 'ESCORTS.NS', 'FORCEMOT.NS',
        'OLECTRA.NS', 'JBMA.NS', 'EXIDEIND.NS', 'AMARARAJA.NS', 'MOTHERSON.NS'
    ],

    // Infrastructure & Capital Goods
    infra: [
        'LT.NS', 'ADANIENT.NS', 'ADANIPORTS.NS', 'GMRINFRA.NS', 'IRB.NS',
        'NBCC.NS', 'NCC.NS', 'KEC.NS', 'KALPATPOWR.NS', 'PNC.NS',
        'HCC.NS', 'JKIL.NS', 'AHLUCONT.NS', 'PRAJIND.NS', 'TRITURBINE.NS'
    ],

    // Metal & Mining - Cyclical High Beta
    metals: [
        'TATASTEEL.NS', 'JSWSTEEL.NS', 'HINDALCO.NS', 'VEDL.NS', 'NMDC.NS',
        'COALINDIA.NS', 'SAIL.NS', 'NATIONALUM.NS', 'HINDZINC.NS', 'MOIL.NS',
        'JINDALSTEL.NS', 'APLAPOLLO.NS', 'RATNAMANI.NS', 'WELCORP.NS', 'JINDALSAW.NS'
    ]
};

// Get all unique stocks from universe
function getAllStocks() {
    const allStocks = new Set();
    Object.values(EXPANDED_STOCK_UNIVERSE).forEach(stocks => {
        stocks.forEach(s => allStocks.add(s));
    });
    return Array.from(allStocks);
}

/**
 * Criteria for 10%+ gainers based on historical analysis
 */
const BIG_GAINER_CRITERIA = {
    // Volume must be exceptional
    volumeShock: {
        minimum: 3,      // 3x average volume
        ideal: 5,        // 5x+ is ideal
        weight: 30
    },

    // RSI reversal from extreme
    rsiReversal: {
        oversoldMax: 35,   // RSI was below 35
        recoveryMin: 5,    // RSI increased by 5+ points
        weight: 20
    },

    // Price near support with bounce
    supportBounce: {
        nearLowPercent: 10,  // Within 10% of 52-week low
        bouncePercent: 2,    // Already bouncing 2%+
        weight: 15
    },

    // Breakout from consolidation
    breakout: {
        consolidationDays: 10,
        breakoutPercent: 3,
        weight: 20
    },

    // Momentum continuation
    momentum: {
        prevDayGain: 3,     // Previous day gained 3%+
        weight: 15
    }
};

/**
 * Fetch quote data for a stock
 */
async function fetchQuote(symbol) {
    try {
        const quote = await yahooFinance.quote(symbol);
        return quote;
    } catch (error) {
        return null;
    }
}

/**
 * Fetch historical data for analysis
 */
async function fetchHistory(symbol, days = 60) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const result = await yahooFinance.chart(symbol, {
            period1: startDate,
            period2: endDate,
            interval: '1d'
        });

        return result?.quotes?.filter(q => q && q.close) || [];
    } catch (error) {
        return [];
    }
}

/**
 * Calculate RSI
 */
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * Analyze stock for 10%+ potential
 */
async function analyzeStock(symbol) {
    try {
        const [quote, history] = await Promise.all([
            fetchQuote(symbol),
            fetchHistory(symbol, 60)
        ]);

        if (!quote || !quote.regularMarketPrice || history.length < 20) {
            return null;
        }

        const currentPrice = quote.regularMarketPrice;
        const volume = quote.regularMarketVolume || 0;
        const avgVolume = quote.averageDailyVolume10Day || quote.averageDailyVolume3Month || volume;
        const dayChange = quote.regularMarketChangePercent || 0;
        const fiftyTwoWeekHigh = quote.fiftyTwoWeekHigh || currentPrice;
        const fiftyTwoWeekLow = quote.fiftyTwoWeekLow || currentPrice;

        // Calculate indicators
        const closePrices = history.map(h => h.close);
        const rsi = calculateRSI(closePrices);
        const prevRsi = calculateRSI(closePrices.slice(0, -1));

        // Volume ratio
        const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

        // Distance from 52-week low (potential for bounce)
        const distanceFromLow = ((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100;
        const distanceFromHigh = ((fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh) * 100;

        // Previous day's change
        const prevDayChange = history.length >= 2
            ? ((history[history.length - 2].close - history[history.length - 3]?.close) / history[history.length - 3]?.close) * 100
            : 0;

        // Calculate 10-day high for breakout detection
        const high10D = Math.max(...history.slice(-10).map(h => h.high || h.close));
        const low10D = Math.min(...history.slice(-10).map(h => h.low || h.close));
        const consolidationRange = ((high10D - low10D) / low10D) * 100;

        // Check if breaking out of consolidation
        const isBreakingOut = currentPrice > high10D * 0.98 && consolidationRange < 15;

        // Calculate big gainer score
        let score = 0;
        const signals = [];
        const triggers = [];

        // 1. Volume Shock (30 points max)
        if (volumeRatio >= 5) {
            score += 30;
            signals.push(`🔥 VOLUME SHOCK: ${volumeRatio.toFixed(1)}x average`);
            triggers.push('Massive Volume');
        } else if (volumeRatio >= 3) {
            score += 20;
            signals.push(`📊 High Volume: ${volumeRatio.toFixed(1)}x average`);
            triggers.push('High Volume');
        } else if (volumeRatio >= 2) {
            score += 10;
            signals.push(`📈 Above Avg Volume: ${volumeRatio.toFixed(1)}x`);
        }

        // 2. RSI Reversal (20 points max)
        if (prevRsi < 35 && rsi > prevRsi + 5) {
            score += 20;
            signals.push(`🔄 RSI REVERSAL: ${prevRsi.toFixed(0)} → ${rsi.toFixed(0)}`);
            triggers.push('RSI Bounce');
        } else if (rsi < 40 && rsi > prevRsi) {
            score += 10;
            signals.push(`📉 Oversold Recovery: RSI ${rsi.toFixed(0)}`);
        }

        // 3. Near 52-Week Low Bounce (15 points max)
        if (distanceFromLow < 15 && dayChange > 2) {
            score += 15;
            signals.push(`💎 BOUNCE FROM LOW: Only ${distanceFromLow.toFixed(0)}% above 52W low`);
            triggers.push('52W Low Bounce');
        } else if (distanceFromLow < 25 && dayChange > 1) {
            score += 8;
            signals.push(`📍 Near 52-Week Low`);
        }

        // 4. Breakout Pattern (20 points max)
        if (isBreakingOut && dayChange > 3) {
            score += 20;
            signals.push(`🚀 BREAKOUT: Breaking ${consolidationRange.toFixed(0)}% consolidation`);
            triggers.push('Breakout');
        } else if (isBreakingOut) {
            score += 10;
            signals.push(`📊 Breaking Resistance`);
        }

        // 5. Momentum Continuation (15 points max)
        if (prevDayChange > 3 && dayChange > 2) {
            score += 15;
            signals.push(`⚡ MOMENTUM: +${prevDayChange.toFixed(1)}% yesterday, +${dayChange.toFixed(1)}% today`);
            triggers.push('Momentum');
        } else if (dayChange > 3) {
            score += 10;
            signals.push(`💹 Today: +${dayChange.toFixed(1)}%`);
        }

        // 6. Near Circuit Filter (Bonus)
        if (dayChange >= 5) {
            score += 15;
            signals.push(`🔒 CIRCUIT ALERT: Already +${dayChange.toFixed(1)}%`);
            triggers.push('Circuit Play');
        }

        // 7. Penny Stock Momentum (Bonus for low-price high-beta)
        if (currentPrice < 50 && volumeRatio > 2 && dayChange > 2) {
            score += 10;
            signals.push(`💰 Penny Stock Momentum`);
        }

        // Base score for any stock with positive momentum
        if (dayChange > 0) {
            score += 5;
        }
        if (rsi > 40 && rsi < 70) {
            score += 5;  // Healthy RSI range
        }

        // Calculate potential gain based on score
        let potentialGain = '1-3%';
        let confidence = 'Low';

        if (score >= 60) {
            potentialGain = '10-20%';
            confidence = 'Very High';
        } else if (score >= 45) {
            potentialGain = '7-12%';
            confidence = 'High';
        } else if (score >= 30) {
            potentialGain = '5-8%';
            confidence = 'Medium';
        } else if (score >= 15) {
            potentialGain = '3-5%';
            confidence = 'Low';
        }

        return {
            symbol,
            name: quote.shortName || quote.longName || symbol.replace('.NS', ''),
            currentPrice: currentPrice.toFixed(2),
            dayChange: dayChange.toFixed(2),
            volume,
            avgVolume,
            volumeRatio: volumeRatio.toFixed(1),
            rsi: rsi.toFixed(1),
            score,
            potentialGain,
            confidence,
            signals,
            triggers,
            distanceFromLow: distanceFromLow.toFixed(1),
            distanceFromHigh: distanceFromHigh.toFixed(1),
            fiftyTwoWeekHigh: fiftyTwoWeekHigh.toFixed(2),
            fiftyTwoWeekLow: fiftyTwoWeekLow.toFixed(2),
            marketCap: quote.marketCap,
            sector: detectSector(symbol)
        };

    } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error.message);
        return null;
    }
}

/**
 * Detect sector from symbol
 */
function detectSector(symbol) {
    const s = symbol.toUpperCase();
    if (EXPANDED_STOCK_UNIVERSE.psuBanks.includes(symbol) || s.includes('BANK')) return 'Banking';
    if (EXPANDED_STOCK_UNIVERSE.tech.includes(symbol)) return 'IT';
    if (EXPANDED_STOCK_UNIVERSE.pharma.includes(symbol)) return 'Pharma';
    if (EXPANDED_STOCK_UNIVERSE.power.includes(symbol)) return 'Power';
    if (EXPANDED_STOCK_UNIVERSE.metals.includes(symbol)) return 'Metals';
    if (EXPANDED_STOCK_UNIVERSE.auto.includes(symbol)) return 'Auto';
    if (EXPANDED_STOCK_UNIVERSE.infra.includes(symbol)) return 'Infra';
    return 'Others';
}

/**
 * Scan all stocks for 10%+ potential gainers
 */
async function scanForBigGainers(progressCallback = null) {
    console.log('🔍 Starting aggressive scan for 10%+ potential gainers...');

    const allStocks = getAllStocks();
    console.log(`📊 Scanning ${allStocks.length} stocks...`);

    const results = [];
    const batchSize = 10;

    for (let i = 0; i < allStocks.length; i += batchSize) {
        const batch = allStocks.slice(i, i + batchSize);

        const batchResults = await Promise.all(
            batch.map(symbol => analyzeStock(symbol))
        );

        batchResults.forEach(result => {
            if (result && result.score >= 25) {  // Only include stocks with score >= 25
                results.push(result);
            }
        });

        if (progressCallback) {
            progressCallback({
                scanned: Math.min(i + batchSize, allStocks.length),
                total: allStocks.length,
                found: results.length
            });
        }

        console.log(`Scanned ${Math.min(i + batchSize, allStocks.length)}/${allStocks.length} - Found ${results.length} candidates`);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    // Categorize results
    const categorized = {
        highConfidence: results.filter(r => r.confidence === 'Very High' || r.confidence === 'High'),
        mediumConfidence: results.filter(r => r.confidence === 'Medium'),
        lowConfidence: results.filter(r => r.confidence === 'Low'),
        all: results
    };

    console.log(`✅ Scan complete! Found ${results.length} potential big gainers`);
    console.log(`   High Confidence (10%+ potential): ${categorized.highConfidence.length}`);
    console.log(`   Medium Confidence (5-8%): ${categorized.mediumConfidence.length}`);

    return {
        timestamp: new Date().toISOString(),
        stocksScanned: allStocks.length,
        candidatesFound: results.length,
        highConfidenceCount: categorized.highConfidence.length,

        // Top 10 picks with highest potential
        topPicks: categorized.highConfidence.slice(0, 10),

        // All candidates by confidence
        byConfidence: {
            veryHigh: results.filter(r => r.confidence === 'Very High').slice(0, 5),
            high: results.filter(r => r.confidence === 'High').slice(0, 10),
            medium: results.filter(r => r.confidence === 'Medium').slice(0, 10),
        },

        // By sector
        bySector: groupBySector(results),

        // Summary statistics
        summary: {
            totalScanned: allStocks.length,
            totalCandidates: results.length,
            avgScore: results.length > 0
                ? (results.reduce((a, b) => a + b.score, 0) / results.length).toFixed(1)
                : 0,
            topScore: results.length > 0 ? results[0].score : 0,
            mostCommonTriggers: getMostCommonTriggers(results)
        },

        methodology: {
            criteria: [
                'Volume Shock: 3-5x+ average volume (30 points)',
                'RSI Reversal: Bounce from oversold (20 points)',
                'Support Bounce: Near 52-week low with momentum (15 points)',
                'Breakout: Breaking consolidation pattern (20 points)',
                'Momentum: Multi-day momentum continuation (15 points)',
                'Circuit Play: Already 5%+ gain today (Bonus 15 points)'
            ],
            minScoreThreshold: 25,
            stocksInUniverse: allStocks.length,
            sectors: Object.keys(EXPANDED_STOCK_UNIVERSE)
        }
    };
}

/**
 * Group results by sector
 */
function groupBySector(results) {
    const sectors = {};
    results.forEach(r => {
        const sector = r.sector || 'Others';
        if (!sectors[sector]) sectors[sector] = [];
        if (sectors[sector].length < 5) {
            sectors[sector].push(r);
        }
    });
    return sectors;
}

/**
 * Get most common triggers
 */
function getMostCommonTriggers(results) {
    const triggerCount = {};
    results.forEach(r => {
        (r.triggers || []).forEach(t => {
            triggerCount[t] = (triggerCount[t] || 0) + 1;
        });
    });

    return Object.entries(triggerCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([trigger, count]) => ({ trigger, count }));
}

/**
 * Quick scan for immediate opportunities
 * Checks only high-beta stocks for speed
 */
async function quickScan() {
    console.log('⚡ Running quick scan for immediate opportunities...');

    const quickList = [
        ...EXPANDED_STOCK_UNIVERSE.highBeta,
        ...EXPANDED_STOCK_UNIVERSE.psuBanks,
        ...EXPANDED_STOCK_UNIVERSE.smallCaps,
        ...EXPANDED_STOCK_UNIVERSE.power,
        ...EXPANDED_STOCK_UNIVERSE.metals
    ];

    const uniqueStocks = [...new Set(quickList)];
    const results = [];

    for (const symbol of uniqueStocks) {
        const result = await analyzeStock(symbol);
        if (result && result.score >= 15) {  // Lower threshold to show more candidates
            results.push(result);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    results.sort((a, b) => b.score - a.score);

    return {
        timestamp: new Date().toISOString(),
        scanType: 'Quick Scan',
        stocksScanned: uniqueStocks.length,
        topPicks: results.slice(0, 15)  // Show top 15
    };
}

module.exports = {
    scanForBigGainers,
    quickScan,
    analyzeStock,
    getAllStocks,
    EXPANDED_STOCK_UNIVERSE,
    BIG_GAINER_CRITERIA
};
