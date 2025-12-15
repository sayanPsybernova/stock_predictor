import React from 'react';

const EXCHANGE_LABELS = {
    'US': { label: 'US', color: 'bg-blue-600' },
    'NSE': { label: 'NSE', color: 'bg-orange-600' },
    'BSE': { label: 'BSE', color: 'bg-purple-600' },
};

const CURRENCY_SYMBOLS = {
    'USD': '$',
    'INR': '₹',
    'EUR': '€',
    'GBP': '£',
};

function StockSummary({ data }) {
    if (!data) return null;

    const isPositive = (data.marketChange?.amount || 0) >= 0;
    const exchange = data.exchange || 'US';
    const exchangeInfo = EXCHANGE_LABELS[exchange] || { label: exchange, color: 'bg-gray-600' };
    const currency = data.currency || 'USD';
    const currencySymbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
    const marketPrice = data.marketPrice || 0;

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-start flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-2xl md:text-3xl font-bold text-white">
                            {data.shortName || data.longName || data.symbol}
                        </h2>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${exchangeInfo.color}`}>
                            {exchangeInfo.label}
                        </span>
                    </div>
                    <p className="text-gray-400 text-sm">
                        {data.symbol} {data.originalSymbol && data.originalSymbol !== data.symbol && `(searched: ${data.originalSymbol})`}
                    </p>
                    {data.longName && data.shortName && data.longName !== data.shortName && (
                        <p className="text-gray-500 text-xs mt-1">{data.longName}</p>
                    )}
                </div>
                <div className="text-right">
                    <p className="text-3xl md:text-4xl font-bold text-white">
                        {currencySymbol}{marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className={`text-lg md:text-xl font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{(data.marketChange?.amount || 0).toFixed(2)} ({(data.marketChange?.percent || 0).toFixed(2)}%)
                    </p>
                    <p className="text-gray-500 text-xs mt-1">{currency}</p>
                </div>
            </div>
        </div>
    );
}

export default StockSummary;
