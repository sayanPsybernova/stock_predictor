import React from 'react';

const SummaryItem = ({ label, value, valueColor }) => (
    <div className="flex justify-between text-sm">
        <span className="text-gray-400">{label}:</span>
        <span className={`font-semibold ${valueColor || 'text-white'}`}>{value ?? 'N/A'}</span>
    </div>
);

function TechnicalView({ data }) {
    // FIX: Add null safety guard
    if (!data) {
        return (
            <div className="text-gray-500 p-4">
                No technical data available
            </div>
        );
    }

    // FIX: Safe access with defaults
    const rsi = data?.summary?.rsi ?? 'N/A';
    const trend = data?.summary?.trend ?? 'Unknown';
    const macdSignal = data?.summary?.macd_signal ?? 'Unknown';
    const volatility = data?.summary?.volatility ?? 'Unknown';

    // Calculate colors safely
    const rsiValue = parseFloat(rsi);
    const rsiColor = !isNaN(rsiValue)
        ? (rsiValue > 70 ? 'text-red-400' : rsiValue < 30 ? 'text-green-400' : 'text-white')
        : 'text-white';

    const trendColor = trend === 'Uptrend' ? 'text-green-400' : trend === 'Downtrend' ? 'text-red-400' : 'text-white';
    const macdColor = macdSignal === 'Bullish' ? 'text-green-400' : macdSignal === 'Bearish' ? 'text-red-400' : 'text-white';

    // FIX: Safe access for support/resistance
    const support = data?.supportResistance?.support;
    const resistance = data?.supportResistance?.resistance;

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Technical Summary</h3>
            <div className="bg-gray-700 p-4 rounded-lg space-y-2">
                <SummaryItem label="Trend" value={trend} valueColor={trendColor} />
                <SummaryItem label="RSI (14)" value={rsi} valueColor={rsiColor} />
                <SummaryItem label="MACD" value={macdSignal} valueColor={macdColor} />
                <SummaryItem label="Volatility" value={volatility} />
            </div>
            <div className="bg-gray-700 p-4 rounded-lg space-y-2">
                <h4 className="font-bold text-base mb-2">Key Levels</h4>
                <SummaryItem
                    label="Support"
                    value={support != null ? `$${support.toFixed(2)}` : 'N/A'}
                />
                <SummaryItem
                    label="Resistance"
                    value={resistance != null ? `$${resistance.toFixed(2)}` : 'N/A'}
                />
            </div>
        </div>
    );
}

export default TechnicalView;
