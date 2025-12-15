const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const stockRoutes = require('./routes/stock');
const niftyService = require('./services/niftyTotalMarketService');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'],
    credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api/stock', stockRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.send('Stock Analysis Backend is running!');
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Financial Disclaimer Endpoint
app.get('/api/disclaimer', (req, res) => {
    res.json({
        disclaimer: 'This analysis is based on statistical models and historical data. For educational purposes only. Not financial advice. Past performance is not indicative of future results.'
    });
});

// 404 handler for unknown routes
app.use((req, res, next) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global error handler middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // Don't expose internal errors in production
    const isProduction = process.env.NODE_ENV === 'production';

    res.status(err.status || 500).json({
        error: isProduction ? 'Internal server error' : err.message,
        ...(isProduction ? {} : { stack: err.stack })
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ============================================
// AUTO-REFRESH SCHEDULER (FREE with node-cron)
// ============================================

// Refresh stock list daily at 5:30 AM IST (before market opens)
// 5:30 AM IST = 00:00 UTC (IST is UTC+5:30)
cron.schedule('0 0 * * *', async () => {
    console.log('🔄 [CRON] Starting daily stock list refresh...');
    try {
        await niftyService.fetchNSEStockList();
        console.log('✅ [CRON] Stock list refreshed successfully');
    } catch (error) {
        console.error('❌ [CRON] Stock list refresh failed:', error.message);
    }
}, {
    timezone: 'Asia/Kolkata'
});

// Refresh patterns every day at 6 AM IST (before market opens)
// This runs the full pattern discovery
cron.schedule('0 6 * * *', async () => {
    console.log('🔄 [CRON] Starting daily pattern discovery refresh...');
    try {
        const patterns = await niftyService.discoverTopGainerPatterns();
        console.log(`✅ [CRON] Pattern discovery complete. Found ${patterns.summary.totalBigGainerEvents} big gainer events.`);
    } catch (error) {
        console.error('❌ [CRON] Pattern discovery failed:', error.message);
    }
}, {
    timezone: 'Asia/Kolkata'
});

// Log that schedulers are active
console.log('⏰ Auto-refresh schedulers configured:');
console.log('   - Stock list refresh: Daily at 5:30 AM IST');
console.log('   - Pattern discovery: Daily at 6:00 AM IST');

// Start server
app.listen(port, () => {
    console.log(`Stock Analysis Server listening at http://localhost:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
