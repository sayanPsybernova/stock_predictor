import React, { useState, useRef, useEffect } from 'react';

// Complete list of NSE F&O stocks (as of Dec 2024)
const FNO_SYMBOLS = [
    // Indices
    { symbol: 'NIFTY', name: 'Nifty 50', type: 'index' },
    { symbol: 'BANKNIFTY', name: 'Bank Nifty', type: 'index' },
    { symbol: 'FINNIFTY', name: 'Fin Nifty', type: 'index' },
    { symbol: 'MIDCPNIFTY', name: 'Midcap Nifty', type: 'index' },

    // A
    { symbol: 'AARTIIND', name: 'Aarti Industries', type: 'stock' },
    { symbol: 'ABB', name: 'ABB India', type: 'stock' },
    { symbol: 'ABBOTINDIA', name: 'Abbott India', type: 'stock' },
    { symbol: 'ABCAPITAL', name: 'Aditya Birla Capital', type: 'stock' },
    { symbol: 'ABFRL', name: 'Aditya Birla Fashion', type: 'stock' },
    { symbol: 'ACC', name: 'ACC Ltd', type: 'stock' },
    { symbol: 'ADANIENT', name: 'Adani Enterprises', type: 'stock' },
    { symbol: 'ADANIPORTS', name: 'Adani Ports', type: 'stock' },
    { symbol: 'ALKEM', name: 'Alkem Laboratories', type: 'stock' },
    { symbol: 'AMBUJACEM', name: 'Ambuja Cements', type: 'stock' },
    { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', type: 'stock' },
    { symbol: 'APOLLOTYRE', name: 'Apollo Tyres', type: 'stock' },
    { symbol: 'ASHOKLEY', name: 'Ashok Leyland', type: 'stock' },
    { symbol: 'ASIANPAINT', name: 'Asian Paints', type: 'stock' },
    { symbol: 'ASTRAL', name: 'Astral Ltd', type: 'stock' },
    { symbol: 'ATUL', name: 'Atul Ltd', type: 'stock' },
    { symbol: 'AUBANK', name: 'AU Small Finance Bank', type: 'stock' },
    { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma', type: 'stock' },
    { symbol: 'AXISBANK', name: 'Axis Bank', type: 'stock' },

    // B
    { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', type: 'stock' },
    { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', type: 'stock' },
    { symbol: 'BAJFINANCE', name: 'Bajaj Finance', type: 'stock' },
    { symbol: 'BALKRISIND', name: 'Balkrishna Industries', type: 'stock' },
    { symbol: 'BALRAMCHIN', name: 'Balrampur Chini', type: 'stock' },
    { symbol: 'BANDHANBNK', name: 'Bandhan Bank', type: 'stock' },
    { symbol: 'BANKBARODA', name: 'Bank of Baroda', type: 'stock' },
    { symbol: 'BATAINDIA', name: 'Bata India', type: 'stock' },
    { symbol: 'BEL', name: 'Bharat Electronics', type: 'stock' },
    { symbol: 'BERGEPAINT', name: 'Berger Paints', type: 'stock' },
    { symbol: 'BHARATFORG', name: 'Bharat Forge', type: 'stock' },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel', type: 'stock' },
    { symbol: 'BHEL', name: 'BHEL', type: 'stock' },
    { symbol: 'BIOCON', name: 'Biocon', type: 'stock' },
    { symbol: 'BOSCHLTD', name: 'Bosch Ltd', type: 'stock' },
    { symbol: 'BPCL', name: 'BPCL', type: 'stock' },
    { symbol: 'BRITANNIA', name: 'Britannia Industries', type: 'stock' },
    { symbol: 'BSOFT', name: 'Birlasoft', type: 'stock' },

    // C
    { symbol: 'CANBK', name: 'Canara Bank', type: 'stock' },
    { symbol: 'CANFINHOME', name: 'Can Fin Homes', type: 'stock' },
    { symbol: 'CHAMBLFERT', name: 'Chambal Fertilisers', type: 'stock' },
    { symbol: 'CHOLAFIN', name: 'Cholamandalam Finance', type: 'stock' },
    { symbol: 'CIPLA', name: 'Cipla', type: 'stock' },
    { symbol: 'COALINDIA', name: 'Coal India', type: 'stock' },
    { symbol: 'COFORGE', name: 'Coforge', type: 'stock' },
    { symbol: 'COLPAL', name: 'Colgate Palmolive', type: 'stock' },
    { symbol: 'CONCOR', name: 'Container Corp', type: 'stock' },
    { symbol: 'COROMANDEL', name: 'Coromandel International', type: 'stock' },
    { symbol: 'CROMPTON', name: 'Crompton Greaves', type: 'stock' },
    { symbol: 'CUB', name: 'City Union Bank', type: 'stock' },
    { symbol: 'CUMMINSIND', name: 'Cummins India', type: 'stock' },

    // D
    { symbol: 'DABUR', name: 'Dabur India', type: 'stock' },
    { symbol: 'DALBHARAT', name: 'Dalmia Bharat', type: 'stock' },
    { symbol: 'DEEPAKNTR', name: 'Deepak Nitrite', type: 'stock' },
    { symbol: 'DELTACORP', name: 'Delta Corp', type: 'stock' },
    { symbol: 'DEVYANI', name: 'Devyani International', type: 'stock' },
    { symbol: 'DIVISLAB', name: 'Divis Laboratories', type: 'stock' },
    { symbol: 'DIXON', name: 'Dixon Technologies', type: 'stock' },
    { symbol: 'DLF', name: 'DLF Ltd', type: 'stock' },
    { symbol: 'DRREDDY', name: 'Dr Reddys Labs', type: 'stock' },

    // E
    { symbol: 'EICHERMOT', name: 'Eicher Motors', type: 'stock' },
    { symbol: 'ESCORTS', name: 'Escorts Kubota', type: 'stock' },
    { symbol: 'EXIDEIND', name: 'Exide Industries', type: 'stock' },

    // F
    { symbol: 'FEDERALBNK', name: 'Federal Bank', type: 'stock' },

    // G
    { symbol: 'GAIL', name: 'GAIL India', type: 'stock' },
    { symbol: 'GLENMARK', name: 'Glenmark Pharma', type: 'stock' },
    { symbol: 'GMRINFRA', name: 'GMR Airports', type: 'stock' },
    { symbol: 'GNFC', name: 'GNFC', type: 'stock' },
    { symbol: 'GODREJCP', name: 'Godrej Consumer', type: 'stock' },
    { symbol: 'GODREJPROP', name: 'Godrej Properties', type: 'stock' },
    { symbol: 'GRANULES', name: 'Granules India', type: 'stock' },
    { symbol: 'GRASIM', name: 'Grasim Industries', type: 'stock' },
    { symbol: 'GUJGASLTD', name: 'Gujarat Gas', type: 'stock' },

    // H
    { symbol: 'HAL', name: 'Hindustan Aeronautics', type: 'stock' },
    { symbol: 'HAVELLS', name: 'Havells India', type: 'stock' },
    { symbol: 'HCLTECH', name: 'HCL Technologies', type: 'stock' },
    { symbol: 'HDFC', name: 'HDFC Ltd', type: 'stock' },
    { symbol: 'HDFCAMC', name: 'HDFC AMC', type: 'stock' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank', type: 'stock' },
    { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance', type: 'stock' },
    { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp', type: 'stock' },
    { symbol: 'HINDALCO', name: 'Hindalco', type: 'stock' },
    { symbol: 'HINDCOPPER', name: 'Hindustan Copper', type: 'stock' },
    { symbol: 'HINDPETRO', name: 'HPCL', type: 'stock' },
    { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', type: 'stock' },
    { symbol: 'HONAUT', name: 'Honeywell Automation', type: 'stock' },

    // I
    { symbol: 'IBULHSGFIN', name: 'Indiabulls Housing', type: 'stock' },
    { symbol: 'ICICIBANK', name: 'ICICI Bank', type: 'stock' },
    { symbol: 'ICICIGI', name: 'ICICI Lombard', type: 'stock' },
    { symbol: 'ICICIPRULI', name: 'ICICI Prudential', type: 'stock' },
    { symbol: 'IDEA', name: 'Vodafone Idea', type: 'stock' },
    { symbol: 'IDFC', name: 'IDFC Ltd', type: 'stock' },
    { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank', type: 'stock' },
    { symbol: 'IEX', name: 'Indian Energy Exchange', type: 'stock' },
    { symbol: 'IGL', name: 'Indraprastha Gas', type: 'stock' },
    { symbol: 'INDHOTEL', name: 'Indian Hotels', type: 'stock' },
    { symbol: 'INDIACEM', name: 'India Cements', type: 'stock' },
    { symbol: 'INDIAMART', name: 'IndiaMART', type: 'stock' },
    { symbol: 'INDIGO', name: 'InterGlobe Aviation', type: 'stock' },
    { symbol: 'INDUSINDBK', name: 'IndusInd Bank', type: 'stock' },
    { symbol: 'INDUSTOWER', name: 'Indus Towers', type: 'stock' },
    { symbol: 'INFY', name: 'Infosys', type: 'stock' },
    { symbol: 'IOC', name: 'Indian Oil Corp', type: 'stock' },
    { symbol: 'IPCALAB', name: 'IPCA Laboratories', type: 'stock' },
    { symbol: 'IRCTC', name: 'IRCTC', type: 'stock' },
    { symbol: 'ITC', name: 'ITC Ltd', type: 'stock' },

    // J
    { symbol: 'JINDALSTEL', name: 'Jindal Steel', type: 'stock' },
    { symbol: 'JKCEMENT', name: 'JK Cement', type: 'stock' },
    { symbol: 'JSWSTEEL', name: 'JSW Steel', type: 'stock' },
    { symbol: 'JUBLFOOD', name: 'Jubilant FoodWorks', type: 'stock' },

    // K
    { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', type: 'stock' },

    // L
    { symbol: 'LALPATHLAB', name: 'Dr Lal PathLabs', type: 'stock' },
    { symbol: 'LAURUSLABS', name: 'Laurus Labs', type: 'stock' },
    { symbol: 'LICHSGFIN', name: 'LIC Housing Finance', type: 'stock' },
    { symbol: 'LICI', name: 'LIC India', type: 'stock' },
    { symbol: 'LT', name: 'Larsen & Toubro', type: 'stock' },
    { symbol: 'LTF', name: 'L&T Finance', type: 'stock' },
    { symbol: 'LTIM', name: 'LTIMindtree', type: 'stock' },
    { symbol: 'LTTS', name: 'L&T Technology', type: 'stock' },
    { symbol: 'LUPIN', name: 'Lupin', type: 'stock' },

    // M
    { symbol: 'M&M', name: 'Mahindra & Mahindra', type: 'stock' },
    { symbol: 'M&MFIN', name: 'M&M Finance', type: 'stock' },
    { symbol: 'MANAPPURAM', name: 'Manappuram Finance', type: 'stock' },
    { symbol: 'MARICO', name: 'Marico', type: 'stock' },
    { symbol: 'MARUTI', name: 'Maruti Suzuki', type: 'stock' },
    { symbol: 'MCDOWELL-N', name: 'United Spirits', type: 'stock' },
    { symbol: 'MCX', name: 'MCX India', type: 'stock' },
    { symbol: 'METROPOLIS', name: 'Metropolis Healthcare', type: 'stock' },
    { symbol: 'MFSL', name: 'Max Financial', type: 'stock' },
    { symbol: 'MGL', name: 'Mahanagar Gas', type: 'stock' },
    { symbol: 'MOTHERSON', name: 'Motherson Sumi', type: 'stock' },
    { symbol: 'MPHASIS', name: 'Mphasis', type: 'stock' },
    { symbol: 'MRF', name: 'MRF Ltd', type: 'stock' },
    { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance', type: 'stock' },

    // N
    { symbol: 'NAM-INDIA', name: 'Nippon Life AMC', type: 'stock' },
    { symbol: 'NATIONALUM', name: 'National Aluminium', type: 'stock' },
    { symbol: 'NAUKRI', name: 'Info Edge India', type: 'stock' },
    { symbol: 'NAVINFLUOR', name: 'Navin Fluorine', type: 'stock' },
    { symbol: 'NESTLEIND', name: 'Nestle India', type: 'stock' },
    { symbol: 'NMDC', name: 'NMDC Ltd', type: 'stock' },
    { symbol: 'NTPC', name: 'NTPC Ltd', type: 'stock' },

    // O
    { symbol: 'OBEROIRLTY', name: 'Oberoi Realty', type: 'stock' },
    { symbol: 'OFSS', name: 'Oracle Financial', type: 'stock' },
    { symbol: 'ONGC', name: 'ONGC', type: 'stock' },

    // P
    { symbol: 'PAGEIND', name: 'Page Industries', type: 'stock' },
    { symbol: 'PEL', name: 'Piramal Enterprises', type: 'stock' },
    { symbol: 'PERSISTENT', name: 'Persistent Systems', type: 'stock' },
    { symbol: 'PETRONET', name: 'Petronet LNG', type: 'stock' },
    { symbol: 'PFC', name: 'Power Finance Corp', type: 'stock' },
    { symbol: 'PIDILITIND', name: 'Pidilite Industries', type: 'stock' },
    { symbol: 'PIIND', name: 'PI Industries', type: 'stock' },
    { symbol: 'PNB', name: 'Punjab National Bank', type: 'stock' },
    { symbol: 'POLYCAB', name: 'Polycab India', type: 'stock' },
    { symbol: 'POWERGRID', name: 'Power Grid Corp', type: 'stock' },
    { symbol: 'PVRINOX', name: 'PVR INOX', type: 'stock' },

    // R
    { symbol: 'RAIN', name: 'Rain Industries', type: 'stock' },
    { symbol: 'RAMCOCEM', name: 'Ramco Cements', type: 'stock' },
    { symbol: 'RBLBANK', name: 'RBL Bank', type: 'stock' },
    { symbol: 'RECLTD', name: 'REC Ltd', type: 'stock' },
    { symbol: 'RELIANCE', name: 'Reliance Industries', type: 'stock' },

    // S
    { symbol: 'SAIL', name: 'Steel Authority', type: 'stock' },
    { symbol: 'SBICARD', name: 'SBI Cards', type: 'stock' },
    { symbol: 'SBILIFE', name: 'SBI Life Insurance', type: 'stock' },
    { symbol: 'SBIN', name: 'State Bank of India', type: 'stock' },
    { symbol: 'SHREECEM', name: 'Shree Cement', type: 'stock' },
    { symbol: 'SHRIRAMFIN', name: 'Shriram Finance', type: 'stock' },
    { symbol: 'SIEMENS', name: 'Siemens', type: 'stock' },
    { symbol: 'SRF', name: 'SRF Ltd', type: 'stock' },
    { symbol: 'SUNPHARMA', name: 'Sun Pharma', type: 'stock' },
    { symbol: 'SUNTV', name: 'Sun TV Network', type: 'stock' },
    { symbol: 'SYNGENE', name: 'Syngene International', type: 'stock' },

    // T
    { symbol: 'TATACHEM', name: 'Tata Chemicals', type: 'stock' },
    { symbol: 'TATACOMM', name: 'Tata Communications', type: 'stock' },
    { symbol: 'TATACONSUM', name: 'Tata Consumer', type: 'stock' },
    { symbol: 'TATAMOTORS', name: 'Tata Motors', type: 'stock' },
    { symbol: 'TATAPOWER', name: 'Tata Power', type: 'stock' },
    { symbol: 'TATASTEEL', name: 'Tata Steel', type: 'stock' },
    { symbol: 'TCS', name: 'Tata Consultancy', type: 'stock' },
    { symbol: 'TECHM', name: 'Tech Mahindra', type: 'stock' },
    { symbol: 'TITAN', name: 'Titan Company', type: 'stock' },
    { symbol: 'TORNTPHARM', name: 'Torrent Pharma', type: 'stock' },
    { symbol: 'TORNTPOWER', name: 'Torrent Power', type: 'stock' },
    { symbol: 'TRENT', name: 'Trent Ltd', type: 'stock' },
    { symbol: 'TVSMOTOR', name: 'TVS Motor', type: 'stock' },

    // U
    { symbol: 'UBL', name: 'United Breweries', type: 'stock' },
    { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', type: 'stock' },
    { symbol: 'UNIONBANK', name: 'Union Bank', type: 'stock' },
    { symbol: 'UPL', name: 'UPL Ltd', type: 'stock' },

    // V
    { symbol: 'VEDL', name: 'Vedanta Ltd', type: 'stock' },
    { symbol: 'VOLTAS', name: 'Voltas', type: 'stock' },

    // W
    { symbol: 'WIPRO', name: 'Wipro', type: 'stock' },

    // Z
    { symbol: 'ZEEL', name: 'Zee Entertainment', type: 'stock' },
    { symbol: 'ZYDUSLIFE', name: 'Zydus Lifesciences', type: 'stock' },
];

// Popular symbols shown first when no search
const POPULAR_SYMBOL_NAMES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'TATAMOTORS', 'BAJFINANCE', 'ITC', 'BHARTIARTL', 'KOTAKBANK', 'LT'];

// Get popular symbols as objects
const getPopularSymbols = () => {
    return FNO_SYMBOLS.filter(s => POPULAR_SYMBOL_NAMES.includes(s.symbol));
};

function SymbolSearchBar({ value, onSelect }) {
    const [inputValue, setInputValue] = useState(value || '');
    const [showDropdown, setShowDropdown] = useState(false);
    const [filteredSymbols, setFilteredSymbols] = useState(getPopularSymbols());
    const [showAll, setShowAll] = useState(false);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    useEffect(() => {
        // Close dropdown on outside click
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
                inputRef.current && !inputRef.current.contains(event.target)) {
                setShowDropdown(false);
                setShowAll(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        const val = e.target.value.toUpperCase();
        setInputValue(val);
        setShowDropdown(true);

        if (val) {
            const filtered = FNO_SYMBOLS.filter(
                s => s.symbol.includes(val) || s.name.toUpperCase().includes(val)
            );
            setFilteredSymbols(filtered.length > 0 ? filtered : []);
            setShowAll(true);
        } else {
            setFilteredSymbols(getPopularSymbols());
            setShowAll(false);
        }
    };

    const handleSelect = (symbol) => {
        setInputValue(symbol);
        setShowDropdown(false);
        setShowAll(false);
        onSelect(symbol);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && inputValue) {
            setShowDropdown(false);
            onSelect(inputValue);
        }
    };

    const handleShowAll = () => {
        setShowAll(true);
        setFilteredSymbols(FNO_SYMBOLS);
    };

    // Group symbols by type for display
    const indices = filteredSymbols.filter(s => s.type === 'index');
    const stocks = filteredSymbols.filter(s => s.type === 'stock');

    return (
        <div className="relative">
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => setShowDropdown(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search F&O symbol..."
                    className="w-48 md:w-64 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-gray-500"
                />
                <svg
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            {showDropdown && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 mt-1 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto"
                >
                    {/* Header with count */}
                    <div className="sticky top-0 bg-gray-800 p-2 border-b border-gray-700 flex justify-between items-center">
                        <span className="text-xs text-gray-500">
                            {showAll ? `All F&O Symbols (${FNO_SYMBOLS.length})` : 'Popular Symbols'}
                        </span>
                        {!showAll && (
                            <button
                                onClick={handleShowAll}
                                className="text-xs text-cyan-400 hover:text-cyan-300"
                            >
                                Show all {FNO_SYMBOLS.length} →
                            </button>
                        )}
                    </div>

                    {/* No results */}
                    {filteredSymbols.length === 0 && (
                        <div className="p-4 text-center text-gray-500 text-sm">
                            No F&O symbol found for "{inputValue}"
                        </div>
                    )}

                    {/* Indices Section */}
                    {indices.length > 0 && (
                        <>
                            <div className="px-3 py-1 text-xs font-semibold text-purple-400 bg-purple-900/20 sticky top-10">
                                📊 INDICES ({indices.length})
                            </div>
                            {indices.map((item) => (
                                <button
                                    key={item.symbol}
                                    onClick={() => handleSelect(item.symbol)}
                                    className={`w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors flex justify-between items-center ${
                                        item.symbol === value ? 'bg-cyan-900/30' : ''
                                    }`}
                                >
                                    <div>
                                        <span className="font-medium text-white">{item.symbol}</span>
                                        <span className="text-xs text-gray-500 ml-2">{item.name}</span>
                                    </div>
                                    <span className="text-xs px-2 py-0.5 rounded bg-purple-600/30 text-purple-400">
                                        index
                                    </span>
                                </button>
                            ))}
                        </>
                    )}

                    {/* Stocks Section */}
                    {stocks.length > 0 && (
                        <>
                            <div className="px-3 py-1 text-xs font-semibold text-cyan-400 bg-cyan-900/20 sticky top-10">
                                📈 STOCKS ({stocks.length})
                            </div>
                            {stocks.map((item) => (
                                <button
                                    key={item.symbol}
                                    onClick={() => handleSelect(item.symbol)}
                                    className={`w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors flex justify-between items-center ${
                                        item.symbol === value ? 'bg-cyan-900/30' : ''
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <span className="font-medium text-white">{item.symbol}</span>
                                        <span className="text-xs text-gray-500 ml-2 truncate">{item.name}</span>
                                    </div>
                                    <span className="text-xs px-2 py-0.5 rounded bg-cyan-600/30 text-cyan-400 ml-2 flex-shrink-0">
                                        stock
                                    </span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default SymbolSearchBar;
