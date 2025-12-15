/**
 * NSE India Service - Option Chain & Market Data
 * Fetches real-time data from NSE India
 *
 * Data available:
 * - Option Chain (OI, Volume, Strike prices)
 * - Put-Call Ratio (PCR)
 * - Max Pain calculation
 * - FII/DII data
 * - Index data (Nifty, Bank Nifty)
 */

const axios = require('axios');

const NSE_BASE_URL = 'https://www.nseindia.com';

// Create axios instance with required headers for NSE
const nseAxios = axios.create({
    baseURL: NSE_BASE_URL,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://www.nseindia.com/'
    },
    timeout: 15000
});

let cookies = null;

/**
 * Get NSE cookies (required for API access)
 */
async function getNSECookies() {
    try {
        const response = await nseAxios.get('/', {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml'
            }
        });
        if (response.headers['set-cookie']) {
            cookies = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        }
        return cookies;
    } catch (error) {
        console.error('Error getting NSE cookies:', error.message);
        return null;
    }
}

/**
 * Make authenticated request to NSE
 */
async function nseRequest(endpoint) {
    if (!cookies) {
        await getNSECookies();
    }

    try {
        const response = await nseAxios.get(endpoint, {
            headers: {
                Cookie: cookies || ''
            }
        });
        return response.data;
    } catch (error) {
        // Retry with fresh cookies
        if (error.response && error.response.status === 401) {
            await getNSECookies();
            const response = await nseAxios.get(endpoint, {
                headers: {
                    Cookie: cookies || ''
                }
            });
            return response.data;
        }
        throw error;
    }
}

/**
 * Fetch Option Chain data for a symbol
 * @param {string} symbol - Stock symbol (e.g., 'RELIANCE', 'NIFTY')
 * @returns {Promise<Object>} Option chain data
 */
async function fetchOptionChain(symbol) {
    try {
        console.log(`Fetching option chain for ${symbol}...`);

        const isIndex = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'].includes(symbol.toUpperCase());
        const endpoint = isIndex
            ? `/api/option-chain-indices?symbol=${symbol.toUpperCase()}`
            : `/api/option-chain-equities?symbol=${symbol.toUpperCase().replace('.NS', '')}`;

        const data = await nseRequest(endpoint);

        if (!data || !data.records) {
            return null;
        }

        const records = data.records;
        const filteredData = data.filtered ? data.filtered.data : records.data;

        // Calculate PCR (Put-Call Ratio)
        let totalCallOI = 0;
        let totalPutOI = 0;
        let totalCallVolume = 0;
        let totalPutVolume = 0;

        filteredData.forEach(strike => {
            if (strike.CE) {
                totalCallOI += strike.CE.openInterest || 0;
                totalCallVolume += strike.CE.totalTradedVolume || 0;
            }
            if (strike.PE) {
                totalPutOI += strike.PE.openInterest || 0;
                totalPutVolume += strike.PE.totalTradedVolume || 0;
            }
        });

        const pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : 0;
        const pcrVolume = totalCallVolume > 0 ? (totalPutVolume / totalCallVolume).toFixed(2) : 0;

        // Calculate Max Pain
        const maxPain = calculateMaxPain(filteredData, records.underlyingValue);

        // Find highest OI strikes
        let maxCallOIStrike = { strike: 0, oi: 0 };
        let maxPutOIStrike = { strike: 0, oi: 0 };

        filteredData.forEach(strike => {
            if (strike.CE && strike.CE.openInterest > maxCallOIStrike.oi) {
                maxCallOIStrike = { strike: strike.strikePrice, oi: strike.CE.openInterest };
            }
            if (strike.PE && strike.PE.openInterest > maxPutOIStrike.oi) {
                maxPutOIStrike = { strike: strike.strikePrice, oi: strike.PE.openInterest };
            }
        });

        // Determine sentiment
        let sentiment = 'Neutral';
        if (parseFloat(pcr) > 1.2) sentiment = 'Bullish';
        else if (parseFloat(pcr) < 0.8) sentiment = 'Bearish';
        else if (parseFloat(pcr) > 1) sentiment = 'Mildly Bullish';
        else sentiment = 'Mildly Bearish';

        return {
            symbol: symbol.toUpperCase(),
            underlyingValue: records.underlyingValue,
            pcr: parseFloat(pcr),
            pcrVolume: parseFloat(pcrVolume),
            maxPain,
            maxCallOIStrike,
            maxPutOIStrike,
            totalCallOI,
            totalPutOI,
            totalCallVolume,
            totalPutVolume,
            sentiment,
            expiryDate: records.expiryDates ? records.expiryDates[0] : null,
            timestamp: records.timestamp,
            interpretation: generateOIInterpretation(pcr, maxPain, records.underlyingValue, maxCallOIStrike, maxPutOIStrike)
        };
    } catch (error) {
        console.error(`Error fetching option chain for ${symbol}:`, error.message);
        return null;
    }
}

/**
 * Calculate Max Pain point
 */
function calculateMaxPain(optionData, spotPrice) {
    if (!optionData || optionData.length === 0) return spotPrice;

    const strikes = optionData.map(d => d.strikePrice).filter(s => s);
    if (strikes.length === 0) return spotPrice;

    let minPain = Infinity;
    let maxPainStrike = spotPrice;

    strikes.forEach(testStrike => {
        let totalPain = 0;

        optionData.forEach(strike => {
            // Call buyer pain (stock above strike)
            if (strike.CE && strike.CE.openInterest) {
                if (testStrike > strike.strikePrice) {
                    totalPain += (testStrike - strike.strikePrice) * strike.CE.openInterest;
                }
            }
            // Put buyer pain (stock below strike)
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
 * Generate interpretation from OI data
 */
function generateOIInterpretation(pcr, maxPain, spot, maxCallOI, maxPutOI) {
    const lines = [];

    if (parseFloat(pcr) > 1.2) {
        lines.push(`PCR at ${pcr} indicates bullish sentiment (put writers confident)`);
    } else if (parseFloat(pcr) < 0.8) {
        lines.push(`PCR at ${pcr} indicates bearish sentiment (call writers dominant)`);
    } else {
        lines.push(`PCR at ${pcr} indicates neutral/range-bound market`);
    }

    if (maxPain > spot) {
        lines.push(`Max Pain at ${maxPain} is above spot - potential upside to expiry`);
    } else if (maxPain < spot) {
        lines.push(`Max Pain at ${maxPain} is below spot - possible pullback to expiry`);
    }

    lines.push(`Resistance at ${maxCallOI.strike} (highest Call OI: ${formatNumber(maxCallOI.oi)})`);
    lines.push(`Support at ${maxPutOI.strike} (highest Put OI: ${formatNumber(maxPutOI.oi)})`);

    return lines.join('. ');
}

/**
 * Fetch FII/DII activity data
 */
async function fetchFIIDIIData() {
    try {
        console.log('Fetching FII/DII data...');
        const data = await nseRequest('/api/fiidiiTradeReact');

        if (!data || !data.length) {
            return null;
        }

        const fiiData = data.find(d => d.category === 'FII/FPI');
        const diiData = data.find(d => d.category === 'DII');

        return {
            fii: {
                buyValue: fiiData ? parseFloat(fiiData.buyValue) : 0,
                sellValue: fiiData ? parseFloat(fiiData.sellValue) : 0,
                netValue: fiiData ? parseFloat(fiiData.netValue) : 0,
                activity: fiiData && parseFloat(fiiData.netValue) > 0 ? 'Buying' : 'Selling'
            },
            dii: {
                buyValue: diiData ? parseFloat(diiData.buyValue) : 0,
                sellValue: diiData ? parseFloat(diiData.sellValue) : 0,
                netValue: diiData ? parseFloat(diiData.netValue) : 0,
                activity: diiData && parseFloat(diiData.netValue) > 0 ? 'Buying' : 'Selling'
            },
            overallSentiment: determineFIIDIISentiment(fiiData, diiData),
            date: new Date().toISOString().split('T')[0]
        };
    } catch (error) {
        console.error('Error fetching FII/DII data:', error.message);
        return null;
    }
}

/**
 * Determine overall sentiment from FII/DII data
 */
function determineFIIDIISentiment(fiiData, diiData) {
    if (!fiiData || !diiData) return 'Unknown';

    const fiiNet = parseFloat(fiiData.netValue) || 0;
    const diiNet = parseFloat(diiData.netValue) || 0;

    if (fiiNet > 0 && diiNet > 0) return 'Strong Bullish';
    if (fiiNet > 0 && diiNet < 0) return 'FII Bullish';
    if (fiiNet < 0 && diiNet > 0) return 'DII Supported';
    if (fiiNet < 0 && diiNet < 0) return 'Bearish';
    return 'Neutral';
}

/**
 * Fetch Nifty/Bank Nifty index data
 */
async function fetchIndexData() {
    try {
        console.log('Fetching index data...');
        const data = await nseRequest('/api/allIndices');

        if (!data || !data.data) {
            return null;
        }

        const indices = {};
        const importantIndices = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY FINANCIAL SERVICES', 'NIFTY MIDCAP 50', 'NIFTY SMALLCAP 50'];

        data.data.forEach(index => {
            if (importantIndices.includes(index.index)) {
                indices[index.index] = {
                    value: index.last,
                    change: index.percentChange,
                    open: index.open,
                    high: index.high,
                    low: index.low,
                    previousClose: index.previousClose,
                    status: index.percentChange > 0 ? 'Bullish' : index.percentChange < 0 ? 'Bearish' : 'Flat'
                };
            }
        });

        return {
            indices,
            marketStatus: data.marketStatus || {},
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error fetching index data:', error.message);
        return null;
    }
}

/**
 * Get top gainers from NSE
 */
async function fetchTopGainers() {
    try {
        console.log('Fetching NSE top gainers...');
        const data = await nseRequest('/api/live-analysis-variations?index=gainers');

        if (!data || !data.NIFTY || !data.NIFTY.data) {
            return [];
        }

        return data.NIFTY.data.map(stock => ({
            symbol: stock.symbol + '.NS',
            name: stock.symbol,
            lastPrice: stock.lastPrice,
            change: stock.change,
            percentChange: stock.pChange,
            volume: stock.totalTradedVolume,
            value: stock.totalTradedValue
        }));
    } catch (error) {
        console.error('Error fetching top gainers:', error.message);
        return [];
    }
}

/**
 * Get top losers from NSE
 */
async function fetchTopLosers() {
    try {
        console.log('Fetching NSE top losers...');
        const data = await nseRequest('/api/live-analysis-variations?index=losers');

        if (!data || !data.NIFTY || !data.NIFTY.data) {
            return [];
        }

        return data.NIFTY.data.map(stock => ({
            symbol: stock.symbol + '.NS',
            name: stock.symbol,
            lastPrice: stock.lastPrice,
            change: stock.change,
            percentChange: stock.pChange,
            volume: stock.totalTradedVolume,
            value: stock.totalTradedValue
        }));
    } catch (error) {
        console.error('Error fetching top losers:', error.message);
        return [];
    }
}

/**
 * Helper function to format numbers
 */
function formatNumber(num) {
    if (!num) return '0';
    if (num >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
    if (num >= 100000) return (num / 100000).toFixed(2) + ' L';
    if (num >= 1000) return (num / 1000).toFixed(2) + ' K';
    return num.toString();
}

module.exports = {
    fetchOptionChain,
    fetchFIIDIIData,
    fetchIndexData,
    fetchTopGainers,
    fetchTopLosers,
    getNSECookies
};
