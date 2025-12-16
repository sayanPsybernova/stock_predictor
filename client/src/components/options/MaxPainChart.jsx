import React from 'react';

function MaxPainChart({ maxPain, spotPrice, keyLevels }) {
    const maxPainValue = maxPain?.maxPain || keyLevels?.maxPain || 0;
    const spot = spotPrice || 0;
    const distancePercent = maxPain?.distancePercent || 0;

    const getSignalColor = () => {
        if (distancePercent < -1) return 'text-green-400'; // Spot below max pain - bullish
        if (distancePercent > 1) return 'text-red-400'; // Spot above max pain - bearish
        return 'text-yellow-400';
    };

    const getSignalText = () => {
        if (distancePercent < -2) return 'Strong upside potential';
        if (distancePercent < -0.5) return 'Upside expected';
        if (distancePercent > 2) return 'Pullback expected';
        if (distancePercent > 0.5) return 'Downside risk';
        return 'Near equilibrium';
    };

    // Create visual representation
    const levels = [
        { label: 'Support', value: keyLevels?.support?.[0]?.level, color: 'bg-green-500' },
        { label: 'Spot', value: spot, color: 'bg-cyan-500', isSpot: true },
        { label: 'Max Pain', value: maxPainValue, color: 'bg-purple-500', isMaxPain: true },
        { label: 'Resistance', value: keyLevels?.resistance?.[0]?.level, color: 'bg-red-500' }
    ].filter(l => l.value).sort((a, b) => a.value - b.value);

    return (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Max Pain Analysis</h3>

            {/* Max Pain Value */}
            <div className="text-center mb-4">
                <span className="text-4xl font-bold text-purple-400">
                    {maxPainValue.toLocaleString()}
                </span>
                <p className="text-sm text-gray-400 mt-1">Max Pain Strike</p>
            </div>

            {/* Distance from Spot */}
            <div className="flex justify-between items-center p-2 bg-gray-700/50 rounded-lg mb-4">
                <span className="text-sm text-gray-400">Spot vs Max Pain</span>
                <span className={`font-mono ${getSignalColor()}`}>
                    {distancePercent > 0 ? '+' : ''}{distancePercent.toFixed(2)}%
                </span>
            </div>

            {/* Visual Level Indicator */}
            <div className="relative py-4 mb-4">
                <div className="absolute left-0 right-0 top-1/2 h-1 bg-gray-700 rounded" />
                {levels.map((level, idx) => {
                    const position = (idx / (levels.length - 1)) * 100;
                    return (
                        <div
                            key={idx}
                            className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
                            style={{ left: `${position}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                        >
                            <div className={`w-3 h-3 rounded-full ${level.color} ${level.isSpot ? 'ring-2 ring-white' : ''}`} />
                            <span className="text-xs text-gray-400 mt-1 whitespace-nowrap">
                                {level.label}
                            </span>
                            <span className="text-xs font-mono text-gray-300">
                                {level.value?.toLocaleString()}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Signal */}
            <div className={`text-center p-2 rounded-lg ${
                distancePercent < -1 ? 'bg-green-900/30 border border-green-800/50' :
                distancePercent > 1 ? 'bg-red-900/30 border border-red-800/50' :
                'bg-yellow-900/30 border border-yellow-800/50'
            }`}>
                <p className={`text-sm font-medium ${getSignalColor()}`}>
                    {getSignalText()}
                </p>
            </div>

            {/* Interpretation */}
            <p className="text-xs text-gray-500 mt-3">
                {maxPain?.interpretation || 'Max Pain is the strike where option buyers lose maximum. Price tends to gravitate towards this level near expiry.'}
            </p>
        </div>
    );
}

export default MaxPainChart;
