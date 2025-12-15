import React from 'react';

const MetricItem = ({ label, value }) => (
    <div className="flex justify-between text-sm py-2 border-b border-gray-700">
        <span className="text-gray-400">{label}:</span>
        <span className="font-mono text-white">{value ?? 'N/A'}</span>
    </div>
);

function FundamentalView({ data }) {
    // FIX: Add null safety guard
    if (!data) {
        return (
            <div className="text-gray-500 p-4">
                No fundamental data available
            </div>
        );
    }

    // FIX: Add default for rating color
    const ratingColor = {
        'Strong': 'text-green-400',
        'Moderate': 'text-yellow-400',
        'Neutral': 'text-white',
        'Weak': 'text-red-400',
    }[data.rating] || 'text-white';

    // FIX: Safe access to metrics
    const metrics = data.metrics || {};
    const fundamentalScore = data.fundamentalScore ?? 0;

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Fundamental Summary</h3>
            <div className="bg-gray-700 p-4 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Overall Rating:</span>
                    <span className={`font-bold text-lg ${ratingColor}`}>{data.rating || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Score:</span>
                    <span className="font-mono text-white">{(fundamentalScore * 100).toFixed(1)} / 100</span>
                </div>
            </div>

            <div className="bg-gray-700 p-4 rounded-lg">
                <h4 className="font-bold text-base mb-2">Key Metrics</h4>
                <MetricItem label="P/E Ratio" value={metrics.peRatio} />
                <MetricItem label="P/B Ratio" value={metrics.pbRatio} />
                <MetricItem label="Debt-to-Equity" value={metrics.debtToEquity} />
                <MetricItem label="Return on Equity" value={metrics.roe} />
            </div>
        </div>
    );
}

export default FundamentalView;
