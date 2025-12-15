/**
 * Nifty Total Market Pattern Discovery Service
 * Analyzes 5 years of daily top gainers to find predictive patterns
 *
 * Target: Find stocks that will gain 10%+ tomorrow
 * Method: Analyze what patterns existed BEFORE stocks became top gainers
 *
 * NOW WITH DYNAMIC FEATURES:
 * - Fetches live stock list from NSE India (FREE)
 * - Caches patterns to file for persistence
 * - Auto-fetches today's top gainers
 */

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Cache file paths
const CACHE_DIR = path.join(__dirname, '../cache');
const PATTERNS_CACHE_FILE = path.join(CACHE_DIR, 'nifty-patterns.json');
const STOCKS_CACHE_FILE = path.join(CACHE_DIR, 'nifty-stocks.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Dynamic stock list (will be populated from NSE)
let dynamicStockList = null;
let lastStockListUpdate = null;

// NSE API headers (required for NSE endpoints)
const NSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://www.nseindia.com/'
};

/**
 * Fetch live stock list from NSE India (FREE)
 */
async function fetchNSEStockList() {
    try {
        console.log('📡 Fetching live stock list from NSE India...');

        // Create axios instance with cookie jar for NSE
        const nseAxios = axios.create({
            baseURL: 'https://www.nseindia.com',
            headers: NSE_HEADERS,
            timeout: 10000
        });

        // First, get cookies from main page
        await nseAxios.get('/');

        // Fetch different index constituents
        const indices = [
            { name: 'NIFTY 50', url: '/api/equity-stockIndices?index=NIFTY%2050' },
            { name: 'NIFTY NEXT 50', url: '/api/equity-stockIndices?index=NIFTY%20NEXT%2050' },
            { name: 'NIFTY MIDCAP 150', url: '/api/equity-stockIndices?index=NIFTY%20MIDCAP%20150' },
            { name: 'NIFTY SMALLCAP 250', url: '/api/equity-stockIndices?index=NIFTY%20SMALLCAP%20250' }
        ];

        const stocks = new Set();

        for (const index of indices) {
            try {
                const response = await nseAxios.get(index.url);
                if (response.data && response.data.data) {
                    response.data.data.forEach(stock => {
                        if (stock.symbol) {
                            stocks.add(stock.symbol + '.NS');
                        }
                    });
                }
                console.log(`  ✓ ${index.name}: ${response.data?.data?.length || 0} stocks`);
            } catch (e) {
                console.log(`  ✗ ${index.name}: Failed`);
            }
            await new Promise(r => setTimeout(r, 500));
        }

        if (stocks.size > 0) {
            dynamicStockList = Array.from(stocks);
            lastStockListUpdate = new Date();

            // Cache to file
            fs.writeFileSync(STOCKS_CACHE_FILE, JSON.stringify({
                stocks: dynamicStockList,
                timestamp: lastStockListUpdate.toISOString(),
                source: 'NSE India API'
            }, null, 2));

            console.log(`✅ Fetched ${dynamicStockList.length} stocks from NSE`);
            return dynamicStockList;
        }
    } catch (error) {
        console.error('❌ NSE fetch failed:', error.message);
    }

    // Return null to fall back to static list
    return null;
}

/**
 * Fetch today's top gainers from NSE (FREE)
 */
async function fetchTodaysTopGainers() {
    try {
        console.log('📈 Fetching today\'s top gainers from NSE...');

        const nseAxios = axios.create({
            baseURL: 'https://www.nseindia.com',
            headers: NSE_HEADERS,
            timeout: 10000
        });

        // Get cookies first
        await nseAxios.get('/');

        // Fetch top gainers
        const response = await nseAxios.get('/api/live-analysis-variations?index=gainers');

        if (response.data && response.data.NIFTY) {
            const gainers = response.data.NIFTY.data || [];
            console.log(`✅ Found ${gainers.length} top gainers from NSE`);

            return gainers.map(g => ({
                symbol: g.symbol + '.NS',
                name: g.symbol,
                change: g.pChange,
                price: g.lastPrice,
                volume: g.totalTradedVolume
            }));
        }

        return [];
    } catch (error) {
        console.error('❌ Top gainers fetch failed:', error.message);
        return [];
    }
}

/**
 * Load patterns from cache file
 */
function loadCachedPatterns() {
    try {
        if (fs.existsSync(PATTERNS_CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(PATTERNS_CACHE_FILE, 'utf8'));
            console.log(`📂 Loaded cached patterns from ${data.timestamp}`);
            return data;
        }
    } catch (error) {
        console.error('Cache load error:', error.message);
    }
    return null;
}

/**
 * Save patterns to cache file
 */
function savePatternsToCache(patterns) {
    try {
        fs.writeFileSync(PATTERNS_CACHE_FILE, JSON.stringify(patterns, null, 2));
        console.log('💾 Patterns saved to cache');
        return true;
    } catch (error) {
        console.error('Cache save error:', error.message);
        return false;
    }
}

/**
 * Load cached stock list
 */
function loadCachedStocks() {
    try {
        if (fs.existsSync(STOCKS_CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STOCKS_CACHE_FILE, 'utf8'));
            const cacheAge = (Date.now() - new Date(data.timestamp).getTime()) / (1000 * 60 * 60);

            if (cacheAge < 24) { // Cache valid for 24 hours
                console.log(`📂 Using cached stock list (${data.stocks.length} stocks, ${cacheAge.toFixed(1)}h old)`);
                dynamicStockList = data.stocks;
                lastStockListUpdate = new Date(data.timestamp);
                return data.stocks;
            }
        }
    } catch (error) {
        console.error('Stock cache load error:', error.message);
    }
    return null;
}

// Nifty Total Market - Comprehensive list of 500+ Indian stocks
// Includes Nifty 50, Nifty Next 50, Nifty Midcap 150, Nifty Smallcap 250
const NIFTY_TOTAL_MARKET = {
    // Nifty 50 - Large Cap
    nifty50: [
        'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
        'HINDUNILVR.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'BAJFINANCE.NS', 'KOTAKBANK.NS',
        'LT.NS', 'HCLTECH.NS', 'AXISBANK.NS', 'ASIANPAINT.NS', 'MARUTI.NS',
        'SUNPHARMA.NS', 'TITAN.NS', 'ULTRACEMCO.NS', 'WIPRO.NS', 'NTPC.NS',
        'TATAMOTORS.NS', 'M&M.NS', 'POWERGRID.NS', 'JSWSTEEL.NS', 'TATASTEEL.NS',
        'ADANIENT.NS', 'ADANIPORTS.NS', 'COALINDIA.NS', 'GRASIM.NS', 'BAJAJFINSV.NS',
        'TECHM.NS', 'ONGC.NS', 'NESTLEIND.NS', 'HDFCLIFE.NS', 'DIVISLAB.NS',
        'SBILIFE.NS', 'BRITANNIA.NS', 'HINDALCO.NS', 'BPCL.NS', 'CIPLA.NS',
        'TATACONSUM.NS', 'DRREDDY.NS', 'EICHERMOT.NS', 'APOLLOHOSP.NS', 'INDUSINDBK.NS',
        'HEROMOTOCO.NS', 'SHRIRAMFIN.NS', 'BAJAJ-AUTO.NS', 'LTIM.NS', 'TRENT.NS'
    ],

    // Nifty Next 50
    niftyNext50: [
        'ADANIGREEN.NS', 'ADANIPOWER.NS', 'AMBUJACEM.NS', 'AUROPHARMA.NS', 'BANDHANBNK.NS',
        'BANKBARODA.NS', 'BEL.NS', 'BERGEPAINT.NS', 'BIOCON.NS', 'BOSCHLTD.NS',
        'CANBK.NS', 'CHOLAFIN.NS', 'COLPAL.NS', 'CONCOR.NS', 'DABUR.NS',
        'DLF.NS', 'GAIL.NS', 'GODREJCP.NS', 'HAVELLS.NS', 'HINDPETRO.NS',
        'ICICIPRULI.NS', 'ICICIGI.NS', 'IDEA.NS', 'IGL.NS', 'INDHOTEL.NS',
        'INDIGO.NS', 'IOC.NS', 'IRCTC.NS', 'JINDALSTEL.NS', 'JUBLFOOD.NS',
        'LICI.NS', 'LUPIN.NS', 'MARICO.NS', 'MCDOWELL-N.NS', 'MOTHERSON.NS',
        'MUTHOOTFIN.NS', 'NAUKRI.NS', 'NHPC.NS', 'OBEROIRLTY.NS', 'OFSS.NS',
        'PAGEIND.NS', 'PETRONET.NS', 'PIDILITIND.NS', 'PNB.NS', 'RECLTD.NS',
        'SBICARD.NS', 'SIEMENS.NS', 'SRF.NS', 'TORNTPHARM.NS', 'VEDL.NS'
    ],

    // Midcap - High Momentum Potential
    midcap: [
        'AARTIIND.NS', 'ABCAPITAL.NS', 'ABFRL.NS', 'ACC.NS', 'ALKEM.NS',
        'APLLTD.NS', 'ASHOKLEY.NS', 'ASTRAL.NS', 'ATUL.NS', 'AUBANK.NS',
        'BALKRISIND.NS', 'BATAINDIA.NS', 'BHARATFORG.NS', 'BHEL.NS', 'CANFINHOME.NS',
        'CENTRALBK.NS', 'CESC.NS', 'CGPOWER.NS', 'CHAMBLFERT.NS', 'COFORGE.NS',
        'COROMANDEL.NS', 'CROMPTON.NS', 'CUMMINSIND.NS', 'CYIENT.NS', 'DEEPAKNTR.NS',
        'DELHIVERY.NS', 'DEVYANI.NS', 'DIXON.NS', 'ELGIEQUIP.NS', 'EMAMILTD.NS',
        'ENDURANCE.NS', 'ESCORTS.NS', 'EXIDEIND.NS', 'FEDERALBNK.NS', 'FORTIS.NS',
        'GLENMARK.NS', 'GMRINFRA.NS', 'GNFC.NS', 'GODREJPROP.NS', 'GRANULES.NS',
        'GSFC.NS', 'GSPL.NS', 'GUJGASLTD.NS', 'HAL.NS', 'HATSUN.NS',
        'HINDCOPPER.NS', 'HONAUT.NS', 'IDFCFIRSTB.NS', 'IEX.NS', 'IIFL.NS',
        'INDIANB.NS', 'INDIAMART.NS', 'IOB.NS', 'IPCALAB.NS', 'IRB.NS',
        'IRFC.NS', 'ISEC.NS', 'JKCEMENT.NS', 'JKLAKSHMI.NS', 'JSL.NS',
        'JSWENERGY.NS', 'KAJARIACER.NS', 'KALYANKJIL.NS', 'KEI.NS', 'KEC.NS',
        'KPITTECH.NS', 'KRBL.NS', 'L&TFH.NS', 'LAURUSLABS.NS', 'LICHSGFIN.NS',
        'LLOYDSME.NS', 'LTI.NS', 'LTTS.NS', 'M&MFIN.NS', 'MANAPPURAM.NS',
        'MAZDOCK.NS', 'MCX.NS', 'METROPOLIS.NS', 'MFSL.NS', 'MGL.NS',
        'MINDTREE.NS', 'MPHASIS.NS', 'MRF.NS', 'NAM-INDIA.NS', 'NATCOPHARM.NS',
        'NATIONALUM.NS', 'NAVINFLUOR.NS', 'NBCC.NS', 'NCC.NS', 'NMDC.NS',
        'NOCIL.NS', 'NYKAA.NS', 'OLECTRA.NS', 'PAYTM.NS', 'PERSISTENT.NS',
        'PFIZER.NS', 'PHOENIXLTD.NS', 'PIIND.NS', 'POLICYBZR.NS', 'POLYCAB.NS',
        'POONAWALLA.NS', 'PRESTIGE.NS', 'PVRINOX.NS', 'RAJESHEXPO.NS', 'RAMCOCEM.NS',
        'RATNAMANI.NS', 'RBLBANK.NS', 'RELAXO.NS', 'ROUTE.NS', 'RVNL.NS',
        'SAIL.NS', 'SANOFI.NS', 'SCHAEFFLER.NS', 'SHREECEM.NS', 'SJVN.NS',
        'SKFINDIA.NS', 'SOLARINDS.NS', 'SONACOMS.NS', 'STARHEALTH.NS', 'SUMICHEM.NS',
        'SUNDARMFIN.NS', 'SUNDRMFAST.NS', 'SUNTV.NS', 'SUPREMEIND.NS', 'SYNGENE.NS',
        'TATACOMM.NS', 'TATAELXSI.NS', 'TATAPOWER.NS', 'TATVA.NS', 'TCI.NS',
        'THERMAX.NS', 'TIINDIA.NS', 'TIMKEN.NS', 'TORNTPOWER.NS', 'TRIDENT.NS',
        'TTML.NS', 'TVSMOTOR.NS', 'UBL.NS', 'UJJIVAN.NS', 'UNIONBANK.NS',
        'UPL.NS', 'VBL.NS', 'VINATIORGA.NS', 'VOLTAS.NS', 'WHIRLPOOL.NS',
        'ZEEL.NS', 'ZOMATO.NS', 'ZYDUSLIFE.NS'
    ],

    // Small Cap - High Risk High Reward (where 10%+ gainers often come from)
    smallcap: [
        'AARTIDRUGS.NS', 'AAVAS.NS', 'ACCELYA.NS', 'ACRYSIL.NS', 'AFFLE.NS',
        'AGROPHOS.NS', 'AJANTPHARM.NS', 'AKZOINDIA.NS', 'ALANKIT.NS', 'ALLCARGO.NS',
        'AMBER.NS', 'ANGELONE.NS', 'ANURAS.NS', 'APLAPOLLO.NS', 'ARVINDFASN.NS',
        'ASAHIINDIA.NS', 'AVANTIFEED.NS', 'BANARISUG.NS', 'BASF.NS', 'BAYERCROP.NS',
        'BCG.NS', 'BEML.NS', 'BIRLACORPN.NS', 'BLISSGVS.NS', 'BLUEDART.NS',
        'BRIGADE.NS', 'CAMPUS.NS', 'CAMS.NS', 'CANBK.NS', 'CARBORUNIV.NS',
        'CARERATING.NS', 'CASTROLIND.NS', 'CDSL.NS', 'CENTURYPLY.NS', 'CERA.NS',
        'CHALET.NS', 'CLEAN.NS', 'COCHINSHIP.NS', 'CRAFTSMAN.NS', 'CROMPTON.NS',
        'CSBBANK.NS', 'CUB.NS', 'CYIENT.NS', 'DATAPATTNS.NS', 'DCMSHRIRAM.NS',
        'DELTACORP.NS', 'ECLERX.NS', 'EDELWEISS.NS', 'ELECON.NS', 'ESTER.NS',
        'FINCABLES.NS', 'FINPIPE.NS', 'FIVESTAR.NS', 'FLUOROCHEM.NS', 'FDC.NS',
        'GESHIP.NS', 'GILLETTE.NS', 'GLAXO.NS', 'GODFRYPHLP.NS', 'GPPL.NS',
        'GRAPHITE.NS', 'GREAVESCOT.NS', 'GREENPANEL.NS', 'GRINDWELL.NS', 'GRSE.NS',
        'GUJALKALI.NS', 'HAPPSTMNDS.NS', 'HATHWAY.NS', 'HCG.NS', 'HFCL.NS',
        'HIKAL.NS', 'HINDZINC.NS', 'HLEGLAS.NS', 'HOMO.NS', 'HUDCO.NS',
        'IDFC.NS', 'IFBIND.NS', 'IIFLWAM.NS', 'IMAGICAA.NS', 'IMFA.NS',
        'INDIAGLYCO.NS', 'INOXWIND.NS', 'INTELLECT.NS', 'IONEXCHANG.NS', 'IRCON.NS',
        'ITI.NS', 'JAMNAAUTO.NS', 'JAYNECOIND.NS', 'JBCHEPHARM.NS', 'JINDALSAW.NS',
        'JKPAPER.NS', 'JMFINANCIL.NS', 'JPASSOCIAT.NS', 'JPPOWER.NS', 'JSWHL.NS',
        'JUSTDIAL.NS', 'JYOTHYLAB.NS', 'KALPATPOWR.NS', 'KANSAINER.NS', 'KARURVYSYA.NS',
        'KCP.NS', 'KHADIM.NS', 'KNRCON.NS', 'KPITTECH.NS', 'KPRMILL.NS',
        'KRBL.NS', 'KSB.NS', 'LALPATHLAB.NS', 'LATENTVIEW.NS', 'LEMONTREE.NS',
        'LINDEINDIA.NS', 'LUXIND.NS', 'MAHABANK.NS', 'MAHINDCIE.NS', 'MAHLOG.NS',
        'MAHSCOOTER.NS', 'MAITHANALL.NS', 'MANINFRA.NS', 'MASTEK.NS', 'MAXHEALTH.NS',
        'MAZDOCK.NS', 'MIDHANI.NS', 'MINDACORP.NS', 'MMTC.NS', 'MOIL.NS',
        'MTARTECH.NS', 'MUTHOOTCAP.NS', 'NELCO.NS', 'NETWORK18.NS', 'NEWGEN.NS',
        'NFL.NS', 'NH.NS', 'NLCINDIA.NS', 'NOCIL.NS', 'NUVOCO.NS',
        'ORIENTCEM.NS', 'ORIENTELEC.NS', 'ORIENTREF.NS', 'PCBL.NS', 'PDSL.NS',
        'PEL.NS', 'PENIND.NS', 'PFC.NS', 'PGHH.NS', 'PNCINFRA.NS',
        'POLYMED.NS', 'POWERINDIA.NS', 'PRAJIND.NS', 'PRINCEPIPE.NS', 'PRSMJOHNSN.NS',
        'PSB.NS', 'PTCIL.NS', 'QUESS.NS', 'RADICO.NS', 'RAILTEL.NS',
        'RAIN.NS', 'RAJRATAN.NS', 'RALLIS.NS', 'RANEHOLDIN.NS', 'RAYMOND.NS',
        'RCF.NS', 'REDINGTON.NS', 'REFEX.NS', 'RELIGARE.NS', 'RELINFRA.NS',
        'RENUKA.NS', 'RITES.NS', 'ROSSARI.NS', 'RPOWER.NS', 'RUPA.NS',
        'SAFARI.NS', 'SAREGAMA.NS', 'SCHNEIDER.NS', 'SEQUENT.NS', 'SFL.NS',
        'SHAKTIPUMP.NS', 'SHARDACROP.NS', 'SHILPAMED.NS', 'SHOPERSTOP.NS', 'SHRIRAMCIT.NS',
        'SHYAMMETL.NS', 'SOBHA.NS', 'SOLARA.NS', 'SOUTHBANK.NS', 'SPANDANA.NS',
        'SPARC.NS', 'SSWL.NS', 'STAR.NS', 'STLTECH.NS', 'SUBROS.NS',
        'SUDARSCHEM.NS', 'SUNFLAG.NS', 'SUNTECK.NS', 'SUPRAJIT.NS', 'SURYAROSNI.NS',
        'SUZLON.NS', 'SWSOLAR.NS', 'SYMPHONY.NS', 'TANLA.NS', 'TATACHEM.NS',
        'TATACOFFEE.NS', 'TATAINVEST.NS', 'TATAMETALI.NS', 'TEAMLEASE.NS', 'TECHNO.NS',
        'TEGA.NS', 'THANGAMAYL.NS', 'THERMAX.NS', 'THYROCARE.NS', 'TINPLATE.NS',
        'TMB.NS', 'TNPL.NS', 'TRENT.NS', 'TRITURBINE.NS', 'TRIVENI.NS',
        'UCOBANK.NS', 'UJJIVANSFB.NS', 'ULTRACEMCO.NS', 'UNICHEMLAB.NS', 'UNITDSPR.NS',
        'VAIBHAVGBL.NS', 'VAKRANGEE.NS', 'VARROC.NS', 'VGUARD.NS', 'VIPIND.NS',
        'VINATIORGA.NS', 'VSTIND.NS', 'WELCORP.NS', 'WELSPUNIND.NS', 'WESTLIFE.NS',
        'WHEELS.NS', 'WINDLAS.NS', 'WOCKPHARMA.NS', 'YESBANK.NS', 'ZENSARTECH.NS'
    ],

    // Stocks from today's top gainer list (add these specifically)
    todaysTopGainers: [
        'REFEX.NS',        // Refex Industries
        'SHAKTIPUMP.NS',   // Shakti Pumps
        'JAIBALAJI.NS',    // Jai Balaji Industries
        'PRAJIND.NS',      // Praj Industries
        'TRFLTD.NS',       // Transformers & Rectifiers
        'IONEXCHANG.NS',   // Ion Exchange
        'ACE.NS',          // Action Construction
        'RAIN.NS',         // Rain Industries
        'LUMAXTECH.NS',    // Lumax Auto
        'ATGL.NS',         // Ather Energy
        'POWERMECH.NS',    // Power Mech Projects
        'AWFIS.NS'         // Awfis Space Solutions
    ]
};

// Get all unique stocks (DYNAMIC - tries NSE first, falls back to static list)
async function getAllStocks(forceRefresh = false) {
    // Try to use dynamic list first
    if (!forceRefresh && dynamicStockList && dynamicStockList.length > 0) {
        return dynamicStockList;
    }

    // Try to load from cache
    const cachedStocks = loadCachedStocks();
    if (cachedStocks && cachedStocks.length > 0) {
        return cachedStocks;
    }

    // Try to fetch from NSE (async)
    const nseStocks = await fetchNSEStockList();
    if (nseStocks && nseStocks.length > 0) {
        return nseStocks;
    }

    // Fall back to static list
    console.log('📋 Using static stock list (500+ stocks)');
    const allStocks = new Set();
    Object.values(NIFTY_TOTAL_MARKET).forEach(stocks => {
        stocks.forEach(s => allStocks.add(s));
    });
    return Array.from(allStocks);
}

// Sync version for backward compatibility
function getAllStocksSync() {
    if (dynamicStockList && dynamicStockList.length > 0) {
        return dynamicStockList;
    }

    const allStocks = new Set();
    Object.values(NIFTY_TOTAL_MARKET).forEach(stocks => {
        stocks.forEach(s => allStocks.add(s));
    });
    return Array.from(allStocks);
}

// Pattern buckets for 10%+ gainer analysis
const BIG_GAINER_PATTERNS = {
    // RSI patterns before 10%+ gain
    rsi: {
        extremeOversold: { min: 0, max: 20, label: 'Extreme Oversold (<20)' },
        oversold: { min: 20, max: 30, label: 'Oversold (20-30)' },
        lowMid: { min: 30, max: 45, label: 'Low-Mid (30-45)' },
        mid: { min: 45, max: 55, label: 'Neutral (45-55)' },
        highMid: { min: 55, max: 70, label: 'High-Mid (55-70)' },
        overbought: { min: 70, max: 100, label: 'Overbought (70+)' }
    },

    // Volume patterns
    volume: {
        veryLow: { min: 0, max: 0.5, label: 'Very Low (<0.5x)' },
        low: { min: 0.5, max: 1, label: 'Low (0.5-1x)' },
        normal: { min: 1, max: 2, label: 'Normal (1-2x)' },
        high: { min: 2, max: 4, label: 'High (2-4x)' },
        veryHigh: { min: 4, max: 10, label: 'Very High (4-10x)' },
        extreme: { min: 10, max: Infinity, label: 'Extreme (10x+)' }
    },

    // Price position relative to 52-week range
    pricePosition: {
        near52WLow: { min: 0, max: 10, label: 'Near 52W Low (0-10%)' },
        lowerHalf: { min: 10, max: 30, label: 'Lower Range (10-30%)' },
        midRange: { min: 30, max: 70, label: 'Mid Range (30-70%)' },
        upperHalf: { min: 70, max: 90, label: 'Upper Range (70-90%)' },
        near52WHigh: { min: 90, max: 100, label: 'Near 52W High (90-100%)' }
    },

    // Previous day momentum
    prevDayChange: {
        bigDown: { min: -Infinity, max: -3, label: 'Big Down (<-3%)' },
        down: { min: -3, max: -1, label: 'Down (-3 to -1%)' },
        slightDown: { min: -1, max: 0, label: 'Slight Down (-1 to 0%)' },
        flat: { min: 0, max: 1, label: 'Flat (0 to 1%)' },
        up: { min: 1, max: 3, label: 'Up (1-3%)' },
        bigUp: { min: 3, max: Infinity, label: 'Big Up (3%+)' }
    },

    // Consolidation before breakout
    consolidation: {
        tight: { min: 0, max: 5, label: 'Tight (<5% range)' },
        normal: { min: 5, max: 10, label: 'Normal (5-10%)' },
        wide: { min: 10, max: 20, label: 'Wide (10-20%)' },
        veryWide: { min: 20, max: Infinity, label: 'Very Wide (20%+)' }
    }
};

// Cache for discovered patterns
let discoveredPatterns = null;
let lastDiscoveryTime = null;

/**
 * Calculate RSI
 */
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * Fetch historical data for a stock (5 years)
 */
async function fetchStockHistory(symbol, years = 5) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - years);

        const result = await yahooFinance.chart(symbol, {
            period1: startDate,
            period2: endDate,
            interval: '1d'
        });

        if (!result || !result.quotes || result.quotes.length < 100) {
            return null;
        }

        return result.quotes
            .filter(q => q && q.close && q.volume)
            .map(q => ({
                date: new Date(q.date).toISOString().split('T')[0],
                open: q.open,
                high: q.high,
                low: q.low,
                close: q.close,
                volume: q.volume
            }));
    } catch (error) {
        return null;
    }
}

/**
 * Calculate indicators for a specific day
 */
function calculateDayIndicators(history, dayIndex, fiftyTwoWeekData) {
    if (dayIndex < 20) return null;

    const currentDay = history[dayIndex];
    const prevDay = history[dayIndex - 1];

    // Get closing prices for RSI
    const closePrices = history.slice(Math.max(0, dayIndex - 20), dayIndex + 1).map(h => h.close);

    // Calculate RSI
    const rsi = calculateRSI(closePrices.reverse(), 14);

    // Volume ratio
    const volumes = history.slice(Math.max(0, dayIndex - 10), dayIndex).map(h => h.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeRatio = avgVolume > 0 ? prevDay.volume / avgVolume : 1;

    // 52-week high/low position
    const fiftyTwoWeekHigh = fiftyTwoWeekData?.high || currentDay.high;
    const fiftyTwoWeekLow = fiftyTwoWeekData?.low || currentDay.low;
    const priceRange = fiftyTwoWeekHigh - fiftyTwoWeekLow;
    const pricePosition = priceRange > 0
        ? ((prevDay.close - fiftyTwoWeekLow) / priceRange) * 100
        : 50;

    // Previous day change
    const prevDayChange = dayIndex > 1
        ? ((prevDay.close - history[dayIndex - 2].close) / history[dayIndex - 2].close) * 100
        : 0;

    // Current day change (what we're predicting)
    const dayChange = ((currentDay.close - prevDay.close) / prevDay.close) * 100;

    // 10-day consolidation range
    const last10Days = history.slice(Math.max(0, dayIndex - 10), dayIndex);
    const high10D = Math.max(...last10Days.map(h => h.high));
    const low10D = Math.min(...last10Days.map(h => h.low));
    const consolidationRange = low10D > 0 ? ((high10D - low10D) / low10D) * 100 : 10;

    // Distance from 20-day high
    const high20D = Math.max(...history.slice(Math.max(0, dayIndex - 20), dayIndex).map(h => h.high));
    const distanceFrom20DHigh = ((high20D - prevDay.close) / high20D) * 100;

    return {
        date: currentDay.date,
        dayChange,
        isBigGainer: dayChange >= 10, // 10%+ is big gainer
        indicators: {
            rsi,
            volumeRatio,
            pricePosition,
            prevDayChange,
            consolidationRange,
            distanceFrom20DHigh,
            closingPrice: prevDay.close
        }
    };
}

/**
 * Categorize value into pattern bucket
 */
function categorize(value, buckets) {
    for (const [name, range] of Object.entries(buckets)) {
        if (value >= range.min && value < range.max) {
            return { name, label: range.label };
        }
    }
    return { name: 'unknown', label: 'Unknown' };
}

/**
 * MAIN: Discover patterns from 5 years of top gainers
 */
async function discoverTopGainerPatterns(progressCallback = null) {
    console.log('🔍 Starting 5-year Nifty Total Market pattern discovery...');
    console.log('⏱️ This will analyze thousands of trading days. Please wait...');

    const allStocks = await getAllStocks();
    console.log(`📊 Analyzing ${allStocks.length} stocks...`);

    // Pattern counters for 10%+ gainers
    const patternCounts = {
        rsi: {},
        volume: {},
        pricePosition: {},
        prevDayChange: {},
        consolidation: {}
    };

    // Initialize counters
    Object.keys(BIG_GAINER_PATTERNS.rsi).forEach(k => patternCounts.rsi[k] = 0);
    Object.keys(BIG_GAINER_PATTERNS.volume).forEach(k => patternCounts.volume[k] = 0);
    Object.keys(BIG_GAINER_PATTERNS.pricePosition).forEach(k => patternCounts.pricePosition[k] = 0);
    Object.keys(BIG_GAINER_PATTERNS.prevDayChange).forEach(k => patternCounts.prevDayChange[k] = 0);
    Object.keys(BIG_GAINER_PATTERNS.consolidation).forEach(k => patternCounts.consolidation[k] = 0);

    let totalBigGainerEvents = 0;
    const bigGainerDetails = [];
    let stocksProcessed = 0;

    // Process stocks
    for (const symbol of allStocks) {
        try {
            const history = await fetchStockHistory(symbol, 5);

            if (!history || history.length < 260) {
                continue;
            }

            // Calculate 52-week high/low for entire history
            const fiftyTwoWeekData = {
                high: Math.max(...history.slice(-260).map(h => h.high)),
                low: Math.min(...history.slice(-260).map(h => h.low))
            };

            // Analyze each day
            for (let i = 30; i < history.length; i++) {
                const dayData = calculateDayIndicators(history, i, fiftyTwoWeekData);

                if (dayData && dayData.isBigGainer) {
                    // This is a 10%+ gainer! Record the patterns from day before
                    const ind = dayData.indicators;

                    patternCounts.rsi[categorize(ind.rsi, BIG_GAINER_PATTERNS.rsi).name]++;
                    patternCounts.volume[categorize(ind.volumeRatio, BIG_GAINER_PATTERNS.volume).name]++;
                    patternCounts.pricePosition[categorize(ind.pricePosition, BIG_GAINER_PATTERNS.pricePosition).name]++;
                    patternCounts.prevDayChange[categorize(ind.prevDayChange, BIG_GAINER_PATTERNS.prevDayChange).name]++;
                    patternCounts.consolidation[categorize(ind.consolidationRange, BIG_GAINER_PATTERNS.consolidation).name]++;

                    totalBigGainerEvents++;

                    bigGainerDetails.push({
                        date: dayData.date,
                        symbol,
                        gain: dayData.dayChange.toFixed(2) + '%',
                        indicators: ind
                    });
                }
            }

            stocksProcessed++;

            if (progressCallback && stocksProcessed % 20 === 0) {
                progressCallback({
                    phase: 'analyzing',
                    stocksProcessed,
                    totalStocks: allStocks.length,
                    bigGainersFound: totalBigGainerEvents
                });
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error) {
            console.error(`Error processing ${symbol}:`, error.message);
        }
    }

    console.log(`\n✅ Pattern Discovery Complete!`);
    console.log(`📊 Stocks analyzed: ${stocksProcessed}`);
    console.log(`🚀 10%+ gainer events found: ${totalBigGainerEvents}`);

    // Convert counts to percentages and find most common patterns
    const calculateDistribution = (counts, total) => {
        const dist = {};
        let maxKey = null;
        let maxVal = 0;

        for (const [key, count] of Object.entries(counts)) {
            const pct = total > 0 ? count / total : 0;
            dist[key] = {
                count,
                percentage: (pct * 100).toFixed(1) + '%',
                probability: pct
            };
            if (count > maxVal) {
                maxVal = count;
                maxKey = key;
            }
        }

        return {
            distribution: dist,
            mostCommon: maxKey,
            mostCommonProbability: total > 0 ? maxVal / total : 0
        };
    };

    // Build patterns object
    const patterns = {
        rsi: calculateDistribution(patternCounts.rsi, totalBigGainerEvents),
        volume: calculateDistribution(patternCounts.volume, totalBigGainerEvents),
        pricePosition: calculateDistribution(patternCounts.pricePosition, totalBigGainerEvents),
        prevDayChange: calculateDistribution(patternCounts.prevDayChange, totalBigGainerEvents),
        consolidation: calculateDistribution(patternCounts.consolidation, totalBigGainerEvents),

        summary: {
            totalBigGainerEvents,
            stocksAnalyzed: stocksProcessed,
            periodYears: 5,
            minGainThreshold: '10%',
            avgGainersPerYear: (totalBigGainerEvents / 5).toFixed(0)
        },

        insights: generateInsights(patternCounts, totalBigGainerEvents),

        // Store recent big gainers for reference
        recentBigGainers: bigGainerDetails.slice(-50),

        timestamp: new Date().toISOString()
    };

    // Cache patterns in memory
    discoveredPatterns = patterns;
    lastDiscoveryTime = new Date();

    // Save patterns to file for persistence across restarts
    savePatternsToCache(patterns);

    return patterns;
}

/**
 * Generate insights from discovered patterns
 */
function generateInsights(counts, total) {
    const insights = [];

    // RSI insight
    const rsiOversoldPct = ((counts.rsi.extremeOversold || 0) + (counts.rsi.oversold || 0)) / total * 100;
    const rsiLowMidPct = (counts.rsi.lowMid || 0) / total * 100;
    insights.push(`${rsiLowMidPct.toFixed(0)}% of 10%+ gainers had RSI in 30-45 range (recovering but not overbought)`);
    if (rsiOversoldPct > 15) {
        insights.push(`${rsiOversoldPct.toFixed(0)}% came from oversold conditions (RSI < 30)`);
    }

    // Volume insight
    const volHighPct = ((counts.volume.high || 0) + (counts.volume.veryHigh || 0) + (counts.volume.extreme || 0)) / total * 100;
    insights.push(`${volHighPct.toFixed(0)}% of 10%+ gainers had above-average volume (2x+) the day before`);

    // Price position insight
    const nearLowPct = ((counts.pricePosition.near52WLow || 0) + (counts.pricePosition.lowerHalf || 0)) / total * 100;
    insights.push(`${nearLowPct.toFixed(0)}% of 10%+ gainers were in lower half of 52-week range`);

    // Momentum insight
    const prevUpPct = ((counts.prevDayChange.up || 0) + (counts.prevDayChange.bigUp || 0)) / total * 100;
    insights.push(`${prevUpPct.toFixed(0)}% of 10%+ gainers already had positive momentum (1%+ previous day)`);

    return insights;
}

/**
 * Score a stock based on discovered patterns
 */
function scoreByDiscoveredPatterns(indicators, patterns) {
    if (!patterns || !indicators) {
        return { score: 0, reasoning: [], matchProbability: 0 };
    }

    let totalProbability = 0;
    const reasoning = [];

    // RSI score
    const rsiCat = categorize(indicators.rsi, BIG_GAINER_PATTERNS.rsi);
    const rsiProb = patterns.rsi.distribution[rsiCat.name]?.probability || 0;
    totalProbability += rsiProb;
    if (rsiProb > 0.15) {
        reasoning.push(`RSI ${indicators.rsi.toFixed(0)} (${rsiCat.label}) - ${(rsiProb * 100).toFixed(0)}% of big gainers`);
    }

    // Volume score
    const volCat = categorize(indicators.volumeRatio, BIG_GAINER_PATTERNS.volume);
    const volProb = patterns.volume.distribution[volCat.name]?.probability || 0;
    totalProbability += volProb;
    if (volProb > 0.15) {
        reasoning.push(`Volume ${indicators.volumeRatio.toFixed(1)}x (${volCat.label}) - ${(volProb * 100).toFixed(0)}% of big gainers`);
    }

    // Price position score
    const posCat = categorize(indicators.pricePosition, BIG_GAINER_PATTERNS.pricePosition);
    const posProb = patterns.pricePosition.distribution[posCat.name]?.probability || 0;
    totalProbability += posProb;
    if (posProb > 0.15) {
        reasoning.push(`Price at ${indicators.pricePosition.toFixed(0)}% of 52W range - ${(posProb * 100).toFixed(0)}% of big gainers`);
    }

    // Previous day momentum
    const momCat = categorize(indicators.prevDayChange, BIG_GAINER_PATTERNS.prevDayChange);
    const momProb = patterns.prevDayChange.distribution[momCat.name]?.probability || 0;
    totalProbability += momProb;

    // Consolidation score
    const consCat = categorize(indicators.consolidationRange, BIG_GAINER_PATTERNS.consolidation);
    const consProb = patterns.consolidation.distribution[consCat.name]?.probability || 0;
    totalProbability += consProb;

    // Normalize score to 0-100
    const matchProbability = totalProbability / 5;
    const score = matchProbability * 100;

    return {
        score: Math.min(100, score),
        reasoning,
        matchProbability: matchProbability.toFixed(3),
        patternMatches: {
            rsi: { category: rsiCat.label, probability: rsiProb },
            volume: { category: volCat.label, probability: volProb },
            pricePosition: { category: posCat.label, probability: posProb },
            momentum: { category: momCat.label, probability: momProb },
            consolidation: { category: consCat.label, probability: consProb }
        }
    };
}

/**
 * Get cached patterns or discover new
 * Priority: 1) Memory cache 2) File cache 3) Fresh discovery
 */
async function getPatterns(forceRefresh = false) {
    // Check memory cache first
    if (!forceRefresh && discoveredPatterns && lastDiscoveryTime) {
        const hoursSince = (new Date() - lastDiscoveryTime) / (1000 * 60 * 60);
        if (hoursSince < 24) {
            console.log('📦 Using in-memory cached patterns');
            return discoveredPatterns;
        }
    }

    // Try to load from file cache (persists across restarts)
    if (!forceRefresh) {
        const cachedPatterns = loadCachedPatterns();
        if (cachedPatterns && cachedPatterns.timestamp) {
            const cacheAge = (Date.now() - new Date(cachedPatterns.timestamp).getTime()) / (1000 * 60 * 60);
            if (cacheAge < 24) {
                console.log(`📂 Using file-cached patterns (${cacheAge.toFixed(1)}h old)`);
                discoveredPatterns = cachedPatterns;
                lastDiscoveryTime = new Date(cachedPatterns.timestamp);
                return cachedPatterns;
            }
        }
    }

    // Discover fresh patterns
    console.log('🔄 Cache expired or forced refresh - discovering fresh patterns...');
    return await discoverTopGainerPatterns();
}

/**
 * Get pattern summary
 */
function getPatternSummary() {
    if (!discoveredPatterns) {
        return {
            available: false,
            message: 'Pattern discovery not yet run. Call /api/stock/patterns/discover-nifty first.'
        };
    }

    return {
        available: true,
        summary: discoveredPatterns.summary,
        insights: discoveredPatterns.insights,
        topPatterns: {
            rsi: discoveredPatterns.rsi.mostCommon,
            volume: discoveredPatterns.volume.mostCommon,
            pricePosition: discoveredPatterns.pricePosition.mostCommon
        },
        lastUpdated: lastDiscoveryTime?.toISOString()
    };
}

module.exports = {
    // Pattern discovery
    discoverTopGainerPatterns,
    getPatterns,
    getPatternSummary,
    scoreByDiscoveredPatterns,

    // Stock list (dynamic)
    getAllStocks,
    getAllStocksSync,
    fetchNSEStockList,
    fetchTodaysTopGainers,

    // Cache management
    loadCachedPatterns,
    savePatternsToCache,

    // Static data
    NIFTY_TOTAL_MARKET,
    BIG_GAINER_PATTERNS
};
