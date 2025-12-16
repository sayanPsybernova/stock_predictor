import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function OIAnalysisPanel({ oiData, chainData, expanded = false }) {
    // Prepare chart data
    const chartData = chainData?.chain?.map(strike => ({
        strike: strike.strikePrice,
        callOI: strike.call?.oi || 0,
        putOI: strike.put?.oi || 0,
        callChange: strike.call?.oiChange || 0,
        putChange: strike.put?.oiChange || 0,
        isATM: strike.isATM
    })).filter(d => d.callOI > 0 || d.putOI > 0) || [];

    // Get pattern info
    const pattern = oiData?.pattern || '';
    const patternInterpretation = oiData?.patternInterpretation || '';

    const getPatternColor = () => {
        if (pattern.includes('longBuildup') || pattern.includes('shortCovering')) return 'text-green-400';
        if (pattern.includes('shortBuildup') || pattern.includes('longUnwinding')) return 'text-red-400';
        return 'text-yellow-400';
    };

    const formatNumber = (num) => {
        if (num >= 10000000) return (num / 10000000).toFixed(1) + 'Cr';
        if (num >= 100000) return (num / 100000).toFixed(1) + 'L';
        if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
        return num;
    };

    return (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">OI Analysis</h3>

            {/* Pattern Summary */}
            <div className="mb-4 p-3 bg-gray-700/50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Dominant Pattern</span>
                    <span className={`font-medium ${getPatternColor()}`}>
                        {pattern.replace(/([A-Z])/g, ' $1').trim() || 'Analyzing...'}
                    </span>
                </div>
                <p className="text-xs text-gray-500">{patternInterpretation}</p>
            </div>

            {/* OI Summary */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-2 bg-green-900/20 rounded border border-green-800/30">
                    <span className="text-xs text-gray-400">Total Call OI</span>
                    <p className="text-lg font-mono text-green-400">
                        {formatNumber(oiData?.totalCallOI || 0)}
                    </p>
                    <span className={`text-xs ${oiData?.callOIChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {oiData?.callOIChange > 0 ? '+' : ''}{formatNumber(oiData?.callOIChange || 0)}
                    </span>
                </div>
                <div className="p-2 bg-red-900/20 rounded border border-red-800/30">
                    <span className="text-xs text-gray-400">Total Put OI</span>
                    <p className="text-lg font-mono text-red-400">
                        {formatNumber(oiData?.totalPutOI || 0)}
                    </p>
                    <span className={`text-xs ${oiData?.putOIChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {oiData?.putOIChange > 0 ? '+' : ''}{formatNumber(oiData?.putOIChange || 0)}
                    </span>
                </div>
            </div>

            {/* OI Chart */}
            {expanded && chartData.length > 0 && (
                <div className="h-64 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.slice(-15)} layout="vertical">
                            <XAxis type="number" tickFormatter={formatNumber} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                            <YAxis
                                type="category"
                                dataKey="strike"
                                tick={{ fill: '#9ca3af', fontSize: 10 }}
                                width={60}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                                labelStyle={{ color: '#fff' }}
                                formatter={(value, name) => [formatNumber(value), name === 'callOI' ? 'Call OI' : 'Put OI']}
                            />
                            <Bar dataKey="callOI" fill="#22c55e" name="Call OI" />
                            <Bar dataKey="putOI" fill="#ef4444" name="Put OI" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Key Levels */}
            <div className="mt-4">
                <h4 className="text-xs font-semibold text-gray-400 mb-2">Key OI Levels</h4>
                <div className="space-y-1">
                    {oiData?.concentration?.callStrikes?.slice(0, 3).map((strike, idx) => (
                        <div key={`call-${idx}`} className="flex justify-between text-xs">
                            <span className="text-gray-400">Resistance {idx + 1}</span>
                            <span className="text-red-400 font-mono">{strike.strike?.toLocaleString()}</span>
                            <span className="text-gray-500">{formatNumber(strike.oi)}</span>
                        </div>
                    ))}
                    {oiData?.concentration?.putStrikes?.slice(0, 3).map((strike, idx) => (
                        <div key={`put-${idx}`} className="flex justify-between text-xs">
                            <span className="text-gray-400">Support {idx + 1}</span>
                            <span className="text-green-400 font-mono">{strike.strike?.toLocaleString()}</span>
                            <span className="text-gray-500">{formatNumber(strike.oi)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default OIAnalysisPanel;
