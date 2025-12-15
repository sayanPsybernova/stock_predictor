/**
 * News Service - Market News & Sentiment Analysis
 * Fetches news from Moneycontrol and analyzes sentiment
 *
 * Provides:
 * - Latest market news
 * - Stock-specific news
 * - Sentiment analysis
 * - Corporate announcements
 */

const axios = require('axios');
const cheerio = require('cheerio');

const MONEYCONTROL_BASE = 'https://www.moneycontrol.com';

// Create axios instance with headers
const newsAxios = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
    },
    timeout: 15000
});

// Sentiment keywords for analysis
const SENTIMENT_KEYWORDS = {
    veryPositive: [
        'surge', 'soar', 'rally', 'boom', 'breakthrough', 'record high',
        'all-time high', 'blockbuster', 'outperform', 'upgrade', 'bullish',
        'strong buy', 'beat estimates', 'exceeds expectations', 'robust growth'
    ],
    positive: [
        'rise', 'gain', 'up', 'growth', 'profit', 'positive', 'improve',
        'recover', 'advance', 'buy', 'accumulate', 'momentum', 'strength'
    ],
    negative: [
        'fall', 'drop', 'decline', 'down', 'loss', 'negative', 'weak',
        'sell', 'underperform', 'concern', 'warning', 'risk', 'pressure'
    ],
    veryNegative: [
        'crash', 'plunge', 'tumble', 'collapse', 'crisis', 'fraud',
        'scandal', 'default', 'bankruptcy', 'downgrade', 'bearish',
        'miss estimates', 'disappointing', 'cut', 'slash'
    ]
};

/**
 * Fetch latest market news from Moneycontrol
 */
async function fetchLatestNews() {
    try {
        console.log('Fetching latest market news...');

        const response = await newsAxios.get(`${MONEYCONTROL_BASE}/news/business/markets/`);
        const $ = cheerio.load(response.data);

        const news = [];

        // Parse news articles
        $('.news_listing li, .newslist li, .FL').each((i, el) => {
            if (i >= 20) return false; // Limit to 20 articles

            const $el = $(el);
            const title = $el.find('a').first().text().trim() || $el.find('h2 a').text().trim();
            const link = $el.find('a').first().attr('href') || '';
            const time = $el.find('.article_schedule, .time').text().trim();

            if (title && title.length > 10) {
                const sentiment = analyzeSentiment(title);
                news.push({
                    title,
                    link: link.startsWith('http') ? link : MONEYCONTROL_BASE + link,
                    time,
                    sentiment: sentiment.sentiment,
                    sentimentScore: sentiment.score,
                    source: 'Moneycontrol'
                });
            }
        });

        return {
            news,
            overallSentiment: calculateOverallSentiment(news),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error fetching news:', error.message);
        return { news: [], overallSentiment: 'Neutral', timestamp: new Date().toISOString() };
    }
}

/**
 * Fetch news for a specific stock
 * @param {string} symbol - Stock symbol (e.g., 'RELIANCE')
 */
async function fetchStockNews(symbol) {
    try {
        const cleanSymbol = symbol.replace('.NS', '').toUpperCase();
        console.log(`Fetching news for ${cleanSymbol}...`);

        // Try to get stock-specific news
        const searchUrl = `${MONEYCONTROL_BASE}/news/tags/${cleanSymbol.toLowerCase()}.html`;

        const response = await newsAxios.get(searchUrl).catch(() => null);

        const news = [];

        if (response && response.data) {
            const $ = cheerio.load(response.data);

            $('.news_listing li, .list_news li, article').each((i, el) => {
                if (i >= 10) return false;

                const $el = $(el);
                const title = $el.find('a').first().text().trim() || $el.find('h2').text().trim();
                const link = $el.find('a').first().attr('href') || '';
                const time = $el.find('.time, .date, time').text().trim();

                if (title && title.length > 10) {
                    const sentiment = analyzeSentiment(title);
                    news.push({
                        title,
                        link: link.startsWith('http') ? link : MONEYCONTROL_BASE + link,
                        time,
                        sentiment: sentiment.sentiment,
                        sentimentScore: sentiment.score,
                        source: 'Moneycontrol'
                    });
                }
            });
        }

        // Check for specific news catalysts
        const catalysts = detectNewsCatalysts(news);

        return {
            symbol: cleanSymbol,
            news,
            newsCount: news.length,
            overallSentiment: calculateOverallSentiment(news),
            catalysts,
            hasPositiveNews: news.some(n => n.sentimentScore > 0.3),
            hasNegativeNews: news.some(n => n.sentimentScore < -0.3),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error(`Error fetching news for ${symbol}:`, error.message);
        return {
            symbol: symbol.replace('.NS', ''),
            news: [],
            newsCount: 0,
            overallSentiment: 'Neutral',
            catalysts: [],
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Analyze sentiment of text
 * @param {string} text - Text to analyze
 */
function analyzeSentiment(text) {
    if (!text) return { sentiment: 'Neutral', score: 0 };

    const lowerText = text.toLowerCase();
    let score = 0;

    // Very positive keywords (+0.4 each)
    SENTIMENT_KEYWORDS.veryPositive.forEach(keyword => {
        if (lowerText.includes(keyword)) score += 0.4;
    });

    // Positive keywords (+0.2 each)
    SENTIMENT_KEYWORDS.positive.forEach(keyword => {
        if (lowerText.includes(keyword)) score += 0.2;
    });

    // Negative keywords (-0.2 each)
    SENTIMENT_KEYWORDS.negative.forEach(keyword => {
        if (lowerText.includes(keyword)) score -= 0.2;
    });

    // Very negative keywords (-0.4 each)
    SENTIMENT_KEYWORDS.veryNegative.forEach(keyword => {
        if (lowerText.includes(keyword)) score -= 0.4;
    });

    // Normalize score to [-1, 1]
    score = Math.max(-1, Math.min(1, score));

    let sentiment = 'Neutral';
    if (score >= 0.5) sentiment = 'Very Positive';
    else if (score >= 0.2) sentiment = 'Positive';
    else if (score <= -0.5) sentiment = 'Very Negative';
    else if (score <= -0.2) sentiment = 'Negative';

    return { sentiment, score };
}

/**
 * Calculate overall sentiment from news array
 */
function calculateOverallSentiment(news) {
    if (!news || news.length === 0) return 'Neutral';

    const avgScore = news.reduce((sum, n) => sum + (n.sentimentScore || 0), 0) / news.length;

    if (avgScore >= 0.3) return 'Bullish';
    if (avgScore >= 0.1) return 'Mildly Bullish';
    if (avgScore <= -0.3) return 'Bearish';
    if (avgScore <= -0.1) return 'Mildly Bearish';
    return 'Neutral';
}

/**
 * Detect specific news catalysts
 */
function detectNewsCatalysts(news) {
    const catalysts = [];
    const allText = news.map(n => n.title.toLowerCase()).join(' ');

    // Check for earnings
    if (allText.includes('result') || allText.includes('earning') || allText.includes('profit') || allText.includes('quarterly')) {
        catalysts.push({ type: 'Earnings', impact: 'High' });
    }

    // Check for contracts/orders
    if (allText.includes('order') || allText.includes('contract') || allText.includes('deal') || allText.includes('win')) {
        catalysts.push({ type: 'Contract Win', impact: 'High' });
    }

    // Check for management changes
    if (allText.includes('ceo') || allText.includes('appoint') || allText.includes('resign') || allText.includes('management')) {
        catalysts.push({ type: 'Management Change', impact: 'Medium' });
    }

    // Check for regulatory
    if (allText.includes('sebi') || allText.includes('rbi') || allText.includes('government') || allText.includes('policy')) {
        catalysts.push({ type: 'Regulatory', impact: 'Medium' });
    }

    // Check for M&A
    if (allText.includes('merger') || allText.includes('acquisition') || allText.includes('buyout') || allText.includes('takeover')) {
        catalysts.push({ type: 'M&A Activity', impact: 'High' });
    }

    // Check for dividends/bonus
    if (allText.includes('dividend') || allText.includes('bonus') || allText.includes('split') || allText.includes('buyback')) {
        catalysts.push({ type: 'Corporate Action', impact: 'Medium' });
    }

    // Check for analyst ratings
    if (allText.includes('upgrade') || allText.includes('downgrade') || allText.includes('target') || allText.includes('rating')) {
        catalysts.push({ type: 'Analyst Rating', impact: 'Medium' });
    }

    return catalysts;
}

/**
 * Fetch sector news
 * @param {string} sector - Sector name
 */
async function fetchSectorNews(sector) {
    try {
        const sectorMap = {
            'Banking': 'banks',
            'IT': 'tech',
            'Pharma': 'pharma',
            'Auto': 'auto',
            'FMCG': 'fmcg',
            'Energy': 'energy',
            'Metals': 'metals',
            'Realty': 'real-estate',
            'Infra': 'infrastructure'
        };

        const sectorSlug = sectorMap[sector] || sector.toLowerCase();
        console.log(`Fetching news for ${sector} sector...`);

        const response = await newsAxios.get(`${MONEYCONTROL_BASE}/news/business/sectors/${sectorSlug}/`).catch(() => null);

        const news = [];

        if (response && response.data) {
            const $ = cheerio.load(response.data);

            $('.news_listing li, .list_news li').each((i, el) => {
                if (i >= 10) return false;

                const $el = $(el);
                const title = $el.find('a').first().text().trim();
                const link = $el.find('a').first().attr('href') || '';

                if (title && title.length > 10) {
                    const sentiment = analyzeSentiment(title);
                    news.push({
                        title,
                        link: link.startsWith('http') ? link : MONEYCONTROL_BASE + link,
                        sentiment: sentiment.sentiment,
                        sentimentScore: sentiment.score
                    });
                }
            });
        }

        return {
            sector,
            news,
            sentiment: calculateOverallSentiment(news),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error(`Error fetching sector news for ${sector}:`, error.message);
        return { sector, news: [], sentiment: 'Neutral' };
    }
}

/**
 * Get news score for top gainer prediction
 */
function getNewsScore(newsData) {
    if (!newsData || newsData.newsCount === 0) {
        return { score: 0, signals: [] };
    }

    let score = 0;
    const signals = [];

    // Base sentiment score
    const sentimentMap = {
        'Bullish': 20,
        'Mildly Bullish': 10,
        'Neutral': 0,
        'Mildly Bearish': -10,
        'Bearish': -20
    };
    score += sentimentMap[newsData.overallSentiment] || 0;

    // Catalyst bonus
    newsData.catalysts?.forEach(catalyst => {
        if (catalyst.impact === 'High') {
            score += 15;
            signals.push(`${catalyst.type} News`);
        } else {
            score += 8;
        }
    });

    // Positive news bonus
    if (newsData.hasPositiveNews) {
        score += 10;
        signals.push('Positive Coverage');
    }

    // Negative news penalty
    if (newsData.hasNegativeNews) {
        score -= 15;
        signals.push('Negative Headlines');
    }

    // News volume (more news = more attention)
    if (newsData.newsCount >= 5) {
        score += 5;
        signals.push('High News Volume');
    }

    return {
        score: Math.min(50, Math.max(-30, score)),
        signals,
        sentiment: newsData.overallSentiment
    };
}

module.exports = {
    fetchLatestNews,
    fetchStockNews,
    fetchSectorNews,
    analyzeSentiment,
    getNewsScore,
    SENTIMENT_KEYWORDS
};
