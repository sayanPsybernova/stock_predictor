import React from 'react';

const RiskIndicator = ({ level }) => {
    const levelColor = {
        'Low': 'bg-green-500',
        'Medium': 'bg-yellow-500',
        'High': 'bg-red-500',
        'Unknown': 'bg-gray-500'
    }[level] || 'bg-gray-500';

    return <span className={`px-2 py-1 text-xs font-bold text-white rounded-full ${levelColor}`}>{level || 'N/A'}</span>;
};

const ConfidenceBar = ({ value }) => {
    // FIX: Clamp value to 0-100 to prevent overflow
    const safeValue = Math.max(0, Math.min(100, value || 0));

    return (
        <div className="w-full bg-gray-600 rounded-full h-4">
            <div
                className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                style={{ width: `${safeValue}%` }}
            ></div>
        </div>
    );
};

function QuantView({ data }) {
    // FIX: Add null safety guard
    if (!data || typeof data !== 'object') {
        return (
            <div className="text-gray-500 p-4">
                No forecast data available
            </div>
        );
    }

    const entries = Object.entries(data);

    if (entries.length === 0) {
        return (
            <div className="text-gray-500 p-4">
                No forecast data available
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {entries.map(([timeframe, analysis]) => {
                // FIX: Safe access to analysis properties
                if (!analysis) return null;

                const expectedRange = analysis.expectedReturnRange || {};
                const probability = analysis.probability || {};
                const explanation = analysis.explanation || [];

                return (
                    <div key={timeframe} className="bg-gray-700 p-4 rounded-lg">
                        <h3 className="text-lg font-bold text-white mb-3">{timeframe} Forecast</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Exp. Return:</span>
                                <span className="font-mono text-green-400">
                                    {expectedRange.lower ?? 'N/A'} to {expectedRange.upper ?? 'N/A'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Risk Level:</span>
                                <RiskIndicator level={analysis.riskLevel} />
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Confidence:</span>
                                <div className="w-3/5 flex items-center">
                                    <ConfidenceBar value={analysis.confidence} />
                                    <span className="ml-2 text-xs font-mono">{analysis.confidence ?? 0}%</span>
                                </div>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">P(Positive):</span>
                                <span className="font-mono text-green-400">{probability.positive ?? 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">P(Negative):</span>
                                <span className="font-mono text-red-400">{probability.negative ?? 'N/A'}</span>
                            </div>
                            {explanation.length > 0 && (
                                <details className="pt-2">
                                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                                        View Explanation
                                    </summary>
                                    <ul className="mt-2 pl-4 list-disc text-xs text-gray-400 space-y-1">
                                        {explanation.map((line, i) => <li key={i}>{line}</li>)}
                                    </ul>
                                </details>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default QuantView;
