import React, { useState } from 'react';
import QuantView from './QuantView';
import TechnicalView from './TechnicalView';
import FundamentalView from './FundamentalView';
import AIAnalysisView from './AIAnalysisView';

const TABS = ['Forecast', 'Technical', 'Fundamental', 'AI Insight'];

function AnalysisTabs({ data, onRefresh }) {
    const [activeTab, setActiveTab] = useState(TABS[0]);

    // Null safety guard
    if (!data) {
        return (
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
                <p className="text-gray-500">No analysis data available</p>
            </div>
        );
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'Forecast':
                return <QuantView data={data.analysis} />;
            case 'Technical':
                return <TechnicalView data={data.technicalAnalysis} />;
            case 'Fundamental':
                return <FundamentalView data={data.fundamentalAnalysis} />;
            case 'AI Insight':
                return (
                    <AIAnalysisView
                        data={data.aiAnalysis}
                        marketStatus={data.marketStatus}
                        onRefresh={onRefresh}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg">
            <div className="flex border-b border-gray-700 overflow-x-auto">
                {TABS.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 min-w-max py-3 px-2 text-sm font-semibold transition-colors duration-200 ${
                            activeTab === tab
                                ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
            <div className="p-4">
                {renderContent()}
            </div>
        </div>
    );
}

export default AnalysisTabs;
