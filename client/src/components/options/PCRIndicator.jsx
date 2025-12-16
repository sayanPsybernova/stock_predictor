import React from 'react';

function PCRIndicator({ pcr, chainSummary }) {
    const pcrOI = pcr?.oi || chainSummary?.pcr?.oi || 1;
    const pcrVolume = pcr?.volume || chainSummary?.pcr?.volume || 1;

    const getPCRColor = (value) => {
        if (value > 1.2) return 'text-green-400';
        if (value < 0.8) return 'text-red-400';
        return 'text-yellow-400';
    };

    const getPCRBg = (value) => {
        if (value > 1.2) return 'bg-green-500';
        if (value < 0.8) return 'bg-red-500';
        return 'bg-yellow-500';
    };

    const getSignalText = (value) => {
        if (value > 1.5) return 'Strong Bullish';
        if (value > 1.2) return 'Bullish';
        if (value > 1.0) return 'Mildly Bullish';
        if (value > 0.8) return 'Mildly Bearish';
        if (value > 0.5) return 'Bearish';
        return 'Strong Bearish';
    };

    // Calculate gauge position (0-100)
    const gaugePosition = Math.min(100, Math.max(0, (pcrOI / 2) * 100));

    return (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Put-Call Ratio</h3>

            {/* Main PCR Display */}
            <div className="text-center mb-4">
                <span className={`text-4xl font-bold ${getPCRColor(pcrOI)}`}>
                    {pcrOI.toFixed(2)}
                </span>
                <p className={`text-sm mt-1 ${getPCRColor(pcrOI)}`}>
                    {getSignalText(pcrOI)}
                </p>
            </div>

            {/* Gauge */}
            <div className="relative h-3 bg-gray-700 rounded-full mb-4 overflow-visible">
                {/* Background gradient */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 opacity-30" />

                {/* Marker */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg border-2 border-gray-800 transition-all duration-300"
                    style={{ left: `calc(${gaugePosition}% - 8px)` }}
                />

                {/* Labels */}
                <div className="absolute -bottom-5 left-0 text-xs text-red-400">0.5</div>
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-yellow-400">1.0</div>
                <div className="absolute -bottom-5 right-0 text-xs text-green-400">1.5+</div>
            </div>

            {/* Volume PCR */}
            <div className="mt-6 pt-4 border-t border-gray-700">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Volume PCR</span>
                    <span className={`font-mono ${getPCRColor(pcrVolume)}`}>
                        {pcrVolume.toFixed(2)}
                    </span>
                </div>
            </div>

            {/* Interpretation */}
            <div className="mt-3 p-2 bg-gray-700/50 rounded-lg">
                <p className="text-xs text-gray-400">
                    {pcrOI > 1.2 ? (
                        'High PCR indicates strong put writing. Writers confident of support levels.'
                    ) : pcrOI < 0.8 ? (
                        'Low PCR indicates call writing dominance. Bearish sentiment from writers.'
                    ) : (
                        'PCR in neutral zone. Market may be range-bound.'
                    )}
                </p>
            </div>
        </div>
    );
}

export default PCRIndicator;
