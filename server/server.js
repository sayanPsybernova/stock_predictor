const express = require('express');
const cors = require('cors');
const stockRoutes = require('./routes/stock');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
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

// Start server
app.listen(port, () => {
    console.log(`Stock Analysis Server listening at http://localhost:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
