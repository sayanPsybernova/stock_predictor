/**
 * Option Data Service
 * Fetches and processes option chain data from NSE India
 * With Yahoo Finance fallback for when NSE is unavailable
 *
 * Data provided:
 * - Full option chain with all strikes
 * - IV (Implied Volatility) for each option
 * - OI (Open Interest) and OI changes
 * - Greeks calculation using Black-Scholes
 * - Multiple expiry dates
 */

const axios = require('axios');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const NSE_BASE_URL = 'https://www.nseindia.com';

// Supported indices and their lot sizes
const INDEX_INFO = {
    'NIFTY': { lotSize: 25, tickSize: 0.05 },
    'BANKNIFTY': { lotSize: 15, tickSize: 0.05 },
    'FINNIFTY': { lotSize: 25, tickSize: 0.05 },
    'MIDCPNIFTY': { lotSize: 50, tickSize: 0.05 }
};

// Risk-free rate for Black-Scholes (approximate RBI repo rate)
const RISK_FREE_RATE = 0.065; // 6.5%

let cookies = null;
let cookieExpiry = null;
const COOKIE_REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes
let browser = null;

/**
 * Get NSE cookies using puppeteer (headless browser)
 */
async function getNSECookies() {
    try {
        // Check if cookies are still valid
        if (cookies && cookieExpiry && Date.now() < cookieExpiry) {
            return cookies;
        }

        console.log('🔑 Fetching fresh NSE cookies...');

        // Try puppeteer first
        try {
            const puppeteer = require('puppeteer-core');
            const chromium = require('chromium');

            if (!browser) {
                browser = await puppeteer.launch({
                    headless: 'new',
                    executablePath: chromium.path,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--disable-gpu',
                        '--window-size=1920x1080'
                    ]
                });
            }

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await page.goto('https://www.nseindia.com/option-chain', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Get cookies from browser
            const browserCookies = await page.cookies();
            cookies = browserCookies.map(c => `${c.name}=${c.value}`).join('; ');
            cookieExpiry = Date.now() + COOKIE_REFRESH_INTERVAL;

            await page.close();
            console.log('✅ NSE cookies obtained via puppeteer');
            return cookies;

        } catch (puppeteerError) {
            console.log('⚠️ Puppeteer failed, using fallback:', puppeteerError.message);

            // Fallback: Direct request with enhanced headers
            const response = await axios.get('https://www.nseindia.com/option-chain', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 20000
            });

            if (response.headers['set-cookie']) {
                cookies = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                cookieExpiry = Date.now() + COOKIE_REFRESH_INTERVAL;
                console.log('✅ NSE cookies obtained via fallback');
            }
            return cookies;
        }
    } catch (error) {
        console.error('❌ Error getting NSE cookies:', error.message);
        return null;
    }
}

/**
 * Make authenticated request to NSE
 */
async function nseRequest(endpoint, retries = 3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (!cookies || (cookieExpiry && Date.now() >= cookieExpiry)) {
                await getNSECookies();
            }

            if (!cookies) {
                throw new Error('Failed to obtain NSE cookies');
            }

            const response = await axios.get(`${NSE_BASE_URL}${endpoint}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.nseindia.com/option-chain',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cookie': cookies
                },
                timeout: 20000
            });
            return response.data;
        } catch (error) {
            console.log(`⚠️ NSE request attempt ${attempt + 1} failed:`, error.message);

            if (attempt === retries) throw error;

            // Refresh cookies on 401 or 403
            if (error.response && [401, 403].includes(error.response.status)) {
                cookies = null;
                cookieExpiry = null;
            }

            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
    }
}

/**
 * Fetch complete option chain data for a symbol
 * @param {string} symbol - Index/Stock symbol (e.g., 'NIFTY', 'BANKNIFTY', 'RELIANCE')
 * @param {string} expiry - Optional specific expiry date (DD-Mon-YYYY format)
 * @returns {Promise<Object>} Complete option chain data
 */
async function fetchOptionChain(symbol, expiry = null) {
    const upperSymbol = symbol.toUpperCase().replace('.NS', '');
    const isIndex = Object.keys(INDEX_INFO).includes(upperSymbol);

    // Try NSE first
    try {
        console.log(`📊 Fetching option chain for ${symbol} from NSE...`);

        const endpoint = isIndex
            ? `/api/option-chain-indices?symbol=${upperSymbol}`
            : `/api/option-chain-equities?symbol=${upperSymbol}`;

        const data = await nseRequest(endpoint);

        if (data && data.records) {
            const records = data.records;
            const filteredData = data.filtered ? data.filtered.data : records.data;

            // Get spot price and expiry dates
            const spotPrice = records.underlyingValue;
            const expiryDates = records.expiryDates || [];
            const selectedExpiry = expiry || expiryDates[0];

            // Filter by selected expiry if specified
            let optionData = filteredData;
            if (expiry) {
                optionData = filteredData.filter(strike =>
                    strike.expiryDate === expiry
                );
            }

            // Process option chain
            const processedChain = processOptionChain(optionData, spotPrice, selectedExpiry);

            // Calculate aggregate metrics
            const metrics = calculateAggregateMetrics(optionData, spotPrice);

            // Calculate Max Pain
            const maxPain = calculateMaxPain(optionData, spotPrice);

            // Get ATM strike
            const atmStrike = findATMStrike(optionData, spotPrice);

            return {
                symbol: upperSymbol,
                spotPrice,
                atmStrike,
                expiryDates,
                selectedExpiry,
                isIndex,
                lotSize: isIndex ? INDEX_INFO[upperSymbol]?.lotSize : 1,
                chain: processedChain,
                metrics: {
                    ...metrics,
                    maxPain,
                    spotVsMaxPain: ((spotPrice - maxPain) / maxPain * 100).toFixed(2),
                    daysToExpiry: calculateDaysToExpiry(selectedExpiry)
                },
                topOIStrikes: findTopOIStrikes(optionData),
                oiChangeAnalysis: analyzeOIChanges(optionData),
                timestamp: new Date().toISOString(),
                dataSource: 'NSE'
            };
        }
    } catch (nseError) {
        console.log(`⚠️ NSE fetch failed: ${nseError.message}`);
    }

    // Fallback to Yahoo Finance based simulation
    console.log(`📊 Using Yahoo Finance fallback for ${symbol}...`);
    return await fetchOptionChainFromYahoo(upperSymbol, isIndex, expiry);
}

/**
 * Fetch option chain using Yahoo Finance as fallback
 * Generates realistic option data based on real stock price
 */
async function fetchOptionChainFromYahoo(symbol, isIndex, expiry = null) {
    try {
        // Map NSE symbols to Yahoo Finance symbols
        const yahooSymbol = getYahooSymbol(symbol, isIndex);
        console.log(`📈 Fetching ${yahooSymbol} from Yahoo Finance...`);

        // Get current quote from Yahoo Finance
        const quote = await yahooFinance.quote(yahooSymbol);

        if (!quote || !quote.regularMarketPrice) {
            console.error(`Failed to get quote for ${yahooSymbol}`);
            return null;
        }

        const spotPrice = quote.regularMarketPrice;
        console.log(`✅ Got spot price: ${spotPrice} for ${symbol}`);

        // Generate expiry dates (next 4 Thursdays for weekly, next 3 months for monthly)
        const expiryDates = generateExpiryDates();
        const selectedExpiry = expiry || expiryDates[0];

        // Generate realistic option chain based on spot price
        const generatedData = generateRealisticOptionChain(symbol, spotPrice, isIndex, selectedExpiry);

        // Process the generated data
        const processedChain = processOptionChain(generatedData, spotPrice, selectedExpiry);
        const metrics = calculateAggregateMetrics(generatedData, spotPrice);
        const maxPain = calculateMaxPain(generatedData, spotPrice);
        const atmStrike = findATMStrike(generatedData, spotPrice);

        return {
            symbol,
            spotPrice,
            atmStrike,
            expiryDates,
            selectedExpiry,
            isIndex,
            lotSize: isIndex ? INDEX_INFO[symbol]?.lotSize : 1,
            chain: processedChain,
            metrics: {
                ...metrics,
                maxPain,
                spotVsMaxPain: ((spotPrice - maxPain) / maxPain * 100).toFixed(2),
                daysToExpiry: calculateDaysToExpiry(selectedExpiry)
            },
            topOIStrikes: findTopOIStrikes(generatedData),
            oiChangeAnalysis: analyzeOIChanges(generatedData),
            timestamp: new Date().toISOString(),
            dataSource: 'Yahoo Finance (Simulated OI)',
            disclaimer: 'Option chain data is simulated based on real-time stock price from Yahoo Finance. OI and volume data are estimates.'
        };
    } catch (error) {
        console.error(`Yahoo Finance fallback failed for ${symbol}:`, error.message);
        return null;
    }
}

/**
 * Map NSE symbols to Yahoo Finance symbols
 */
function getYahooSymbol(symbol, isIndex) {
    // Index mappings
    const indexMap = {
        'NIFTY': '^NSEI',
        'BANKNIFTY': '^NSEBANK',
        'FINNIFTY': 'NIFTY_FIN_SERVICE.NS',
        'MIDCPNIFTY': '^NSEMDCP50'
    };

    if (isIndex && indexMap[symbol]) {
        return indexMap[symbol];
    }

    // Stock symbols - add .NS suffix
    return `${symbol}.NS`;
}

/**
 * Generate upcoming expiry dates
 */
function generateExpiryDates() {
    const expiries = [];
    const today = new Date();

    // Find next 4 Thursdays (weekly expiries)
    let d = new Date(today);
    for (let i = 0; i < 4; i++) {
        // Move to next Thursday
        const daysUntilThursday = (4 - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + daysUntilThursday);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const expiryStr = `${d.getDate().toString().padStart(2, '0')}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
        expiries.push(expiryStr);

        d = new Date(d);
    }

    return expiries;
}

/**
 * Generate realistic option chain data
 */
function generateRealisticOptionChain(symbol, spotPrice, isIndex, expiry) {
    const optionData = [];

    // Determine strike interval based on spot price and instrument
    let strikeInterval;
    if (isIndex) {
        if (symbol === 'BANKNIFTY') strikeInterval = 100;
        else if (symbol === 'NIFTY') strikeInterval = 50;
        else strikeInterval = 25;
    } else {
        if (spotPrice > 5000) strikeInterval = 100;
        else if (spotPrice > 1000) strikeInterval = 50;
        else if (spotPrice > 500) strikeInterval = 20;
        else if (spotPrice > 100) strikeInterval = 10;
        else strikeInterval = 5;
    }

    // Round spot to nearest strike interval
    const atmStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;

    // Generate strikes (20 above and 20 below ATM)
    const numStrikes = 20;
    const baseIV = isIndex ? 15 : 30; // Base implied volatility
    const daysToExpiry = calculateDaysToExpiry(expiry) || 7;

    for (let i = -numStrikes; i <= numStrikes; i++) {
        const strikePrice = atmStrike + (i * strikeInterval);
        if (strikePrice <= 0) continue;

        const moneyness = spotPrice / strikePrice;
        const distanceFromATM = Math.abs(i);

        // IV smile - higher IV for OTM options
        const ivAdjustment = 1 + (distanceFromATM * 0.02);
        const callIV = baseIV * ivAdjustment * (strikePrice > spotPrice ? 1.1 : 0.95);
        const putIV = baseIV * ivAdjustment * (strikePrice < spotPrice ? 1.1 : 0.95);

        // OI distribution - bell curve around ATM, with bias
        const oiBase = isIndex ? 500000 : 50000;
        const oiMultiplier = Math.exp(-0.1 * distanceFromATM * distanceFromATM);

        // More put OI below spot (support), more call OI above spot (resistance)
        const callOI = Math.round(oiBase * oiMultiplier * (strikePrice > spotPrice ? 1.2 : 0.8) * (0.8 + Math.random() * 0.4));
        const putOI = Math.round(oiBase * oiMultiplier * (strikePrice < spotPrice ? 1.2 : 0.8) * (0.8 + Math.random() * 0.4));

        // OI changes (random but realistic)
        const callOIChange = Math.round(callOI * (Math.random() * 0.2 - 0.1));
        const putOIChange = Math.round(putOI * (Math.random() * 0.2 - 0.1));

        // Volume (typically 20-50% of OI)
        const callVolume = Math.round(callOI * (0.2 + Math.random() * 0.3));
        const putVolume = Math.round(putOI * (0.2 + Math.random() * 0.3));

        // Calculate theoretical option prices using Black-Scholes
        const timeToExpiry = Math.max(daysToExpiry, 1) / 365;
        const callPrice = calculateBlackScholesPrice(spotPrice, strikePrice, timeToExpiry, callIV / 100, 'CE');
        const putPrice = calculateBlackScholesPrice(spotPrice, strikePrice, timeToExpiry, putIV / 100, 'PE');

        // Small random price change
        const callChange = callPrice * (Math.random() * 0.1 - 0.05);
        const putChange = putPrice * (Math.random() * 0.1 - 0.05);

        optionData.push({
            strikePrice,
            expiryDate: expiry,
            CE: {
                strikePrice,
                expiryDate: expiry,
                underlying: symbol,
                identifier: `${symbol}${expiry}${strikePrice}CE`,
                openInterest: callOI,
                changeinOpenInterest: callOIChange,
                pchangeinOpenInterest: callOI > 0 ? ((callOIChange / callOI) * 100).toFixed(2) : 0,
                totalTradedVolume: callVolume,
                impliedVolatility: parseFloat(callIV.toFixed(2)),
                lastPrice: parseFloat(callPrice.toFixed(2)),
                change: parseFloat(callChange.toFixed(2)),
                pChange: callPrice > 0 ? parseFloat(((callChange / callPrice) * 100).toFixed(2)) : 0,
                totalBuyQuantity: Math.round(callVolume * 0.4),
                totalSellQuantity: Math.round(callVolume * 0.4),
                bidQty: Math.round(Math.random() * 1000) * 50,
                bidprice: parseFloat((callPrice * 0.99).toFixed(2)),
                askPrice: parseFloat((callPrice * 1.01).toFixed(2)),
                askQty: Math.round(Math.random() * 1000) * 50,
                underlyingValue: spotPrice
            },
            PE: {
                strikePrice,
                expiryDate: expiry,
                underlying: symbol,
                identifier: `${symbol}${expiry}${strikePrice}PE`,
                openInterest: putOI,
                changeinOpenInterest: putOIChange,
                pchangeinOpenInterest: putOI > 0 ? ((putOIChange / putOI) * 100).toFixed(2) : 0,
                totalTradedVolume: putVolume,
                impliedVolatility: parseFloat(putIV.toFixed(2)),
                lastPrice: parseFloat(putPrice.toFixed(2)),
                change: parseFloat(putChange.toFixed(2)),
                pChange: putPrice > 0 ? parseFloat(((putChange / putPrice) * 100).toFixed(2)) : 0,
                totalBuyQuantity: Math.round(putVolume * 0.4),
                totalSellQuantity: Math.round(putVolume * 0.4),
                bidQty: Math.round(Math.random() * 1000) * 50,
                bidprice: parseFloat((putPrice * 0.99).toFixed(2)),
                askPrice: parseFloat((putPrice * 1.01).toFixed(2)),
                askQty: Math.round(Math.random() * 1000) * 50,
                underlyingValue: spotPrice
            }
        });
    }

    return optionData;
}

/**
 * Calculate Black-Scholes option price
 */
function calculateBlackScholesPrice(spot, strike, time, iv, optionType) {
    if (time <= 0 || iv <= 0) {
        // Intrinsic value only
        if (optionType === 'CE') return Math.max(0, spot - strike);
        return Math.max(0, strike - spot);
    }

    const r = RISK_FREE_RATE;
    const sqrtT = Math.sqrt(time);

    const d1 = (Math.log(spot / strike) + (r + (iv * iv) / 2) * time) / (iv * sqrtT);
    const d2 = d1 - iv * sqrtT;

    // Standard normal CDF
    const N = (x) => {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    };

    if (optionType === 'CE') {
        return spot * N(d1) - strike * Math.exp(-r * time) * N(d2);
    } else {
        return strike * Math.exp(-r * time) * N(-d2) - spot * N(-d1);
    }
}

/**
 * Process raw option chain data
 */
function processOptionChain(data, spotPrice, expiry) {
    const daysToExpiry = calculateDaysToExpiry(expiry);
    const timeToExpiry = daysToExpiry / 365;

    return data.map(strike => {
        const strikePrice = strike.strikePrice;

        // Process Call option
        const call = strike.CE ? {
            strikePrice,
            ltp: strike.CE.lastPrice || 0,
            change: strike.CE.change || 0,
            pChange: strike.CE.pChange || 0,
            volume: strike.CE.totalTradedVolume || 0,
            oi: strike.CE.openInterest || 0,
            oiChange: strike.CE.changeinOpenInterest || 0,
            iv: strike.CE.impliedVolatility || 0,
            bidQty: strike.CE.bidQty || 0,
            bidPrice: strike.CE.bidprice || 0,
            askPrice: strike.CE.askPrice || 0,
            askQty: strike.CE.askQty || 0,
            // Calculate Greeks
            ...calculateGreeks(spotPrice, strikePrice, timeToExpiry, strike.CE.impliedVolatility / 100, 'CE')
        } : null;

        // Process Put option
        const put = strike.PE ? {
            strikePrice,
            ltp: strike.PE.lastPrice || 0,
            change: strike.PE.change || 0,
            pChange: strike.PE.pChange || 0,
            volume: strike.PE.totalTradedVolume || 0,
            oi: strike.PE.openInterest || 0,
            oiChange: strike.PE.changeinOpenInterest || 0,
            iv: strike.PE.impliedVolatility || 0,
            bidQty: strike.PE.bidQty || 0,
            bidPrice: strike.PE.bidprice || 0,
            askPrice: strike.PE.askPrice || 0,
            askQty: strike.PE.askQty || 0,
            // Calculate Greeks
            ...calculateGreeks(spotPrice, strikePrice, timeToExpiry, strike.PE.impliedVolatility / 100, 'PE')
        } : null;

        return {
            strikePrice,
            call,
            put,
            isATM: Math.abs(strikePrice - spotPrice) < (spotPrice * 0.005), // Within 0.5%
            isITM: {
                call: strikePrice < spotPrice,
                put: strikePrice > spotPrice
            }
        };
    }).sort((a, b) => a.strikePrice - b.strikePrice);
}

/**
 * Calculate option Greeks using Black-Scholes model
 */
function calculateGreeks(spot, strike, time, iv, optionType) {
    if (!iv || iv <= 0 || time <= 0) {
        return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    }

    const r = RISK_FREE_RATE;
    const sqrtT = Math.sqrt(time);

    // d1 and d2
    const d1 = (Math.log(spot / strike) + (r + (iv * iv) / 2) * time) / (iv * sqrtT);
    const d2 = d1 - iv * sqrtT;

    // Standard normal CDF
    const N = (x) => {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    };

    // Standard normal PDF
    const n = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

    // Delta
    let delta = optionType === 'CE' ? N(d1) : N(d1) - 1;

    // Gamma (same for calls and puts)
    const gamma = n(d1) / (spot * iv * sqrtT);

    // Theta (per day)
    const theta_call = (-spot * n(d1) * iv / (2 * sqrtT) - r * strike * Math.exp(-r * time) * N(d2)) / 365;
    const theta_put = (-spot * n(d1) * iv / (2 * sqrtT) + r * strike * Math.exp(-r * time) * N(-d2)) / 365;
    const theta = optionType === 'CE' ? theta_call : theta_put;

    // Vega (per 1% change in IV)
    const vega = spot * sqrtT * n(d1) / 100;

    return {
        delta: parseFloat(delta.toFixed(4)),
        gamma: parseFloat(gamma.toFixed(6)),
        theta: parseFloat(theta.toFixed(2)),
        vega: parseFloat(vega.toFixed(2))
    };
}

/**
 * Calculate aggregate metrics from option chain
 */
function calculateAggregateMetrics(data, spotPrice) {
    let totalCallOI = 0, totalPutOI = 0;
    let totalCallVolume = 0, totalPutVolume = 0;
    let totalCallOIChange = 0, totalPutOIChange = 0;
    let weightedCallIV = 0, weightedPutIV = 0;
    let callOIForIV = 0, putOIForIV = 0;

    data.forEach(strike => {
        if (strike.CE) {
            totalCallOI += strike.CE.openInterest || 0;
            totalCallVolume += strike.CE.totalTradedVolume || 0;
            totalCallOIChange += strike.CE.changeinOpenInterest || 0;
            if (strike.CE.impliedVolatility && strike.CE.openInterest) {
                weightedCallIV += strike.CE.impliedVolatility * strike.CE.openInterest;
                callOIForIV += strike.CE.openInterest;
            }
        }
        if (strike.PE) {
            totalPutOI += strike.PE.openInterest || 0;
            totalPutVolume += strike.PE.totalTradedVolume || 0;
            totalPutOIChange += strike.PE.changeinOpenInterest || 0;
            if (strike.PE.impliedVolatility && strike.PE.openInterest) {
                weightedPutIV += strike.PE.impliedVolatility * strike.PE.openInterest;
                putOIForIV += strike.PE.openInterest;
            }
        }
    });

    const pcrOI = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
    const pcrVolume = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;

    // Determine sentiment from PCR
    let sentiment = 'Neutral';
    let sentimentStrength = 'Moderate';

    if (pcrOI > 1.3) {
        sentiment = 'Bullish';
        sentimentStrength = pcrOI > 1.5 ? 'Strong' : 'Moderate';
    } else if (pcrOI < 0.7) {
        sentiment = 'Bearish';
        sentimentStrength = pcrOI < 0.5 ? 'Strong' : 'Moderate';
    } else if (pcrOI > 1.0) {
        sentiment = 'Mildly Bullish';
    } else {
        sentiment = 'Mildly Bearish';
    }

    return {
        pcr: {
            oi: parseFloat(pcrOI.toFixed(3)),
            volume: parseFloat(pcrVolume.toFixed(3))
        },
        totalOI: {
            call: totalCallOI,
            put: totalPutOI,
            total: totalCallOI + totalPutOI
        },
        totalVolume: {
            call: totalCallVolume,
            put: totalPutVolume,
            total: totalCallVolume + totalPutVolume
        },
        oiChange: {
            call: totalCallOIChange,
            put: totalPutOIChange,
            net: totalPutOIChange - totalCallOIChange
        },
        avgIV: {
            call: callOIForIV > 0 ? parseFloat((weightedCallIV / callOIForIV).toFixed(2)) : 0,
            put: putOIForIV > 0 ? parseFloat((weightedPutIV / putOIForIV).toFixed(2)) : 0
        },
        sentiment,
        sentimentStrength
    };
}

/**
 * Calculate Max Pain point
 */
function calculateMaxPain(data, spotPrice) {
    const strikes = data.map(d => d.strikePrice).filter(s => s);
    if (strikes.length === 0) return spotPrice;

    let minPain = Infinity;
    let maxPainStrike = spotPrice;

    strikes.forEach(testStrike => {
        let totalPain = 0;

        data.forEach(strike => {
            // Call pain (ITM calls cost money to buyers)
            if (strike.CE && strike.CE.openInterest) {
                if (testStrike > strike.strikePrice) {
                    totalPain += (testStrike - strike.strikePrice) * strike.CE.openInterest;
                }
            }
            // Put pain (ITM puts cost money to buyers)
            if (strike.PE && strike.PE.openInterest) {
                if (testStrike < strike.strikePrice) {
                    totalPain += (strike.strikePrice - testStrike) * strike.PE.openInterest;
                }
            }
        });

        if (totalPain < minPain) {
            minPain = totalPain;
            maxPainStrike = testStrike;
        }
    });

    return maxPainStrike;
}

/**
 * Find ATM strike
 */
function findATMStrike(data, spotPrice) {
    let atmStrike = data[0]?.strikePrice || spotPrice;
    let minDiff = Infinity;

    data.forEach(strike => {
        const diff = Math.abs(strike.strikePrice - spotPrice);
        if (diff < minDiff) {
            minDiff = diff;
            atmStrike = strike.strikePrice;
        }
    });

    return atmStrike;
}

/**
 * Find top OI strikes
 */
function findTopOIStrikes(data, count = 5) {
    const callStrikes = data
        .filter(s => s.CE && s.CE.openInterest > 0)
        .sort((a, b) => (b.CE?.openInterest || 0) - (a.CE?.openInterest || 0))
        .slice(0, count)
        .map(s => ({
            strike: s.strikePrice,
            oi: s.CE.openInterest,
            oiChange: s.CE.changeinOpenInterest || 0,
            type: 'resistance'
        }));

    const putStrikes = data
        .filter(s => s.PE && s.PE.openInterest > 0)
        .sort((a, b) => (b.PE?.openInterest || 0) - (a.PE?.openInterest || 0))
        .slice(0, count)
        .map(s => ({
            strike: s.strikePrice,
            oi: s.PE.openInterest,
            oiChange: s.PE.changeinOpenInterest || 0,
            type: 'support'
        }));

    return { callStrikes, putStrikes };
}

/**
 * Analyze OI changes for buildup patterns
 */
function analyzeOIChanges(data) {
    let longBuildup = 0, shortBuildup = 0;
    let longUnwinding = 0, shortCovering = 0;

    data.forEach(strike => {
        // CE analysis
        if (strike.CE) {
            const oiChange = strike.CE.changeinOpenInterest || 0;
            const priceChange = strike.CE.change || 0;

            if (oiChange > 0 && priceChange > 0) longBuildup++;
            else if (oiChange > 0 && priceChange < 0) shortBuildup++;
            else if (oiChange < 0 && priceChange > 0) shortCovering++;
            else if (oiChange < 0 && priceChange < 0) longUnwinding++;
        }

        // PE analysis
        if (strike.PE) {
            const oiChange = strike.PE.changeinOpenInterest || 0;
            const priceChange = strike.PE.change || 0;

            if (oiChange > 0 && priceChange > 0) longBuildup++;
            else if (oiChange > 0 && priceChange < 0) shortBuildup++;
            else if (oiChange < 0 && priceChange > 0) shortCovering++;
            else if (oiChange < 0 && priceChange < 0) longUnwinding++;
        }
    });

    // Determine dominant pattern
    const patterns = { longBuildup, shortBuildup, longUnwinding, shortCovering };
    const dominant = Object.entries(patterns).sort((a, b) => b[1] - a[1])[0];

    return {
        patterns,
        dominant: {
            pattern: dominant[0],
            count: dominant[1],
            interpretation: getPatternInterpretation(dominant[0])
        }
    };
}

/**
 * Get interpretation for OI pattern
 */
function getPatternInterpretation(pattern) {
    const interpretations = {
        longBuildup: 'Fresh longs being added - Bullish',
        shortBuildup: 'Fresh shorts being added - Bearish',
        longUnwinding: 'Longs exiting positions - Bearish',
        shortCovering: 'Shorts covering positions - Bullish'
    };
    return interpretations[pattern] || 'No clear pattern';
}

/**
 * Calculate days to expiry
 */
function calculateDaysToExpiry(expiryDate) {
    if (!expiryDate) return 0;

    const expiry = new Date(expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = expiry - today;
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

/**
 * Get Greeks for a specific option
 */
async function getOptionGreeks(symbol, strike, optionType, expiry = null) {
    const chainData = await fetchOptionChain(symbol, expiry);
    if (!chainData) return null;

    const strikeData = chainData.chain.find(s => s.strikePrice === strike);
    if (!strikeData) return null;

    const option = optionType.toUpperCase() === 'CE' ? strikeData.call : strikeData.put;
    if (!option) return null;

    return {
        symbol,
        strike,
        optionType: optionType.toUpperCase(),
        expiry: chainData.selectedExpiry,
        spotPrice: chainData.spotPrice,
        ltp: option.ltp,
        iv: option.iv,
        greeks: {
            delta: option.delta,
            gamma: option.gamma,
            theta: option.theta,
            vega: option.vega
        },
        volume: option.volume,
        oi: option.oi,
        oiChange: option.oiChange
    };
}

module.exports = {
    fetchOptionChain,
    getOptionGreeks,
    getNSECookies,
    INDEX_INFO,
    calculateDaysToExpiry
};
