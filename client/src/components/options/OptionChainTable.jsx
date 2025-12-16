import React, { useState } from 'react';

function OptionChainTable({ chain, spotPrice, atmStrike }) {
    const [showCount, setShowCount] = useState(10); // Show 10 strikes by default

    // Filter chain to show relevant strikes around ATM
    const atmIndex = chain?.findIndex(s => s.strikePrice === atmStrike) || 0;
    const startIndex = Math.max(0, atmIndex - Math.floor(showCount / 2));
    const displayedChain = chain?.slice(startIndex, startIndex + showCount) || [];

    const formatNumber = (num) => {
        if (!num) return '-';
        if (num >= 10000000) return (num / 10000000).toFixed(2) + 'Cr';
        if (num >= 100000) return (num / 100000).toFixed(2) + 'L';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    };

    const getOIChangeColor = (change) => {
        if (change > 0) return 'text-green-400';
        if (change < 0) return 'text-red-400';
        return 'text-gray-400';
    };

    const getPriceChangeColor = (change) => {
        if (change > 0) return 'text-green-400';
        if (change < 0) return 'text-red-400';
        return 'text-gray-400';
    };

    return (
        <div className="overflow-x-auto">
            {/* Controls */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Strikes:</span>
                    {[10, 20, 30].map(count => (
                        <button
                            key={count}
                            onClick={() => setShowCount(count)}
                            className={`px-3 py-1 text-xs rounded ${
                                showCount === count
                                    ? 'bg-cyan-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            {count}
                        </button>
                    ))}
                </div>
                <div className="text-sm text-gray-400">
                    Spot: <span className="text-white font-mono">{spotPrice?.toLocaleString()}</span>
                </div>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-700">
                        {/* Call columns */}
                        <th colSpan="6" className="text-center py-2 text-green-400 bg-green-900/20">CALLS</th>
                        {/* Strike */}
                        <th className="py-2 text-center text-white bg-gray-700">STRIKE</th>
                        {/* Put columns */}
                        <th colSpan="6" className="text-center py-2 text-red-400 bg-red-900/20">PUTS</th>
                    </tr>
                    <tr className="border-b border-gray-700 text-xs text-gray-400">
                        <th className="py-2 px-1 text-right">OI</th>
                        <th className="py-2 px-1 text-right">Chg</th>
                        <th className="py-2 px-1 text-right">Vol</th>
                        <th className="py-2 px-1 text-right">IV</th>
                        <th className="py-2 px-1 text-right">LTP</th>
                        <th className="py-2 px-1 text-right">Chg%</th>
                        <th className="py-2 px-2 text-center bg-gray-700"></th>
                        <th className="py-2 px-1 text-left">Chg%</th>
                        <th className="py-2 px-1 text-left">LTP</th>
                        <th className="py-2 px-1 text-left">IV</th>
                        <th className="py-2 px-1 text-left">Vol</th>
                        <th className="py-2 px-1 text-left">Chg</th>
                        <th className="py-2 px-1 text-left">OI</th>
                    </tr>
                </thead>
                <tbody>
                    {displayedChain.map((strike) => {
                        const isATM = strike.strikePrice === atmStrike;
                        const isITMCall = strike.strikePrice < spotPrice;
                        const isITMPut = strike.strikePrice > spotPrice;

                        return (
                            <tr
                                key={strike.strikePrice}
                                className={`border-b border-gray-800 hover:bg-gray-700/30 ${
                                    isATM ? 'bg-cyan-900/20' : ''
                                }`}
                            >
                                {/* Call side */}
                                <td className={`py-2 px-1 text-right font-mono ${isITMCall ? 'bg-green-900/10' : ''}`}>
                                    {formatNumber(strike.call?.oi)}
                                </td>
                                <td className={`py-2 px-1 text-right font-mono ${getOIChangeColor(strike.call?.oiChange)} ${isITMCall ? 'bg-green-900/10' : ''}`}>
                                    {strike.call?.oiChange > 0 ? '+' : ''}{formatNumber(strike.call?.oiChange)}
                                </td>
                                <td className={`py-2 px-1 text-right font-mono text-gray-400 ${isITMCall ? 'bg-green-900/10' : ''}`}>
                                    {formatNumber(strike.call?.volume)}
                                </td>
                                <td className={`py-2 px-1 text-right font-mono text-purple-400 ${isITMCall ? 'bg-green-900/10' : ''}`}>
                                    {strike.call?.iv?.toFixed(1) || '-'}
                                </td>
                                <td className={`py-2 px-1 text-right font-mono text-white ${isITMCall ? 'bg-green-900/10' : ''}`}>
                                    {strike.call?.ltp?.toFixed(2) || '-'}
                                </td>
                                <td className={`py-2 px-1 text-right font-mono ${getPriceChangeColor(strike.call?.pChange)} ${isITMCall ? 'bg-green-900/10' : ''}`}>
                                    {strike.call?.pChange?.toFixed(1) || '-'}%
                                </td>

                                {/* Strike */}
                                <td className={`py-2 px-2 text-center font-bold ${
                                    isATM ? 'text-cyan-400 bg-cyan-900/30' : 'text-white bg-gray-700'
                                }`}>
                                    {strike.strikePrice.toLocaleString()}
                                    {isATM && <span className="text-xs ml-1">ATM</span>}
                                </td>

                                {/* Put side */}
                                <td className={`py-2 px-1 text-left font-mono ${getPriceChangeColor(strike.put?.pChange)} ${isITMPut ? 'bg-red-900/10' : ''}`}>
                                    {strike.put?.pChange?.toFixed(1) || '-'}%
                                </td>
                                <td className={`py-2 px-1 text-left font-mono text-white ${isITMPut ? 'bg-red-900/10' : ''}`}>
                                    {strike.put?.ltp?.toFixed(2) || '-'}
                                </td>
                                <td className={`py-2 px-1 text-left font-mono text-purple-400 ${isITMPut ? 'bg-red-900/10' : ''}`}>
                                    {strike.put?.iv?.toFixed(1) || '-'}
                                </td>
                                <td className={`py-2 px-1 text-left font-mono text-gray-400 ${isITMPut ? 'bg-red-900/10' : ''}`}>
                                    {formatNumber(strike.put?.volume)}
                                </td>
                                <td className={`py-2 px-1 text-left font-mono ${getOIChangeColor(strike.put?.oiChange)} ${isITMPut ? 'bg-red-900/10' : ''}`}>
                                    {strike.put?.oiChange > 0 ? '+' : ''}{formatNumber(strike.put?.oiChange)}
                                </td>
                                <td className={`py-2 px-1 text-left font-mono ${isITMPut ? 'bg-red-900/10' : ''}`}>
                                    {formatNumber(strike.put?.oi)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Legend */}
            <div className="flex gap-4 mt-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-900/30 rounded"></span> ITM Call
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-900/30 rounded"></span> ITM Put
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-cyan-900/30 rounded"></span> ATM
                </span>
            </div>
        </div>
    );
}

export default OptionChainTable;
