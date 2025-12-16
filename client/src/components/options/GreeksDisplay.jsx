import React from 'react';

function GreeksDisplay({ atmStrike, spotPrice, chain }) {
    // Find ATM option from chain
    const atmData = chain?.find(s => s.strikePrice === atmStrike);
    const callGreeks = atmData?.call || {};
    const putGreeks = atmData?.put || {};

    const greeks = [
        {
            name: 'Delta',
            symbol: 'Δ',
            call: callGreeks.delta,
            put: putGreeks.delta,
            description: 'Rate of change vs underlying',
            color: 'text-cyan-400'
        },
        {
            name: 'Gamma',
            symbol: 'Γ',
            call: callGreeks.gamma,
            put: putGreeks.gamma,
            description: 'Rate of change of Delta',
            color: 'text-purple-400'
        },
        {
            name: 'Theta',
            symbol: 'Θ',
            call: callGreeks.theta,
            put: putGreeks.theta,
            description: 'Time decay per day',
            color: 'text-yellow-400'
        },
        {
            name: 'Vega',
            symbol: 'V',
            call: callGreeks.vega,
            put: putGreeks.vega,
            description: 'Sensitivity to IV',
            color: 'text-green-400'
        }
    ];

    return (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-gray-400">ATM Greeks</h3>
                <span className="text-xs text-gray-500">Strike: {atmStrike?.toLocaleString()}</span>
            </div>

            <div className="space-y-3">
                {greeks.map((greek) => (
                    <div key={greek.name} className="flex items-center justify-between p-2 bg-gray-700/30 rounded-lg">
                        <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${greek.color}`}>{greek.symbol}</span>
                            <div>
                                <span className="text-sm text-white">{greek.name}</span>
                            </div>
                        </div>
                        <div className="flex gap-4 text-sm">
                            <div className="text-right">
                                <span className="text-gray-500 text-xs">CE</span>
                                <p className="font-mono text-green-400">
                                    {greek.call != null ? greek.call.toFixed(greek.name === 'Gamma' ? 4 : 2) : '-'}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-gray-500 text-xs">PE</span>
                                <p className="font-mono text-red-400">
                                    {greek.put != null ? greek.put.toFixed(greek.name === 'Gamma' ? 4 : 2) : '-'}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick interpretation */}
            <div className="mt-3 p-2 bg-gray-700/30 rounded-lg">
                <p className="text-xs text-gray-400">
                    {callGreeks.delta > 0.5 ? (
                        'ATM Call has strong delta - good for directional plays'
                    ) : callGreeks.theta < -10 ? (
                        'High theta decay - time is against option buyers'
                    ) : (
                        'Monitor Greeks for position management'
                    )}
                </p>
            </div>
        </div>
    );
}

export default GreeksDisplay;
