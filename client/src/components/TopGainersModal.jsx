import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const TopGainersModal = ({ isOpen, onClose }) => {
    const [predictions, setPredictions] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('largeCap');
    const [expandedStock, setExpandedStock] = useState(null);

    useEffect(() => {
        if (isOpen && !predictions) {
            fetchPredictions();
        }
    }, [isOpen]);

    const fetchPredictions = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`${API_URL}/stock/predictions/top-gainers`, {
                timeout: 120000 // 120 second timeout for complex analysis
            });
            setPredictions(response.data);
        } catch (err) {
            console.error('Error fetching predictions:', err);
            setError(err.response?.data?.error || 'Failed to fetch predictions. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const tabs = [
        { id: 'largeCap', label: 'Large Cap', icon: '🏢' },
        { id: 'midCap', label: 'Mid Cap', icon: '🏠' },
        { id: 'smallCap', label: 'Small Cap', icon: '🏪' }
    ];

    const getConfidenceColor = (confidence) => {
        if (confidence === 'High') return 'text-green-400';
        if (confidence === 'Medium') return 'text-yellow-400';
        return 'text-orange-400';
    };

    const getConfidenceBg = (confidence) => {
        if (confidence === 'High') return 'bg-green-500/20 border-green-500/30';
        if (confidence === 'Medium') return 'bg-yellow-500/20 border-yellow-500/30';
        return 'bg-orange-500/20 border-orange-500/30';
    };

    const getScoreColor = (score) => {
        const numScore = parseFloat(score);
        if (numScore >= 40) return 'text-green-400';
        if (numScore >= 25) return 'text-yellow-400';
        return 'text-orange-400';
    };

    const renderDetailedReasons = (stock) => {
        const reasons = stock.detailedReasons;
        if (!reasons) return null;

        return (
            <div className="mt-4 border-t border-gray-600 pt-4 animate-fadeIn">
                {/* Prediction Summary Header */}
                <div className="bg-gradient-to-r from-purple-900/50 to-cyan-900/50 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🎯</span>
                        <h4 className="text-lg font-bold text-white">Why This Stock?</h4>
                    </div>
                    <div className="text-cyan-300 font-medium mb-2">
                        Primary Reason: {reasons.predictionSummary?.primaryReason}
                    </div>
                    {reasons.predictionSummary?.supportingFactors?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {reasons.predictionSummary.supportingFactors.map((factor, i) => (
                                <span key={i} className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">
                                    + {factor}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Data Sources Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Chartink Analysis */}
                    <div className="bg-gray-800/70 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{reasons.chartinkAnalysis?.icon}</span>
                            <span className="text-sm font-semibold text-white">{reasons.chartinkAnalysis?.source}</span>
                            <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                                reasons.chartinkAnalysis?.verdict === 'Strong Buy Signal' ? 'bg-green-500/30 text-green-300' :
                                reasons.chartinkAnalysis?.verdict === 'Moderate Signal' ? 'bg-yellow-500/30 text-yellow-300' :
                                'bg-gray-600/30 text-gray-400'
                            }`}>
                                {reasons.chartinkAnalysis?.verdict}
                            </span>
                        </div>
                        <ul className="text-xs text-gray-300 space-y-1">
                            {reasons.chartinkAnalysis?.findings?.map((finding, i) => (
                                <li key={i} className="flex items-start gap-1">
                                    <span className="text-cyan-400 mt-0.5">•</span>
                                    <span>{finding}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* TradingView Analysis */}
                    <div className="bg-gray-800/70 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{reasons.tradingViewAnalysis?.icon}</span>
                            <span className="text-sm font-semibold text-white">{reasons.tradingViewAnalysis?.source}</span>
                            <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                                reasons.tradingViewAnalysis?.recommendation === 'Buy' ? 'bg-green-500/30 text-green-300' :
                                reasons.tradingViewAnalysis?.recommendation === 'Sell' ? 'bg-red-500/30 text-red-300' :
                                'bg-yellow-500/30 text-yellow-300'
                            }`}>
                                {reasons.tradingViewAnalysis?.recommendation}
                            </span>
                        </div>
                        <div className="text-xs text-gray-300 mb-2">{reasons.tradingViewAnalysis?.summary}</div>
                        <div className="grid grid-cols-3 gap-1 text-xs">
                            <div className="bg-gray-700/50 p-1 rounded text-center">
                                <div className="text-red-400">R1</div>
                                <div className="text-white">{reasons.tradingViewAnalysis?.pivotPoints?.r1}</div>
                            </div>
                            <div className="bg-gray-700/50 p-1 rounded text-center">
                                <div className="text-yellow-400">Pivot</div>
                                <div className="text-white">{reasons.tradingViewAnalysis?.pivotPoints?.pivot}</div>
                            </div>
                            <div className="bg-gray-700/50 p-1 rounded text-center">
                                <div className="text-green-400">S1</div>
                                <div className="text-white">{reasons.tradingViewAnalysis?.pivotPoints?.s1}</div>
                            </div>
                        </div>
                    </div>

                    {/* Option Chain Analysis */}
                    <div className="bg-gray-800/70 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{reasons.optionChainAnalysis?.icon}</span>
                            <span className="text-sm font-semibold text-white">{reasons.optionChainAnalysis?.source}</span>
                            <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                                reasons.optionChainAnalysis?.sentiment === 'Bullish' ? 'bg-green-500/30 text-green-300' :
                                reasons.optionChainAnalysis?.sentiment === 'Bearish' ? 'bg-red-500/30 text-red-300' :
                                'bg-yellow-500/30 text-yellow-300'
                            }`}>
                                {reasons.optionChainAnalysis?.sentiment}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-gray-700/50 p-2 rounded text-center">
                                <div className="text-gray-400 text-xs">PCR</div>
                                <div className="text-cyan-400 font-bold">{reasons.optionChainAnalysis?.pcr}</div>
                            </div>
                            <div className="bg-gray-700/50 p-2 rounded text-center">
                                <div className="text-gray-400 text-xs">Max Pain</div>
                                <div className="text-cyan-400 font-bold">{reasons.optionChainAnalysis?.maxPain}</div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">{reasons.optionChainAnalysis?.interpretation}</div>
                    </div>

                    {/* Volume Analysis */}
                    <div className="bg-gray-800/70 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">📊</span>
                            <span className="text-sm font-semibold text-white">{reasons.volumeAnalysis?.source}</span>
                            <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                                parseFloat(reasons.volumeAnalysis?.volumeRatio) > 2 ? 'bg-green-500/30 text-green-300' :
                                parseFloat(reasons.volumeAnalysis?.volumeRatio) > 1.5 ? 'bg-yellow-500/30 text-yellow-300' :
                                'bg-gray-600/30 text-gray-400'
                            }`}>
                                {reasons.volumeAnalysis?.volumeRatio}x Avg
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="bg-gray-700/50 p-2 rounded text-center">
                                <div className="text-gray-400 text-xs">Today's Vol</div>
                                <div className="text-white font-bold">{reasons.volumeAnalysis?.currentVolume}</div>
                            </div>
                            <div className="bg-gray-700/50 p-2 rounded text-center">
                                <div className="text-gray-400 text-xs">Avg Vol</div>
                                <div className="text-white font-bold">{reasons.volumeAnalysis?.avgVolume}</div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">{reasons.volumeAnalysis?.interpretation}</div>
                    </div>

                    {/* Momentum Analysis */}
                    <div className="bg-gray-800/70 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{reasons.momentumAnalysis?.icon}</span>
                            <span className="text-sm font-semibold text-white">{reasons.momentumAnalysis?.source}</span>
                            <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                                reasons.momentumAnalysis?.strength === 'Strong' ? 'bg-green-500/30 text-green-300' :
                                reasons.momentumAnalysis?.strength === 'Moderate' ? 'bg-yellow-500/30 text-yellow-300' :
                                'bg-gray-600/30 text-gray-400'
                            }`}>
                                {reasons.momentumAnalysis?.strength}
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 mb-2">
                            <div className="bg-gray-700/50 p-1.5 rounded text-center">
                                <div className="text-gray-400 text-xs">RSI</div>
                                <div className="text-white font-bold">{reasons.momentumAnalysis?.rsi}</div>
                            </div>
                            <div className="bg-gray-700/50 p-1.5 rounded text-center">
                                <div className="text-gray-400 text-xs">MACD</div>
                                <div className={`font-bold ${reasons.momentumAnalysis?.macd === 'Bullish' ? 'text-green-400' : reasons.momentumAnalysis?.macd === 'Bearish' ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {reasons.momentumAnalysis?.macd}
                                </div>
                            </div>
                            <div className="bg-gray-700/50 p-1.5 rounded text-center">
                                <div className="text-gray-400 text-xs">Trend</div>
                                <div className={`font-bold ${reasons.momentumAnalysis?.trend === 'Uptrend' ? 'text-green-400' : reasons.momentumAnalysis?.trend === 'Downtrend' ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {reasons.momentumAnalysis?.trend}
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">{reasons.momentumAnalysis?.interpretation}</div>
                    </div>

                    {/* Sector & FII Analysis */}
                    <div className="bg-gray-800/70 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{reasons.sectorAnalysis?.icon}</span>
                            <span className="text-sm font-semibold text-white">{reasons.sectorAnalysis?.source}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 mb-2">
                            <div className="bg-gray-700/50 p-1.5 rounded text-center">
                                <div className="text-gray-400 text-xs">Sector</div>
                                <div className={`font-bold text-xs ${reasons.sectorAnalysis?.sectorTrend === 'Outperforming' ? 'text-green-400' : 'text-yellow-400'}`}>
                                    {reasons.sectorAnalysis?.sectorTrend}
                                </div>
                            </div>
                            <div className="bg-gray-700/50 p-1.5 rounded text-center">
                                <div className="text-gray-400 text-xs">FII</div>
                                <div className={`font-bold text-xs ${reasons.sectorAnalysis?.fiiActivity === 'Buying' ? 'text-green-400' : reasons.sectorAnalysis?.fiiActivity === 'Selling' ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {reasons.sectorAnalysis?.fiiActivity}
                                </div>
                            </div>
                            <div className="bg-gray-700/50 p-1.5 rounded text-center">
                                <div className="text-gray-400 text-xs">Global</div>
                                <div className={`font-bold text-xs ${reasons.sectorAnalysis?.globalCues === 'Positive' ? 'text-green-400' : reasons.sectorAnalysis?.globalCues === 'Negative' ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {reasons.sectorAnalysis?.globalCues}
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">{reasons.sectorAnalysis?.interpretation}</div>
                    </div>
                </div>

                {/* Pattern Recognition */}
                {reasons.patternAnalysis?.matchedPatterns?.length > 0 && (
                    <div className="mt-3 bg-gray-800/70 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">🎯</span>
                            <span className="text-sm font-semibold text-white">Historical Pattern Recognition</span>
                            <span className="ml-auto text-xs px-2 py-0.5 rounded bg-purple-500/30 text-purple-300">
                                Win Rate: {reasons.patternAnalysis?.historicalWinRate}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {reasons.patternAnalysis.matchedPatterns.map((pattern, i) => (
                                <div key={i} className="bg-gray-700/50 rounded p-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-cyan-400 font-medium text-sm">{pattern.name}</span>
                                        <div className="flex gap-2">
                                            <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">
                                                Match: {pattern.accuracy}
                                            </span>
                                            <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">
                                                Weight: {pattern.weight}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-400">{pattern.description}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Risk Factors */}
                {reasons.predictionSummary?.riskFactors?.length > 0 && (
                    <div className="mt-3 bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">⚠️</span>
                            <span className="text-sm font-semibold text-red-300">Risk Factors to Consider</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {reasons.predictionSummary.riskFactors.map((risk, i) => (
                                <span key={i} className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded">
                                    {risk}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderStockCard = (stock, index) => (
        <div
            key={stock.symbol}
            className={`p-4 rounded-lg border ${getConfidenceBg(stock.confidence)} mb-3 hover:scale-[1.005] transition-all`}
        >
            <div className="flex justify-between items-start mb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-white">#{index + 1}</span>
                        <span className="text-xl font-bold text-cyan-400">{stock.symbol.replace('.NS', '')}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">{stock.sector}</span>
                    </div>
                    <p className="text-gray-400 text-sm">{stock.name}</p>
                </div>
                <div className="text-right">
                    <div className={`text-2xl font-bold ${getConfidenceColor(stock.confidence)}`}>
                        {stock.confidence}
                    </div>
                    <div className="text-xs text-gray-500">Confidence</div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-gray-800/50 p-2 rounded text-center">
                    <div className="text-green-400 font-bold">{stock.predictedGain}</div>
                    <div className="text-xs text-gray-500">Expected Gain</div>
                </div>
                <div className="bg-gray-800/50 p-2 rounded text-center">
                    <div className={`font-bold ${getScoreColor(stock.patternScore)}`}>{stock.patternScore}</div>
                    <div className="text-xs text-gray-500">Pattern Score</div>
                </div>
                <div className="bg-gray-800/50 p-2 rounded text-center">
                    <div className="text-cyan-400 font-bold">{stock.currentPrice}</div>
                    <div className="text-xs text-gray-500">Current Price</div>
                </div>
            </div>

            {/* Technical Indicators */}
            <div className="grid grid-cols-4 gap-1 mb-3 text-xs">
                <div className="bg-gray-800/30 p-1.5 rounded text-center">
                    <div className="text-gray-400">RSI</div>
                    <div className={`font-bold ${parseFloat(stock.technicalIndicators?.rsi) > 70 ? 'text-red-400' : parseFloat(stock.technicalIndicators?.rsi) < 30 ? 'text-green-400' : 'text-white'}`}>
                        {stock.technicalIndicators?.rsi || 'N/A'}
                    </div>
                </div>
                <div className="bg-gray-800/30 p-1.5 rounded text-center">
                    <div className="text-gray-400">Trend</div>
                    <div className={`font-bold ${stock.technicalIndicators?.trend === 'Uptrend' ? 'text-green-400' : stock.technicalIndicators?.trend === 'Downtrend' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {stock.technicalIndicators?.trend || 'N/A'}
                    </div>
                </div>
                <div className="bg-gray-800/30 p-1.5 rounded text-center">
                    <div className="text-gray-400">MACD</div>
                    <div className={`font-bold ${stock.technicalIndicators?.macdSignal === 'Bullish' ? 'text-green-400' : stock.technicalIndicators?.macdSignal === 'Bearish' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {stock.technicalIndicators?.macdSignal || 'N/A'}
                    </div>
                </div>
                <div className="bg-gray-800/30 p-1.5 rounded text-center">
                    <div className="text-gray-400">Volume</div>
                    <div className={`font-bold ${stock.technicalIndicators?.volumeSpike ? 'text-green-400' : 'text-gray-400'}`}>
                        {stock.technicalIndicators?.volumeSpike ? 'HIGH' : 'Normal'}
                    </div>
                </div>
            </div>

            {/* Matched Patterns */}
            <div className="mb-3">
                <div className="text-xs text-gray-400 mb-1">Matched Patterns:</div>
                <div className="flex flex-wrap gap-1">
                    {stock.matchedPatterns?.slice(0, 4).map((p, i) => (
                        <span key={i} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                            {p.pattern} ({(p.score * 100).toFixed(0)}%)
                        </span>
                    ))}
                </div>
            </div>

            {/* Key Signals */}
            <div className="text-xs text-gray-500 border-t border-gray-700 pt-2 mb-3">
                <div className="flex flex-wrap gap-1">
                    {stock.keySignals?.slice(0, 4).map((signal, i) => (
                        <span key={i} className="text-gray-300">{signal}</span>
                    ))}
                </div>
            </div>

            {/* View Reason Button */}
            <button
                onClick={() => setExpandedStock(expandedStock === stock.symbol ? null : stock.symbol)}
                className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                    expandedStock === stock.symbol
                        ? 'bg-gradient-to-r from-purple-600 to-cyan-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
            >
                {expandedStock === stock.symbol ? (
                    <>
                        <span>📊</span>
                        <span>Hide Detailed Analysis</span>
                        <span className="transform rotate-180">▼</span>
                    </>
                ) : (
                    <>
                        <span>🔍</span>
                        <span>View Why This Stock Will Gain</span>
                        <span>▼</span>
                    </>
                )}
            </button>

            {/* Expanded Detailed Reasons */}
            {expandedStock === stock.symbol && renderDetailedReasons(stock)}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl">
                {/* Header */}
                <div className="bg-gradient-to-r from-purple-900 to-cyan-900 p-4 border-b border-gray-700">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                <span>🚀</span> Tomorrow's Top Gainers Prediction
                            </h2>
                            {predictions && (
                                <p className="text-gray-300 text-sm mt-1">
                                    Predictions for: <span className="text-cyan-400 font-medium">{predictions.predictionDate}</span>
                                </p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white text-2xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-700 transition-colors"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-700">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                            }`}
                        >
                            <span className="mr-2">{tab.icon}</span>
                            {tab.label}
                            {predictions?.predictions?.[tab.id] && (
                                <span className="ml-2 text-xs bg-gray-700 px-1.5 py-0.5 rounded">
                                    {predictions.predictions[tab.id].length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 220px)' }}>
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-gray-400">Analyzing patterns & generating predictions...</p>
                            <p className="text-gray-500 text-sm mt-2">Scanning 45+ stocks across all market caps</p>
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-8">
                            <div className="text-red-400 bg-red-900/30 p-4 rounded-lg border border-red-700 mb-4">
                                <p className="font-semibold">Error</p>
                                <p>{error}</p>
                            </div>
                            <button
                                onClick={fetchPredictions}
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {predictions && !loading && !error && (
                        <>
                            {predictions.predictions?.[activeTab]?.length > 0 ? (
                                <div>
                                    {predictions.predictions[activeTab].map((stock, index) =>
                                        renderStockCard(stock, index)
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-400">
                                    No predictions available for this category
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Methodology Section */}
                {predictions?.predictions?.methodology && (
                    <div className="px-4 pb-2">
                        <details className="bg-gray-800/50 rounded-lg">
                            <summary className="cursor-pointer p-2 text-sm text-gray-400 hover:text-white">
                                📊 View Methodology & Data Sources
                            </summary>
                            <div className="p-3 text-xs text-gray-500 border-t border-gray-700">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-gray-400 mb-1">Data Sources:</div>
                                        <ul className="list-disc list-inside">
                                            {predictions.predictions.methodology.dataSourcesUsed?.map((src, i) => (
                                                <li key={i}>{src}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div>
                                        <div className="text-gray-400 mb-1">Patterns Analyzed:</div>
                                        <ul className="list-disc list-inside">
                                            {predictions.predictions.methodology.patternsAnalyzed?.map((p, i) => (
                                                <li key={i}>{p}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                <div className="mt-2 text-gray-400">
                                    Historical Accuracy: <span className="text-cyan-400">{predictions.predictions.methodology.historicalAccuracy}</span>
                                </div>
                            </div>
                        </details>
                    </div>
                )}

                {/* Footer */}
                <div className="bg-gray-800 p-3 border-t border-gray-700">
                    <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500 flex-1">
                            {predictions?.disclaimer || 'Predictions are based on historical pattern analysis. Not financial advice.'}
                        </p>
                        <button
                            onClick={() => { setPredictions(null); fetchPredictions(); }}
                            disabled={loading}
                            className="ml-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            <span>🔄</span> Refresh
                        </button>
                    </div>
                    {predictions?.generatedAt && (
                        <p className="text-xs text-gray-600 mt-1">
                            Generated: {new Date(predictions.generatedAt).toLocaleString()}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TopGainersModal;
