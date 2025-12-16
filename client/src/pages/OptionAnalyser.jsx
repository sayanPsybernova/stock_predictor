import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import SymbolSearchBar from '../components/options/SymbolSearchBar';
import OptionChainTable from '../components/options/OptionChainTable';
import GreeksDisplay from '../components/options/GreeksDisplay';
import OIAnalysisPanel from '../components/options/OIAnalysisPanel';
import PCRIndicator from '../components/options/PCRIndicator';
import MaxPainChart from '../components/options/MaxPainChart';
import DecisionPanel from '../components/options/DecisionPanel';

const API_URL = 'http://localhost:5000/api';

const axiosInstance = axios.create({
    baseURL: API_URL,
    timeout: 30000,
});

function OptionAnalyser() {
    const [symbol, setSymbol] = useState('NIFTY');
    const [expiry, setExpiry] = useState(null);
    const [expiryDates, setExpiryDates] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [chainData, setChainData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    // Fetch analysis on symbol or expiry change
    useEffect(() => {
        if (symbol) {
            fetchAnalysis();
        }
    }, [symbol, expiry]);

    const fetchAnalysis = async () => {
        if (!symbol) return;

        setLoading(true);
        setError(null);

        try {
            const params = expiry ? { expiry } : {};
            const [analysisRes, chainRes] = await Promise.all([
                axiosInstance.get(`/options/analyse/${symbol}`, { params }),
                axiosInstance.get(`/options/chain/${symbol}`, { params })
            ]);

            if (analysisRes.data.success) {
                setAnalysis(analysisRes.data.analysis);
            }

            if (chainRes.data.success) {
                setChainData(chainRes.data.data);
                setExpiryDates(chainRes.data.data.expiryDates || []);
                if (!expiry && chainRes.data.data.expiryDates?.length > 0) {
                    setExpiry(chainRes.data.data.expiryDates[0]);
                }
            }
        } catch (err) {
            console.error('Analysis fetch error:', err);
            setError(err.response?.data?.error || 'Failed to fetch analysis');
        } finally {
            setLoading(false);
        }
    };

    const handleSymbolSelect = (newSymbol) => {
        setSymbol(newSymbol);
        setExpiry(null);
        setExpiryDates([]);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-300 font-sans">
            {/* Header */}
            <header className="bg-gray-800 p-4 shadow-lg">
                <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="text-gray-400 hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-2xl font-bold text-white">Option AI Analyser</h1>
                        <span className="px-2 py-1 bg-purple-600/30 text-purple-400 text-xs rounded-full">
                            Beta
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <SymbolSearchBar
                            value={symbol}
                            onSelect={handleSymbolSelect}
                        />
                        {expiryDates.length > 0 && (
                            <select
                                value={expiry || ''}
                                onChange={(e) => setExpiry(e.target.value)}
                                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                            >
                                {expiryDates.map((date) => (
                                    <option key={date} value={date}>{date}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                {/* Loading State */}
                {loading && (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="text-center text-red-400 bg-red-900/50 p-4 rounded-lg border border-red-700">
                        <p className="font-semibold">Error</p>
                        <p>{error}</p>
                        <button
                            onClick={fetchAnalysis}
                            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Main Content */}
                {analysis && chainData && !loading && (
                    <div className="space-y-6">
                        {/* Top Section: Decision + Key Metrics */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            {/* Decision Panel - Takes 1 column */}
                            <div className="lg:col-span-1">
                                <DecisionPanel
                                    decision={analysis.decision}
                                    recommendation={analysis.recommendation}
                                    scores={analysis.scores}
                                    reasoning={analysis.reasoning}
                                />
                            </div>

                            {/* Quantitative Panel - Takes 2 columns */}
                            <div className="lg:col-span-2 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <PCRIndicator
                                        pcr={analysis.analysis?.quantitative?.pcr}
                                        chainSummary={analysis.chainSummary}
                                    />
                                    <MaxPainChart
                                        maxPain={analysis.analysis?.quantitative?.maxPain}
                                        spotPrice={analysis.spotPrice}
                                        keyLevels={analysis.keyLevels}
                                    />
                                </div>
                                <OIAnalysisPanel
                                    oiData={analysis.analysis?.quantitative?.oi}
                                    chainData={chainData}
                                />
                            </div>

                            {/* Greeks + Technical - Takes 1 column */}
                            <div className="lg:col-span-1 space-y-4">
                                <GreeksDisplay
                                    atmStrike={chainData?.atmStrike}
                                    spotPrice={chainData?.spotPrice}
                                    chain={chainData?.chain}
                                />
                                {/* Technical Summary */}
                                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                                    <h3 className="text-sm font-semibold text-gray-400 mb-3">Technical (30%)</h3>
                                    <div className="space-y-2">
                                        {analysis.analysis?.technical?.reasoning?.map((reason, idx) => (
                                            <p key={idx} className="text-sm text-gray-300">{reason}</p>
                                        )) || <p className="text-sm text-gray-500">No technical data</p>}
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-gray-700">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-400">Score</span>
                                            <span className={`font-bold ${
                                                analysis.scores?.breakdown?.technical?.score >= 60 ? 'text-green-400' :
                                                analysis.scores?.breakdown?.technical?.score <= 40 ? 'text-red-400' :
                                                'text-yellow-400'
                                            }`}>
                                                {analysis.scores?.breakdown?.technical?.score || 50}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs for detailed views */}
                        <div className="bg-gray-800 rounded-xl border border-gray-700">
                            <div className="flex border-b border-gray-700 overflow-x-auto">
                                {['overview', 'chain', 'oi', 'iv'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                                            activeTab === tab
                                                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-gray-700/50'
                                                : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
                                        }`}
                                    >
                                        {tab === 'overview' && 'Overview'}
                                        {tab === 'chain' && 'Option Chain'}
                                        {tab === 'oi' && 'OI Analysis'}
                                        {tab === 'iv' && 'IV Analysis'}
                                    </button>
                                ))}
                            </div>

                            <div className="p-4">
                                {activeTab === 'overview' && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Score Breakdown */}
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-white">Score Breakdown</h3>
                                            {Object.entries(analysis.scores?.breakdown || {}).map(([key, value]) => (
                                                <div key={key} className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <div className="flex justify-between text-sm mb-1">
                                                            <span className="capitalize text-gray-400">{key}</span>
                                                            <span className="text-white">{value.score} ({value.weight})</span>
                                                        </div>
                                                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${
                                                                    value.score >= 60 ? 'bg-green-500' :
                                                                    value.score <= 40 ? 'bg-red-500' :
                                                                    'bg-yellow-500'
                                                                }`}
                                                                style={{ width: `${value.score}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Key Levels */}
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-white">Key Levels</h3>
                                            <div className="space-y-2">
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">Spot</span>
                                                    <span className="text-white font-mono">{analysis.spotPrice?.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">Max Pain</span>
                                                    <span className="text-cyan-400 font-mono">{analysis.keyLevels?.maxPain?.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">ATM Strike</span>
                                                    <span className="text-white font-mono">{analysis.keyLevels?.atmStrike?.toLocaleString()}</span>
                                                </div>
                                                {analysis.keyLevels?.resistance?.[0] && (
                                                    <div className="flex justify-between p-2 bg-red-900/30 rounded border border-red-800/50">
                                                        <span className="text-red-400">Resistance</span>
                                                        <span className="text-red-300 font-mono">{analysis.keyLevels.resistance[0].level?.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {analysis.keyLevels?.support?.[0] && (
                                                    <div className="flex justify-between p-2 bg-green-900/30 rounded border border-green-800/50">
                                                        <span className="text-green-400">Support</span>
                                                        <span className="text-green-300 font-mono">{analysis.keyLevels.support[0].level?.toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Market Summary */}
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-white">Market Summary</h3>
                                            <div className="space-y-2">
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">PCR (OI)</span>
                                                    <span className={`font-mono ${
                                                        analysis.chainSummary?.pcr?.oi > 1 ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                        {analysis.chainSummary?.pcr?.oi?.toFixed(2)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">Sentiment</span>
                                                    <span className={`${
                                                        analysis.chainSummary?.sentiment?.includes('Bullish') ? 'text-green-400' :
                                                        analysis.chainSummary?.sentiment?.includes('Bearish') ? 'text-red-400' :
                                                        'text-yellow-400'
                                                    }`}>
                                                        {analysis.chainSummary?.sentiment}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">Expiry</span>
                                                    <span className="text-white">{analysis.expiry}</span>
                                                </div>
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">Days to Expiry</span>
                                                    <span className={`font-mono ${
                                                        analysis.daysToExpiry <= 2 ? 'text-red-400' :
                                                        analysis.daysToExpiry <= 5 ? 'text-yellow-400' :
                                                        'text-white'
                                                    }`}>
                                                        {analysis.daysToExpiry}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'chain' && (
                                    <OptionChainTable
                                        chain={chainData?.chain}
                                        spotPrice={chainData?.spotPrice}
                                        atmStrike={chainData?.atmStrike}
                                    />
                                )}

                                {activeTab === 'oi' && (
                                    <div className="space-y-4">
                                        <OIAnalysisPanel
                                            oiData={analysis.analysis?.quantitative?.oi}
                                            chainData={chainData}
                                            expanded={true}
                                        />
                                    </div>
                                )}

                                {activeTab === 'iv' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-white">IV Analysis</h3>
                                            <div className="space-y-2">
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">ATM IV (Call)</span>
                                                    <span className="text-white font-mono">
                                                        {analysis.analysis?.quantitative?.iv?.atmIV?.call?.toFixed(1)}%
                                                    </span>
                                                </div>
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">ATM IV (Put)</span>
                                                    <span className="text-white font-mono">
                                                        {analysis.analysis?.quantitative?.iv?.atmIV?.put?.toFixed(1)}%
                                                    </span>
                                                </div>
                                                <div className="flex justify-between p-2 bg-gray-700/50 rounded">
                                                    <span className="text-gray-400">IV Skew</span>
                                                    <span className={`font-mono ${
                                                        analysis.analysis?.quantitative?.iv?.skew?.value > 2 ? 'text-red-400' :
                                                        analysis.analysis?.quantitative?.iv?.skew?.value < -2 ? 'text-green-400' :
                                                        'text-yellow-400'
                                                    }`}>
                                                        {analysis.analysis?.quantitative?.iv?.skew?.value?.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-400">
                                                {analysis.analysis?.quantitative?.iv?.skew?.interpretation}
                                            </p>
                                        </div>
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-white">IV Level</h3>
                                            <div className="text-center py-8">
                                                <span className={`text-4xl font-bold ${
                                                    analysis.analysis?.quantitative?.iv?.level?.value > 25 ? 'text-red-400' :
                                                    analysis.analysis?.quantitative?.iv?.level?.value < 15 ? 'text-green-400' :
                                                    'text-yellow-400'
                                                }`}>
                                                    {analysis.analysis?.quantitative?.iv?.level?.value?.toFixed(1)}%
                                                </span>
                                                <p className="text-gray-400 mt-2">Average ATM IV</p>
                                            </div>
                                            <p className="text-sm text-gray-400">
                                                {analysis.analysis?.quantitative?.iv?.level?.interpretation}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Initial State */}
                {!analysis && !loading && !error && (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">📊</div>
                        <h2 className="text-2xl font-bold text-white mb-2">Option AI Analyser</h2>
                        <p className="text-gray-400 max-w-lg mx-auto">
                            AI-powered options analysis combining Quantitative, Technical, ML, and News signals.
                            Select a symbol above to begin.
                        </p>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="bg-gray-800 p-4 text-center text-xs text-gray-500">
                <p>Options trading involves significant risk. This analysis is for educational purposes only. Not financial advice.</p>
            </footer>
        </div>
    );
}

export default OptionAnalyser;
