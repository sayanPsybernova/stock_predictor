const express = require('express');
const router = express.Router();
const { getHistoricalData, getFundamentalData, getIntradayData, searchStocks, EXCHANGE_SUFFIXES } = require('../services/yahooFinance');
const { performTechnicalAnalysis } = require('../analysis/technicalAnalysis');
const { performFundamentalAnalysis } = require('../analysis/fundamentalAnalysis');
const { performQuantitativeAnalysis } = require('../analysis/quantitativeAnalysis');
const { generateAnalysisExplanation, generateMarketSentiment, getMarketStatus } = require('../services/geminiService');
const { predictTopGainers } = require('../services/topGainerService');
const { discoverPatterns, getPatternSummary, getPatterns } = require('../services/historicalPatternService');
const { scanForBigGainers, quickScan, analyzeStock } = require('../services/aggressiveScannerService');
const {
    discoverTopGainerPatterns,
    getPatterns: getNiftyPatterns,
    getPatternSummary: getNiftyPatternSummary,
    scoreByDiscoveredPatterns,
    getAllStocks: getAllNiftyStocks,
    NIFTY_TOTAL_MARKET,
    BIG_GAINER_PATTERNS
} = require('../services/niftyTotalMarketService');

// Input validation regex for stock symbols
const VALID_SYMBOL_REGEX = /^[A-Z0-9.\-^]{1,12}$/i;

// Valid exchange values
const VALID_EXCHANGES = ['AUTO', 'US', 'NSE', 'BSE'];

// Search/autocomplete endpoint - must be before /:symbol to avoid conflict
router.get('/search/:query', async (req, res) => {
    const query = req.params.query?.trim();

    if (!query || query.length < 1) {
        return res.json({ results: [] });
    }

    try {
        const results = await searchStocks(query);
        res.json({ results });
    } catch (error) {
        console.error(`Search error for "${query}":`, error);
        res.status(500).json({ error: 'Search failed', results: [] });
    }
});

/**
 * Top Gainers Prediction Endpoint
 * Predicts tomorrow's potential top gainers using pattern analysis
 * Categories: Large Cap, Mid Cap, Small Cap
 */
router.get('/predictions/top-gainers', async (req, res) => {
    try {
        console.log('Generating top gainer predictions...');
        const predictions = await predictTopGainers();

        // Add tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        res.json({
            success: true,
            predictionDate: tomorrowStr,
            generatedAt: new Date().toISOString(),
            predictions: predictions,
            disclaimer: 'These predictions are based on historical pattern analysis and AI algorithms. This is NOT financial advice. Past performance does not guarantee future results. Always do your own research before investing.'
        });
    } catch (error) {
        console.error('Top gainer prediction error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate predictions. Please try again later.',
            predictions: null
        });
    }
});

/**
 * Pattern Discovery - Get Current Pattern Summary
 * Returns discovered patterns from historical top gainer analysis
 */
router.get('/patterns/summary', async (req, res) => {
    try {
        const summary = getPatternSummary();
        res.json({
            success: true,
            ...summary
        });
    } catch (error) {
        console.error('Pattern summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get pattern summary'
        });
    }
});

/**
 * Pattern Discovery - Run Analysis
 * Analyzes 3 years of historical data to discover top gainer patterns
 * WARNING: This takes several minutes to complete
 */
router.get('/patterns/discover', async (req, res) => {
    try {
        console.log('Starting pattern discovery analysis...');
        console.log('This will analyze 3 years of data for 45 stocks. Please wait...');

        // Send initial response headers for long-running request
        res.setHeader('Content-Type', 'application/json');

        const patterns = await discoverPatterns((progress) => {
            console.log(`Progress: ${progress.phase} - ${progress.message}`);
        });

        if (!patterns) {
            return res.status(500).json({
                success: false,
                error: 'Pattern discovery failed. Not enough data available.'
            });
        }

        res.json({
            success: true,
            message: 'Pattern discovery complete!',
            patterns: {
                rsi: patterns.rsi,
                volumeRatio: patterns.volumeRatio,
                priceVs20DayHigh: patterns.priceVs20DayHigh,
                previousDayChange: patterns.previousDayChange,
                aboveSMA20: patterns.aboveSMA20
            },
            summary: patterns.summary,
            insights: patterns.insights,
            avgIndicators: patterns.avgIndicators,
            timestamp: patterns.timestamp
        });

    } catch (error) {
        console.error('Pattern discovery error:', error);
        res.status(500).json({
            success: false,
            error: 'Pattern discovery failed: ' + error.message
        });
    }
});

/**
 * Get Full Discovered Patterns
 * Returns cached patterns if available, otherwise returns instructions
 */
router.get('/patterns/full', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        const patterns = await getPatterns(forceRefresh);

        if (!patterns) {
            return res.json({
                success: false,
                available: false,
                message: 'No patterns discovered yet. Call /api/stock/patterns/discover to analyze historical data.',
                estimatedTime: '3-5 minutes for full analysis'
            });
        }

        res.json({
            success: true,
            patterns
        });
    } catch (error) {
        console.error('Get patterns error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get patterns'
        });
    }
});

// ============================================================
// NIFTY TOTAL MARKET PATTERN DISCOVERY (5-YEAR ANALYSIS)
// ============================================================

/**
 * NIFTY TOTAL MARKET - Pattern Discovery
 * Analyzes 5 years of 500+ stocks to find 10%+ gainer patterns
 * WARNING: This takes 10-15 minutes to complete
 */
router.get('/patterns/discover-nifty', async (req, res) => {
    try {
        console.log('🔍 Starting 5-year Nifty Total Market pattern discovery...');
        console.log('⏱️ This will analyze 500+ stocks over 5 years. Please wait...');

        res.setHeader('Content-Type', 'application/json');

        const patterns = await discoverTopGainerPatterns((progress) => {
            console.log(`Progress: ${progress.stocksProcessed}/${progress.totalStocks} stocks - Found ${progress.bigGainersFound} big gainer events`);
        });

        if (!patterns) {
            return res.status(500).json({
                success: false,
                error: 'Pattern discovery failed. Not enough data available.'
            });
        }

        res.json({
            success: true,
            message: '5-year Nifty Total Market pattern discovery complete!',
            patterns: {
                rsi: patterns.rsi,
                volume: patterns.volume,
                pricePosition: patterns.pricePosition,
                prevDayChange: patterns.prevDayChange,
                consolidation: patterns.consolidation
            },
            summary: patterns.summary,
            insights: patterns.insights,
            recentBigGainers: patterns.recentBigGainers,
            timestamp: patterns.timestamp
        });

    } catch (error) {
        console.error('Nifty pattern discovery error:', error);
        res.status(500).json({
            success: false,
            error: 'Pattern discovery failed: ' + error.message
        });
    }
});

/**
 * NIFTY TOTAL MARKET - Get Pattern Summary
 */
router.get('/patterns/nifty-summary', async (req, res) => {
    try {
        const summary = getNiftyPatternSummary();
        res.json({
            success: true,
            ...summary
        });
    } catch (error) {
        console.error('Nifty pattern summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get Nifty pattern summary'
        });
    }
});

/**
 * NIFTY TOTAL MARKET - Get Full Patterns
 */
router.get('/patterns/nifty-full', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        const patterns = await getNiftyPatterns(forceRefresh);

        if (!patterns) {
            return res.json({
                success: false,
                available: false,
                message: 'No Nifty patterns discovered yet. Call /api/stock/patterns/discover-nifty to analyze 5 years of data.',
                estimatedTime: '10-15 minutes for full analysis (500+ stocks)'
            });
        }

        res.json({
            success: true,
            patterns
        });
    } catch (error) {
        console.error('Get Nifty patterns error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get Nifty patterns'
        });
    }
});

/**
 * NIFTY TOTAL MARKET - Predict Tomorrow's 10%+ Gainers
 * Uses discovered patterns to scan current market
 */
router.get('/predictions/nifty-big-gainers', async (req, res) => {
    try {
        console.log('🚀 Scanning Nifty Total Market for tomorrow\'s 10%+ gainers...');

        // First check if patterns are available
        let patterns = await getNiftyPatterns(false);

        if (!patterns) {
            console.log('⚠️ No cached patterns. Using default patterns...');
            // Use default patterns based on general market knowledge
            patterns = getDefaultPatterns();
        }

        const allStocks = getAllNiftyStocks();
        console.log(`📊 Scanning ${allStocks.length} stocks...`);

        const candidates = [];
        let scanned = 0;

        for (const symbol of allStocks) {
            try {
                const indicators = await fetchCurrentIndicators(symbol);

                if (indicators) {
                    const patternScore = scoreByDiscoveredPatterns(indicators, patterns);

                    if (patternScore.score >= 20) { // Threshold for potential big gainer
                        candidates.push({
                            symbol,
                            name: indicators.name || symbol.replace('.NS', ''),
                            currentPrice: indicators.currentPrice,
                            dayChange: indicators.dayChange,
                            score: patternScore.score,
                            matchProbability: patternScore.matchProbability,
                            reasoning: patternScore.reasoning,
                            patternMatches: patternScore.patternMatches,
                            indicators: {
                                rsi: indicators.rsi,
                                volumeRatio: indicators.volumeRatio,
                                pricePosition: indicators.pricePosition,
                                prevDayChange: indicators.prevDayChange
                            }
                        });
                    }
                }

                scanned++;
                if (scanned % 50 === 0) {
                    console.log(`Progress: ${scanned}/${allStocks.length} - Found ${candidates.length} candidates`);
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                // Skip failed stocks
            }
        }

        // Sort by score
        candidates.sort((a, b) => b.score - a.score);

        // Categorize by confidence
        const veryHighConfidence = candidates.filter(c => c.score >= 50);
        const highConfidence = candidates.filter(c => c.score >= 35 && c.score < 50);
        const mediumConfidence = candidates.filter(c => c.score >= 20 && c.score < 35);

        // Tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        res.json({
            success: true,
            predictionDate: tomorrowStr,
            generatedAt: new Date().toISOString(),
            scanType: 'Nifty Total Market - 5-Year Pattern Based',
            stocksScanned: scanned,
            totalCandidates: candidates.length,

            topPicks: candidates.slice(0, 10).map(formatNiftyBigGainerResult),

            byConfidence: {
                veryHigh: veryHighConfidence.slice(0, 5).map(formatNiftyBigGainerResult),
                high: highConfidence.slice(0, 10).map(formatNiftyBigGainerResult),
                medium: mediumConfidence.slice(0, 10).map(formatNiftyBigGainerResult)
            },

            patternInfo: {
                patternsUsed: patterns ? 'Discovered from 5-year historical data' : 'Default patterns',
                lastPatternUpdate: patterns?.timestamp || 'N/A'
            },

            methodology: {
                universe: 'Nifty Total Market (500+ stocks)',
                patternSource: '5 years of historical 10%+ gainers',
                indicators: ['RSI', 'Volume Ratio', 'Price Position', 'Momentum', 'Consolidation'],
                minScore: 20,
                targetGain: '10%+'
            },

            disclaimer: 'These predictions are based on historical pattern analysis of 10%+ gainers. This is HIGH RISK trading. Not financial advice. Only invest what you can afford to lose.'
        });

    } catch (error) {
        console.error('Nifty big gainer prediction error:', error);
        res.status(500).json({
            success: false,
            error: 'Prediction failed: ' + error.message
        });
    }
});

/**
 * Helper: Fetch current indicators for a stock
 */
async function fetchCurrentIndicators(symbol) {
    try {
        const YahooFinance = require('yahoo-finance2').default;
        const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

        const [quote, history] = await Promise.all([
            yahooFinance.quote(symbol),
            yahooFinance.chart(symbol, {
                period1: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days
                period2: new Date(),
                interval: '1d'
            })
        ]);

        if (!quote || !history || !history.quotes || history.quotes.length < 20) {
            return null;
        }

        const quotes = history.quotes.filter(q => q && q.close && q.volume);
        if (quotes.length < 20) return null;

        // Calculate RSI
        const closes = quotes.map(q => q.close);
        let gains = 0, losses = 0;
        for (let i = 1; i <= 14 && i < closes.length; i++) {
            const change = closes[closes.length - i] - closes[closes.length - i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }
        const avgGain = gains / 14;
        const avgLoss = losses / 14;
        const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

        // Volume ratio
        const volumes = quotes.slice(-11, -1).map(q => q.volume);
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const volumeRatio = avgVolume > 0 ? quotes[quotes.length - 1].volume / avgVolume : 1;

        // Price position in 52-week range
        const high52 = quote.fiftyTwoWeekHigh || Math.max(...quotes.map(q => q.high));
        const low52 = quote.fiftyTwoWeekLow || Math.min(...quotes.map(q => q.low));
        const priceRange = high52 - low52;
        const pricePosition = priceRange > 0 ? ((quote.regularMarketPrice - low52) / priceRange) * 100 : 50;

        // Previous day change
        const prevClose = quotes[quotes.length - 2]?.close;
        const prevDayChange = prevClose ? ((quotes[quotes.length - 1].close - prevClose) / prevClose) * 100 : 0;

        // Day change
        const dayChange = quote.regularMarketChangePercent || 0;

        // Consolidation range (10-day)
        const last10 = quotes.slice(-10);
        const high10 = Math.max(...last10.map(q => q.high));
        const low10 = Math.min(...last10.map(q => q.low));
        const consolidationRange = low10 > 0 ? ((high10 - low10) / low10) * 100 : 10;

        return {
            name: quote.shortName || quote.longName || symbol.replace('.NS', ''),
            currentPrice: quote.regularMarketPrice,
            dayChange: dayChange.toFixed(2),
            rsi,
            volumeRatio,
            pricePosition,
            prevDayChange,
            consolidationRange
        };
    } catch (error) {
        return null;
    }
}

/**
 * Helper: Default patterns when no historical discovery has been run
 */
function getDefaultPatterns() {
    return {
        rsi: {
            distribution: {
                extremeOversold: { probability: 0.15 },
                oversold: { probability: 0.18 },
                lowMid: { probability: 0.25 },
                mid: { probability: 0.20 },
                highMid: { probability: 0.15 },
                overbought: { probability: 0.07 }
            }
        },
        volume: {
            distribution: {
                veryLow: { probability: 0.05 },
                low: { probability: 0.15 },
                normal: { probability: 0.30 },
                high: { probability: 0.30 },
                veryHigh: { probability: 0.15 },
                extreme: { probability: 0.05 }
            }
        },
        pricePosition: {
            distribution: {
                near52WLow: { probability: 0.20 },
                lowerHalf: { probability: 0.25 },
                midRange: { probability: 0.30 },
                upperHalf: { probability: 0.15 },
                near52WHigh: { probability: 0.10 }
            }
        },
        prevDayChange: {
            distribution: {
                bigDown: { probability: 0.10 },
                down: { probability: 0.15 },
                slightDown: { probability: 0.15 },
                flat: { probability: 0.25 },
                up: { probability: 0.25 },
                bigUp: { probability: 0.10 }
            }
        },
        consolidation: {
            distribution: {
                tight: { probability: 0.15 },
                normal: { probability: 0.35 },
                wide: { probability: 0.35 },
                veryWide: { probability: 0.15 }
            }
        }
    };
}

/**
 * Format Nifty big gainer result for frontend
 */
function formatNiftyBigGainerResult(stock) {
    return {
        symbol: stock.symbol.replace('.NS', ''),
        name: stock.name,
        currentPrice: `₹${stock.currentPrice}`,
        todayChange: `${parseFloat(stock.dayChange) > 0 ? '+' : ''}${stock.dayChange}%`,
        score: stock.score,
        matchProbability: `${(parseFloat(stock.matchProbability) * 100).toFixed(1)}%`,
        potentialGain: stock.score >= 50 ? '10-15%' : stock.score >= 35 ? '7-12%' : '5-10%',
        confidence: stock.score >= 50 ? 'Very High' : stock.score >= 35 ? 'High' : 'Medium',
        reasoning: stock.reasoning,
        indicators: stock.indicators,
        patternMatches: stock.patternMatches
    };
}

// ============================================================
// AGGRESSIVE SCANNER (200+ STOCKS)
// ============================================================

/**
 * AGGRESSIVE SCANNER - Find 10%+ Potential Gainers
 * Scans 200+ stocks for big movers
 * WARNING: This takes 2-3 minutes to complete
 */
router.get('/predictions/big-gainers', async (req, res) => {
    try {
        console.log('🚀 Starting aggressive scan for 10%+ gainers...');
        console.log('⏱️ This will scan 200+ stocks. Please wait...');

        const results = await scanForBigGainers((progress) => {
            console.log(`Progress: ${progress.scanned}/${progress.total} - Found ${progress.found} candidates`);
        });

        // Format for frontend
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        res.json({
            success: true,
            predictionDate: tomorrowStr,
            generatedAt: results.timestamp,
            scanType: 'Aggressive 10%+ Scanner',

            // Top picks for immediate action
            topPicks: results.topPicks.map(formatBigGainerResult),

            // Categorized by confidence
            byConfidence: {
                veryHigh: results.byConfidence.veryHigh.map(formatBigGainerResult),
                high: results.byConfidence.high.map(formatBigGainerResult),
                medium: results.byConfidence.medium.map(formatBigGainerResult)
            },

            // By sector
            bySector: Object.fromEntries(
                Object.entries(results.bySector).map(([sector, stocks]) => [
                    sector,
                    stocks.map(formatBigGainerResult)
                ])
            ),

            summary: results.summary,
            methodology: results.methodology,

            disclaimer: 'These are HIGH-RISK predictions for potentially 10%+ gains. Such stocks are extremely volatile. This is NOT financial advice. Only invest what you can afford to lose. Always do your own research.'
        });

    } catch (error) {
        console.error('Big gainer scan error:', error);
        res.status(500).json({
            success: false,
            error: 'Scan failed: ' + error.message
        });
    }
});

/**
 * QUICK SCAN - Fast scan of high-beta stocks only
 * Returns in 30-60 seconds
 */
router.get('/predictions/quick-scan', async (req, res) => {
    try {
        console.log('⚡ Running quick scan for immediate opportunities...');

        const results = await quickScan();

        res.json({
            success: true,
            scanType: 'Quick Scan (High-Beta Stocks)',
            generatedAt: results.timestamp,
            stocksScanned: results.stocksScanned,
            topPicks: results.topPicks.map(formatBigGainerResult),
            disclaimer: 'Quick scan focuses on high-beta stocks. For comprehensive analysis, use /predictions/big-gainers'
        });

    } catch (error) {
        console.error('Quick scan error:', error);
        res.status(500).json({
            success: false,
            error: 'Quick scan failed: ' + error.message
        });
    }
});

/**
 * Analyze single stock for big gainer potential
 */
router.get('/analyze/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const fullSymbol = symbol.endsWith('.NS') ? symbol : symbol + '.NS';

        console.log(`Analyzing ${fullSymbol} for big gainer potential...`);

        const result = await analyzeStock(fullSymbol);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: `Could not analyze ${symbol}. Stock may not exist.`
            });
        }

        res.json({
            success: true,
            analysis: formatBigGainerResult(result),
            rawData: result
        });

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'Analysis failed: ' + error.message
        });
    }
});

/**
 * Format big gainer result for frontend
 */
function formatBigGainerResult(stock) {
    return {
        symbol: stock.symbol.replace('.NS', ''),
        name: stock.name,
        currentPrice: `₹${stock.currentPrice}`,
        todayChange: `${stock.dayChange > 0 ? '+' : ''}${stock.dayChange}%`,
        potentialGain: stock.potentialGain,
        confidence: stock.confidence,
        score: stock.score,

        // Key metrics
        metrics: {
            volumeRatio: `${stock.volumeRatio}x avg`,
            rsi: stock.rsi,
            distanceFromLow: `${stock.distanceFromLow}% above 52W low`,
            distanceFromHigh: `${stock.distanceFromHigh}% below 52W high`
        },

        // Signals that triggered this stock
        signals: stock.signals,
        triggers: stock.triggers,

        // Price levels
        priceLevels: {
            current: `₹${stock.currentPrice}`,
            fiftyTwoWeekHigh: `₹${stock.fiftyTwoWeekHigh}`,
            fiftyTwoWeekLow: `₹${stock.fiftyTwoWeekLow}`
        },

        sector: stock.sector
    };
}

router.get('/:symbol', async (req, res) => {
    // FIX: Normalize and validate symbol
    const symbol = req.params.symbol?.trim().toUpperCase();

    // Get optional exchange parameter (defaults to AUTO for smart detection)
    const exchange = (req.query.exchange?.toUpperCase() || 'AUTO');

    if (!symbol) {
        return res.status(400).json({ error: 'Stock symbol is required.' });
    }

    // FIX: Validate symbol format
    if (!VALID_SYMBOL_REGEX.test(symbol)) {
        return res.status(400).json({
            error: 'Invalid stock symbol format. Use only letters, numbers, dots, and hyphens (1-12 characters).'
        });
    }

    // Validate exchange parameter
    if (!VALID_EXCHANGES.includes(exchange)) {
        return res.status(400).json({
            error: `Invalid exchange. Supported: ${VALID_EXCHANGES.join(', ')}`
        });
    }

    try {
        // Fetch all data in parallel with exchange parameter
        const [historicalData, fundamentalData] = await Promise.all([
            getHistoricalData(symbol, exchange),
            getFundamentalData(symbol, exchange),
        ]);

        if (!historicalData || historicalData.length === 0) {
            return res.status(404).json({ error: 'No historical data found for this symbol.' });
        }

        // Perform all analyses in parallel with error handling
        let technicalAnalysis, fundamentalAnalysis, quant5D, quant1M, quant6M;

        try {
            [technicalAnalysis, fundamentalAnalysis, quant5D, quant1M, quant6M] = await Promise.all([
                performTechnicalAnalysis(historicalData),
                performFundamentalAnalysis(fundamentalData),
                performQuantitativeAnalysis(historicalData, 5),
                performQuantitativeAnalysis(historicalData, 22), // ~1 trading month
                performQuantitativeAnalysis(historicalData, 126), // ~6 trading months
            ]);
        } catch (analysisError) {
            console.error(`Analysis error for ${symbol}:`, analysisError);
            // Continue with partial data if possible
            technicalAnalysis = technicalAnalysis || { summary: { trend: 'N/A', rsi: 'N/A', macd_signal: 'N/A', volatility: 'N/A' } };
            fundamentalAnalysis = fundamentalAnalysis || { rating: 'N/A', fundamentalScore: 0, metrics: {} };
            quant5D = quant5D || { expectedReturn: 0, expectedReturnRange: { lower: 'N/A', upper: 'N/A' }, confidence: 0, riskLevel: 'Unknown' };
            quant1M = quant1M || { expectedReturn: 0, expectedReturnRange: { lower: 'N/A', upper: 'N/A' }, confidence: 0, riskLevel: 'Unknown' };
            quant6M = quant6M || { expectedReturn: 0, expectedReturnRange: { lower: 'N/A', upper: 'N/A' }, confidence: 0, riskLevel: 'Unknown' };
        }

        // Get market status for this stock
        const resolvedSymbol = fundamentalData.resolvedSymbol || fundamentalData.symbol || symbol;
        const marketStatus = getMarketStatus(resolvedSymbol);

        // Build initial response with resolved symbol info
        const response = {
            symbol: resolvedSymbol,
            originalSymbol: symbol,
            exchange: fundamentalData.exchange || 'US',
            shortName: fundamentalData.shortName || null,
            longName: fundamentalData.longName || null,
            currency: fundamentalData.currency || 'USD',
            marketPrice: fundamentalData.regularMarketPrice || null,
            marketChange: {
                amount: fundamentalData.regularMarketChange || 0,
                percent: fundamentalData.regularMarketChangePercent || 0,
            },
            marketStatus: {
                isOpen: marketStatus.isOpen,
                market: marketStatus.market,
                currentTimeIST: marketStatus.currentTimeIST,
                preMarket: marketStatus.preMarket,
                updateFrequency: marketStatus.updateFrequency
            },
            analysis: {
                '5-Day': quant5D,
                '1-Month': quant1M,
                '6-Month': quant6M,
            },
            charts: {
                // Return all 5 years of data for dynamic time range filtering on frontend
                historical: historicalData.map(d => ({
                    date: d.date,
                    close: d.close
                })),
            },
            technicalAnalysis,
            fundamentalAnalysis,
            disclaimer: "This analysis is based on statistical models and historical data. For educational purposes only. Not financial advice."
        };

        // Generate AI explanation and sentiment in parallel (non-blocking)
        try {
            const [aiExplanation, sentiment] = await Promise.all([
                generateAnalysisExplanation(response),
                generateMarketSentiment(response)
            ]);

            response.aiAnalysis = {
                explanation: aiExplanation,
                sentiment: sentiment.sentiment,
                sentimentStrength: (sentiment.strength * 100).toFixed(0) + '%',
                signals: sentiment.signals
            };
        } catch (aiError) {
            console.error(`AI analysis error for ${symbol}:`, aiError.message);
            // Continue without AI analysis - it's optional
            response.aiAnalysis = {
                explanation: 'AI analysis temporarily unavailable.',
                sentiment: 'Unknown',
                sentimentStrength: 'N/A',
                signals: { bullish: 0, bearish: 0, neutral: 0 }
            };
        }

        res.json(response);

    } catch (error) {
        console.error(`Error processing stock ${symbol}:`, error);

        // Return appropriate error based on type
        if (error.message.includes('Please check if the symbol is valid')) {
            return res.status(404).json({
                error: `Stock symbol '${symbol}' not found or invalid.`
            });
        }

        res.status(500).json({
            error: `Failed to process stock analysis for ${symbol}. Please try again later.`
        });
    }
});

// Intraday data endpoint for 1D chart
router.get('/:symbol/intraday', async (req, res) => {
    const symbol = req.params.symbol?.trim().toUpperCase();
    const exchange = (req.query.exchange?.toUpperCase() || 'AUTO');

    if (!symbol) {
        return res.status(400).json({ error: 'Stock symbol is required.' });
    }

    if (!VALID_SYMBOL_REGEX.test(symbol)) {
        return res.status(400).json({
            error: 'Invalid stock symbol format.'
        });
    }

    try {
        const intradayData = await getIntradayData(symbol, exchange);

        if (!intradayData || intradayData.length === 0) {
            return res.status(404).json({
                error: 'No intraday data available. Market may be closed.',
                data: []
            });
        }

        res.json({
            symbol,
            data: intradayData.map(d => ({
                date: d.date,
                close: d.close
            }))
        });
    } catch (error) {
        console.error(`Error fetching intraday data for ${symbol}:`, error);
        res.status(500).json({
            error: 'Failed to fetch intraday data.',
            data: []
        });
    }
});

module.exports = router;
