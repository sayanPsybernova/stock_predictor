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
 * Build comprehensive prompt for detailed analysis
 * Now includes news sentiment adjustment for dynamic predictions
 */
function buildComprehensivePrompt(stockData, newsData, priceChange30D, currencySymbol, newsSentiment = {}, marketStatus = {}) {
    const { symbol, shortName, longName, marketPrice, marketChange, currency,
            technicalAnalysis, fundamentalAnalysis, analysis, charts } = stockData;

    const quant5D = analysis?.['5-Day'] || {};
    const quant1M = analysis?.['1-Month'] || {};
    const quant6M = analysis?.['6-Month'] || {};
    const companyName = longName || shortName || symbol;
    const dates = getFutureDates();

    // Get historical data for volatility calculation
    const historicalData = charts?.historical || [];

    // Calculate realistic predictions using weighted analysis
    const predictions = calculateRealisticPredictions(stockData, newsSentiment, historicalData);

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
📰 NEWS SENTIMENT ANALYSIS:
• Overall Sentiment: ${newsSentiment.sentiment} (Score: ${(newsSentiment.score * 100).toFixed(1)}%)
• Confidence: ${newsSentiment.confidence?.toFixed(0) || 50}%
• News Impact: ${newsImpact >= 0 ? '+' : ''}${(newsImpact * 100).toFixed(2)}%
${newsSentiment.details?.length > 0 ? '• Key Headlines Analyzed:\n' + newsSentiment.details.slice(0, 3).map(d => `  - "${d.headline}" [${d.impact}]`).join('\n') : ''}
` : '';

    // Prediction breakdown section
    const breakdownSection = `
📊 PREDICTION BREAKDOWN (Weighted Analysis):
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

    return `You are an expert quantitative analyst and AI trading advisor. Provide a COMPREHENSIVE analysis for the stock below.

═══════════════════════════════════════════════════════════════
STOCK: ${symbol} - ${companyName}
CURRENT PRICE: ${currencySymbol}${marketPrice?.toFixed(2) || 'N/A'}
TODAY'S CHANGE: ${marketChange?.amount >= 0 ? '+' : ''}${currencySymbol}${marketChange?.amount?.toFixed(2) || '0'} (${marketChange?.percent >= 0 ? '+' : ''}${marketChange?.percent?.toFixed(2) || '0'}%)
30-DAY CHANGE: ${priceChange30D}%
═══════════════════════════════════════════════════════════════
${marketSection}${sentimentSection}
📊 TECHNICAL ANALYSIS DATA:
• Current Trend: ${technicalAnalysis?.summary?.trend || 'N/A'}
• RSI (14-day): ${technicalAnalysis?.summary?.rsi || 'N/A'} ${getRSIInterpretation(technicalAnalysis?.summary?.rsi)}
• MACD Signal: ${technicalAnalysis?.summary?.macd_signal || 'N/A'}
• Volatility Level: ${technicalAnalysis?.summary?.volatility || 'N/A'}
• EMA20 vs EMA50: ${technicalAnalysis?.summary?.trend === 'Uptrend' ? 'EMA20 > EMA50 (Bullish)' : technicalAnalysis?.summary?.trend === 'Downtrend' ? 'EMA20 < EMA50 (Bearish)' : 'Neutral'}

📈 FUNDAMENTAL ANALYSIS DATA:
• Overall Rating: ${fundamentalAnalysis?.rating || 'N/A'}
• Fundamental Score: ${fundamentalAnalysis?.fundamentalScore ? (fundamentalAnalysis.fundamentalScore * 100).toFixed(1) : 'N/A'}/100
• P/E Ratio: ${fundamentalAnalysis?.metrics?.peRatio?.toFixed(2) || 'N/A'}
• P/B Ratio: ${fundamentalAnalysis?.metrics?.pbRatio?.toFixed(2) || 'N/A'}
• ROE: ${fundamentalAnalysis?.metrics?.roe ? (fundamentalAnalysis.metrics.roe * 100).toFixed(2) + '%' : 'N/A'}
• Debt/Equity: ${fundamentalAnalysis?.metrics?.debtToEquity?.toFixed(2) || 'N/A'}
• Revenue Growth: ${fundamentalAnalysis?.metrics?.revenueGrowth ? (fundamentalAnalysis.metrics.revenueGrowth * 100).toFixed(2) + '%' : 'N/A'}

🔮 QUANTITATIVE MODEL PREDICTIONS:
5-Day Forecast:
  • Expected Return: ${quant5D.expectedReturn ? (quant5D.expectedReturn * 100).toFixed(2) + '%' : 'N/A'}
  • Confidence: ${quant5D.confidence || 0}%
  • Risk Level: ${quant5D.riskLevel || 'N/A'}

1-Month Forecast:
  • Expected Return: ${quant1M.expectedReturn ? (quant1M.expectedReturn * 100).toFixed(2) + '%' : 'N/A'}
  • Confidence: ${quant1M.confidence || 0}%
  • Risk Level: ${quant1M.riskLevel || 'N/A'}

📰 LATEST NEWS & MARKET UPDATES:
${newsData}

═══════════════════════════════════════════════════════════════

Based on ALL the above data, provide a DETAILED analysis with the following sections:

## 📊 TECHNICAL ANALYSIS EXPLAINED
Explain what the technical indicators mean for this stock in 2-3 sentences.

## 📈 FUNDAMENTAL ANALYSIS EXPLAINED
Break down the fundamental metrics in 2-3 sentences.

## 🎯 AI PRICE PREDICTIONS

IMPORTANT: Provide SPECIFIC price predictions with EXACT dates and percentage changes!

**📅 NEXT DAY PREDICTION (${dates.tomorrow}):**
- Predicted Price: ${currencySymbol}${nextDayPrice.toFixed(2)}
- Change: ${nextDayReturn >= 0 ? '+' : ''}${(nextDayReturn * 100).toFixed(2)}%
- Direction: ${nextDayReturn >= 0 ? '🟢 UP' : '🔴 DOWN'}

**📅 1 WEEK PREDICTION (${dates.oneWeek}):**
- Predicted Price: ${currencySymbol}${weekPrice.toFixed(2)}
- Change: ${weekReturn >= 0 ? '+' : ''}${(weekReturn * 100).toFixed(2)}%
- Direction: ${weekReturn >= 0 ? '🟢 UP' : '🔴 DOWN'}

**📅 1 MONTH PREDICTION (${dates.oneMonth}):**
- Predicted Price: ${currencySymbol}${monthPrice.toFixed(2)}
- Change: ${monthReturn >= 0 ? '+' : ''}${(monthReturn * 100).toFixed(2)}%
- Direction: ${monthReturn >= 0 ? '🟢 UP' : '🔴 DOWN'}

Confidence Level: ${predictions.nextDay.confidence}%

## 📰 NEWS IMPACT ANALYSIS
How are recent news and events likely to affect the stock price? (2-3 sentences)

## ⚠️ RISK FACTORS
List 3 key risks in bullet points.

## ✅ POSITIVE CATALYSTS
List 3 positive factors in bullet points.

## 🎯 FINAL VERDICT
One clear sentence: BULLISH, BEARISH, or NEUTRAL with confidence percentage.

IMPORTANT: Keep the response concise. Use the exact price predictions I calculated above. This is for educational purposes only.`;
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
 * Now uses the same weighted realistic predictions as the main prompt
 */
function generateFallbackExplanation(stockData, newsData, newsSentiment = {}, marketStatus = {}) {
    const { symbol, shortName, marketPrice, marketChange, currency,
            technicalAnalysis, fundamentalAnalysis, analysis, charts } = stockData;

    const currencySymbol = currency === 'INR' ? '₹' : '$';
    const trend = technicalAnalysis?.summary?.trend || 'Neutral';
    const rating = fundamentalAnalysis?.rating || 'Moderate';

    // Get prediction dates
    const dates = getFutureDates();

    // Get historical data for volatility calculation
    const historicalData = charts?.historical || [];

    // Use the same realistic prediction calculator as the main prompt
    const predictions = calculateRealisticPredictions(stockData, newsSentiment, historicalData);

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

    return `${marketSection}
## 📊 Technical Analysis
The stock is currently showing a **${trend}** pattern. ${
        trend === 'Uptrend'
            ? 'The EMA20 is above EMA50, indicating positive momentum.'
            : trend === 'Downtrend'
            ? 'The EMA20 is below EMA50, suggesting bearish pressure.'
            : 'Price is consolidating between moving averages.'
    }

RSI is at ${technicalAnalysis?.summary?.rsi || 'moderate levels'}, ${
        parseFloat(technicalAnalysis?.summary?.rsi) < 30
            ? 'indicating the stock may be oversold.'
            : parseFloat(technicalAnalysis?.summary?.rsi) > 70
            ? 'suggesting overbought conditions.'
            : 'showing balanced momentum.'
    }

## 📈 Fundamental Analysis
The stock has a **${rating}** fundamental rating with a score of ${
        fundamentalAnalysis?.fundamentalScore
            ? (fundamentalAnalysis.fundamentalScore * 100).toFixed(1)
            : 'N/A'
    }/100.
${sentimentSection}${breakdownSection}
## 🎯 AI PRICE PREDICTIONS (Weighted Analysis)

**📅 NEXT DAY (${dates.tomorrow}):**
- Predicted Price: **${currencySymbol}${nextDayPrice.toFixed(2)}**
- Change: ${nextDayReturn >= 0 ? '🟢 +' : '🔴 '}${nextDayChange}%
- Confidence: ${predictions.nextDay.confidence}%

**📅 1 WEEK (${dates.oneWeek}):**
- Predicted Price: **${currencySymbol}${weekPrice.toFixed(2)}**
- Change: ${weekReturn >= 0 ? '🟢 +' : '🔴 '}${weekChange}%
- Confidence: ${predictions.oneWeek.confidence}%

**📅 1 MONTH (${dates.oneMonth}):**
- Predicted Price: **${currencySymbol}${monthPrice.toFixed(2)}**
- Change: ${monthReturn >= 0 ? '🟢 +' : '🔴 '}${monthChange}%
- Confidence: ${predictions.oneMonth.confidence}%

## 📰 Latest News
${newsData || 'News data temporarily unavailable.'}

## ⚠️ Disclaimer
This analysis is generated by AI for educational purposes only. It is not financial advice. Predictions are calculated using weighted analysis of technical (25%), fundamental (25%), quantitative (30%), and news sentiment (20%) factors. Always do your own research before making investment decisions.`;
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
