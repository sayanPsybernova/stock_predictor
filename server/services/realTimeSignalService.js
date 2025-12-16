/**
 * Real-Time Trading Signal Service
 *
 * Features:
 * - Live price updates every 1 second
 * - Trading signals every 30 seconds
 * - BUY/EXIT signals for CALL/PUT options
 * - Live candlestick data streaming
 */

const EventEmitter = require('events');

// Try to load yahoo-finance2
let yahooFinance = null;
try {
    const YahooFinance = require('yahoo-finance2').default;
    yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
} catch (e) {
    console.log('Yahoo Finance not available, using simulation mode');
}

class RealTimeSignalService extends EventEmitter {
    constructor() {
        super();
        this.isRunning = false;
        this.symbols = new Map(); // symbol -> { data, subscribers }
        this.priceHistory = new Map(); // symbol -> array of OHLCV
        this.positions = new Map(); // symbol -> { type: 'CALL'|'PUT', entry, target, stopLoss }
        this.signals = new Map(); // symbol -> latest signal

        // Intervals
        this.priceInterval = null; // 1 second
        this.signalInterval = null; // 30 seconds
        this.candleInterval = null; // 1 second candle updates

        // Signal thresholds
        this.THRESHOLDS = {
            STRONG_BUY: 75,
            BUY: 60,
            HOLD: 40,
            SELL: 30,
            STRONG_SELL: 20
        };
    }

    /**
     * Start real-time streaming for a symbol
     */
    async startStreaming(symbol) {
        const normalizedSymbol = this.normalizeSymbol(symbol);

        if (!this.symbols.has(normalizedSymbol)) {
            this.symbols.set(normalizedSymbol, {
                lastPrice: 0,
                lastUpdate: null,
                subscribers: new Set(),
                candles: [],
                indicators: {}
            });

            // Initialize price history
            await this.initializePriceHistory(normalizedSymbol);
        }

        // Start streaming if not already running
        if (!this.isRunning) {
            this.startIntervals();
        }

        return normalizedSymbol;
    }

    /**
     * Stop streaming for a symbol
     */
    stopStreaming(symbol) {
        const normalizedSymbol = this.normalizeSymbol(symbol);
        this.symbols.delete(normalizedSymbol);
        this.priceHistory.delete(normalizedSymbol);

        if (this.symbols.size === 0) {
            this.stopIntervals();
        }
    }

    /**
     * Normalize symbol for Yahoo Finance
     */
    normalizeSymbol(symbol) {
        const upper = symbol.toUpperCase();
        if (upper === 'NIFTY' || upper === 'NIFTY50') return '^NSEI';
        if (upper === 'BANKNIFTY' || upper === 'NIFTYBANK') return '^NSEBANK';
        if (upper === 'SENSEX') return '^BSESN';
        if (!upper.includes('.') && !upper.startsWith('^')) return `${upper}.NS`;
        return upper;
    }

    /**
     * Initialize historical price data
     */
    async initializePriceHistory(symbol) {
        try {
            let history = [];

            if (yahooFinance) {
                const data = await yahooFinance.chart(symbol, {
                    period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days
                    interval: '1m'
                });

                if (data && data.quotes) {
                    history = data.quotes.map(q => ({
                        time: new Date(q.date).getTime(),
                        open: q.open,
                        high: q.high,
                        low: q.low,
                        close: q.close,
                        volume: q.volume || 0
                    })).filter(c => c.open && c.close);
                }
            }

            // If no data, generate simulated history
            if (history.length === 0) {
                history = this.generateSimulatedHistory(symbol);
            }

            this.priceHistory.set(symbol, history);

            // Set initial price
            if (history.length > 0) {
                const symbolData = this.symbols.get(symbol);
                if (symbolData) {
                    symbolData.lastPrice = history[history.length - 1].close;
                }
            }

            console.log(`📊 Initialized ${history.length} candles for ${symbol}`);

        } catch (error) {
            console.error(`Error initializing history for ${symbol}:`, error.message);
            this.priceHistory.set(symbol, this.generateSimulatedHistory(symbol));
        }
    }

    /**
     * Generate simulated price history
     */
    generateSimulatedHistory(symbol) {
        const history = [];
        let basePrice = symbol.includes('NSEI') ? 24500 :
                       symbol.includes('NSEBANK') ? 52000 : 1000;

        const now = Date.now();
        const candleCount = 300; // 5 hours of 1-min candles

        for (let i = candleCount; i > 0; i--) {
            const time = now - (i * 60 * 1000);
            const volatility = basePrice * 0.001;

            const open = basePrice + (Math.random() - 0.5) * volatility;
            const close = open + (Math.random() - 0.5) * volatility;
            const high = Math.max(open, close) + Math.random() * volatility * 0.5;
            const low = Math.min(open, close) - Math.random() * volatility * 0.5;

            history.push({
                time,
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2)),
                volume: Math.floor(Math.random() * 100000) + 10000
            });

            basePrice = close;
        }

        return history;
    }

    /**
     * Start all intervals
     */
    startIntervals() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('🚀 Starting real-time streaming...');

        // Price update every 1 second
        this.priceInterval = setInterval(() => this.updatePrices(), 1000);

        // Signal generation every 30 seconds
        this.signalInterval = setInterval(() => this.generateSignals(), 30000);

        // Generate initial signals
        setTimeout(() => this.generateSignals(), 2000);
    }

    /**
     * Stop all intervals
     */
    stopIntervals() {
        this.isRunning = false;

        if (this.priceInterval) clearInterval(this.priceInterval);
        if (this.signalInterval) clearInterval(this.signalInterval);

        console.log('⏹️ Stopped real-time streaming');
    }

    /**
     * Update prices for all symbols (every 1 second)
     */
    async updatePrices() {
        for (const [symbol, data] of this.symbols) {
            try {
                const newPrice = await this.fetchLatestPrice(symbol);
                const history = this.priceHistory.get(symbol) || [];

                // Update or create current candle
                const now = Date.now();
                const currentMinute = Math.floor(now / 60000) * 60000;

                let currentCandle = history.find(c =>
                    Math.floor(c.time / 60000) * 60000 === currentMinute
                );

                if (!currentCandle) {
                    // New minute candle
                    currentCandle = {
                        time: currentMinute,
                        open: newPrice,
                        high: newPrice,
                        low: newPrice,
                        close: newPrice,
                        volume: Math.floor(Math.random() * 10000)
                    };
                    history.push(currentCandle);

                    // Keep only last 500 candles
                    if (history.length > 500) {
                        history.shift();
                    }
                } else {
                    // Update existing candle
                    currentCandle.high = Math.max(currentCandle.high, newPrice);
                    currentCandle.low = Math.min(currentCandle.low, newPrice);
                    currentCandle.close = newPrice;
                    currentCandle.volume += Math.floor(Math.random() * 1000);
                }

                // Calculate price change
                const prevPrice = data.lastPrice || newPrice;
                const change = newPrice - prevPrice;
                const changePercent = prevPrice ? (change / prevPrice) * 100 : 0;

                // Update symbol data
                data.lastPrice = newPrice;
                data.lastUpdate = now;
                data.change = change;
                data.changePercent = changePercent;

                // Emit price update
                this.emit('price', {
                    symbol,
                    price: newPrice,
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(changePercent.toFixed(2)),
                    high: currentCandle.high,
                    low: currentCandle.low,
                    open: currentCandle.open,
                    volume: currentCandle.volume,
                    timestamp: now,
                    candle: currentCandle
                });

            } catch (error) {
                console.error(`Price update error for ${symbol}:`, error.message);
            }
        }
    }

    /**
     * Fetch latest price for symbol
     */
    async fetchLatestPrice(symbol) {
        const data = this.symbols.get(symbol);
        const history = this.priceHistory.get(symbol) || [];
        const lastCandle = history[history.length - 1];
        const basePrice = lastCandle?.close || data?.lastPrice || 24500;

        try {
            if (yahooFinance) {
                const quote = await yahooFinance.quote(symbol);
                if (quote && quote.regularMarketPrice) {
                    return quote.regularMarketPrice;
                }
            }
        } catch (e) {
            // Fall through to simulation
        }

        // Simulate realistic price movement
        const volatility = basePrice * 0.0002; // 0.02% per second
        const trend = Math.sin(Date.now() / 30000) * volatility; // Slight trend
        const noise = (Math.random() - 0.5) * volatility * 2;

        return parseFloat((basePrice + trend + noise).toFixed(2));
    }

    /**
     * Generate trading signals (every 30 seconds)
     */
    async generateSignals() {
        for (const [symbol, data] of this.symbols) {
            try {
                const history = this.priceHistory.get(symbol) || [];
                if (history.length < 20) continue;

                // Calculate indicators
                const indicators = this.calculateIndicators(history);
                data.indicators = indicators;

                // Generate signal
                const signal = this.generateTradingSignal(symbol, indicators, data.lastPrice);

                // Store signal
                this.signals.set(symbol, signal);

                // Emit signal
                this.emit('signal', signal);

                console.log(`📈 Signal for ${symbol}: ${signal.action} ${signal.optionType || ''} | Score: ${signal.score}`);

            } catch (error) {
                console.error(`Signal generation error for ${symbol}:`, error.message);
            }
        }
    }

    /**
     * Calculate technical indicators from price history
     */
    calculateIndicators(history) {
        const closes = history.map(c => c.close);
        const highs = history.map(c => c.high);
        const lows = history.map(c => c.low);
        const volumes = history.map(c => c.volume);

        // RSI (14 period)
        const rsi = this.calculateRSI(closes, 14);

        // MACD
        const macd = this.calculateMACD(closes);

        // Moving Averages
        const sma20 = this.calculateSMA(closes, 20);
        const ema9 = this.calculateEMA(closes, 9);
        const ema21 = this.calculateEMA(closes, 21);

        // Bollinger Bands
        const bb = this.calculateBollingerBands(closes, 20, 2);

        // Stochastic
        const stoch = this.calculateStochastic(closes, highs, lows, 14);

        // VWAP
        const vwap = this.calculateVWAP(closes, volumes);

        // Trend strength
        const trendStrength = this.calculateTrendStrength(closes);

        // Support/Resistance
        const levels = this.calculateSupportResistance(highs, lows, closes);

        return {
            rsi,
            macd,
            sma20,
            ema9,
            ema21,
            bollingerBands: bb,
            stochastic: stoch,
            vwap,
            trendStrength,
            supportResistance: levels,
            lastClose: closes[closes.length - 1]
        };
    }

    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return 50;

        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;

        return parseFloat((100 - (100 / (1 + rs))).toFixed(2));
    }

    calculateMACD(closes) {
        const ema12 = this.calculateEMA(closes, 12);
        const ema26 = this.calculateEMA(closes, 26);
        const macdLine = ema12 - ema26;

        // Signal line (9-period EMA of MACD)
        const macdHistory = [];
        for (let i = 26; i < closes.length; i++) {
            const e12 = this.calculateEMA(closes.slice(0, i + 1), 12);
            const e26 = this.calculateEMA(closes.slice(0, i + 1), 26);
            macdHistory.push(e12 - e26);
        }

        const signalLine = macdHistory.length >= 9 ?
            this.calculateEMA(macdHistory, 9) : macdLine;

        return {
            macd: parseFloat(macdLine.toFixed(2)),
            signal: parseFloat(signalLine.toFixed(2)),
            histogram: parseFloat((macdLine - signalLine).toFixed(2))
        };
    }

    calculateSMA(values, period) {
        if (values.length < period) return values[values.length - 1];
        const slice = values.slice(-period);
        return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
    }

    calculateEMA(values, period) {
        if (values.length < period) return values[values.length - 1];

        const multiplier = 2 / (period + 1);
        let ema = this.calculateSMA(values.slice(0, period), period);

        for (let i = period; i < values.length; i++) {
            ema = (values[i] - ema) * multiplier + ema;
        }

        return parseFloat(ema.toFixed(2));
    }

    calculateBollingerBands(closes, period = 20, stdDev = 2) {
        const sma = this.calculateSMA(closes, period);
        const slice = closes.slice(-period);
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
        const std = Math.sqrt(variance);

        return {
            upper: parseFloat((sma + stdDev * std).toFixed(2)),
            middle: sma,
            lower: parseFloat((sma - stdDev * std).toFixed(2)),
            width: parseFloat(((stdDev * std * 2) / sma * 100).toFixed(2))
        };
    }

    calculateStochastic(closes, highs, lows, period = 14) {
        const recentCloses = closes.slice(-period);
        const recentHighs = highs.slice(-period);
        const recentLows = lows.slice(-period);

        const highestHigh = Math.max(...recentHighs);
        const lowestLow = Math.min(...recentLows);
        const currentClose = closes[closes.length - 1];

        const k = highestHigh === lowestLow ? 50 :
            ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

        return {
            k: parseFloat(k.toFixed(2)),
            d: parseFloat(k.toFixed(2)) // Simplified
        };
    }

    calculateVWAP(closes, volumes) {
        let cumVolume = 0;
        let cumPV = 0;

        for (let i = 0; i < closes.length; i++) {
            cumPV += closes[i] * volumes[i];
            cumVolume += volumes[i];
        }

        return parseFloat((cumPV / cumVolume).toFixed(2));
    }

    calculateTrendStrength(closes) {
        if (closes.length < 20) return 0;

        const sma5 = this.calculateSMA(closes, 5);
        const sma20 = this.calculateSMA(closes, 20);
        const current = closes[closes.length - 1];

        // Trend direction and strength
        const shortTrend = (current - sma5) / sma5 * 100;
        const longTrend = (sma5 - sma20) / sma20 * 100;

        return {
            direction: longTrend > 0 ? 'BULLISH' : longTrend < 0 ? 'BEARISH' : 'NEUTRAL',
            strength: parseFloat(Math.abs(longTrend).toFixed(2)),
            shortTerm: parseFloat(shortTrend.toFixed(2)),
            longTerm: parseFloat(longTrend.toFixed(2))
        };
    }

    calculateSupportResistance(highs, lows, closes) {
        const recentHighs = highs.slice(-50);
        const recentLows = lows.slice(-50);
        const current = closes[closes.length - 1];

        // Find pivot highs and lows
        const resistance = Math.max(...recentHighs);
        const support = Math.min(...recentLows);

        // Calculate intermediate levels
        const r1 = current + (resistance - current) * 0.382;
        const s1 = current - (current - support) * 0.382;

        return {
            resistance: parseFloat(resistance.toFixed(2)),
            support: parseFloat(support.toFixed(2)),
            r1: parseFloat(r1.toFixed(2)),
            s1: parseFloat(s1.toFixed(2))
        };
    }

    /**
     * Generate trading signal with BUY/EXIT recommendations
     */
    generateTradingSignal(symbol, indicators, currentPrice) {
        let score = 50; // Neutral starting point
        const reasons = [];

        // RSI Analysis (weight: 20)
        if (indicators.rsi < 30) {
            score += 15;
            reasons.push(`RSI oversold (${indicators.rsi}) - Bullish reversal likely`);
        } else if (indicators.rsi > 70) {
            score -= 15;
            reasons.push(`RSI overbought (${indicators.rsi}) - Bearish reversal likely`);
        } else if (indicators.rsi > 50) {
            score += 5;
            reasons.push(`RSI bullish (${indicators.rsi})`);
        } else {
            score -= 5;
            reasons.push(`RSI bearish (${indicators.rsi})`);
        }

        // MACD Analysis (weight: 20)
        if (indicators.macd.histogram > 0) {
            score += 10;
            if (indicators.macd.macd > indicators.macd.signal) {
                score += 5;
                reasons.push('MACD bullish crossover');
            }
        } else {
            score -= 10;
            if (indicators.macd.macd < indicators.macd.signal) {
                score -= 5;
                reasons.push('MACD bearish crossover');
            }
        }

        // Moving Average Analysis (weight: 15)
        if (currentPrice > indicators.ema9 && indicators.ema9 > indicators.ema21) {
            score += 10;
            reasons.push('Price above EMAs - Uptrend');
        } else if (currentPrice < indicators.ema9 && indicators.ema9 < indicators.ema21) {
            score -= 10;
            reasons.push('Price below EMAs - Downtrend');
        }

        // Bollinger Bands (weight: 15)
        const bb = indicators.bollingerBands;
        if (currentPrice < bb.lower) {
            score += 10;
            reasons.push('Price below lower BB - Oversold');
        } else if (currentPrice > bb.upper) {
            score -= 10;
            reasons.push('Price above upper BB - Overbought');
        }

        // Stochastic (weight: 10)
        if (indicators.stochastic.k < 20) {
            score += 8;
            reasons.push(`Stochastic oversold (${indicators.stochastic.k})`);
        } else if (indicators.stochastic.k > 80) {
            score -= 8;
            reasons.push(`Stochastic overbought (${indicators.stochastic.k})`);
        }

        // Trend Strength (weight: 10)
        if (indicators.trendStrength.direction === 'BULLISH' && indicators.trendStrength.strength > 0.5) {
            score += 7;
            reasons.push('Strong uptrend');
        } else if (indicators.trendStrength.direction === 'BEARISH' && indicators.trendStrength.strength > 0.5) {
            score -= 7;
            reasons.push('Strong downtrend');
        }

        // VWAP Analysis (weight: 10)
        if (currentPrice > indicators.vwap) {
            score += 5;
            reasons.push('Price above VWAP - Bullish');
        } else {
            score -= 5;
            reasons.push('Price below VWAP - Bearish');
        }

        // Clamp score between 0-100
        score = Math.max(0, Math.min(100, score));

        // Determine action
        let action, optionType, confidence, target, stopLoss;
        const sr = indicators.supportResistance;

        if (score >= this.THRESHOLDS.STRONG_BUY) {
            action = 'BUY';
            optionType = 'CALL';
            confidence = 'HIGH';
            target = sr.resistance;
            stopLoss = sr.s1;
        } else if (score >= this.THRESHOLDS.BUY) {
            action = 'BUY';
            optionType = 'CALL';
            confidence = 'MODERATE';
            target = sr.r1;
            stopLoss = sr.s1;
        } else if (score <= this.THRESHOLDS.STRONG_SELL) {
            action = 'BUY';
            optionType = 'PUT';
            confidence = 'HIGH';
            target = sr.support;
            stopLoss = sr.r1;
        } else if (score <= this.THRESHOLDS.SELL) {
            action = 'BUY';
            optionType = 'PUT';
            confidence = 'MODERATE';
            target = sr.s1;
            stopLoss = sr.r1;
        } else {
            action = 'WAIT';
            optionType = null;
            confidence = 'LOW';
            target = null;
            stopLoss = null;
        }

        // Check existing position for EXIT signal
        const position = this.positions.get(symbol);
        if (position) {
            const shouldExit = this.checkExitCondition(position, currentPrice, score, indicators);
            if (shouldExit.exit) {
                action = 'EXIT';
                reasons.unshift(shouldExit.reason);
            }
        }

        return {
            symbol,
            timestamp: Date.now(),
            price: currentPrice,
            score: Math.round(score),
            action,
            optionType,
            confidence,
            target,
            stopLoss,
            indicators: {
                rsi: indicators.rsi,
                macd: indicators.macd.histogram,
                stochastic: indicators.stochastic.k,
                trend: indicators.trendStrength.direction,
                vwap: indicators.vwap
            },
            levels: indicators.supportResistance,
            reasons: reasons.slice(0, 5),
            recommendation: this.generateRecommendation(action, optionType, confidence, currentPrice, target, stopLoss)
        };
    }

    /**
     * Check if we should exit current position
     */
    checkExitCondition(position, currentPrice, score, indicators) {
        // Target hit
        if (position.type === 'CALL' && currentPrice >= position.target) {
            return { exit: true, reason: '🎯 TARGET HIT! Take profit' };
        }
        if (position.type === 'PUT' && currentPrice <= position.target) {
            return { exit: true, reason: '🎯 TARGET HIT! Take profit' };
        }

        // Stop loss hit
        if (position.type === 'CALL' && currentPrice <= position.stopLoss) {
            return { exit: true, reason: '🛑 STOP LOSS HIT! Exit to limit loss' };
        }
        if (position.type === 'PUT' && currentPrice >= position.stopLoss) {
            return { exit: true, reason: '🛑 STOP LOSS HIT! Exit to limit loss' };
        }

        // Trend reversal
        if (position.type === 'CALL' && score < 35) {
            return { exit: true, reason: '📉 Trend reversal detected - Exit CALL' };
        }
        if (position.type === 'PUT' && score > 65) {
            return { exit: true, reason: '📈 Trend reversal detected - Exit PUT' };
        }

        return { exit: false };
    }

    /**
     * Generate human-readable recommendation
     */
    generateRecommendation(action, optionType, confidence, price, target, stopLoss) {
        if (action === 'EXIT') {
            return `EXIT your current position NOW`;
        }

        if (action === 'WAIT') {
            return `WAIT - No clear signal. Market is ranging.`;
        }

        const riskReward = target && stopLoss ?
            ((Math.abs(target - price)) / (Math.abs(price - stopLoss))).toFixed(2) : 'N/A';

        return `${action} ${optionType} | Entry: ${price.toFixed(2)} | Target: ${target?.toFixed(2)} | SL: ${stopLoss?.toFixed(2)} | R:R ${riskReward}`;
    }

    /**
     * Enter a position (for tracking)
     */
    enterPosition(symbol, type, entry, target, stopLoss) {
        this.positions.set(symbol, {
            type,
            entry,
            target,
            stopLoss,
            entryTime: Date.now()
        });
    }

    /**
     * Exit position
     */
    exitPosition(symbol) {
        this.positions.delete(symbol);
    }

    /**
     * Get current state for a symbol
     */
    getState(symbol) {
        const normalizedSymbol = this.normalizeSymbol(symbol);
        const data = this.symbols.get(normalizedSymbol);
        const signal = this.signals.get(normalizedSymbol);
        const history = this.priceHistory.get(normalizedSymbol) || [];
        const position = this.positions.get(normalizedSymbol);

        return {
            symbol: normalizedSymbol,
            price: data?.lastPrice,
            lastUpdate: data?.lastUpdate,
            signal,
            position,
            candles: history.slice(-100), // Last 100 candles
            indicators: data?.indicators
        };
    }

    /**
     * Get all candles for charting
     */
    getCandles(symbol, count = 100) {
        const normalizedSymbol = this.normalizeSymbol(symbol);
        const history = this.priceHistory.get(normalizedSymbol) || [];
        return history.slice(-count);
    }
}

// Create singleton instance
const realTimeService = new RealTimeSignalService();

module.exports = {
    realTimeService,
    RealTimeSignalService
};
