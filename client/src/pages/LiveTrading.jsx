import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

// Ultra-smooth Live Candlestick Chart with 60fps animation (no API spam)
function LiveCandleChart({ candles, currentPrice, symbol }) {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

    // Animated price for smooth transitions (local interpolation)
    const displayPriceRef = useRef(currentPrice);
    const targetPriceRef = useRef(currentPrice);
    const velocityRef = useRef(0);

    useEffect(() => {
        if (currentPrice) {
            targetPriceRef.current = currentPrice;
        }
    }, [currentPrice]);

    useEffect(() => {
        const handleResize = () => {
            const container = canvasRef.current?.parentElement;
            if (container) {
                setDimensions({
                    width: container.clientWidth,
                    height: Math.min(500, container.clientWidth * 0.5)
                });
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 60fps animation loop - ALL local, NO API calls
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        const animate = () => {
            // Smooth spring-based price interpolation (local only)
            const target = targetPriceRef.current || 0;
            const current = displayPriceRef.current || target;

            if (target && current) {
                const diff = target - current;
                // Spring physics for smooth animation
                velocityRef.current = velocityRef.current * 0.8 + diff * 0.1;
                displayPriceRef.current = current + velocityRef.current;

                // Add micro-jitter for realistic market feel (local simulation)
                const microJitter = (Math.random() - 0.5) * 0.02 * Math.abs(current * 0.0001);
                const displayPrice = displayPriceRef.current + microJitter;

                renderChart(ctx, canvas.width, canvas.height, displayPrice);
            } else {
                renderChart(ctx, canvas.width, canvas.height, null);
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [candles, dimensions, symbol]);

    const renderChart = (ctx, width, height, animatedPrice) => {
        const padding = { top: 30, right: 80, bottom: 40, left: 20 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Clear canvas with dark gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#0f0f1a');
        gradient.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        if (candles.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Waiting for market data...', width / 2, height / 2);

            // Animated loading dots
            const dots = Math.floor(Date.now() / 300) % 4;
            ctx.fillText('.'.repeat(dots), width / 2 + 120, height / 2);

            ctx.fillStyle = '#888';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(symbol, padding.left, 20);
            return;
        }

        // Calculate price range
        const prices = candles.flatMap(c => [c.high, c.low]);
        if (animatedPrice) prices.push(animatedPrice);
        const minPrice = Math.min(...prices) * 0.9995;
        const maxPrice = Math.max(...prices) * 1.0005;
        const priceRange = maxPrice - minPrice;

        // Scale functions
        const scaleX = (index) => padding.left + (index / candles.length) * chartWidth;
        const scaleY = (price) => padding.top + (1 - (price - minPrice) / priceRange) * chartHeight;

        // Draw grid lines
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 6; i++) {
            const y = padding.top + (i / 6) * chartHeight;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            const price = maxPrice - (i / 6) * priceRange;
            ctx.fillStyle = '#555';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(price.toFixed(2), width - padding.right + 5, y + 3);
        }

        // Draw candles with glow effect
        const candleWidth = Math.max(3, (chartWidth / candles.length) - 2);
        candles.forEach((candle, index) => {
            const x = scaleX(index);
            const open = scaleY(candle.open);
            const close = scaleY(candle.close);
            const high = scaleY(candle.high);
            const low = scaleY(candle.low);
            const isGreen = candle.close >= candle.open;

            // Glow effect for recent candles
            const isRecent = index >= candles.length - 3;
            if (isRecent) {
                ctx.shadowColor = isGreen ? '#22c55e' : '#ef4444';
                ctx.shadowBlur = 8;
            }

            // Wick
            ctx.strokeStyle = isGreen ? '#22c55e' : '#ef4444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + candleWidth / 2, high);
            ctx.lineTo(x + candleWidth / 2, low);
            ctx.stroke();

            // Body
            ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
            const bodyTop = Math.min(open, close);
            const bodyHeight = Math.max(1, Math.abs(close - open));
            ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);

            ctx.shadowBlur = 0;
        });

        // Animated current price line with pulsing effect
        if (animatedPrice) {
            const priceY = scaleY(animatedPrice);
            const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;

            // Glow
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 10 * pulse;

            ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(padding.left, priceY);
            ctx.lineTo(width - padding.right, priceY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;

            // Current price label
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(width - padding.right, priceY - 12, 75, 24);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(animatedPrice.toFixed(2), width - padding.right + 8, priceY + 4);

            // Animated tick indicator
            const tickPulse = Math.sin(Date.now() / 100) > 0;
            ctx.fillStyle = tickPulse ? '#22c55e' : '#ef4444';
            ctx.fillRect(width - padding.right - 5, priceY - 3, 3, 6);
        }

        // Live timestamp with milliseconds
        ctx.fillStyle = '#666';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0'), width - padding.right, height - 10);

        // Symbol with live indicator
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(symbol, padding.left, 20);

        // Pulsing live dot
        const livePulse = Math.sin(Date.now() / 300) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(34, 197, 94, ${livePulse})`;
        ctx.beginPath();
        ctx.arc(padding.left + ctx.measureText(symbol).width + 15, 15, 5, 0, Math.PI * 2);
        ctx.fill();
    };

    return (
        <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            className="rounded-lg"
            style={{ imageRendering: 'crisp-edges' }}
        />
    );
}

// Real-time Price Ticker with animation
function PriceTicker({ price, change, changePercent, high, low, loading, tickDirection, apiCallsPerMin }) {
    const isPositive = change >= 0;
    const [flash, setFlash] = useState(null);
    const [displayPrice, setDisplayPrice] = useState(price);

    // Smooth price animation (local)
    useEffect(() => {
        if (!price) return;

        let animationId;
        const animate = () => {
            setDisplayPrice(prev => {
                if (!prev) return price;
                const diff = price - prev;
                if (Math.abs(diff) < 0.01) return price;
                return prev + diff * 0.2;
            });
            animationId = requestAnimationFrame(animate);
        };
        animationId = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animationId);
    }, [price]);

    useEffect(() => {
        if (tickDirection) {
            setFlash(tickDirection);
            const timer = setTimeout(() => setFlash(null), 200);
            return () => clearTimeout(timer);
        }
    }, [tickDirection, price]);

    if (loading) {
        return (
            <div className="bg-gray-800/50 rounded-lg p-4 animate-pulse">
                <div className="h-10 bg-gray-700 rounded w-1/3"></div>
            </div>
        );
    }

    const flashClass = flash === 'up' ? 'bg-green-500/30' : flash === 'down' ? 'bg-red-500/30' : '';

    return (
        <div className={`bg-gray-800/50 rounded-lg p-4 flex items-center justify-between transition-colors duration-150 ${flashClass}`}>
            <div className="flex items-center gap-4">
                <div>
                    <div className={`text-4xl font-bold font-mono transition-all duration-100 ${
                        flash === 'up' ? 'text-green-400 scale-105' :
                        flash === 'down' ? 'text-red-400 scale-105' : 'text-white'
                    }`}>
                        {displayPrice?.toFixed(2) || '—'}
                    </div>
                    <div className={`flex items-center gap-2 text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        <span className="animate-pulse">{isPositive ? '▲' : '▼'}</span>
                        <span>{Math.abs(change || 0).toFixed(2)}</span>
                        <span>({Math.abs(changePercent || 0).toFixed(2)}%)</span>
                    </div>
                </div>
                {/* Live indicator */}
                <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 rounded text-green-400 text-xs">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    LIVE
                </div>
            </div>
            <div className="flex gap-6 text-sm">
                <div>
                    <div className="text-gray-400">High</div>
                    <div className="font-mono text-green-400">{high?.toFixed(2) || '—'}</div>
                </div>
                <div>
                    <div className="text-gray-400">Low</div>
                    <div className="font-mono text-red-400">{low?.toFixed(2) || '—'}</div>
                </div>
                <div>
                    <div className="text-gray-400">API/min</div>
                    <div className="font-mono text-cyan-400">{apiCallsPerMin || '~60'}</div>
                </div>
            </div>
        </div>
    );
}

// Signal Card Component
function SignalCard({ signal, onEnterPosition, onExitPosition, position, loading }) {
    if (loading) {
        return (
            <div className="border-2 border-gray-600 bg-gray-800/30 rounded-xl p-4 animate-pulse">
                <div className="h-8 bg-gray-700 rounded mb-3"></div>
                <div className="h-20 bg-gray-700 rounded mb-3"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
            </div>
        );
    }

    if (!signal) {
        return (
            <div className="border-2 border-gray-600 bg-gray-800/30 rounded-xl p-4 text-center">
                <div className="text-gray-400 mb-2">Analyzing market...</div>
                <div className="text-sm text-gray-500">Signal generating every 30 seconds</div>
            </div>
        );
    }

    const getSignalColor = () => {
        if (signal.action === 'EXIT') return 'border-yellow-500 bg-yellow-500/10';
        if (signal.action === 'BUY' && signal.optionType === 'CALL') return 'border-green-500 bg-green-500/10';
        if (signal.action === 'BUY' && signal.optionType === 'PUT') return 'border-red-500 bg-red-500/10';
        return 'border-gray-500 bg-gray-500/10';
    };

    const getActionIcon = () => {
        if (signal.action === 'EXIT') return '🚪';
        if (signal.action === 'BUY' && signal.optionType === 'CALL') return '📈';
        if (signal.action === 'BUY' && signal.optionType === 'PUT') return '📉';
        return '⏳';
    };

    return (
        <div className={`border-2 ${getSignalColor()} rounded-xl p-4 space-y-3`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{getActionIcon()}</span>
                    <div>
                        <div className="font-bold text-lg">
                            {signal.action === 'WAIT' ? 'WAIT' : `${signal.action} ${signal.optionType || ''}`}
                        </div>
                        <div className="text-xs text-gray-400">Confidence: {signal.confidence}</div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold">{signal.score}</div>
                    <div className="text-xs text-gray-400">Score</div>
                </div>
            </div>

            {signal.target && (
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="bg-gray-800/50 rounded p-2">
                        <div className="text-gray-400 text-xs">Entry</div>
                        <div className="font-bold">{signal.price?.toFixed(2)}</div>
                    </div>
                    <div className="bg-green-500/20 rounded p-2">
                        <div className="text-green-400 text-xs">Target</div>
                        <div className="font-bold text-green-400">{signal.target?.toFixed(2)}</div>
                    </div>
                    <div className="bg-red-500/20 rounded p-2">
                        <div className="text-red-400 text-xs">Stop Loss</div>
                        <div className="font-bold text-red-400">{signal.stopLoss?.toFixed(2)}</div>
                    </div>
                </div>
            )}

            {signal.indicators && (
                <div className="grid grid-cols-5 gap-1 text-xs">
                    <div className="bg-gray-800/50 rounded p-1.5 text-center">
                        <div className="text-gray-400">RSI</div>
                        <div className={`font-bold ${signal.indicators?.rsi < 30 ? 'text-green-400' : signal.indicators?.rsi > 70 ? 'text-red-400' : ''}`}>
                            {signal.indicators?.rsi?.toFixed(0) || '—'}
                        </div>
                    </div>
                    <div className="bg-gray-800/50 rounded p-1.5 text-center">
                        <div className="text-gray-400">MACD</div>
                        <div className={`font-bold ${signal.indicators?.macd > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {signal.indicators?.macd?.toFixed(1) || '—'}
                        </div>
                    </div>
                    <div className="bg-gray-800/50 rounded p-1.5 text-center">
                        <div className="text-gray-400">Stoch</div>
                        <div className="font-bold">{signal.indicators?.stochastic?.toFixed(0) || '—'}</div>
                    </div>
                    <div className="bg-gray-800/50 rounded p-1.5 text-center">
                        <div className="text-gray-400">Trend</div>
                        <div className={`font-bold text-xs ${signal.indicators?.trend === 'BULLISH' ? 'text-green-400' : signal.indicators?.trend === 'BEARISH' ? 'text-red-400' : ''}`}>
                            {signal.indicators?.trend?.slice(0, 4) || '—'}
                        </div>
                    </div>
                    <div className="bg-gray-800/50 rounded p-1.5 text-center">
                        <div className="text-gray-400">VWAP</div>
                        <div className="font-bold">{signal.indicators?.vwap?.toFixed(0) || '—'}</div>
                    </div>
                </div>
            )}

            {signal.reasons && signal.reasons.length > 0 && (
                <div className="space-y-1">
                    <div className="text-xs text-gray-400">Analysis:</div>
                    {signal.reasons?.slice(0, 3).map((reason, i) => (
                        <div key={i} className="text-xs bg-gray-800/30 rounded px-2 py-1">• {reason}</div>
                    ))}
                </div>
            )}

            {!position && signal.action === 'BUY' && (
                <button
                    onClick={() => onEnterPosition(signal)}
                    className={`w-full py-2 rounded-lg font-bold ${
                        signal.optionType === 'CALL' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'
                    } transition-colors`}
                >
                    Enter {signal.optionType} Position
                </button>
            )}

            {position && (
                <button onClick={() => onExitPosition()} className="w-full py-2 rounded-lg font-bold bg-yellow-600 hover:bg-yellow-500 transition-colors">
                    Exit Position
                </button>
            )}

            {signal.timestamp && (
                <div className="text-xs text-gray-500 text-center">
                    Last updated: {new Date(signal.timestamp).toLocaleTimeString()}
                </div>
            )}
        </div>
    );
}

// Position Card Component
function PositionCard({ position, currentPrice }) {
    if (!position) return null;

    const pnl = position.type === 'CALL' ? currentPrice - position.entry : position.entry - currentPrice;
    const pnlPercent = (pnl / position.entry) * 100;
    const isProfit = pnl >= 0;

    return (
        <div className={`border-2 ${isProfit ? 'border-green-500' : 'border-red-500'} rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-3">
                <div className="font-bold">Active: {position.type}</div>
                <div className={`font-mono font-bold text-lg ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                    {isProfit ? '+' : ''}{pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-gray-800/50 rounded p-2 text-center">
                    <div className="text-gray-400">Entry</div>
                    <div className="font-mono">{position.entry.toFixed(2)}</div>
                </div>
                <div className="bg-gray-800/50 rounded p-2 text-center">
                    <div className="text-gray-400">Target</div>
                    <div className="font-mono text-green-400">{position.target?.toFixed(2) || '—'}</div>
                </div>
                <div className="bg-gray-800/50 rounded p-2 text-center">
                    <div className="text-gray-400">Stop Loss</div>
                    <div className="font-mono text-red-400">{position.stopLoss?.toFixed(2) || '—'}</div>
                </div>
            </div>
        </div>
    );
}

// Main Live Trading Page
function LiveTrading() {
    const [symbol, setSymbol] = useState('NIFTY');
    const [inputSymbol, setInputSymbol] = useState('NIFTY');
    const [candles, setCandles] = useState([]);
    const [priceData, setPriceData] = useState({});
    const [signal, setSignal] = useState(null);
    const [position, setPosition] = useState(null);
    const [countdown, setCountdown] = useState(30);
    const [loading, setLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [tickDirection, setTickDirection] = useState(null);
    const [apiCalls, setApiCalls] = useState(0);

    const priceIntervalRef = useRef(null);
    const signalIntervalRef = useRef(null);
    const lastPriceRef = useRef(null);
    const basePriceRef = useRef(null);

    // Fetch initial data via REST API
    const fetchSignalData = useCallback(async (sym) => {
        try {
            setLoading(true);
            setError(null);

            // Start streaming on server
            await axios.get(`${API_URL}/realtime/start/${sym}`);

            // Get signal
            const signalRes = await axios.get(`${API_URL}/realtime/signal/${sym}`);

            if (signalRes.data) {
                const newPrice = signalRes.data.price;
                basePriceRef.current = basePriceRef.current || newPrice;

                setPriceData(prev => ({
                    price: newPrice,
                    change: basePriceRef.current ? newPrice - basePriceRef.current : 0,
                    changePercent: basePriceRef.current ? ((newPrice - basePriceRef.current) / basePriceRef.current) * 100 : 0,
                    high: Math.max(prev.high || newPrice, newPrice),
                    low: prev.low ? Math.min(prev.low, newPrice) : newPrice
                }));

                if (signalRes.data.signal) {
                    setSignal(signalRes.data.signal);
                    setCountdown(30);
                }

                if (signalRes.data.candles) {
                    setCandles(signalRes.data.candles);
                }
            }

            // Get candles
            const candlesRes = await axios.get(`${API_URL}/realtime/candles/${sym}?count=100`);
            if (candlesRes.data?.candles) {
                setCandles(candlesRes.data.candles);
            }

            setIsConnected(true);
            setApiCalls(prev => prev + 3); // 3 API calls

        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.message || 'Failed to fetch data');
            setIsConnected(false);
        } finally {
            setLoading(false);
        }
    }, []);

    // Price update - ONLY 1 call per second (60 per minute)
    const updatePrice = useCallback(async (sym) => {
        try {
            const res = await axios.get(`${API_URL}/realtime/state/${sym}`);
            setApiCalls(prev => prev + 1);

            if (res.data?.price) {
                const newPrice = res.data.price;
                const prevPrice = lastPriceRef.current || newPrice;
                lastPriceRef.current = newPrice;

                // Determine tick direction
                if (newPrice > prevPrice + 0.01) {
                    setTickDirection('up');
                } else if (newPrice < prevPrice - 0.01) {
                    setTickDirection('down');
                }

                setPriceData(prev => ({
                    price: newPrice,
                    change: basePriceRef.current ? newPrice - basePriceRef.current : 0,
                    changePercent: basePriceRef.current ? ((newPrice - basePriceRef.current) / basePriceRef.current) * 100 : 0,
                    high: Math.max(prev.high || newPrice, newPrice),
                    low: prev.low ? Math.min(prev.low, newPrice) : newPrice
                }));

                // Update candles only if available
                if (res.data.candles && res.data.candles.length > 0) {
                    setCandles(res.data.candles);
                }
            }
        } catch (err) {
            // Silent fail
        }
    }, []);

    // Handle Track button
    const handleTrack = async () => {
        const sym = inputSymbol.toUpperCase();
        setSymbol(sym);
        setCandles([]);
        setPriceData({});
        setSignal(null);
        setError(null);
        setApiCalls(0);
        lastPriceRef.current = null;
        basePriceRef.current = null;

        // Clear existing intervals
        if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
        if (signalIntervalRef.current) clearInterval(signalIntervalRef.current);

        // Fetch initial data
        await fetchSignalData(sym);

        // Price updates every 1 second (60 API calls/minute - much better!)
        priceIntervalRef.current = setInterval(() => updatePrice(sym), 1000);

        // Signal updates every 30 seconds
        signalIntervalRef.current = setInterval(() => fetchSignalData(sym), 30000);
    };

    // Cleanup
    useEffect(() => {
        return () => {
            if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
            if (signalIntervalRef.current) clearInterval(signalIntervalRef.current);
        };
    }, []);

    // Countdown timer
    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => prev > 0 ? prev - 1 : 30);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Auto-track on mount
    useEffect(() => {
        handleTrack();
    }, []);

    // Enter position
    const handleEnterPosition = async (sig) => {
        try {
            await axios.post(`${API_URL}/realtime/position/enter`, {
                symbol,
                type: sig.optionType,
                entry: sig.price,
                target: sig.target,
                stopLoss: sig.stopLoss
            });
            setPosition({
                type: sig.optionType,
                entry: sig.price,
                target: sig.target,
                stopLoss: sig.stopLoss
            });
        } catch (err) {
            console.error('Enter position error:', err);
        }
    };

    // Exit position
    const handleExitPosition = async () => {
        try {
            await axios.post(`${API_URL}/realtime/position/exit`, { symbol });
            setPosition(null);
        } catch (err) {
            console.error('Exit position error:', err);
        }
    };

    return (
        <div className="container mx-auto p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <span className="text-3xl">📊</span>
                    Live Trading Signals
                </h1>
                <div className="flex items-center gap-4">
                    <div className="text-xs text-gray-400 bg-gray-800/50 px-2 py-1 rounded">
                        API calls: <span className="text-cyan-400 font-mono">{apiCalls}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-sm text-gray-400">
                            {isConnected ? 'Live' : loading ? 'Connecting...' : 'Disconnected'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-900/50 border border-red-500 rounded-lg p-3 text-red-300 text-sm">
                    {error} - Make sure the server is running on port 5000
                </div>
            )}

            {/* Symbol Selector */}
            <div className="flex gap-2">
                <select
                    value={inputSymbol}
                    onChange={(e) => setInputSymbol(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-cyan-500 outline-none"
                >
                    <option value="NIFTY">NIFTY 50</option>
                    <option value="BANKNIFTY">BANK NIFTY</option>
                    <option value="RELIANCE">RELIANCE</option>
                    <option value="TCS">TCS</option>
                    <option value="HDFCBANK">HDFC BANK</option>
                    <option value="INFY">INFOSYS</option>
                    <option value="ICICIBANK">ICICI BANK</option>
                    <option value="SBIN">SBI</option>
                </select>
                <input
                    type="text"
                    value={inputSymbol}
                    onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
                    placeholder="Or type symbol..."
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:border-cyan-500 outline-none flex-1"
                />
                <button
                    onClick={handleTrack}
                    disabled={loading}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 px-6 py-2 rounded-lg font-bold transition-colors"
                >
                    {loading ? 'Loading...' : 'Track'}
                </button>
            </div>

            {/* Price Ticker */}
            <PriceTicker {...priceData} loading={loading && !priceData.price} tickDirection={tickDirection} apiCallsPerMin="~60" />

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Chart */}
                <div className="lg:col-span-2 bg-gray-800/30 rounded-xl p-2">
                    <div className="flex items-center justify-between mb-2 px-2">
                        <div className="font-bold flex items-center gap-2">
                            {symbol} - Real-Time Chart
                            <span className="text-xs px-2 py-0.5 bg-cyan-600/30 text-cyan-400 rounded">60 FPS</span>
                        </div>
                        <div className="text-sm text-gray-400">
                            Next signal: <span className="text-cyan-400 font-mono">{countdown}s</span>
                        </div>
                    </div>
                    <LiveCandleChart
                        candles={candles}
                        currentPrice={priceData.price}
                        symbol={symbol}
                    />
                </div>

                {/* Signal Panel */}
                <div className="space-y-4">
                    <PositionCard position={position} currentPrice={priceData.price} />
                    <SignalCard
                        signal={signal}
                        position={position}
                        onEnterPosition={handleEnterPosition}
                        onExitPosition={handleExitPosition}
                        loading={loading && !signal}
                    />

                    {signal?.levels && (
                        <div className="bg-gray-800/30 rounded-xl p-4">
                            <div className="font-bold mb-2">Key Levels</div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Resistance</span>
                                    <span className="text-red-400 font-mono">{signal.levels.resistance?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">R1</span>
                                    <span className="text-orange-400 font-mono">{signal.levels.r1?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between bg-yellow-500/20 rounded px-2 py-1">
                                    <span className="text-yellow-400">Current</span>
                                    <span className="text-yellow-400 font-mono font-bold">{priceData.price?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">S1</span>
                                    <span className="text-cyan-400 font-mono">{signal.levels.s1?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Support</span>
                                    <span className="text-green-400 font-mono">{signal.levels.support?.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Disclaimer */}
            <div className="text-xs text-gray-500 text-center p-4 border-t border-gray-800">
                ⚠️ Trading signals are for educational purposes only. Not financial advice.
                Past performance does not guarantee future results. Trade at your own risk.
            </div>
        </div>
    );
}

export default LiveTrading;
