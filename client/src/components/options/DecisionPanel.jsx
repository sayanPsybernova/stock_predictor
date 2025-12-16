import React from 'react';

function DecisionPanel({ decision, recommendation, scores, reasoning }) {
    const getDirectionColor = (direction) => {
        if (direction?.includes('BULLISH')) return 'text-green-400';
        if (direction?.includes('BEARISH')) return 'text-red-400';
        return 'text-yellow-400';
    };

    const getDirectionBg = (direction) => {
        if (direction?.includes('BULLISH')) return 'from-green-600/20 to-green-600/5';
        if (direction?.includes('BEARISH')) return 'from-red-600/20 to-red-600/5';
        return 'from-yellow-600/20 to-yellow-600/5';
    };

    const getDirectionIcon = (direction) => {
        if (direction?.includes('BULLISH')) return '📈';
        if (direction?.includes('BEARISH')) return '📉';
        return '➡️';
    };

    const getConfidenceColor = (confidence) => {
        if (confidence === 'High') return 'text-green-400 bg-green-600/20';
        if (confidence === 'Moderate') return 'text-yellow-400 bg-yellow-600/20';
        return 'text-gray-400 bg-gray-600/20';
    };

    return (
        <div className={`bg-gradient-to-b ${getDirectionBg(decision?.direction)} bg-gray-800 rounded-xl border border-gray-700 overflow-hidden`}>
            {/* Header */}
            <div className="p-4 border-b border-gray-700/50">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">AI Decision</h3>
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{getDirectionIcon(decision?.direction)}</span>
                    <div>
                        <p className={`text-xl font-bold ${getDirectionColor(decision?.direction)}`}>
                            {decision?.direction?.replace('_', ' ') || 'ANALYZING'}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getConfidenceColor(decision?.confidence)}`}>
                            {decision?.confidence} Confidence
                        </span>
                    </div>
                </div>
            </div>

            {/* Score */}
            <div className="p-4 border-b border-gray-700/50">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Final Score</span>
                    <span className={`text-2xl font-bold ${getDirectionColor(decision?.direction)}`}>
                        {scores?.final || 50}
                    </span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${
                            decision?.direction?.includes('BULLISH') ? 'bg-green-500' :
                            decision?.direction?.includes('BEARISH') ? 'bg-red-500' :
                            'bg-yellow-500'
                        }`}
                        style={{ width: `${scores?.final || 50}%` }}
                    />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Bearish</span>
                    <span>Neutral</span>
                    <span>Bullish</span>
                </div>
            </div>

            {/* Recommendation */}
            {recommendation && recommendation.action !== 'NO_TRADE' && (
                <div className="p-4 border-b border-gray-700/50">
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Recommendation</h4>
                    {recommendation.action === 'WAIT_FOR_CONFIRMATION' ? (
                        <p className="text-sm text-yellow-400">
                            Wait for clearer signals before taking position
                        </p>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className={`px-3 py-1 rounded text-sm font-medium ${
                                    recommendation.optionType === 'CE' ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'
                                }`}>
                                    {recommendation.action} {recommendation.strike} {recommendation.optionType}
                                </span>
                            </div>
                            {recommendation.target && (
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="bg-green-900/20 p-2 rounded border border-green-800/30">
                                        <span className="text-gray-400 text-xs">Target</span>
                                        <p className="text-green-400 font-mono">{recommendation.target?.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-red-900/20 p-2 rounded border border-red-800/30">
                                        <span className="text-gray-400 text-xs">Stop Loss</span>
                                        <p className="text-red-400 font-mono">{recommendation.stopLoss?.toLocaleString()}</p>
                                    </div>
                                </div>
                            )}
                            {recommendation.riskReward && (
                                <p className="text-xs text-gray-400">
                                    Risk:Reward = 1:{recommendation.riskReward.ratio}
                                </p>
                            )}
                        </div>
                    )}
                    {recommendation.expiryNote && (
                        <p className="text-xs text-orange-400 mt-2">
                            ⚠️ {recommendation.expiryNote}
                        </p>
                    )}
                </div>
            )}

            {/* Reasoning */}
            <div className="p-4">
                <h4 className="text-sm font-semibold text-gray-400 mb-2">Key Signals</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {reasoning?.map((section, idx) => (
                        <div key={idx} className="text-xs">
                            <p className="text-cyan-400 font-medium">{section.source}</p>
                            <ul className="ml-3 mt-1 space-y-0.5">
                                {section.points?.slice(0, 2).map((point, pIdx) => (
                                    <li key={pIdx} className="text-gray-400">• {point}</li>
                                ))}
                            </ul>
                        </div>
                    )) || (
                        <p className="text-sm text-gray-500">No reasoning available</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DecisionPanel;
