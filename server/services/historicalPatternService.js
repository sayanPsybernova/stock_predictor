/**
 * Historical Pattern Discovery Service
 * Analyzes 3 years of daily top gainers to discover real patterns
 *
 * Methodology:
 * 1. Fetch 3 years of historical data for all stocks
 * 2. For each trading day, identify top 5 gainers (by % change)
 * 3. For each top gainer, record indicators from DAY BEFORE
 * 4. Aggregate to find common patterns
 */

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Stock universe for pattern discovery
const STOCK_UNIVERSE = {
    largeCap: [
        'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
        'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'KOTAKBANK.NS', 'ITC.NS',
        'AXISBANK.NS', 'LT.NS', 'BAJFINANCE.NS', 'ASIANPAINT.NS', 'MARUTI.NS'
    ],
    midCap: [
        'PIDILITIND.NS', 'HAVELLS.NS', 'GODREJCP.NS', 'DABUR.NS', 'INDIGO.NS',
        'BANKBARODA.NS', 'PNB.NS', 'IDFCFIRSTB.NS', 'FEDERALBNK.NS', 'TATAPOWER.NS',
        'VOLTAS.NS', 'CROMPTON.NS', 'JUBLFOOD.NS', 'MUTHOOTFIN.NS', 'LICHSGFIN.NS'
    ],
    smallCap: [
        'IRFC.NS', 'ZOMATO.NS', 'PAYTM.NS', 'NYKAA.NS', 'POLICYBZR.NS',
        'DELHIVERY.NS', 'CAMS.NS', 'CDSL.NS', 'ROUTE.NS', 'HAPPSTMNDS.NS',
        'KPITTECH.NS', 'PERSISTENT.NS', 'COFORGE.NS', 'LTTS.NS', 'TATAELXSI.NS'
    ]
};

// Pattern buckets for analysis
const PATTERN_BUCKETS = {
    rsi: {
        oversold: { min: 0, max: 30 },
        lowMid: { min: 30, max: 50 },
        highMid: { min: 50, max: 70 },
        overbought: { min: 70, max: 100 }
    },
    volumeRatio: {
        veryLow: { min: 0, max: 0.5 },
        low: { min: 0.5, max: 1 },
        moderate: { min: 1, max: 2 },
        high: { min: 2, max: 5 },
        veryHigh: { min: 5, max: Infinity }
    },
    priceVs20DayHigh: {
        atHigh: { min: 0, max: 2 },
        nearHigh: { min: 2, max: 5 },
        moderate: { min: 5, max: 15 },
        far: { min: 15, max: Infinity }
    },
    previousDayChange: {
        strongDown: { min: -Infinity, max: -2 },
        down: { min: -2, max: 0 },
        flat: { min: 0, max: 0.5 },
        up: { min: 0.5, max: 2 },
        strongUp: { min: 2, max: Infinity }
    }
};

// Cache for discovered patterns
let discoveredPatterns = null;
let lastPatternUpdate = null;

/**
 * Calculate RSI from price data
 */
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

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
 * Calculate SMA
 */
function calculateSMA(prices, period) {
    if (prices.length < period) return null;
    const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
    return sum / period;
}

/**
 * Fetch historical data for a single stock
 */
async function fetchStockHistory(symbol, years = 3) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - years);

        const result = await yahooFinance.chart(symbol, {
            period1: startDate,
            period2: endDate,
            interval: '1d'
        });

        if (!result || !result.quotes || result.quotes.length === 0) {
            return null;
        }

        return result.quotes.map(q => ({
            date: new Date(q.date).toISOString().split('T')[0],
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume
        })).filter(q => q.close && q.volume);

    } catch (error) {
        console.error(`Error fetching history for ${symbol}:`, error.message);
        return null;
    }
}

/**
 * Calculate indicators for a specific day
 */
function calculateDayIndicators(history, dayIndex) {
    if (dayIndex < 20) return null; // Need 20 days of data

    const currentDay = history[dayIndex];
    const prevDay = history[dayIndex - 1];

    // Get closing prices for calculations
    const closePrices = history.slice(dayIndex - 20, dayIndex + 1).map(h => h.close);
    const volumes = history.slice(dayIndex - 10, dayIndex + 1).map(h => h.volume);

    // Calculate indicators
    const rsi = calculateRSI(closePrices.reverse(), 14);
    const sma20 = calculateSMA(closePrices, 20);
    const avgVolume10 = volumes.slice(0, 10).reduce((a, b) => a + b, 0) / 10;

    // 20-day high
    const high20Day = Math.max(...history.slice(dayIndex - 20, dayIndex).map(h => h.high));
    const distanceFrom20DayHigh = ((high20Day - prevDay.close) / high20Day) * 100;

    // Previous day change
    const prevDayChange = dayIndex > 0 ?
        ((prevDay.close - history[dayIndex - 2]?.close) / history[dayIndex - 2]?.close) * 100 : 0;

    // Current day change (this is what we're predicting)
    const dayChange = ((currentDay.close - prevDay.close) / prevDay.close) * 100;

    // Volume ratio
    const volumeRatio = avgVolume10 > 0 ? prevDay.volume / avgVolume10 : 1;

    // Price vs SMA20
    const priceVsSMA20 = sma20 ? ((prevDay.close - sma20) / sma20) * 100 : 0;

    return {
        date: currentDay.date,
        dayChange,
        indicators: {
            rsi: rsi || 50,
            volumeRatio,
            distanceFrom20DayHigh,
            prevDayChange,
            priceVsSMA20,
            aboveSMA20: prevDay.close > sma20
        }
    };
}

/**
 * Categorize indicator value into bucket
 */
function categorize(value, buckets) {
    for (const [name, range] of Object.entries(buckets)) {
        if (value >= range.min && value < range.max) {
            return name;
        }
    }
    return 'unknown';
}

/**
 * Discover patterns from historical data
 * Main function that analyzes 3 years of top gainers
 */
async function discoverPatterns(progressCallback = null) {
    console.log('Starting historical pattern discovery...');
    console.log('This will analyze 3 years of daily top gainers across all market caps.');

    const allStocks = [
        ...STOCK_UNIVERSE.largeCap,
        ...STOCK_UNIVERSE.midCap,
        ...STOCK_UNIVERSE.smallCap
    ];

    // Initialize pattern counters
    const patternCounts = {
        rsi: { oversold: 0, lowMid: 0, highMid: 0, overbought: 0 },
        volumeRatio: { veryLow: 0, low: 0, moderate: 0, high: 0, veryHigh: 0 },
        priceVs20DayHigh: { atHigh: 0, nearHigh: 0, moderate: 0, far: 0 },
        previousDayChange: { strongDown: 0, down: 0, flat: 0, up: 0, strongUp: 0 },
        aboveSMA20: { yes: 0, no: 0 }
    };

    let totalTopGainerEvents = 0;
    const topGainerDetails = [];

    // Fetch historical data for all stocks
    console.log(`Fetching 3-year history for ${allStocks.length} stocks...`);

    const stockHistories = {};
    let fetchedCount = 0;

    for (const symbol of allStocks) {
        const history = await fetchStockHistory(symbol, 3);
        if (history && history.length > 100) {
            stockHistories[symbol] = history;
            fetchedCount++;
        }

        if (progressCallback) {
            progressCallback({
                phase: 'fetching',
                current: fetchedCount,
                total: allStocks.length,
                message: `Fetched ${symbol}`
            });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`Successfully fetched data for ${fetchedCount} stocks`);

    if (fetchedCount < 10) {
        console.error('Not enough stock data fetched');
        return null;
    }

    // Find common trading days
    const allDates = new Set();
    Object.values(stockHistories).forEach(history => {
        history.forEach(day => allDates.add(day.date));
    });

    const tradingDays = Array.from(allDates).sort();
    console.log(`Found ${tradingDays.length} trading days to analyze`);

    // Analyze each trading day
    let analyzedDays = 0;

    for (let dayIdx = 25; dayIdx < tradingDays.length; dayIdx++) {
        const targetDate = tradingDays[dayIdx];
        const dailyPerformance = [];

        // Get each stock's performance for this day
        for (const [symbol, history] of Object.entries(stockHistories)) {
            const dayData = history.find(h => h.date === targetDate);
            const dayIndex = history.findIndex(h => h.date === targetDate);

            if (dayData && dayIndex > 20) {
                const indicators = calculateDayIndicators(history, dayIndex);
                if (indicators) {
                    dailyPerformance.push({
                        symbol,
                        ...indicators
                    });
                }
            }
        }

        // Sort by daily change and get top 5 gainers
        dailyPerformance.sort((a, b) => b.dayChange - a.dayChange);
        const topGainers = dailyPerformance.slice(0, 5).filter(s => s.dayChange > 0);

        // Record patterns for each top gainer
        for (const gainer of topGainers) {
            const ind = gainer.indicators;

            // Categorize and count patterns
            patternCounts.rsi[categorize(ind.rsi, PATTERN_BUCKETS.rsi)]++;
            patternCounts.volumeRatio[categorize(ind.volumeRatio, PATTERN_BUCKETS.volumeRatio)]++;
            patternCounts.priceVs20DayHigh[categorize(ind.distanceFrom20DayHigh, PATTERN_BUCKETS.priceVs20DayHigh)]++;
            patternCounts.previousDayChange[categorize(ind.prevDayChange, PATTERN_BUCKETS.previousDayChange)]++;
            patternCounts.aboveSMA20[ind.aboveSMA20 ? 'yes' : 'no']++;

            totalTopGainerEvents++;

            // Store details for analysis
            topGainerDetails.push({
                date: targetDate,
                symbol: gainer.symbol,
                dayChange: gainer.dayChange,
                indicators: ind
            });
        }

        analyzedDays++;

        if (progressCallback && analyzedDays % 50 === 0) {
            progressCallback({
                phase: 'analyzing',
                current: analyzedDays,
                total: tradingDays.length - 25,
                message: `Analyzed ${analyzedDays} trading days, found ${totalTopGainerEvents} top gainer events`
            });
        }
    }

    console.log(`\nPattern Discovery Complete!`);
    console.log(`Analyzed ${analyzedDays} trading days`);
    console.log(`Total top gainer events: ${totalTopGainerEvents}`);

    // Convert counts to percentages
    const calculateDistribution = (counts, total) => {
        const dist = {};
        let maxKey = null;
        let maxVal = 0;

        for (const [key, count] of Object.entries(counts)) {
            const pct = total > 0 ? (count / total) : 0;
            dist[key] = {
                count,
                percentage: (pct * 100).toFixed(1) + '%',
                probability: pct
            };
            if (count > maxVal) {
                maxVal = count;
                maxKey = key;
            }
        }

        return { distribution: dist, mostCommon: maxKey, mostCommonProbability: maxVal / total };
    };

    // Build final patterns object
    const patterns = {
        rsi: calculateDistribution(patternCounts.rsi, totalTopGainerEvents),
        volumeRatio: calculateDistribution(patternCounts.volumeRatio, totalTopGainerEvents),
        priceVs20DayHigh: calculateDistribution(patternCounts.priceVs20DayHigh, totalTopGainerEvents),
        previousDayChange: calculateDistribution(patternCounts.previousDayChange, totalTopGainerEvents),
        aboveSMA20: calculateDistribution(patternCounts.aboveSMA20, totalTopGainerEvents),

        // Summary statistics
        summary: {
            totalTopGainerEvents,
            tradingDaysAnalyzed: analyzedDays,
            stocksAnalyzed: fetchedCount,
            periodStart: tradingDays[25],
            periodEnd: tradingDays[tradingDays.length - 1],
            avgTopGainersPerDay: (totalTopGainerEvents / analyzedDays).toFixed(2)
        },

        // Key insights
        insights: generateInsights(patternCounts, totalTopGainerEvents),

        // Average indicator values for top gainers
        avgIndicators: calculateAverageIndicators(topGainerDetails),

        timestamp: new Date().toISOString()
    };

    // Cache the patterns
    discoveredPatterns = patterns;
    lastPatternUpdate = new Date();

    return patterns;
}

/**
 * Calculate average indicator values from top gainer events
 */
function calculateAverageIndicators(details) {
    if (details.length === 0) return null;

    const sum = {
        rsi: 0,
        volumeRatio: 0,
        distanceFrom20DayHigh: 0,
        prevDayChange: 0,
        priceVsSMA20: 0,
        dayChange: 0
    };

    details.forEach(d => {
        sum.rsi += d.indicators.rsi;
        sum.volumeRatio += d.indicators.volumeRatio;
        sum.distanceFrom20DayHigh += d.indicators.distanceFrom20DayHigh;
        sum.prevDayChange += d.indicators.prevDayChange;
        sum.priceVsSMA20 += d.indicators.priceVsSMA20;
        sum.dayChange += d.dayChange;
    });

    const count = details.length;
    return {
        avgRSI: (sum.rsi / count).toFixed(1),
        avgVolumeRatio: (sum.volumeRatio / count).toFixed(2),
        avgDistanceFrom20DayHigh: (sum.distanceFrom20DayHigh / count).toFixed(1) + '%',
        avgPrevDayChange: (sum.prevDayChange / count).toFixed(2) + '%',
        avgPriceVsSMA20: (sum.priceVsSMA20 / count).toFixed(2) + '%',
        avgTopGainerChange: (sum.dayChange / count).toFixed(2) + '%'
    };
}

/**
 * Generate human-readable insights from patterns
 */
function generateInsights(counts, total) {
    const insights = [];

    // RSI insight
    const rsiLowMidPct = ((counts.rsi.lowMid + counts.rsi.oversold) / total * 100).toFixed(1);
    if (rsiLowMidPct > 50) {
        insights.push(`${rsiLowMidPct}% of top gainers had RSI below 50 (not overbought) the day before`);
    }

    // Volume insight
    const volHighPct = ((counts.volumeRatio.moderate + counts.volumeRatio.high) / total * 100).toFixed(1);
    insights.push(`${volHighPct}% of top gainers had above-average volume (1-5x) the day before`);

    // Price position insight
    const nearHighPct = ((counts.priceVs20DayHigh.atHigh + counts.priceVs20DayHigh.nearHigh) / total * 100).toFixed(1);
    insights.push(`${nearHighPct}% of top gainers were within 5% of their 20-day high`);

    // Previous day momentum
    const prevUpPct = ((counts.previousDayChange.up + counts.previousDayChange.strongUp) / total * 100).toFixed(1);
    insights.push(`${prevUpPct}% of top gainers had positive momentum the previous day`);

    // SMA insight
    const aboveSMAPct = (counts.aboveSMA20.yes / total * 100).toFixed(1);
    insights.push(`${aboveSMAPct}% of top gainers were trading above their 20-day SMA`);

    return insights;
}

/**
 * Get cached patterns or discover new ones
 */
async function getPatterns(forceRefresh = false) {
    // Return cached if available and fresh (less than 24 hours old)
    if (!forceRefresh && discoveredPatterns && lastPatternUpdate) {
        const hoursSinceUpdate = (new Date() - lastPatternUpdate) / (1000 * 60 * 60);
        if (hoursSinceUpdate < 24) {
            return discoveredPatterns;
        }
    }

    return await discoverPatterns();
}

/**
 * Score a stock based on discovered patterns
 * Returns probability-based score
 */
function scoreByPatterns(indicators, patterns) {
    if (!patterns || !indicators) {
        return { score: 50, reasoning: ['No pattern data available'] };
    }

    let score = 0;
    const reasoning = [];

    // RSI scoring based on discovered patterns
    const rsiCategory = categorize(indicators.rsi, PATTERN_BUCKETS.rsi);
    const rsiProb = patterns.rsi.distribution[rsiCategory]?.probability || 0;
    score += rsiProb * 25; // Max 25 points from RSI
    if (rsiProb > 0.3) {
        reasoning.push(`RSI ${indicators.rsi?.toFixed(1)} in favorable zone (${(rsiProb * 100).toFixed(0)}% of top gainers)`);
    }

    // Volume scoring
    const volCategory = categorize(indicators.volumeRatio, PATTERN_BUCKETS.volumeRatio);
    const volProb = patterns.volumeRatio.distribution[volCategory]?.probability || 0;
    score += volProb * 25;
    if (volProb > 0.3) {
        reasoning.push(`Volume ${indicators.volumeRatio?.toFixed(1)}x matches pattern (${(volProb * 100).toFixed(0)}% of top gainers)`);
    }

    // Price position scoring
    const priceCategory = categorize(indicators.distanceFrom20DayHigh, PATTERN_BUCKETS.priceVs20DayHigh);
    const priceProb = patterns.priceVs20DayHigh.distribution[priceCategory]?.probability || 0;
    score += priceProb * 25;
    if (priceProb > 0.3) {
        reasoning.push(`Price position matches ${(priceProb * 100).toFixed(0)}% of historical top gainers`);
    }

    // Previous day momentum scoring
    const momCategory = categorize(indicators.prevDayChange, PATTERN_BUCKETS.previousDayChange);
    const momProb = patterns.previousDayChange.distribution[momCategory]?.probability || 0;
    score += momProb * 15;

    // SMA scoring
    const smaProb = patterns.aboveSMA20.distribution[indicators.aboveSMA20 ? 'yes' : 'no']?.probability || 0;
    score += smaProb * 10;
    if (smaProb > 0.5) {
        reasoning.push(`SMA position matches ${(smaProb * 100).toFixed(0)}% of top gainers`);
    }

    return {
        score: Math.min(100, Math.max(0, score)),
        reasoning,
        patternMatch: (score / 100).toFixed(2)
    };
}

/**
 * Get quick pattern summary for display
 */
function getPatternSummary() {
    if (!discoveredPatterns) {
        return {
            available: false,
            message: 'Pattern analysis not yet run. Call /api/stock/discover-patterns first.'
        };
    }

    return {
        available: true,
        summary: discoveredPatterns.summary,
        keyFindings: {
            mostCommonRSI: discoveredPatterns.rsi.mostCommon,
            mostCommonVolume: discoveredPatterns.volumeRatio.mostCommon,
            priceNearHigh: discoveredPatterns.priceVs20DayHigh.distribution.atHigh?.percentage || 'N/A',
            aboveSMA20: discoveredPatterns.aboveSMA20.distribution.yes?.percentage || 'N/A'
        },
        insights: discoveredPatterns.insights,
        avgIndicators: discoveredPatterns.avgIndicators,
        lastUpdated: lastPatternUpdate?.toISOString()
    };
}

module.exports = {
    discoverPatterns,
    getPatterns,
    scoreByPatterns,
    getPatternSummary,
    calculateDayIndicators,
    STOCK_UNIVERSE,
    PATTERN_BUCKETS
};
