import React, { useState, useEffect } from 'react';

// Market Status Badge Component
const MarketStatusBadge = ({ marketStatus }) => {
    if (!marketStatus) return null;

    return (
        <div className="flex items-center gap-2 text-xs">
            <span className={`flex items-center gap-1 px-2 py-1 rounded-full ${
                marketStatus.isOpen
                    ? 'bg-green-900/50 text-green-400 border border-green-700'
                    : 'bg-red-900/50 text-red-400 border border-red-700'
            }`}>
                <span className={`w-2 h-2 rounded-full ${marketStatus.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                <span>{marketStatus.market} {marketStatus.isOpen ? 'OPEN' : 'CLOSED'}</span>
            </span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">Updates: {marketStatus.updateFrequency}</span>
        </div>
    );
};

// Live Update Indicator
const LiveUpdateIndicator = ({ lastUpdated, isMarketOpen }) => {
    const [timeAgo, setTimeAgo] = useState('just now');

    useEffect(() => {
        const updateTimeAgo = () => {
            if (!lastUpdated) return;
            const seconds = Math.floor((Date.now() - lastUpdated) / 1000);
            if (seconds < 60) setTimeAgo('just now');
            else if (seconds < 3600) setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
            else setTimeAgo(`${Math.floor(seconds / 3600)}h ago`);
        };

        updateTimeAgo();
        const interval = setInterval(updateTimeAgo, 30000);
        return () => clearInterval(interval);
    }, [lastUpdated]);

    return (
        <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${isMarketOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
            <span>News updated {timeAgo}</span>
            {isMarketOpen && <span className="text-green-400">(Live)</span>}
        </div>
    );
};

const SentimentBadge = ({ sentiment }) => {
    const colors = {
        'Bullish': 'bg-green-500 text-white',
        'Bearish': 'bg-red-500 text-white',
        'Neutral': 'bg-yellow-500 text-white',
        'Unknown': 'bg-gray-600 text-gray-300'
    };

    const icons = {
        'Bullish': '📈',
        'Bearish': '📉',
        'Neutral': '➡️',
        'Unknown': '❓'
    };

    return (
        <span className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 ${colors[sentiment] || colors['Unknown']}`}>
            <span>{icons[sentiment] || icons['Unknown']}</span>
            <span>{sentiment || 'Unknown'}</span>
        </span>
    );
};

const SignalBar = ({ bullish, bearish, neutral }) => {
    const total = bullish + bearish + neutral;
    if (total === 0) return null;

    const bullishWidth = (bullish / total) * 100;
    const bearishWidth = (bearish / total) * 100;
    const neutralWidth = (neutral / total) * 100;

    return (
        <div className="w-full h-4 flex rounded-full overflow-hidden bg-gray-600">
            <div
                className="bg-green-500 h-full transition-all duration-500"
                style={{ width: `${bullishWidth}%` }}
                title={`Bullish: ${bullish}`}
            />
            <div
                className="bg-yellow-500 h-full transition-all duration-500"
                style={{ width: `${neutralWidth}%` }}
                title={`Neutral: ${neutral}`}
            />
            <div
                className="bg-red-500 h-full transition-all duration-500"
                style={{ width: `${bearishWidth}%` }}
                title={`Bearish: ${bearish}`}
            />
        </div>
    );
};

// Signal detail badge component
const SignalBadge = ({ signal, type }) => {
    const colors = {
        bullish: 'bg-green-900/50 text-green-400 border-green-700',
        bearish: 'bg-red-900/50 text-red-400 border-red-700',
        neutral: 'bg-yellow-900/50 text-yellow-400 border-yellow-700'
    };

    const icons = {
        bullish: '↑',
        bearish: '↓',
        neutral: '→'
    };

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border ${colors[type]}`}>
            <span>{icons[type]}</span>
            <span>{signal}</span>
        </span>
    );
};

// Markdown renderer component
const MarkdownContent = ({ content }) => {
    if (!content) return null;

    // Parse markdown to JSX
    const parseMarkdown = (text) => {
        const lines = text.split('\n');
        const elements = [];
        let currentList = [];
        let listType = null;

        const flushList = () => {
            if (currentList.length > 0) {
                elements.push(
                    <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-2 ml-4">
                        {currentList.map((item, i) => (
                            <li key={i} className="text-gray-300">{parseInline(item)}</li>
                        ))}
                    </ul>
                );
                currentList = [];
            }
        };

        // Parse inline formatting (bold, italic)
        const parseInline = (text) => {
            const parts = [];
            let remaining = text;
            let key = 0;

            // Bold with **text**
            while (remaining.includes('**')) {
                const start = remaining.indexOf('**');
                const end = remaining.indexOf('**', start + 2);
                if (end === -1) break;

                if (start > 0) {
                    parts.push(<span key={key++}>{remaining.substring(0, start)}</span>);
                }
                parts.push(
                    <strong key={key++} className="text-white font-bold">
                        {remaining.substring(start + 2, end)}
                    </strong>
                );
                remaining = remaining.substring(end + 2);
            }

            if (remaining) {
                parts.push(<span key={key++}>{remaining}</span>);
            }

            return parts.length > 0 ? parts : text;
        };

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();

            // Empty line
            if (!trimmedLine) {
                flushList();
                elements.push(<div key={index} className="h-2" />);
                return;
            }

            // Headers with emojis (## 📊 TITLE)
            if (trimmedLine.startsWith('## ')) {
                flushList();
                const headerText = trimmedLine.substring(3);
                elements.push(
                    <h3 key={index} className="text-lg font-bold text-white mt-6 mb-3 pb-2 border-b border-gray-700 flex items-center gap-2">
                        {headerText}
                    </h3>
                );
                return;
            }

            // H4 headers
            if (trimmedLine.startsWith('### ')) {
                flushList();
                const headerText = trimmedLine.substring(4);
                elements.push(
                    <h4 key={index} className="text-base font-semibold text-blue-400 mt-4 mb-2">
                        {headerText}
                    </h4>
                );
                return;
            }

            // Bold lines (like **Short-term (Next 5 Days):**)
            if (trimmedLine.startsWith('**') && trimmedLine.includes(':**')) {
                flushList();
                const text = trimmedLine.replace(/\*\*/g, '');
                elements.push(
                    <p key={index} className="text-white font-semibold mt-4 mb-1">
                        {text}
                    </p>
                );
                return;
            }

            // Bullet points (- item or • item)
            if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('• ')) {
                currentList.push(trimmedLine.substring(2));
                return;
            }

            // Numbered list
            if (/^\d+\.\s/.test(trimmedLine)) {
                currentList.push(trimmedLine.replace(/^\d+\.\s/, ''));
                return;
            }

            // Regular paragraph
            flushList();
            elements.push(
                <p key={index} className="text-gray-300 my-2 leading-relaxed">
                    {parseInline(trimmedLine)}
                </p>
            );
        });

        flushList();
        return elements;
    };

    return <div className="markdown-content">{parseMarkdown(content)}</div>;
};

function AIAnalysisView({ data, marketStatus, onRefresh }) {
    const [showAllSignals, setShowAllSignals] = useState(false);
    const [lastUpdated] = useState(Date.now());

    // Null safety guard
    if (!data) {
        return (
            <div className="text-gray-500 p-4 text-center">
                <div className="text-4xl mb-2">🤖</div>
                <p>AI analysis not available</p>
            </div>
        );
    }

    const { explanation, sentiment, sentimentStrength, signals } = data;

    // Get signal details if available
    const signalDetails = signals?.details || [];
    const displayedSignals = showAllSignals ? signalDetails : signalDetails.slice(0, 4);

    return (
        <div className="space-y-4">
            {/* Header with Market Status */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-2xl">🤖</span>
                        <span>AI-Powered Analysis</span>
                    </h3>
                    <span className="text-xs bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-1.5 rounded-full text-white font-medium">
                        Powered by Gemini 2.0
                    </span>
                </div>

                {/* Market Status and Live Update Info */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-800/50 p-2 rounded-lg">
                    <MarketStatusBadge marketStatus={marketStatus} />
                    <div className="flex items-center gap-3">
                        <LiveUpdateIndicator lastUpdated={lastUpdated} isMarketOpen={marketStatus?.isOpen} />
                        {onRefresh && (
                            <button
                                onClick={onRefresh}
                                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors flex items-center gap-1"
                            >
                                <span>🔄</span>
                                <span>Refresh</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* News-Based Prediction Notice */}
                <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/30 rounded-lg p-2">
                    <div className="flex items-center gap-2 text-xs text-blue-300">
                        <span>📰</span>
                        <span>Predictions are dynamically adjusted based on real-time news sentiment from Google News</span>
                    </div>
                </div>
            </div>

            {/* Sentiment Overview Card */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-5 rounded-xl border border-gray-700">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div>
                        <span className="text-gray-400 text-sm block mb-1">Overall Sentiment</span>
                        <SentimentBadge sentiment={sentiment} />
                    </div>

                    {sentimentStrength && sentimentStrength !== 'N/A' && (
                        <div className="text-right">
                            <span className="text-gray-400 text-sm block mb-1">Confidence Level</span>
                            <span className="text-2xl font-bold text-white">{sentimentStrength}</span>
                        </div>
                    )}
                </div>

                {signals && (
                    <div className="mt-4">
                        <div className="flex justify-between text-xs text-gray-400 mb-2">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Bullish ({signals.bullish || 0})
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                Neutral ({signals.neutral || 0})
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                Bearish ({signals.bearish || 0})
                            </span>
                        </div>
                        <SignalBar
                            bullish={signals.bullish || 0}
                            bearish={signals.bearish || 0}
                            neutral={signals.neutral || 0}
                        />
                    </div>
                )}

                {/* Signal Details */}
                {signalDetails.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <div className="text-sm text-gray-400 mb-2">Key Signals Detected:</div>
                        <div className="flex flex-wrap gap-2">
                            {displayedSignals.map((detail, idx) => (
                                <SignalBadge
                                    key={idx}
                                    signal={`${detail.source}: ${detail.signal}`}
                                    type={detail.type}
                                />
                            ))}
                        </div>
                        {signalDetails.length > 4 && (
                            <button
                                onClick={() => setShowAllSignals(!showAllSignals)}
                                className="text-blue-400 text-xs mt-2 hover:text-blue-300 transition-colors"
                            >
                                {showAllSignals ? 'Show less' : `+${signalDetails.length - 4} more signals`}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* AI Analysis Content */}
            <div className="bg-gray-800 p-5 rounded-xl border border-gray-700">
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">📊</span>
                    <h4 className="font-bold text-lg text-white">Comprehensive Analysis Report</h4>
                </div>

                <div className="text-sm overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                    {explanation ? (
                        <MarkdownContent content={explanation} />
                    ) : (
                        <p className="text-gray-400 italic">No analysis explanation available.</p>
                    )}
                </div>
            </div>

            {/* Quick Summary Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-800 p-3 rounded-lg text-center border border-gray-700">
                    <div className="text-2xl mb-1">📊</div>
                    <div className="text-xs text-gray-400">Technical</div>
                    <div className="text-sm font-semibold text-white">
                        {signals?.details?.find(s => s.source === 'Technical')?.type === 'bullish' ? '✅ Positive' :
                         signals?.details?.find(s => s.source === 'Technical')?.type === 'bearish' ? '⚠️ Caution' : '➡️ Neutral'}
                    </div>
                </div>
                <div className="bg-gray-800 p-3 rounded-lg text-center border border-gray-700">
                    <div className="text-2xl mb-1">📈</div>
                    <div className="text-xs text-gray-400">Fundamental</div>
                    <div className="text-sm font-semibold text-white">
                        {signals?.details?.find(s => s.source === 'Fundamental')?.type === 'bullish' ? '✅ Strong' :
                         signals?.details?.find(s => s.source === 'Fundamental')?.type === 'bearish' ? '⚠️ Weak' : '➡️ Moderate'}
                    </div>
                </div>
                <div className="bg-gray-800 p-3 rounded-lg text-center border border-gray-700">
                    <div className="text-2xl mb-1">🔮</div>
                    <div className="text-xs text-gray-400">Quant Model</div>
                    <div className="text-sm font-semibold text-white">
                        {signals?.details?.find(s => s.source === 'Quantitative')?.type === 'bullish' ? '✅ Positive' :
                         signals?.details?.find(s => s.source === 'Quantitative')?.type === 'bearish' ? '⚠️ Negative' : '➡️ Neutral'}
                    </div>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                    <span className="text-yellow-500">⚠️</span>
                    <div className="text-xs text-yellow-200/80">
                        <strong>Disclaimer:</strong> This AI-powered analysis is generated using Google Gemini 2.0 and is for educational purposes only.
                        It should not be considered as financial advice. Market predictions involve inherent risks and uncertainties.
                        Always conduct your own research and consult with qualified financial advisors before making investment decisions.
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AIAnalysisView;
