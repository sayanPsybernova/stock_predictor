const express = require('express');
const router = express.Router();
const { getHistoricalData, getFundamentalData, getIntradayData, searchStocks, EXCHANGE_SUFFIXES } = require('../services/yahooFinance');
const { performTechnicalAnalysis } = require('../analysis/technicalAnalysis');
const { performFundamentalAnalysis } = require('../analysis/fundamentalAnalysis');
const { performQuantitativeAnalysis } = require('../analysis/quantitativeAnalysis');
const { generateAnalysisExplanation, generateMarketSentiment, getMarketStatus } = require('../services/geminiService');

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
