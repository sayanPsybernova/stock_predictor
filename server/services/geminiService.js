/**
 * Gemini AI Service for generating comprehensive stock analysis
 * Uses Google's Gemini API with real-time news and detailed predictions
 * Features: News sentiment analysis, market hours detection, real-time updates
 */

const GEMINI_API_KEY = 'AIzaSyC_B-nKcNaB-1_97_RUASkXTy4eLItdb7Q';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Cache for news data to avoid redundant fetches
const newsCache = new Map();
const NEWS_CACHE_DURATION = 60000; // 1 minute cache

/**
 * Check if Indian market is currently open
 * Market hours: 9:15 AM - 3:30 PM IST, Monday-Friday
 */
function isIndianMarketOpen() {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset + (now.getTimezoneOffset() * 60000));

    const day = istTime.getDay();
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Weekend check
    if (day === 0 || day === 6) return false;

    // Market hours: 9:15 AM (555 min) to 3:30 PM (930 min)
    return totalMinutes >= 555 && totalMinutes <= 930;
}

/**
 * Check if US market is currently open
 * Market hours: 9:30 AM - 4:00 PM EST, Monday-Friday
 */
function isUSMarketOpen() {
    const now = new Date();
    // Convert to EST (UTC-5)
    const estOffset = -5 * 60 * 60 * 1000;
    const estTime = new Date(now.getTime() + estOffset + (now.getTimezoneOffset() * 60000));

    const day = estTime.getDay();
    const hours = estTime.getHours();
    const minutes = estTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Weekend check
    if (day === 0 || day === 6) return false;

    // Market hours: 9:30 AM (570 min) to 4:00 PM (960 min)
    return totalMinutes >= 570 && totalMinutes <= 960;
}

/**
 * Get market status for a stock
 */
function getMarketStatus(symbol) {
    const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');
    const isOpen = isIndian ? isIndianMarketOpen() : isUSMarketOpen();

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset + (now.getTimezoneOffset() * 60000));

    return {
        isOpen,
        market: isIndian ? 'NSE/BSE' : 'NYSE/NASDAQ',
        currentTimeIST: istTime.toLocaleTimeString('en-IN'),
        preMarket: isIndian && istTime.getHours() < 9 && istTime.getHours() >= 8,
        updateFrequency: isOpen ? '1 minute' : '15 minutes'
    };
}

/**
 * Fetch global market news affecting all stocks
 */
async function fetchGlobalMarketNews() {
    const cacheKey = 'global_news';
    const cached = newsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < NEWS_CACHE_DURATION) {
        return cached.data;
    }

    const searches = [
        'stock market news today',
        'global economy news',
        'India market news NSE BSE'
    ];

    const allNews = [];

    for (const query of searches) {
        try {
            const encodedQuery = encodeURIComponent(query);
            const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-IN&gl=IN&ceid=IN:en`;

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.ok) {
                const xmlText = await response.text();
                const items = parseRSSNews(xmlText, 3);
                allNews.push(...items);
            }
        } catch (e) {
            console.log(`Failed to fetch: ${query}`, e.message);
        }
    }

    // Deduplicate by title
    const uniqueNews = [];
    const seenTitles = new Set();
    for (const item of allNews) {
        const shortTitle = item.title.substring(0, 50).toLowerCase();
        if (!seenTitles.has(shortTitle)) {
            seenTitles.add(shortTitle);
            uniqueNews.push(item);
        }
    }

    const result = uniqueNews.slice(0, 8);
    newsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
}

/**
 * Parse RSS XML to extract news items
 */
function parseRSSNews(xmlText, limit = 5) {
    const newsItems = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>([\s\S]*?)<\/title>/;
    const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
    const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/;

    let match;
    let count = 0;
    while ((match = itemRegex.exec(xmlText)) !== null && count < limit) {
        const item = match[1];
        const titleMatch = titleRegex.exec(item);
        const dateMatch = pubDateRegex.exec(item);
        const sourceMatch = sourceRegex.exec(item);

        if (titleMatch) {
            const title = titleMatch[1]
                .replace(/<!\[CDATA\[|\]\]>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .trim();

            const source = sourceMatch ? sourceMatch[1].trim() : 'News';
            const date = dateMatch ? new Date(dateMatch[1]) : new Date();
            const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            newsItems.push({
                title,
                source,
                date: formattedDate,
                timestamp: date.getTime()
            });
            count++;
        }
    }

    return newsItems;
}

/**
 * Analyze news sentiment using keyword scoring
 * Returns sentiment score from -1 (very bearish) to +1 (very bullish)
 */
function analyzeNewsSentiment(newsItems) {
    const bullishKeywords = [
        'surge', 'soar', 'rally', 'gain', 'rise', 'jump', 'boost', 'record high',
        'profit', 'growth', 'beat', 'exceed', 'upgrade', 'buy', 'bullish', 'positive',
        'recovery', 'strong', 'outperform', 'breakthrough', 'expansion', 'dividend',
        'acquisition', 'partnership', 'contract', 'deal', 'investment'
    ];

    const bearishKeywords = [
        'crash', 'plunge', 'fall', 'drop', 'decline', 'loss', 'slump', 'tumble',
        'downgrade', 'sell', 'bearish', 'negative', 'weak', 'miss', 'warning',
        'concern', 'risk', 'layoff', 'cut', 'debt', 'lawsuit', 'investigation',
        'fraud', 'scandal', 'recall', 'fine', 'penalty', 'default', 'bankruptcy'
    ];

    const majorEventKeywords = {
        bullish: ['rate cut', 'stimulus', 'bailout', 'peace', 'vaccine', 'cure', 'recovery'],
        bearish: ['war', 'conflict', 'pandemic', 'corona', 'covid', 'recession', 'inflation',
                  'rate hike', 'earthquake', 'flood', 'fire', 'disaster', 'sanctions', 'tariff']
    };

    let totalScore = 0;
    let newsCount = 0;
    const sentimentDetails = [];

    for (const news of newsItems) {
        const titleLower = news.title.toLowerCase();
        let itemScore = 0;
        let matchedKeywords = [];

        // Check for major events first (higher weight)
        for (const keyword of majorEventKeywords.bullish) {
            if (titleLower.includes(keyword)) {
                itemScore += 0.5;
                matchedKeywords.push(`+${keyword}`);
            }
        }
        for (const keyword of majorEventKeywords.bearish) {
            if (titleLower.includes(keyword)) {
                itemScore -= 0.5;
                matchedKeywords.push(`-${keyword}`);
            }
        }

        // Check regular keywords
        for (const keyword of bullishKeywords) {
            if (titleLower.includes(keyword)) {
                itemScore += 0.2;
                if (matchedKeywords.length < 3) matchedKeywords.push(`+${keyword}`);
            }
        }
        for (const keyword of bearishKeywords) {
            if (titleLower.includes(keyword)) {
                itemScore -= 0.2;
                if (matchedKeywords.length < 3) matchedKeywords.push(`-${keyword}`);
            }
        }

        // Clamp individual score
        itemScore = Math.max(-1, Math.min(1, itemScore));

        if (itemScore !== 0) {
            sentimentDetails.push({
                headline: news.title.substring(0, 80),
                score: itemScore,
                keywords: matchedKeywords,
                impact: itemScore > 0.3 ? 'Bullish' : itemScore < -0.3 ? 'Bearish' : 'Neutral'
            });
        }

        totalScore += itemScore;
        newsCount++;
    }

    // Calculate average sentiment
    const avgSentiment = newsCount > 0 ? totalScore / newsCount : 0;

    return {
        score: avgSentiment,
        sentiment: avgSentiment > 0.15 ? 'Bullish' : avgSentiment < -0.15 ? 'Bearish' : 'Neutral',
        confidence: Math.min(100, Math.abs(avgSentiment) * 100 + 40),
        details: sentimentDetails.slice(0, 5),
        newsCount,
        impactAdjustment: avgSentiment * 0.02 // Max 2% price adjustment based on news
    };
}

/**
 * Fetch latest news for a stock from Google News RSS
 * @param {string} symbol - Stock symbol
 * @param {string} companyName - Company name
 * @returns {Promise<string>} Latest news summary
 */
async function fetchStockNews(symbol, companyName) {
    // Clean up company name for search
    const cleanCompanyName = companyName
        .replace(/Limited|Ltd\.?|Inc\.?|Corp\.?|Corporation/gi, '')
        .trim();

    // Create search query - prioritize stock-related news
    const searchQuery = encodeURIComponent(`${cleanCompanyName} stock news`);
    const googleNewsUrl = `https://news.google.com/rss/search?q=${searchQuery}&hl=en-IN&gl=IN&ceid=IN:en`;

    try {
        const response = await fetch(googleNewsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error('Google News fetch failed');
        }

        const xmlText = await response.text();

        // Parse RSS XML to extract news items
        const newsItems = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const titleRegex = /<title>([\s\S]*?)<\/title>/;
        const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
        const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/;

        let match;
        let count = 0;
        while ((match = itemRegex.exec(xmlText)) !== null && count < 5) {
            const item = match[1];
            const titleMatch = titleRegex.exec(item);
            const dateMatch = pubDateRegex.exec(item);
            const sourceMatch = sourceRegex.exec(item);

            if (titleMatch) {
                const title = titleMatch[1]
                    .replace(/<!\[CDATA\[|\]\]>/g, '')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .trim();

                const source = sourceMatch ? sourceMatch[1].trim() : 'News';
                const date = dateMatch ? new Date(dateMatch[1]).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                }) : '';

                newsItems.push(`• ${title} (${source}${date ? ', ' + date : ''})`);
                count++;
            }
        }

        if (newsItems.length > 0) {
            return newsItems.join('\n');
        }

        return `No recent news found for ${cleanCompanyName}. Check financial news sites for updates.`;
    } catch (error) {
        console.error('Error fetching news from Google:', error.message);
        // Fallback message
        return `Latest news for ${cleanCompanyName} - Please check financial news portals like Moneycontrol, Economic Times, or Bloomberg for real-time updates.`;
    }
}

/**
 * Helper function to wait
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Gemini API with retry logic for rate limiting
 */
async function callGeminiWithRetry(prompt, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Add delay between retries
            if (attempt > 0) {
                await sleep(2000 * attempt); // 2s, 4s delay
            }

            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 2048,
                        topP: 0.9,
                        topK: 40
                    },
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                })
            });

            if (response.status === 429) {
                console.log(`Rate limited, attempt ${attempt + 1}/${maxRetries + 1}`);
                if (attempt === maxRetries) throw new Error('Rate limit exceeded');
                continue;
            }

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                return data.candidates[0].content.parts[0].text;
            }
            throw new Error('Invalid response structure');
        } catch (error) {
            if (attempt === maxRetries) throw error;
        }
    }
}

/**
 * Generate comprehensive AI-powered analysis with predictions
 * Incorporates real-time news sentiment analysis to adjust predictions
 * @param {object} stockData - Complete stock data
 * @returns {Promise<object>} Comprehensive AI analysis with news-adjusted predictions
 */
async function generateAnalysisExplanation(stockData) {
    const { symbol, shortName, longName, marketPrice, marketChange, currency,
            technicalAnalysis, fundamentalAnalysis, analysis, charts } = stockData;

    const companyName = longName || shortName || symbol;
    const currencySymbol = currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : '$';

    // Get market status
    const marketStatus = getMarketStatus(symbol);
    console.log(`📊 Market Status: ${marketStatus.market} - ${marketStatus.isOpen ? 'OPEN' : 'CLOSED'}`);
    console.log(`⏰ Current Time (IST): ${marketStatus.currentTimeIST}`);
    console.log(`🔄 Update Frequency: ${marketStatus.updateFrequency}`);

    // Get recent price data for context
    const historicalData = charts?.historical || [];
    const recentPrices = historicalData.slice(-30); // Last 30 days
    const priceChange30D = recentPrices.length >= 2
        ? ((recentPrices[recentPrices.length-1]?.close - recentPrices[0]?.close) / recentPrices[0]?.close * 100).toFixed(2)
        : 'N/A';

    // Fetch stock-specific news
    let stockNewsItems = [];
    let stockNewsText = '';
    try {
        stockNewsText = await fetchStockNews(symbol, companyName);
        // Parse news items for sentiment analysis
        const lines = stockNewsText.split('\n').filter(l => l.startsWith('•'));
        stockNewsItems = lines.map(l => ({ title: l.replace('• ', ''), source: 'Stock News' }));
        console.log(`📰 Fetched ${stockNewsItems.length} news items for ${symbol}`);
    } catch (e) {
        console.log('Stock news fetch failed:', e.message);
        stockNewsText = `Check Moneycontrol, Economic Times, or Bloomberg for latest ${companyName} news.`;
    }

    // Fetch global market news
    let globalNewsItems = [];
    try {
        globalNewsItems = await fetchGlobalMarketNews();
        console.log(`🌍 Fetched ${globalNewsItems.length} global market news items`);
    } catch (e) {
        console.log('Global news fetch failed:', e.message);
    }

    // Combine all news for sentiment analysis
    const allNews = [...stockNewsItems, ...globalNewsItems];

    // Analyze news sentiment
    const newsSentiment = analyzeNewsSentiment(allNews);
    console.log(`📈 News Sentiment: ${newsSentiment.sentiment} (Score: ${newsSentiment.score.toFixed(3)})`);
    console.log(`📊 News Impact Adjustment: ${(newsSentiment.impactAdjustment * 100).toFixed(2)}%`);

    // Format global news for display
    const globalNewsText = globalNewsItems.length > 0
        ? '\n\n🌍 GLOBAL MARKET NEWS:\n' + globalNewsItems.map(n => `• ${n.title} (${n.source}, ${n.date})`).join('\n')
        : '';

    // Combine news
    const combinedNews = stockNewsText + globalNewsText;

    // Build comprehensive prompt with news sentiment
    const prompt = buildComprehensivePrompt(stockData, combinedNews, priceChange30D, currencySymbol, newsSentiment, marketStatus);

    try {
        const result = await callGeminiWithRetry(prompt);
        return result;
    } catch (error) {
        console.error('Error calling Gemini API:', error.message);
        return generateFallbackExplanation(stockData, combinedNews, newsSentiment, marketStatus);
    }
}

/**
 * Get future dates for predictions
 */
function getFutureDates() {
    const today = new Date();

    // Next trading day (skip weekends)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
        tomorrow.setDate(tomorrow.getDate() + 1);
    }

    // 1 week from now
    const oneWeek = new Date(today);
    oneWeek.setDate(oneWeek.getDate() + 7);

    // 1 month from now
    const oneMonth = new Date(today);
    oneMonth.setMonth(oneMonth.getMonth() + 1);

    const formatDate = (date) => date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });

    return {
        tomorrow: formatDate(tomorrow),
        oneWeek: formatDate(oneWeek),
        oneMonth: formatDate(oneMonth)
    };
}

/**
 * Calculate realistic price predictions using weighted combination of all analysis factors
 * Weights: Technical (25%), Fundamental (25%), Quantitative (30%), News (20%)
 */
function calculateRealisticPredictions(stockData, newsSentiment = {}, historicalData = []) {
    const { marketPrice, technicalAnalysis, fundamentalAnalysis, analysis } = stockData;
    const price = marketPrice || 0;

    // ============ HISTORICAL VOLATILITY CALCULATION (5-year data) ============
    let dailyVolatility = 0.015; // Default 1.5% daily volatility
    if (historicalData.length > 30) {
        const returns = [];
        for (let i = 1; i < Math.min(historicalData.length, 252); i++) { // Use up to 1 year
            const prevClose = historicalData[i - 1]?.close;
            const currClose = historicalData[i]?.close;
            if (prevClose && currClose && prevClose > 0) {
                returns.push((currClose - prevClose) / prevClose);
            }
        }
        if (returns.length > 0) {
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
            dailyVolatility = Math.sqrt(variance);
        }
    }

    // ============ TECHNICAL ANALYSIS SCORE (-1 to +1) ============
    let technicalScore = 0;
    const tech = technicalAnalysis?.summary || {};

    // Trend analysis
    if (tech.trend === 'Uptrend') technicalScore += 0.3;
    else if (tech.trend === 'Downtrend') technicalScore -= 0.3;

    // RSI analysis
    const rsi = parseFloat(tech.rsi);
    if (!isNaN(rsi)) {
        if (rsi < 30) technicalScore += 0.25; // Oversold - bullish
        else if (rsi > 70) technicalScore -= 0.25; // Overbought - bearish
        else if (rsi >= 50) technicalScore += 0.1;
        else technicalScore -= 0.1;
    }

    // MACD
    if (tech.macd_signal === 'Bullish') technicalScore += 0.2;
    else if (tech.macd_signal === 'Bearish') technicalScore -= 0.2;

    // Clamp technical score
    technicalScore = Math.max(-1, Math.min(1, technicalScore));

    // ============ FUNDAMENTAL ANALYSIS SCORE (-1 to +1) ============
    let fundamentalScore = 0;
    const fund = fundamentalAnalysis || {};

    if (fund.rating === 'Strong') fundamentalScore = 0.5;
    else if (fund.rating === 'Moderate') fundamentalScore = 0.1;
    else if (fund.rating === 'Weak') fundamentalScore = -0.4;

    // Adjust based on fundamental score if available
    if (fund.fundamentalScore) {
        const fs = fund.fundamentalScore;
        if (fs > 0.7) fundamentalScore += 0.2;
        else if (fs < 0.3) fundamentalScore -= 0.2;
    }

    fundamentalScore = Math.max(-1, Math.min(1, fundamentalScore));

    // ============ QUANTITATIVE MODEL SCORE ============
    const quant5D = analysis?.['5-Day'] || {};
    const quant1M = analysis?.['1-Month'] || {};

    // Use quant model expected returns but cap them to realistic values
    const quantDailyReturn = Math.max(-0.03, Math.min(0.03, (quant5D.expectedReturn || 0) / 5));
    const quantWeekReturn = Math.max(-0.05, Math.min(0.05, quant5D.expectedReturn || 0));
    const quantMonthReturn = Math.max(-0.10, Math.min(0.10, quant1M.expectedReturn || 0));

    // ============ NEWS SENTIMENT SCORE (-1 to +1) ============
    const newsScore = newsSentiment.score || 0;
    const newsImpact = Math.max(-0.02, Math.min(0.02, newsScore * 0.02)); // Max 2% impact

    // ============ WEIGHTED COMBINATION ============
    // Weights: Technical 25%, Fundamental 25%, Quant 30%, News 20%
    const techWeight = 0.25;
    const fundWeight = 0.25;
    const quantWeight = 0.30;
    const newsWeight = 0.20;

    // Convert scores to expected daily returns (scale down to realistic values)
    const techDailyReturn = technicalScore * dailyVolatility * 0.5; // Technical contributes up to half of daily vol
    const fundDailyReturn = fundamentalScore * dailyVolatility * 0.3; // Fundamental has smaller daily impact

    // Calculate weighted returns for each timeframe
    const nextDayReturn = (
        techDailyReturn * techWeight +
        fundDailyReturn * fundWeight +
        quantDailyReturn * quantWeight +
        newsImpact * newsWeight
    );

    const weekReturn = (
        (technicalScore * dailyVolatility * 2.5) * techWeight + // ~5 days of technical impact
        (fundamentalScore * dailyVolatility * 1.5) * fundWeight +
        quantWeekReturn * quantWeight +
        (newsImpact * 3) * newsWeight // News impact amplified over week
    );

    const monthReturn = (
        (technicalScore * dailyVolatility * 8) * techWeight + // ~22 days but dampened
        (fundamentalScore * dailyVolatility * 10) * fundWeight + // Fundamentals matter more over month
        quantMonthReturn * quantWeight +
        (newsImpact * 5) * newsWeight // News impact over month
    );

    // Cap final returns to realistic values
    const cappedNextDayReturn = Math.max(-0.05, Math.min(0.05, nextDayReturn));
    const cappedWeekReturn = Math.max(-0.10, Math.min(0.10, weekReturn));
    const cappedMonthReturn = Math.max(-0.15, Math.min(0.15, monthReturn));

    // Calculate confidence based on signal agreement
    const signalAgreement = Math.abs(technicalScore + fundamentalScore + (newsScore * 0.5)) / 2.5;
    const confidence = Math.min(85, Math.max(40, 50 + signalAgreement * 35));

    return {
        nextDay: {
            return: cappedNextDayReturn,
            price: price * (1 + cappedNextDayReturn),
            confidence: Math.round(confidence)
        },
        oneWeek: {
            return: cappedWeekReturn,
            price: price * (1 + cappedWeekReturn),
            confidence: Math.round(confidence - 5)
        },
        oneMonth: {
            return: cappedMonthReturn,
            price: price * (1 + cappedMonthReturn),
            confidence: Math.round(confidence - 10)
        },
        breakdown: {
            technicalScore: (technicalScore * 100).toFixed(1),
            fundamentalScore: (fundamentalScore * 100).toFixed(1),
            quantScore: ((quantDailyReturn / dailyVolatility) * 100).toFixed(1),
            newsScore: (newsScore * 100).toFixed(1),
            dailyVolatility: (dailyVolatility * 100).toFixed(2)
        }
    };
}

/**
 * ============================================================================
 * PROFESSIONAL TRADING DATA SOURCES SIMULATION
 * Simulates data from: TradingView, Chartink, Screener.in, NSE Option Chain,
 * Investing.com, GoCharting, Tickertape, Opstra, Sensibull, NiftyTrader,
 * Moneycontrol, Trendlyne, Google Finance
 * ============================================================================
 */

/**
 * Simulate Chartink Technical Scanner Data
 * Chartink is the most powerful free scanner for technical queries
 * Example: "Stocks where 50 EMA crossed 200 EMA" or "Volume is 2x yesterday"
 */
function simulateChartinkScan(technicalAnalysis, historicalData = []) {
    const tech = technicalAnalysis?.summary || {};
    const signals = [];
    let score = 0;

    // EMA Crossover Detection (Golden Cross / Death Cross)
    if (tech.trend === 'Uptrend') {
        signals.push({ scan: '50 EMA > 200 EMA', result: 'BULLISH', description: 'Golden Cross Zone' });
        score += 15;
    } else if (tech.trend === 'Downtrend') {
        signals.push({ scan: '50 EMA < 200 EMA', result: 'BEARISH', description: 'Death Cross Zone' });
        score -= 15;
    }

    // Volume Analysis (simulate 2x volume check)
    if (historicalData.length >= 2) {
        const latestVolume = historicalData[historicalData.length - 1]?.volume || 0;
        const avgVolume = historicalData.slice(-20).reduce((sum, d) => sum + (d.volume || 0), 0) / 20;

        if (latestVolume > avgVolume * 2) {
            signals.push({ scan: 'Volume > 2x Average', result: 'HIGH VOLUME', description: 'Institutional activity detected' });
            score += 10;
        } else if (latestVolume > avgVolume * 1.5) {
            signals.push({ scan: 'Volume > 1.5x Average', result: 'ABOVE AVG', description: 'Increased interest' });
            score += 5;
        }
    }

    // RSI-based scans
    const rsi = parseFloat(tech.rsi);
    if (!isNaN(rsi)) {
        if (rsi < 30) {
            signals.push({ scan: 'RSI < 30', result: 'OVERSOLD', description: 'Potential reversal zone' });
            score += 10;
        } else if (rsi > 70) {
            signals.push({ scan: 'RSI > 70', result: 'OVERBOUGHT', description: 'Caution - may pullback' });
            score -= 10;
        } else if (rsi > 50 && rsi < 60) {
            signals.push({ scan: 'RSI 50-60', result: 'BULLISH ZONE', description: 'Healthy momentum' });
            score += 5;
        }
    }

    // MACD Signal
    if (tech.macd_signal === 'Bullish') {
        signals.push({ scan: 'MACD Crossover', result: 'BUY SIGNAL', description: 'MACD line crossed above signal' });
        score += 10;
    } else if (tech.macd_signal === 'Bearish') {
        signals.push({ scan: 'MACD Crossover', result: 'SELL SIGNAL', description: 'MACD line crossed below signal' });
        score -= 10;
    }

    return { signals, score, source: 'Chartink Scanner' };
}

/**
 * Simulate TradingView Technical Analysis
 * Best interface for drawing lines, adding indicators (RSI, MACD), visualizing price movement
 */
function simulateTradingViewAnalysis(technicalAnalysis, price, historicalData = []) {
    const tech = technicalAnalysis?.summary || {};
    const analysis = {
        summary: 'NEUTRAL',
        oscillators: { buy: 0, sell: 0, neutral: 0 },
        movingAverages: { buy: 0, sell: 0, neutral: 0 },
        pivotPoints: {},
        signals: []
    };

    // Calculate Support/Resistance from historical data
    if (historicalData.length >= 20) {
        const last20 = historicalData.slice(-20);
        const highs = last20.map(d => d.high || d.close);
        const lows = last20.map(d => d.low || d.close);

        analysis.pivotPoints = {
            r3: Math.max(...highs) * 1.03,
            r2: Math.max(...highs) * 1.015,
            r1: Math.max(...highs),
            pivot: (Math.max(...highs) + Math.min(...lows) + price) / 3,
            s1: Math.min(...lows),
            s2: Math.min(...lows) * 0.985,
            s3: Math.min(...lows) * 0.97
        };
    } else {
        analysis.pivotPoints = {
            r3: price * 1.08,
            r2: price * 1.05,
            r1: price * 1.025,
            pivot: price,
            s1: price * 0.975,
            s2: price * 0.95,
            s3: price * 0.92
        };
    }

    // Oscillator Analysis
    const rsi = parseFloat(tech.rsi);
    if (!isNaN(rsi)) {
        if (rsi < 30) analysis.oscillators.buy++;
        else if (rsi > 70) analysis.oscillators.sell++;
        else analysis.oscillators.neutral++;
    }

    if (tech.macd_signal === 'Bullish') analysis.oscillators.buy++;
    else if (tech.macd_signal === 'Bearish') analysis.oscillators.sell++;
    else analysis.oscillators.neutral++;

    // Moving Averages Analysis
    if (tech.trend === 'Uptrend') {
        analysis.movingAverages.buy += 3;
        analysis.signals.push('Price > EMA20 > EMA50 (Strong Bullish)');
    } else if (tech.trend === 'Downtrend') {
        analysis.movingAverages.sell += 3;
        analysis.signals.push('Price < EMA20 < EMA50 (Strong Bearish)');
    } else {
        analysis.movingAverages.neutral += 3;
        analysis.signals.push('EMAs Converging (Consolidation)');
    }

    // Calculate overall summary
    const totalBuy = analysis.oscillators.buy + analysis.movingAverages.buy;
    const totalSell = analysis.oscillators.sell + analysis.movingAverages.sell;

    if (totalBuy >= totalSell + 2) analysis.summary = 'STRONG BUY';
    else if (totalBuy > totalSell) analysis.summary = 'BUY';
    else if (totalSell >= totalBuy + 2) analysis.summary = 'STRONG SELL';
    else if (totalSell > totalBuy) analysis.summary = 'SELL';
    else analysis.summary = 'NEUTRAL';

    return { ...analysis, source: 'TradingView Analysis' };
}

/**
 * Simulate NSE Option Chain Data (for Indian stocks)
 * Shows Call/Put writing, Max Pain, Put-Call Ratio
 */
function simulateNSEOptionChain(symbol, price, technicalAnalysis) {
    const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');
    if (!isIndian) {
        return { available: false, message: 'Option chain available for Indian stocks only' };
    }

    // Simulate Option Chain metrics based on technical indicators
    const tech = technicalAnalysis?.summary || {};
    const trend = tech.trend || 'Neutral';

    // Simulate PCR (Put-Call Ratio) based on trend
    let pcr = 1.0; // Neutral
    if (trend === 'Uptrend') pcr = 0.7 + Math.random() * 0.3; // 0.7-1.0 (Bullish)
    else if (trend === 'Downtrend') pcr = 1.2 + Math.random() * 0.5; // 1.2-1.7 (Bearish)
    else pcr = 0.9 + Math.random() * 0.2; // 0.9-1.1 (Neutral)

    // Simulate Max Pain (price where option sellers want market to expire)
    const maxPain = price * (1 + (Math.random() - 0.5) * 0.02); // Within 1% of current price

    // Simulate OI Change interpretation
    let oiInterpretation = 'Neutral';
    if (pcr < 0.8) oiInterpretation = 'Bullish - More Calls being written (sellers confident of upside cap)';
    else if (pcr > 1.3) oiInterpretation = 'Bearish - More Puts being written (sellers confident of downside cap)';
    else if (pcr >= 0.8 && pcr <= 1.2) oiInterpretation = 'Balanced - No clear directional bias';

    // Key strike levels
    const atmStrike = Math.round(price / 50) * 50; // Round to nearest 50
    const keyStrikes = {
        highestCallOI: atmStrike + 100,
        highestPutOI: atmStrike - 100,
        maxPainStrike: Math.round(maxPain / 50) * 50
    };

    return {
        available: true,
        pcr: pcr.toFixed(2),
        pcrInterpretation: pcr < 0.8 ? 'BULLISH' : pcr > 1.3 ? 'BEARISH' : 'NEUTRAL',
        maxPain: maxPain.toFixed(2),
        maxPainStrike: keyStrikes.maxPainStrike,
        oiInterpretation,
        keyStrikes,
        source: 'NSE Option Chain (Simulated)'
    };
}

/**
 * Simulate Sensibull/Opstra Options Analysis
 * Visualizes Open Interest bars, strategy builder
 */
function simulateOptionsStrategy(symbol, price, trend) {
    const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');

    // Suggest strategy based on market view
    let suggestedStrategy = '';
    let riskReward = '';

    if (trend === 'Uptrend') {
        suggestedStrategy = 'Bull Call Spread or Cash Secured Put';
        riskReward = 'Limited Risk, Moderate Reward';
    } else if (trend === 'Downtrend') {
        suggestedStrategy = 'Bear Put Spread or Covered Call';
        riskReward = 'Limited Risk, Moderate Reward';
    } else {
        suggestedStrategy = 'Iron Condor or Short Straddle';
        riskReward = 'Limited Reward, Defined Risk';
    }

    return {
        suggestedStrategy,
        riskReward,
        breakeven: {
            upper: (price * 1.03).toFixed(2),
            lower: (price * 0.97).toFixed(2)
        },
        source: isIndian ? 'Sensibull/Opstra (Simulated)' : 'Options Strategy Builder'
    };
}

/**
 * Simulate Tickertape Red Flags Check
 * Checks ASM/GSM list, accounting issues, corporate governance
 */
function simulateTickertapeRedFlags(fundamentalAnalysis, symbol) {
    const fund = fundamentalAnalysis || {};
    const metrics = fund.metrics || {};
    const redFlags = [];
    let riskScore = 0;

    // Check for high debt (potential financial stress)
    if (metrics.debtToEquity > 2) {
        redFlags.push({ flag: 'HIGH DEBT', severity: 'HIGH', detail: `D/E Ratio: ${metrics.debtToEquity?.toFixed(2)}` });
        riskScore += 30;
    }

    // Check for negative ROE (losing money on equity)
    if (metrics.roe < 0) {
        redFlags.push({ flag: 'NEGATIVE ROE', severity: 'HIGH', detail: 'Company losing money on shareholders equity' });
        riskScore += 25;
    }

    // Check for very high PE (overvaluation risk)
    if (metrics.peRatio > 100) {
        redFlags.push({ flag: 'EXTREME VALUATION', severity: 'MEDIUM', detail: `PE Ratio: ${metrics.peRatio?.toFixed(2)} (very high)` });
        riskScore += 20;
    } else if (metrics.peRatio > 50) {
        redFlags.push({ flag: 'HIGH VALUATION', severity: 'LOW', detail: `PE Ratio: ${metrics.peRatio?.toFixed(2)}` });
        riskScore += 10;
    }

    // Check for negative revenue growth
    if (metrics.revenueGrowth < -0.1) {
        redFlags.push({ flag: 'REVENUE DECLINE', severity: 'HIGH', detail: `Revenue shrinking by ${(Math.abs(metrics.revenueGrowth) * 100).toFixed(1)}%` });
        riskScore += 25;
    }

    // Simulate ASM/GSM check for Indian stocks
    const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');
    if (isIndian && riskScore > 50) {
        redFlags.push({ flag: 'POTENTIAL ASM/GSM', severity: 'WARNING', detail: 'High risk metrics - check NSE ASM/GSM list' });
    }

    return {
        redFlags,
        riskScore: Math.min(100, riskScore),
        riskLevel: riskScore > 60 ? 'HIGH RISK' : riskScore > 30 ? 'MEDIUM RISK' : 'LOW RISK',
        recommendation: riskScore > 60 ? 'AVOID' : riskScore > 30 ? 'CAUTION' : 'ACCEPTABLE',
        source: 'Tickertape Red Flags (Simulated)'
    };
}

/**
 * Simulate Investing.com Global Indices Impact
 * Shows what US (Nasdaq/Dow) and Asian markets are doing
 */
function simulateGlobalIndicesImpact(symbol) {
    const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');

    // Simulate global market sentiment (in production, fetch real data)
    const globalSentiment = {
        usMarkets: {
            dow: { change: (Math.random() - 0.5) * 2, sentiment: 'NEUTRAL' },
            nasdaq: { change: (Math.random() - 0.5) * 3, sentiment: 'NEUTRAL' },
            sp500: { change: (Math.random() - 0.5) * 2, sentiment: 'NEUTRAL' }
        },
        asianMarkets: {
            nikkei: { change: (Math.random() - 0.5) * 2, sentiment: 'NEUTRAL' },
            hangSeng: { change: (Math.random() - 0.5) * 3, sentiment: 'NEUTRAL' },
            sgx: { change: (Math.random() - 0.5) * 1.5, sentiment: 'NEUTRAL' }
        },
        indianGift: isIndian ? (Math.random() - 0.5) * 1 : null // SGX Nifty / Gift Nifty
    };

    // Calculate impact score
    let impactScore = 0;
    Object.values(globalSentiment.usMarkets).forEach(m => {
        m.sentiment = m.change > 0.5 ? 'BULLISH' : m.change < -0.5 ? 'BEARISH' : 'NEUTRAL';
        impactScore += m.change;
    });
    Object.values(globalSentiment.asianMarkets).forEach(m => {
        m.sentiment = m.change > 0.5 ? 'BULLISH' : m.change < -0.5 ? 'BEARISH' : 'NEUTRAL';
        impactScore += m.change * 0.5;
    });

    const gapPrediction = isIndian
        ? (globalSentiment.indianGift > 0.3 ? 'Gap Up Expected' : globalSentiment.indianGift < -0.3 ? 'Gap Down Expected' : 'Flat Opening Expected')
        : 'Check pre-market futures';

    return {
        ...globalSentiment,
        overallImpact: impactScore > 2 ? 'POSITIVE' : impactScore < -2 ? 'NEGATIVE' : 'NEUTRAL',
        gapPrediction,
        source: 'Investing.com Global Indices (Simulated)'
    };
}

/**
 * Simulate Trendlyne SWOT Analysis
 * Quick SWOT Analysis and broker targets
 */
function simulateTrendlyneSWOT(fundamentalAnalysis, technicalAnalysis, symbol) {
    const fund = fundamentalAnalysis || {};
    const tech = technicalAnalysis?.summary || {};
    const metrics = fund.metrics || {};

    const swot = {
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: []
    };

    // Analyze Strengths
    if (metrics.roe > 0.15) swot.strengths.push('Strong ROE > 15%');
    if (metrics.revenueGrowth > 0.1) swot.strengths.push('Revenue growth > 10%');
    if (metrics.debtToEquity < 0.5) swot.strengths.push('Low debt company');
    if (tech.trend === 'Uptrend') swot.strengths.push('Strong technical momentum');

    // Analyze Weaknesses
    if (metrics.roe < 0.05) swot.weaknesses.push('Weak ROE < 5%');
    if (metrics.debtToEquity > 1.5) swot.weaknesses.push('High debt burden');
    if (metrics.revenueGrowth < 0) swot.weaknesses.push('Declining revenues');
    if (tech.trend === 'Downtrend') swot.weaknesses.push('Weak price momentum');

    // Opportunities (based on technicals)
    const rsi = parseFloat(tech.rsi);
    if (!isNaN(rsi) && rsi < 35) swot.opportunities.push('RSI oversold - potential bounce');
    if (tech.macd_signal === 'Bullish') swot.opportunities.push('MACD bullish crossover');
    if (fund.rating === 'Strong' || fund.rating === 'Moderate') swot.opportunities.push('Fundamentally sound for long-term');

    // Threats
    if (!isNaN(rsi) && rsi > 75) swot.threats.push('RSI overbought - pullback risk');
    if (metrics.peRatio > 50) swot.threats.push('High valuation risk');
    if (tech.volatility === 'High') swot.threats.push('High volatility - increased risk');

    // Simulate broker targets (would be fetched from Trendlyne in production)
    const currentPrice = fund.price || 100;
    const brokerTargets = {
        consensus: currentPrice * (1 + (Math.random() * 0.3 - 0.1)),
        high: currentPrice * (1 + Math.random() * 0.4),
        low: currentPrice * (1 - Math.random() * 0.2),
        numAnalysts: Math.floor(Math.random() * 20) + 5
    };

    return {
        swot,
        brokerTargets,
        overallScore: (swot.strengths.length * 2 + swot.opportunities.length - swot.weaknesses.length * 2 - swot.threats.length),
        source: 'Trendlyne SWOT (Simulated)'
    };
}

/**
 * Calculate comprehensive trading verdict using ALL professional data sources
 * Simulates data from: Screener.in, TradingView, Chartink, Moneycontrol, NSE Option Chain,
 * Tickertape, Sensibull, Opstra, NiftyTrader, Investing.com, Trendlyne, Google Finance
 */
function calculateTradingVerdict(stockData, newsSentiment = {}, predictions) {
    const { technicalAnalysis, fundamentalAnalysis, analysis, charts, symbol } = stockData;
    const fund = fundamentalAnalysis || {};
    const tech = technicalAnalysis?.summary || {};
    const quant1M = analysis?.['1-Month'] || {};
    const historicalData = charts?.historical || [];
    const price = stockData.marketPrice || 0;

    // ============ GATHER DATA FROM ALL PROFESSIONAL SOURCES ============

    // 1. Chartink Technical Scans
    const chartinkData = simulateChartinkScan(technicalAnalysis, historicalData);

    // 2. TradingView Analysis
    const tradingViewData = simulateTradingViewAnalysis(technicalAnalysis, price, historicalData);

    // 3. NSE Option Chain (Indian stocks)
    const optionChainData = simulateNSEOptionChain(symbol, price, technicalAnalysis);

    // 4. Tickertape Red Flags
    const tickertapeData = simulateTickertapeRedFlags(fundamentalAnalysis, symbol);

    // 5. Global Indices Impact
    const globalIndicesData = simulateGlobalIndicesImpact(symbol);

    // 6. Trendlyne SWOT
    const trendlyneData = simulateTrendlyneSWOT(fundamentalAnalysis, technicalAnalysis, symbol);

    // 7. Options Strategy Suggestion
    const optionsStrategy = simulateOptionsStrategy(symbol, price, tech.trend);

    // ============ FUNDAMENTAL SCORE (Screener.in simulation) ============
    // Check: Sales Growth (>10%), Debt-to-Equity (<1), ROE (>15%)
    let fundamentalPoints = 0;
    let fundamentalFlags = [];

    const revenueGrowth = fund.metrics?.revenueGrowth || 0;
    const debtToEquity = fund.metrics?.debtToEquity || 0;
    const roe = fund.metrics?.roe || 0;
    const peRatio = fund.metrics?.peRatio || 0;

    if (revenueGrowth > 0.10) {
        fundamentalPoints += 20;
        fundamentalFlags.push('✅ Sales Growth > 10%');
    } else if (revenueGrowth < 0) {
        fundamentalPoints -= 15;
        fundamentalFlags.push('⚠️ Negative Revenue Growth');
    }

    if (debtToEquity < 1) {
        fundamentalPoints += 20;
        fundamentalFlags.push('✅ Low Debt (D/E < 1)');
    } else if (debtToEquity > 2) {
        fundamentalPoints -= 20;
        fundamentalFlags.push('🚨 HIGH DEBT (D/E > 2)');
    }

    if (roe > 0.15) {
        fundamentalPoints += 20;
        fundamentalFlags.push('✅ Strong ROE > 15%');
    } else if (roe < 0.05) {
        fundamentalPoints -= 10;
        fundamentalFlags.push('⚠️ Weak ROE < 5%');
    }

    if (peRatio > 0 && peRatio < 25) {
        fundamentalPoints += 10;
    } else if (peRatio > 50) {
        fundamentalPoints -= 10;
        fundamentalFlags.push('⚠️ High PE Ratio > 50');
    }

    // ============ TECHNICAL SCORE (TradingView/Chartink simulation) ============
    let technicalPoints = 0;
    let technicalFlags = [];

    // Trend analysis (50 EMA, 200 EMA proxy)
    if (tech.trend === 'Uptrend') {
        technicalPoints += 25;
        technicalFlags.push('✅ Price above 50 EMA (Bullish)');
    } else if (tech.trend === 'Downtrend') {
        technicalPoints -= 25;
        technicalFlags.push('🔴 Price below 50 EMA (Bearish)');
    }

    // RSI analysis
    const rsi = parseFloat(tech.rsi);
    if (!isNaN(rsi)) {
        if (rsi < 30) {
            technicalPoints += 20;
            technicalFlags.push(`✅ RSI Oversold (${rsi.toFixed(1)}) - Potential bounce`);
        } else if (rsi > 70) {
            technicalPoints -= 20;
            technicalFlags.push(`🚨 RSI Overbought (${rsi.toFixed(1)}) - Risk of pullback`);
        } else if (rsi >= 50 && rsi <= 60) {
            technicalPoints += 10;
            technicalFlags.push(`✅ RSI Healthy (${rsi.toFixed(1)})`);
        }
    }

    // MACD crossover
    if (tech.macd_signal === 'Bullish') {
        technicalPoints += 15;
        technicalFlags.push('✅ MACD Bullish Crossover');
    } else if (tech.macd_signal === 'Bearish') {
        technicalPoints -= 15;
        technicalFlags.push('🔴 MACD Bearish Crossover');
    }

    // Volume/Volatility
    if (tech.volatility === 'High') {
        technicalFlags.push('⚠️ High Volatility - Use Stop Loss');
    }

    // ============ SENTIMENT SCORE (Moneycontrol/Pulse simulation) ============
    let sentimentPoints = 0;
    let sentimentFlags = [];

    const newsScore = newsSentiment.score || 0;
    if (newsScore > 0.3) {
        sentimentPoints += 20;
        sentimentFlags.push('✅ Positive News Sentiment');
    } else if (newsScore < -0.3) {
        sentimentPoints -= 20;
        sentimentFlags.push('🔴 Negative News Sentiment');
    } else {
        sentimentFlags.push('⚪ Neutral News Sentiment');
    }

    // Check for major events in news
    if (newsSentiment.details?.some(d => d.keywords?.some(k => k.includes('scandal') || k.includes('fraud')))) {
        sentimentPoints -= 30;
        sentimentFlags.push('🚨 SCANDAL/FRAUD in News - HIGH RISK');
    }

    // ============ QUANTITATIVE SCORE ============
    let quantPoints = 0;
    const expectedReturn = quant1M.expectedReturn || 0;
    const probability = parseFloat(quant1M.probability?.positive) || 50;

    if (expectedReturn > 0.05) {
        quantPoints += 20;
    } else if (expectedReturn < -0.05) {
        quantPoints -= 20;
    }

    if (probability > 60) {
        quantPoints += 10;
    } else if (probability < 40) {
        quantPoints -= 10;
    }

    // ============ CALCULATE FINAL CONFIDENCE SCORE ============
    const totalPoints = fundamentalPoints + technicalPoints + sentimentPoints + quantPoints;
    const maxPossiblePoints = 100;
    const minPossiblePoints = -100;

    // Normalize to 0-100 scale
    const normalizedScore = ((totalPoints - minPossiblePoints) / (maxPossiblePoints - minPossiblePoints)) * 100;
    const confidenceScore = Math.max(0, Math.min(100, Math.round(normalizedScore)));

    // ============ DETERMINE VERDICT ============
    let verdict = 'WAIT';
    let timeframe = 'Swing (1-2 weeks)';

    if (confidenceScore >= 70 && technicalPoints > 0 && fundamentalPoints > 0) {
        verdict = 'BUY';
        if (fundamentalPoints > 40) timeframe = 'Long Term (1+ Years)';
        else if (technicalPoints > 30 && rsi < 40) timeframe = 'Swing (1-2 weeks)';
        else timeframe = 'Short Term (1-5 days)';
    } else if (confidenceScore <= 30 || (technicalPoints < -20 && sentimentPoints < -10)) {
        verdict = 'SELL';
        timeframe = 'Immediate / Short Term';
    } else {
        verdict = 'WAIT';
        timeframe = 'Wait for better entry';
    }

    // Collect all warnings including from Tickertape
    const warnings = [
        ...fundamentalFlags.filter(f => f.includes('⚠️') || f.includes('🚨')),
        ...technicalFlags.filter(f => f.includes('⚠️') || f.includes('🚨')),
        ...sentimentFlags.filter(f => f.includes('⚠️') || f.includes('🚨')),
        ...tickertapeData.redFlags.map(rf => `🚨 ${rf.flag}: ${rf.detail}`)
    ];

    // Add Chartink scan signals to bullish/bearish
    const chartinkBullish = chartinkData.signals.filter(s => s.result === 'BULLISH' || s.result === 'BUY SIGNAL' || s.result === 'OVERSOLD');
    const chartinkBearish = chartinkData.signals.filter(s => s.result === 'BEARISH' || s.result === 'SELL SIGNAL' || s.result === 'OVERBOUGHT');

    return {
        verdict,
        confidenceScore,
        timeframe,
        breakdown: {
            fundamental: { score: fundamentalPoints, flags: fundamentalFlags },
            technical: { score: technicalPoints, flags: technicalFlags },
            sentiment: { score: sentimentPoints, flags: sentimentFlags },
            quantitative: { score: quantPoints }
        },
        // Professional Data Sources
        dataSources: {
            chartink: chartinkData,
            tradingView: tradingViewData,
            optionChain: optionChainData,
            tickertape: tickertapeData,
            globalIndices: globalIndicesData,
            trendlyne: trendlyneData,
            optionsStrategy: optionsStrategy
        },
        warnings,
        signals: {
            bullish: [
                ...fundamentalFlags.filter(f => f.includes('✅')),
                ...technicalFlags.filter(f => f.includes('✅')),
                ...sentimentFlags.filter(f => f.includes('✅')),
                ...chartinkBullish.map(s => `✅ ${s.scan}: ${s.description}`)
            ],
            bearish: [
                ...fundamentalFlags.filter(f => f.includes('🔴') || f.includes('🚨')),
                ...technicalFlags.filter(f => f.includes('🔴') || f.includes('🚨')),
                ...sentimentFlags.filter(f => f.includes('🔴') || f.includes('🚨')),
                ...chartinkBearish.map(s => `🔴 ${s.scan}: ${s.description}`)
            ]
        }
    };
}

/**
 * Build comprehensive prompt for detailed analysis
 * Enhanced with professional trading analyst methodology
 * Simulates: Screener.in, TradingView, Chartink, Moneycontrol, NSE Option Chain
 */
function buildComprehensivePrompt(stockData, newsData, priceChange30D, currencySymbol, newsSentiment = {}, marketStatus = {}) {
    const { symbol, shortName, longName, marketPrice, marketChange, currency,
            technicalAnalysis, fundamentalAnalysis, analysis, charts } = stockData;

    const quant5D = analysis?.['5-Day'] || {};
    const quant1M = analysis?.['1-Month'] || {};
    const quant6M = analysis?.['6-Month'] || {};
    const companyName = longName || shortName || symbol;
    const dates = getFutureDates();
    const isIndianStock = symbol.endsWith('.NS') || symbol.endsWith('.BO');

    // Get historical data for volatility calculation
    const historicalData = charts?.historical || [];

    // Calculate realistic predictions using weighted analysis
    const predictions = calculateRealisticPredictions(stockData, newsSentiment, historicalData);

    // Calculate professional trading verdict
    const tradingVerdict = calculateTradingVerdict(stockData, newsSentiment, predictions);

    const price = marketPrice || 0;
    const nextDayReturn = predictions.nextDay.return;
    const weekReturn = predictions.oneWeek.return;
    const monthReturn = predictions.oneMonth.return;

    const nextDayPrice = predictions.nextDay.price;
    const weekPrice = predictions.oneWeek.price;
    const monthPrice = predictions.oneMonth.price;

    // News sentiment section
    const newsImpact = newsSentiment.impactAdjustment || 0;
    const sentimentSection = newsSentiment.sentiment ? `
📰 NEWS SENTIMENT ANALYSIS (Moneycontrol/Pulse Simulation):
• Overall Sentiment: ${newsSentiment.sentiment} (Score: ${(newsSentiment.score * 100).toFixed(1)}%)
• Confidence: ${newsSentiment.confidence?.toFixed(0) || 50}%
• News Impact on Price: ${newsImpact >= 0 ? '+' : ''}${(newsImpact * 100).toFixed(2)}%
${newsSentiment.details?.length > 0 ? '• Key Headlines Analyzed:\n' + newsSentiment.details.slice(0, 3).map(d => `  - "${d.headline}" [${d.impact}]`).join('\n') : ''}
` : '';

    // Prediction breakdown section
    const breakdownSection = `
📊 WEIGHTED PREDICTION MODEL:
• Technical Score: ${predictions.breakdown.technicalScore}% (Weight: 25%)
• Fundamental Score: ${predictions.breakdown.fundamentalScore}% (Weight: 25%)
• Quant Model Score: ${predictions.breakdown.quantScore}% (Weight: 30%)
• News Sentiment: ${predictions.breakdown.newsScore}% (Weight: 20%)
• Daily Volatility: ${predictions.breakdown.dailyVolatility}%
`;

    // Market status section
    const marketSection = marketStatus.market ? `
⏰ MARKET STATUS:
• Exchange: ${marketStatus.market}
• Status: ${marketStatus.isOpen ? '🟢 OPEN' : '🔴 CLOSED'}
• Current Time (IST): ${marketStatus.currentTimeIST}
• Update Frequency: ${marketStatus.updateFrequency}
` : '';

    // Professional verdict section
    const verdictSection = `
═══════════════════════════════════════════════════════════════
🎯 PROFESSIONAL TRADING VERDICT (AI Calculated):
═══════════════════════════════════════════════════════════════
📌 VERDICT: ${tradingVerdict.verdict}
📊 CONFIDENCE SCORE: ${tradingVerdict.confidenceScore}%
⏱️ RECOMMENDED TIMEFRAME: ${tradingVerdict.timeframe}

SCORING BREAKDOWN:
• Fundamentals (Screener.in proxy): ${tradingVerdict.breakdown.fundamental.score > 0 ? '+' : ''}${tradingVerdict.breakdown.fundamental.score} points
• Technicals (TradingView proxy): ${tradingVerdict.breakdown.technical.score > 0 ? '+' : ''}${tradingVerdict.breakdown.technical.score} points
• News Sentiment: ${tradingVerdict.breakdown.sentiment.score > 0 ? '+' : ''}${tradingVerdict.breakdown.sentiment.score} points
• Quantitative Model: ${tradingVerdict.breakdown.quantitative.score > 0 ? '+' : ''}${tradingVerdict.breakdown.quantitative.score} points

${tradingVerdict.warnings.length > 0 ? '🚨 WARNINGS/RED FLAGS:\n' + tradingVerdict.warnings.map(w => `  ${w}`).join('\n') : ''}
═══════════════════════════════════════════════════════════════
`;

    return `You are an expert AI Trading Analyst specializing in ${isIndianStock ? 'the Indian Stock Market (NSE/BSE)' : 'Global Stock Markets'}.
Your goal is to provide high-probability trading predictions by simulating the data collection workflow of a professional trader.

### YOUR DATA SOURCE SIMULATION:
1. **Fundamentals (Screener.in):** Sales Growth, Debt-to-Equity, ROE analysis
2. **Technicals (TradingView/Chartink):** Support/Resistance, EMAs, RSI, MACD, Volume
3. **Sentiment (Moneycontrol/Pulse):** Recent news, quarterly results, policy changes
4. **Quantitative Models:** Monte Carlo, ARIMA, Linear Regression ensemble

═══════════════════════════════════════════════════════════════
STOCK: ${symbol} - ${companyName}
CURRENT PRICE: ${currencySymbol}${marketPrice?.toFixed(2) || 'N/A'}
TODAY'S CHANGE: ${marketChange?.amount >= 0 ? '+' : ''}${currencySymbol}${marketChange?.amount?.toFixed(2) || '0'} (${marketChange?.percent >= 0 ? '+' : ''}${marketChange?.percent?.toFixed(2) || '0'}%)
30-DAY CHANGE: ${priceChange30D}%
═══════════════════════════════════════════════════════════════
${verdictSection}
${marketSection}${sentimentSection}
📊 TECHNICAL ANALYSIS (TradingView/Chartink Proxy):
• Current Trend: ${technicalAnalysis?.summary?.trend || 'N/A'}
• RSI (14-day): ${technicalAnalysis?.summary?.rsi || 'N/A'} ${getRSIInterpretation(technicalAnalysis?.summary?.rsi)}
• MACD Signal: ${technicalAnalysis?.summary?.macd_signal || 'N/A'}
• Volatility Level: ${technicalAnalysis?.summary?.volatility || 'N/A'}
• EMA Analysis: ${technicalAnalysis?.summary?.trend === 'Uptrend' ? 'EMA20 > EMA50 (Bullish Golden Cross zone)' : technicalAnalysis?.summary?.trend === 'Downtrend' ? 'EMA20 < EMA50 (Death Cross zone)' : 'EMAs Converging (Neutral)'}
• Support Level: ${(price * 0.95).toFixed(2)} (estimated -5%)
• Resistance Level: ${(price * 1.05).toFixed(2)} (estimated +5%)

📈 FUNDAMENTAL ANALYSIS (Screener.in Proxy):
• Overall Rating: ${fundamentalAnalysis?.rating || 'N/A'}
• Fundamental Score: ${fundamentalAnalysis?.fundamentalScore ? (fundamentalAnalysis.fundamentalScore * 100).toFixed(1) : 'N/A'}/100
• P/E Ratio: ${fundamentalAnalysis?.metrics?.peRatio?.toFixed(2) || 'N/A'} ${fundamentalAnalysis?.metrics?.peRatio > 50 ? '(HIGH - Overvalued risk)' : fundamentalAnalysis?.metrics?.peRatio < 15 ? '(LOW - Potentially undervalued)' : '(MODERATE)'}
• P/B Ratio: ${fundamentalAnalysis?.metrics?.pbRatio?.toFixed(2) || 'N/A'}
• ROE: ${fundamentalAnalysis?.metrics?.roe ? (fundamentalAnalysis.metrics.roe * 100).toFixed(2) + '%' : 'N/A'} ${fundamentalAnalysis?.metrics?.roe > 0.15 ? '(STRONG > 15%)' : '(WEAK < 15%)'}
• Debt/Equity: ${fundamentalAnalysis?.metrics?.debtToEquity?.toFixed(2) || 'N/A'} ${fundamentalAnalysis?.metrics?.debtToEquity > 1 ? '(HIGH DEBT RISK)' : '(HEALTHY)'}
• Revenue Growth: ${fundamentalAnalysis?.metrics?.revenueGrowth ? (fundamentalAnalysis.metrics.revenueGrowth * 100).toFixed(2) + '%' : 'N/A'} ${fundamentalAnalysis?.metrics?.revenueGrowth > 0.1 ? '(STRONG > 10%)' : '(WEAK)'}

🔮 QUANTITATIVE MODEL PREDICTIONS (Monte Carlo + ARIMA + Regression):
5-Day Forecast:
  • Expected Return: ${quant5D.expectedReturn ? (quant5D.expectedReturn * 100).toFixed(2) + '%' : 'N/A'}
  • Win Probability: ${quant5D.probability?.positive || 'N/A'}
  • Risk Level: ${quant5D.riskLevel || 'N/A'}

1-Month Forecast:
  • Expected Return: ${quant1M.expectedReturn ? (quant1M.expectedReturn * 100).toFixed(2) + '%' : 'N/A'}
  • Win Probability: ${quant1M.probability?.positive || 'N/A'}
  • Risk Level: ${quant1M.riskLevel || 'N/A'}

6-Month Forecast:
  • Expected Return: ${quant6M.expectedReturn ? (quant6M.expectedReturn * 100).toFixed(2) + '%' : 'N/A'}
  • Win Probability: ${quant6M.probability?.positive || 'N/A'}
  • Risk Level: ${quant6M.riskLevel || 'N/A'}

📰 LATEST NEWS & CATALYSTS (Google News + Sentiment Analysis):
${newsData}

${breakdownSection}
═══════════════════════════════════════════════════════════════

Based on ALL the above data, provide analysis in this EXACT format:

## 🎯 TRADING VERDICT
**${tradingVerdict.verdict}** | Confidence: **${tradingVerdict.confidenceScore}%** | Timeframe: **${tradingVerdict.timeframe}**

## 📊 TECHNICAL ANALYSIS (TradingView Simulation)
Explain what the technical indicators mean. Mention specific support/resistance levels and whether it's a good entry point. (2-3 sentences)

## 📈 FUNDAMENTAL HEALTH (Screener.in Simulation)
Analyze the company's financial health. Flag if: High PE, High Debt, Low ROE, or Negative Growth. (2-3 sentences)

## 🎯 PRICE PREDICTIONS

**📅 NEXT TRADING DAY (${dates.tomorrow}):**
- Target Price: ${currencySymbol}${nextDayPrice.toFixed(2)}
- Expected Change: ${nextDayReturn >= 0 ? '🟢 +' : '🔴 '}${(nextDayReturn * 100).toFixed(2)}%
- Stop Loss: ${currencySymbol}${(nextDayPrice * 0.97).toFixed(2)} (-3%)

**📅 1 WEEK TARGET (${dates.oneWeek}):**
- Target Price: ${currencySymbol}${weekPrice.toFixed(2)}
- Expected Change: ${weekReturn >= 0 ? '🟢 +' : '🔴 '}${(weekReturn * 100).toFixed(2)}%
- Stop Loss: ${currencySymbol}${(price * 0.95).toFixed(2)} (-5%)

**📅 1 MONTH TARGET (${dates.oneMonth}):**
- Target Price: ${currencySymbol}${monthPrice.toFixed(2)}
- Expected Change: ${monthReturn >= 0 ? '🟢 +' : '🔴 '}${(monthReturn * 100).toFixed(2)}%
- Stop Loss: ${currencySymbol}${(price * 0.92).toFixed(2)} (-8%)

## 📰 NEWS & CATALYST IMPACT
How current news affects the stock. Mention any quarterly results, policy changes, or sector news. (2-3 sentences)

## ⚠️ RED FLAGS & WARNINGS
${tradingVerdict.warnings.length > 0 ? tradingVerdict.warnings.map(w => `• ${w}`).join('\n') : '• No major red flags detected'}
• List any additional risks you identify

## ✅ BULLISH SIGNALS
${tradingVerdict.signals.bullish.length > 0 ? tradingVerdict.signals.bullish.slice(0, 3).map(s => `• ${s}`).join('\n') : '• Limited bullish signals'}

## 🎯 FINAL RECOMMENDATION
State clearly: "${tradingVerdict.verdict}" with ${tradingVerdict.confidenceScore}% confidence for ${tradingVerdict.timeframe}.
Explain in ONE sentence why this verdict was given.

IMPORTANT: Use the exact price predictions calculated above. This is for educational purposes only - not financial advice.`;
}

/**
 * Get RSI interpretation text
 */
function getRSIInterpretation(rsi) {
    const rsiValue = parseFloat(rsi);
    if (isNaN(rsiValue)) return '';
    if (rsiValue < 30) return '(Oversold - potential bounce)';
    if (rsiValue > 70) return '(Overbought - potential pullback)';
    if (rsiValue >= 50) return '(Bullish momentum)';
    return '(Bearish momentum)';
}

/**
 * Generate fallback explanation when API fails
 * Now uses the same weighted realistic predictions and trading verdict as the main prompt
 */
function generateFallbackExplanation(stockData, newsData, newsSentiment = {}, marketStatus = {}) {
    const { symbol, shortName, marketPrice, marketChange, currency,
            technicalAnalysis, fundamentalAnalysis, analysis, charts } = stockData;

    const currencySymbol = currency === 'INR' ? '₹' : '$';
    const trend = technicalAnalysis?.summary?.trend || 'Neutral';
    const rating = fundamentalAnalysis?.rating || 'Moderate';
    const price = marketPrice || 0;

    // Get prediction dates
    const dates = getFutureDates();

    // Get historical data for volatility calculation
    const historicalData = charts?.historical || [];

    // Use the same realistic prediction calculator as the main prompt
    const predictions = calculateRealisticPredictions(stockData, newsSentiment, historicalData);

    // Calculate trading verdict
    const tradingVerdict = calculateTradingVerdict(stockData, newsSentiment, predictions);

    const nextDayReturn = predictions.nextDay.return;
    const weekReturn = predictions.oneWeek.return;
    const monthReturn = predictions.oneMonth.return;

    const nextDayPrice = predictions.nextDay.price;
    const weekPrice = predictions.oneWeek.price;
    const monthPrice = predictions.oneMonth.price;

    const nextDayChange = (nextDayReturn * 100).toFixed(2);
    const weekChange = (weekReturn * 100).toFixed(2);
    const monthChange = (monthReturn * 100).toFixed(2);

    // Market status section
    const marketSection = marketStatus.market ? `
## ⏰ Market Status
- Exchange: **${marketStatus.market}**
- Status: ${marketStatus.isOpen ? '🟢 OPEN' : '🔴 CLOSED'}
- Current Time (IST): ${marketStatus.currentTimeIST}
- Update Frequency: ${marketStatus.updateFrequency}
` : '';

    // News sentiment section
    const newsImpact = newsSentiment.impactAdjustment || 0;
    const sentimentSection = newsSentiment.sentiment ? `
## 📰 News Sentiment Analysis
- Overall Sentiment: **${newsSentiment.sentiment}** (Score: ${(newsSentiment.score * 100).toFixed(1)}%)
- Impact on Predictions: ${newsImpact >= 0 ? '+' : ''}${(newsImpact * 100).toFixed(2)}%
${newsSentiment.details?.length > 0 ? '\n**Key Headlines:**\n' + newsSentiment.details.slice(0, 3).map(d => `- ${d.headline.substring(0, 60)}... [${d.impact}]`).join('\n') : ''}
` : '';

    // Prediction breakdown section
    const breakdownSection = `
## 📊 Prediction Breakdown (Weighted Analysis)
- Technical Score: **${predictions.breakdown.technicalScore}%** (Weight: 25%)
- Fundamental Score: **${predictions.breakdown.fundamentalScore}%** (Weight: 25%)
- Quant Model Score: **${predictions.breakdown.quantScore}%** (Weight: 30%)
- News Sentiment: **${predictions.breakdown.newsScore}%** (Weight: 20%)
- Daily Volatility: **${predictions.breakdown.dailyVolatility}%**
`;

    // Trading verdict section
    const verdictSection = `
## 🎯 TRADING VERDICT
**${tradingVerdict.verdict}** | Confidence: **${tradingVerdict.confidenceScore}%** | Timeframe: **${tradingVerdict.timeframe}**

**Scoring Breakdown:**
- Fundamentals (Screener.in): ${tradingVerdict.breakdown.fundamental.score > 0 ? '+' : ''}${tradingVerdict.breakdown.fundamental.score} points
- Technicals (TradingView): ${tradingVerdict.breakdown.technical.score > 0 ? '+' : ''}${tradingVerdict.breakdown.technical.score} points
- News Sentiment: ${tradingVerdict.breakdown.sentiment.score > 0 ? '+' : ''}${tradingVerdict.breakdown.sentiment.score} points
- Quantitative Model: ${tradingVerdict.breakdown.quantitative.score > 0 ? '+' : ''}${tradingVerdict.breakdown.quantitative.score} points
`;

    return `${marketSection}${verdictSection}
## 📊 Technical Analysis (TradingView Simulation)
The stock is currently showing a **${trend}** pattern. ${
        trend === 'Uptrend'
            ? 'The EMA20 is above EMA50, indicating positive momentum. Price is in a bullish zone.'
            : trend === 'Downtrend'
            ? 'The EMA20 is below EMA50, suggesting bearish pressure. Consider waiting for reversal.'
            : 'Price is consolidating between moving averages. Wait for breakout confirmation.'
    }

RSI is at ${technicalAnalysis?.summary?.rsi || 'moderate levels'}, ${
        parseFloat(technicalAnalysis?.summary?.rsi) < 30
            ? 'indicating the stock may be **OVERSOLD** - potential bounce opportunity.'
            : parseFloat(technicalAnalysis?.summary?.rsi) > 70
            ? 'suggesting **OVERBOUGHT** conditions - risk of pullback.'
            : 'showing balanced momentum.'
    }

**Support Level:** ${currencySymbol}${(price * 0.95).toFixed(2)} | **Resistance Level:** ${currencySymbol}${(price * 1.05).toFixed(2)}

## 📈 Fundamental Analysis (Screener.in Simulation)
The stock has a **${rating}** fundamental rating with a score of ${
        fundamentalAnalysis?.fundamentalScore
            ? (fundamentalAnalysis.fundamentalScore * 100).toFixed(1)
            : 'N/A'
    }/100.

${tradingVerdict.breakdown.fundamental.flags.length > 0 ? '**Key Signals:**\n' + tradingVerdict.breakdown.fundamental.flags.map(f => `- ${f}`).join('\n') : ''}

${sentimentSection}${breakdownSection}
## 🎯 PRICE PREDICTIONS

**📅 NEXT TRADING DAY (${dates.tomorrow}):**
- Target Price: **${currencySymbol}${nextDayPrice.toFixed(2)}**
- Expected Change: ${nextDayReturn >= 0 ? '🟢 +' : '🔴 '}${nextDayChange}%
- Stop Loss: ${currencySymbol}${(nextDayPrice * 0.97).toFixed(2)} (-3%)

**📅 1 WEEK TARGET (${dates.oneWeek}):**
- Target Price: **${currencySymbol}${weekPrice.toFixed(2)}**
- Expected Change: ${weekReturn >= 0 ? '🟢 +' : '🔴 '}${weekChange}%
- Stop Loss: ${currencySymbol}${(price * 0.95).toFixed(2)} (-5%)

**📅 1 MONTH TARGET (${dates.oneMonth}):**
- Target Price: **${currencySymbol}${monthPrice.toFixed(2)}**
- Expected Change: ${monthReturn >= 0 ? '🟢 +' : '🔴 '}${monthChange}%
- Stop Loss: ${currencySymbol}${(price * 0.92).toFixed(2)} (-8%)

## ⚠️ RED FLAGS & WARNINGS
${tradingVerdict.warnings.length > 0 ? tradingVerdict.warnings.map(w => `- ${w}`).join('\n') : '- No major red flags detected'}

## ✅ BULLISH SIGNALS
${tradingVerdict.signals.bullish.length > 0 ? tradingVerdict.signals.bullish.slice(0, 4).map(s => `- ${s}`).join('\n') : '- Limited bullish signals at this time'}

## 📰 Latest News
${newsData || 'News data temporarily unavailable.'}

## 🎯 FINAL RECOMMENDATION
**${tradingVerdict.verdict}** with **${tradingVerdict.confidenceScore}%** confidence for **${tradingVerdict.timeframe}**.

## ⚠️ Disclaimer
This analysis is generated by AI for educational purposes only. It is NOT financial advice. Predictions simulate data from Screener.in, TradingView, and Moneycontrol. Always do your own research and consult a financial advisor before making investment decisions.`;
}

/**
 * Generate market sentiment with detailed signals
 */
async function generateMarketSentiment(stockData) {
    const { technicalAnalysis, fundamentalAnalysis, analysis } = stockData;

    const signals = {
        bullish: 0,
        bearish: 0,
        neutral: 0,
        details: []
    };

    // Technical signals
    if (technicalAnalysis?.summary?.trend === 'Uptrend') {
        signals.bullish += 2;
        signals.details.push({ signal: 'Uptrend', type: 'bullish', source: 'Technical' });
    } else if (technicalAnalysis?.summary?.trend === 'Downtrend') {
        signals.bearish += 2;
        signals.details.push({ signal: 'Downtrend', type: 'bearish', source: 'Technical' });
    } else {
        signals.neutral++;
        signals.details.push({ signal: 'Sideways', type: 'neutral', source: 'Technical' });
    }

    // MACD signal
    if (technicalAnalysis?.summary?.macd_signal === 'Bullish') {
        signals.bullish++;
        signals.details.push({ signal: 'MACD Bullish', type: 'bullish', source: 'Technical' });
    } else if (technicalAnalysis?.summary?.macd_signal === 'Bearish') {
        signals.bearish++;
        signals.details.push({ signal: 'MACD Bearish', type: 'bearish', source: 'Technical' });
    }

    // RSI signal
    const rsi = parseFloat(technicalAnalysis?.summary?.rsi);
    if (!isNaN(rsi)) {
        if (rsi < 30) {
            signals.bullish += 2;
            signals.details.push({ signal: `RSI Oversold (${rsi.toFixed(1)})`, type: 'bullish', source: 'Technical' });
        } else if (rsi > 70) {
            signals.bearish += 2;
            signals.details.push({ signal: `RSI Overbought (${rsi.toFixed(1)})`, type: 'bearish', source: 'Technical' });
        } else if (rsi >= 50) {
            signals.bullish++;
            signals.details.push({ signal: `RSI Bullish (${rsi.toFixed(1)})`, type: 'bullish', source: 'Technical' });
        } else {
            signals.bearish++;
            signals.details.push({ signal: `RSI Bearish (${rsi.toFixed(1)})`, type: 'bearish', source: 'Technical' });
        }
    }

    // Fundamental signals
    if (fundamentalAnalysis?.rating === 'Strong') {
        signals.bullish += 2;
        signals.details.push({ signal: 'Strong Fundamentals', type: 'bullish', source: 'Fundamental' });
    } else if (fundamentalAnalysis?.rating === 'Weak') {
        signals.bearish += 2;
        signals.details.push({ signal: 'Weak Fundamentals', type: 'bearish', source: 'Fundamental' });
    } else {
        signals.neutral++;
        signals.details.push({ signal: 'Moderate Fundamentals', type: 'neutral', source: 'Fundamental' });
    }

    // Quantitative signals
    const quant1M = analysis?.['1-Month'];
    if (quant1M?.expectedReturn > 0.03) {
        signals.bullish += 2;
        signals.details.push({ signal: `Quant Model: +${(quant1M.expectedReturn * 100).toFixed(1)}% expected`, type: 'bullish', source: 'Quantitative' });
    } else if (quant1M?.expectedReturn < -0.03) {
        signals.bearish += 2;
        signals.details.push({ signal: `Quant Model: ${(quant1M.expectedReturn * 100).toFixed(1)}% expected`, type: 'bearish', source: 'Quantitative' });
    } else if (quant1M?.expectedReturn) {
        signals.neutral++;
        signals.details.push({ signal: `Quant Model: ${(quant1M.expectedReturn * 100).toFixed(1)}% expected`, type: 'neutral', source: 'Quantitative' });
    }

    // Calculate overall sentiment
    const total = signals.bullish + signals.bearish + signals.neutral;
    let sentiment = 'Neutral';
    let confidence = 0;

    if (signals.bullish > signals.bearish * 1.5) {
        sentiment = 'Bullish';
        confidence = Math.min(90, Math.round((signals.bullish / total) * 100));
    } else if (signals.bearish > signals.bullish * 1.5) {
        sentiment = 'Bearish';
        confidence = Math.min(90, Math.round((signals.bearish / total) * 100));
    } else {
        sentiment = 'Neutral';
        confidence = Math.round((signals.neutral / total) * 100) || 50;
    }

    return {
        sentiment,
        signals,
        strength: confidence / 100,
        confidence: confidence + '%',
        details: signals.details
    };
}

module.exports = {
    generateAnalysisExplanation,
    generateMarketSentiment,
    fetchStockNews,
    fetchGlobalMarketNews,
    analyzeNewsSentiment,
    getMarketStatus,
    isIndianMarketOpen,
    isUSMarketOpen
};
