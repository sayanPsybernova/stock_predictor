import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import SearchBar from './components/SearchBar';
import StockSummary from './components/StockSummary';
import PriceChart from './components/PriceChart';
import AnalysisTabs from './components/AnalysisTabs';
import Disclaimer from './components/Disclaimer';
import Spinner from './components/Spinner';
import TopGainersModal from './components/TopGainersModal';
import OptionAnalyser from './pages/OptionAnalyser';
import LiveTrading from './pages/LiveTrading';

const API_URL = 'http://localhost:5000/api';

// FIX: Add timeout configuration
const axiosInstance = axios.create({
    baseURL: API_URL,
    timeout: 30000, // 30 second timeout
});

// Navigation Component
function Navigation({ showTopGainers, setShowTopGainers }) {
    const location = useLocation();
    const isHome = location.pathname === '/';
    const isOptions = location.pathname === '/option-ai-analyser';
    const isLiveTrading = location.pathname === '/live-trading';

    return (
        <header className="bg-gray-800 p-4 shadow-lg">
            <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link to="/" className="text-2xl font-bold text-white hover:text-cyan-400 transition-colors">
                        Quantitative Stock Analysis
                    </Link>
                    <nav className="flex items-center gap-2">
                        <Link
                            to="/"
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                isHome
                                    ? 'bg-gray-700 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                            }`}
                        >
                            Home
                        </Link>
                        <Link
                            to="/live-trading"
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                                isLiveTrading
                                    ? 'bg-green-600/30 text-green-400'
                                    : 'text-gray-400 hover:text-green-400 hover:bg-green-600/20'
                            }`}
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            Live Trading
                            <span className="text-xs px-1 py-0.5 bg-green-600/50 text-green-300 rounded">LIVE</span>
                        </Link>
                        <Link
                            to="/option-ai-analyser"
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                                isOptions
                                    ? 'bg-purple-600/30 text-purple-400'
                                    : 'text-gray-400 hover:text-purple-400 hover:bg-purple-600/20'
                            }`}
                        >
                            <span>📊</span>
                            Option Analyser
                            <span className="text-xs px-1 py-0.5 bg-purple-600/50 text-purple-300 rounded">AI</span>
                        </Link>
                    </nav>
                </div>
                {isHome && (
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowTopGainers(true)}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-lg font-medium text-sm transition-all shadow-lg hover:shadow-purple-500/25 flex items-center gap-2"
                        >
                            <span>🚀</span>
                            <span className="hidden sm:inline">Top Gainers</span>
                            <span className="sm:hidden">Predict</span>
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}

// Home Page Component
function HomePage({ stockData, setStockData, loading, setLoading, error, setError }) {
    const fetchStockData = async (symbol, exchange = 'AUTO') => {
        if (!symbol || !symbol.trim()) return;

        setLoading(true);
        setError(null);
        setStockData(null);

        try {
            const response = await axiosInstance.get(`/stock/${symbol.trim().toUpperCase()}`, {
                params: { exchange }
            });
            const data = response.data;

            // FIX: Validate response structure
            if (!data) {
                throw new Error('Empty response from server');
            }

            if (!data.charts || !data.analysis) {
                console.warn('Incomplete data received:', data);
            }

            setStockData(data);
        } catch (err) {
            console.error('Error fetching stock data:', err);

            // Handle different error types
            if (err.code === 'ECONNABORTED') {
                setError('Request timed out. Please try again.');
            } else if (err.response) {
                // Server responded with error
                setError(err.response.data?.error || `Server error: ${err.response.status}`);
            } else if (err.request) {
                // No response received
                setError('Unable to connect to server. Please check if the backend is running on http://localhost:5000');
            } else {
                setError(err.message || 'An unexpected error occurred');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="container mx-auto px-4 py-4">
                <SearchBar onSearch={fetchStockData} loading={loading} />
            </div>

            <main className="container mx-auto p-4 md:p-8">
                {loading && <Spinner />}

                {error && (
                    <div className="text-center text-red-400 bg-red-900/50 p-4 rounded-lg border border-red-700">
                        <p className="font-semibold">Error</p>
                        <p>{error}</p>
                    </div>
                )}

                {stockData && (
                    <div className="space-y-8">
                        <StockSummary data={stockData} />
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2">
                                <PriceChart
                                    data={stockData?.charts?.historical}
                                    symbol={stockData?.symbol}
                                    currency={stockData?.currency}
                                />
                            </div>
                            <div className="lg:col-span-1">
                                <AnalysisTabs
                                    data={stockData}
                                    onRefresh={() => stockData?.symbol && fetchStockData(stockData.symbol, stockData.exchange)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {!loading && !stockData && !error && <Disclaimer />}
            </main>
        </>
    );
}

function App() {
    const [stockData, setStockData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showTopGainers, setShowTopGainers] = useState(false);

    return (
        <Router>
            <div className="min-h-screen bg-gray-900 text-gray-300 font-sans">
                <Navigation showTopGainers={showTopGainers} setShowTopGainers={setShowTopGainers} />

                <Routes>
                    <Route
                        path="/"
                        element={
                            <HomePage
                                stockData={stockData}
                                setStockData={setStockData}
                                loading={loading}
                                setLoading={setLoading}
                                error={error}
                                setError={setError}
                            />
                        }
                    />
                    <Route path="/option-ai-analyser" element={<OptionAnalyser />} />
                    <Route path="/live-trading" element={<LiveTrading />} />
                </Routes>

                <footer className="bg-gray-800 p-4 text-center text-xs text-gray-500">
                    <p>This analysis is based on statistical models and historical data. For educational purposes only. Not financial advice.</p>
                </footer>

                {/* Top Gainers Prediction Modal */}
                <TopGainersModal
                    isOpen={showTopGainers}
                    onClose={() => setShowTopGainers(false)}
                />
            </div>
        </Router>
    );
}

export default App;
