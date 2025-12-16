/**
 * Options API Routes
 * Provides endpoints for option chain analysis and AI-driven predictions
 */

const express = require('express');
const router = express.Router();
const { fetchOptionChain, getOptionGreeks, INDEX_INFO } = require('../services/optionDataService');
const optionQuantService = require('../services/optionQuantService');
const optionTechnicalService = require('../services/optionTechnicalService');
const optionAnalyserService = require('../services/optionAnalyserService');

// Valid symbol pattern
const VALID_SYMBOL_REGEX = /^[A-Z0-9&\-]{1,20}$/i;

/**
 * GET /api/options/symbols
 * Get list of supported symbols for options trading
 */
router.get('/symbols', (req, res) => {
    const indices = Object.keys(INDEX_INFO).map(symbol => ({
        symbol,
        type: 'index',
        lotSize: INDEX_INFO[symbol].lotSize
    }));

    // Popular F&O stocks
    const popularStocks = [
        'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
        'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
        'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'TITAN',
        'BAJFINANCE', 'WIPRO', 'HCLTECH', 'TATAMOTORS', 'TATASTEEL'
    ].map(symbol => ({
        symbol,
        type: 'stock',
        lotSize: null // Varies by stock
    }));

    res.json({
        success: true,
        indices,
        stocks: popularStocks
    });
});

/**
 * GET /api/options/chain/:symbol
 * Fetch complete option chain for a symbol
 */
router.get('/chain/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const expiry = req.query.expiry || null;

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        console.log(`📊 Fetching option chain for ${symbol}${expiry ? ` (expiry: ${expiry})` : ''}`);

        const chainData = await fetchOptionChain(symbol, expiry);

        if (!chainData) {
            return res.status(404).json({
                success: false,
                error: `Option chain not available for ${symbol}. Ensure it's a valid F&O symbol.`
            });
        }

        res.json({
            success: true,
            data: chainData
        });

    } catch (error) {
        console.error('Option chain fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch option chain: ' + error.message
        });
    }
});

/**
 * GET /api/options/analyse/:symbol
 * Full AI-powered analysis combining Quant + Technical + ML + News
 */
router.get('/analyse/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const expiry = req.query.expiry || null;

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        console.log(`🔍 Running full analysis for ${symbol}...`);

        const analysis = await optionAnalyserService.analyseSymbol(symbol, expiry);

        if (!analysis) {
            return res.status(404).json({
                success: false,
                error: `Could not analyse ${symbol}. Ensure it's a valid F&O symbol.`
            });
        }

        res.json({
            success: true,
            analysis,
            disclaimer: 'This analysis is based on quantitative models and historical data. NOT financial advice. Options trading involves significant risk.'
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
 * GET /api/options/quant/:symbol
 * Quantitative analysis only (PCR, Max Pain, OI, IV)
 */
router.get('/quant/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const expiry = req.query.expiry || null;

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        const quantAnalysis = await optionQuantService.analyseQuant(symbol, expiry);

        if (!quantAnalysis) {
            return res.status(404).json({
                success: false,
                error: `Quantitative analysis not available for ${symbol}`
            });
        }

        res.json({
            success: true,
            analysis: quantAnalysis
        });

    } catch (error) {
        console.error('Quant analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'Quantitative analysis failed: ' + error.message
        });
    }
});

/**
 * GET /api/options/technical/:symbol
 * Technical analysis for underlying asset
 */
router.get('/technical/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        const technicalAnalysis = await optionTechnicalService.analyseTechnical(symbol);

        if (!technicalAnalysis) {
            return res.status(404).json({
                success: false,
                error: `Technical analysis not available for ${symbol}`
            });
        }

        res.json({
            success: true,
            analysis: technicalAnalysis
        });

    } catch (error) {
        console.error('Technical analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'Technical analysis failed: ' + error.message
        });
    }
});

/**
 * GET /api/options/greeks/:symbol/:strike/:type
 * Get Greeks for a specific option contract
 */
router.get('/greeks/:symbol/:strike/:type', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const strike = parseFloat(req.params.strike);
        const optionType = req.params.type?.toUpperCase();
        const expiry = req.query.expiry || null;

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        if (isNaN(strike) || strike <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid strike price'
            });
        }

        if (!['CE', 'PE', 'CALL', 'PUT'].includes(optionType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid option type. Use CE/PE or CALL/PUT'
            });
        }

        const type = ['CE', 'CALL'].includes(optionType) ? 'CE' : 'PE';
        const greeks = await getOptionGreeks(symbol, strike, type, expiry);

        if (!greeks) {
            return res.status(404).json({
                success: false,
                error: `Greeks not available for ${symbol} ${strike} ${type}`
            });
        }

        res.json({
            success: true,
            data: greeks
        });

    } catch (error) {
        console.error('Greeks fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch Greeks: ' + error.message
        });
    }
});

/**
 * GET /api/options/maxpain/:symbol
 * Get Max Pain calculation with chart data
 */
router.get('/maxpain/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const expiry = req.query.expiry || null;

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        const maxPainData = await optionQuantService.getMaxPainAnalysis(symbol, expiry);

        if (!maxPainData) {
            return res.status(404).json({
                success: false,
                error: `Max Pain data not available for ${symbol}`
            });
        }

        res.json({
            success: true,
            data: maxPainData
        });

    } catch (error) {
        console.error('Max Pain fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate Max Pain: ' + error.message
        });
    }
});

/**
 * GET /api/options/pcr/:symbol
 * Get PCR analysis with interpretation
 */
router.get('/pcr/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const expiry = req.query.expiry || null;

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        const pcrData = await optionQuantService.getPCRAnalysis(symbol, expiry);

        if (!pcrData) {
            return res.status(404).json({
                success: false,
                error: `PCR data not available for ${symbol}`
            });
        }

        res.json({
            success: true,
            data: pcrData
        });

    } catch (error) {
        console.error('PCR fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate PCR: ' + error.message
        });
    }
});

/**
 * GET /api/options/oi-analysis/:symbol
 * Get OI buildup analysis
 */
router.get('/oi-analysis/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const expiry = req.query.expiry || null;

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        const oiAnalysis = await optionQuantService.getOIAnalysis(symbol, expiry);

        if (!oiAnalysis) {
            return res.status(404).json({
                success: false,
                error: `OI analysis not available for ${symbol}`
            });
        }

        res.json({
            success: true,
            data: oiAnalysis
        });

    } catch (error) {
        console.error('OI analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze OI: ' + error.message
        });
    }
});

/**
 * GET /api/options/iv-analysis/:symbol
 * Get IV analysis with skew
 */
router.get('/iv-analysis/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol?.trim().toUpperCase();
        const expiry = req.query.expiry || null;

        if (!symbol || !VALID_SYMBOL_REGEX.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbol format'
            });
        }

        const ivAnalysis = await optionQuantService.getIVAnalysis(symbol, expiry);

        if (!ivAnalysis) {
            return res.status(404).json({
                success: false,
                error: `IV analysis not available for ${symbol}`
            });
        }

        res.json({
            success: true,
            data: ivAnalysis
        });

    } catch (error) {
        console.error('IV analysis error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze IV: ' + error.message
        });
    }
});

module.exports = router;
