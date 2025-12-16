/**
 * Real-Time Trading Routes
 * WebSocket and REST endpoints for live trading signals
 */

const express = require('express');
const router = express.Router();
const { realTimeService } = require('../services/realTimeSignalService');

// Store active WebSocket connections
const wsClients = new Map();

/**
 * Initialize WebSocket handling
 */
function initializeWebSocket(server) {
    const WebSocket = require('ws');
    const wss = new WebSocket.Server({ server, path: '/ws/trading' });

    console.log('🔌 WebSocket server initialized at /ws/trading');

    wss.on('connection', (ws, req) => {
        const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2);

        console.log(`📱 Client connected: ${clientId}`);

        wsClients.set(clientId, {
            ws,
            symbols: new Set(),
            lastPing: Date.now()
        });

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            clientId,
            message: 'Connected to Real-Time Trading Service',
            timestamp: Date.now()
        }));

        // Handle messages from client
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                await handleClientMessage(clientId, data);
            } catch (error) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message
                }));
            }
        });

        // Handle disconnect
        ws.on('close', () => {
            console.log(`📴 Client disconnected: ${clientId}`);
            const client = wsClients.get(clientId);
            if (client) {
                // Unsubscribe from all symbols
                for (const symbol of client.symbols) {
                    realTimeService.stopStreaming(symbol);
                }
            }
            wsClients.delete(clientId);
        });

        // Handle errors
        ws.on('error', (error) => {
            console.error(`WebSocket error for ${clientId}:`, error.message);
        });

        // Ping/pong for keepalive
        ws.on('pong', () => {
            const client = wsClients.get(clientId);
            if (client) client.lastPing = Date.now();
        });
    });

    // Setup event listeners for real-time service
    realTimeService.on('price', (data) => {
        broadcastToSubscribers(data.symbol, {
            type: 'price',
            ...data
        });
    });

    realTimeService.on('signal', (signal) => {
        broadcastToSubscribers(signal.symbol, {
            type: 'signal',
            ...signal
        });
    });

    // Keepalive ping every 30 seconds
    setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        });
    }, 30000);

    return wss;
}

/**
 * Handle messages from WebSocket clients
 */
async function handleClientMessage(clientId, data) {
    const client = wsClients.get(clientId);
    if (!client) return;

    switch (data.action) {
        case 'subscribe':
            // Subscribe to symbol
            const symbol = await realTimeService.startStreaming(data.symbol);
            client.symbols.add(symbol);

            // Send initial state
            const state = realTimeService.getState(symbol);
            client.ws.send(JSON.stringify({
                type: 'subscribed',
                symbol,
                state
            }));
            break;

        case 'unsubscribe':
            const normalizedSymbol = realTimeService.normalizeSymbol(data.symbol);
            client.symbols.delete(normalizedSymbol);

            // Check if anyone else is subscribed
            let hasOtherSubscribers = false;
            for (const [id, c] of wsClients) {
                if (id !== clientId && c.symbols.has(normalizedSymbol)) {
                    hasOtherSubscribers = true;
                    break;
                }
            }

            if (!hasOtherSubscribers) {
                realTimeService.stopStreaming(normalizedSymbol);
            }

            client.ws.send(JSON.stringify({
                type: 'unsubscribed',
                symbol: normalizedSymbol
            }));
            break;

        case 'enterPosition':
            realTimeService.enterPosition(
                data.symbol,
                data.type, // 'CALL' or 'PUT'
                data.entry,
                data.target,
                data.stopLoss
            );
            client.ws.send(JSON.stringify({
                type: 'positionEntered',
                ...data
            }));
            break;

        case 'exitPosition':
            realTimeService.exitPosition(data.symbol);
            client.ws.send(JSON.stringify({
                type: 'positionExited',
                symbol: data.symbol
            }));
            break;

        case 'getCandles':
            const candles = realTimeService.getCandles(data.symbol, data.count || 100);
            client.ws.send(JSON.stringify({
                type: 'candles',
                symbol: data.symbol,
                candles
            }));
            break;

        case 'getState':
            const currentState = realTimeService.getState(data.symbol);
            client.ws.send(JSON.stringify({
                type: 'state',
                ...currentState
            }));
            break;

        default:
            client.ws.send(JSON.stringify({
                type: 'error',
                message: `Unknown action: ${data.action}`
            }));
    }
}

/**
 * Broadcast message to all subscribers of a symbol
 */
function broadcastToSubscribers(symbol, message) {
    const messageStr = JSON.stringify(message);

    for (const [clientId, client] of wsClients) {
        if (client.symbols.has(symbol) && client.ws.readyState === 1) { // 1 = OPEN
            client.ws.send(messageStr);
        }
    }
}

// ==================== REST API ENDPOINTS ====================

/**
 * GET /api/realtime/start/:symbol
 * Start streaming for a symbol
 */
router.get('/start/:symbol', async (req, res) => {
    try {
        const symbol = await realTimeService.startStreaming(req.params.symbol);
        const state = realTimeService.getState(symbol);

        res.json({
            success: true,
            symbol,
            message: `Started streaming for ${symbol}`,
            state
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/stop/:symbol
 * Stop streaming for a symbol
 */
router.get('/stop/:symbol', (req, res) => {
    try {
        realTimeService.stopStreaming(req.params.symbol);
        res.json({
            success: true,
            message: `Stopped streaming for ${req.params.symbol}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/state/:symbol
 * Get current state for a symbol
 */
router.get('/state/:symbol', (req, res) => {
    try {
        const state = realTimeService.getState(req.params.symbol);
        res.json(state);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/candles/:symbol
 * Get candle data for charting
 */
router.get('/candles/:symbol', (req, res) => {
    try {
        const count = parseInt(req.query.count) || 100;
        const candles = realTimeService.getCandles(req.params.symbol, count);
        res.json({
            symbol: req.params.symbol,
            count: candles.length,
            candles
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/signal/:symbol
 * Get latest trading signal
 */
router.get('/signal/:symbol', async (req, res) => {
    try {
        // Ensure streaming is started
        await realTimeService.startStreaming(req.params.symbol);
        const state = realTimeService.getState(req.params.symbol);

        if (!state.signal) {
            // Wait a bit for signal generation
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const updatedState = realTimeService.getState(req.params.symbol);

        res.json({
            symbol: updatedState.symbol,
            price: updatedState.price,
            signal: updatedState.signal,
            candles: updatedState.candles?.slice(-20) // Last 20 for mini chart
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/realtime/position/enter
 * Enter a trading position
 */
router.post('/position/enter', (req, res) => {
    try {
        const { symbol, type, entry, target, stopLoss } = req.body;

        if (!symbol || !type || !entry) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        realTimeService.enterPosition(symbol, type, entry, target, stopLoss);

        res.json({
            success: true,
            message: `Entered ${type} position for ${symbol}`,
            position: {
                symbol,
                type,
                entry,
                target,
                stopLoss
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/realtime/position/exit
 * Exit a trading position
 */
router.post('/position/exit', (req, res) => {
    try {
        const { symbol } = req.body;
        realTimeService.exitPosition(symbol);

        res.json({
            success: true,
            message: `Exited position for ${symbol}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/realtime/status
 * Get service status
 */
router.get('/status', (req, res) => {
    res.json({
        isRunning: realTimeService.isRunning,
        activeSymbols: Array.from(realTimeService.symbols.keys()),
        connectedClients: wsClients.size
    });
});

module.exports = {
    router,
    initializeWebSocket
};
