import React from 'react';

function Disclaimer() {
    return (
        <div className="text-center p-8 bg-gray-800 rounded-lg shadow-inner">
            <h2 className="text-xl font-bold mb-4">Welcome to the Stock Analyzer</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
                Enter a stock symbol in the search bar above to begin your analysis. This tool provides insights based on technical, fundamental, and quantitative models.
            </p>
            <p className="text-xs text-gray-500 mt-6">
                <strong>Disclaimer:</strong> All data and analysis provided are for educational and informational purposes only. This is not financial advice. Trading stocks involves significant risk.
            </p>
        </div>
    );
}

export default Disclaimer;
