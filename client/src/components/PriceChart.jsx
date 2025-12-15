import React, { useState, useMemo, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

// Time range options
const TIME_RANGES = [
    { key: '1D', label: '1D', days: 1, isIntraday: true },
    { key: '1W', label: '1W', days: 7, isIntraday: false },
    { key: '1M', label: '1M', days: 30, isIntraday: false },
    { key: '3M', label: '3M', days: 90, isIntraday: false },
    { key: '6M', label: '6M', days: 180, isIntraday: false },
    { key: '1Y', label: '1Y', days: 365, isIntraday: false },
    { key: '5Y', label: '5Y', days: 1825, isIntraday: false },
    { key: 'ALL', label: 'All', days: null, isIntraday: false },
];

function PriceChart({ data, symbol, currency = 'USD' }) {
    const [selectedRange, setSelectedRange] = useState('1Y');
    const [intradayData, setIntradayData] = useState(null);
    const [intradayLoading, setIntradayLoading] = useState(false);
    const [intradayError, setIntradayError] = useState(null);

    // Fetch intraday data when 1D is selected
    useEffect(() => {
        if (selectedRange === '1D' && symbol) {
            setIntradayLoading(true);
            setIntradayError(null);

            // Extract base symbol (remove .NS or .BO suffix for API call)
            const baseSymbol = symbol.replace(/\.(NS|BO)$/, '');

            axios.get(`${API_URL}/stock/${baseSymbol}/intraday`)
                .then(response => {
                    if (response.data && response.data.data && response.data.data.length > 0) {
                        setIntradayData(response.data.data);
                    } else {
                        setIntradayError('No intraday data available. Market may be closed.');
                        setIntradayData(null);
                    }
                })
                .catch(err => {
                    console.error('Intraday fetch error:', err);
                    setIntradayError('Could not load intraday data. Market may be closed.');
                    setIntradayData(null);
                })
                .finally(() => {
                    setIntradayLoading(false);
                });
        }
    }, [selectedRange, symbol]);

    // Determine which data source to use
    const activeData = useMemo(() => {
        if (selectedRange === '1D') {
            return intradayData || [];
        }
        return data || [];
    }, [selectedRange, intradayData, data]);

    // Filter data based on selected time range
    const filteredData = useMemo(() => {
        if (!activeData || !Array.isArray(activeData) || activeData.length === 0) {
            return [];
        }

        // For 1D, return all intraday data
        if (selectedRange === '1D') {
            return activeData;
        }

        const range = TIME_RANGES.find(r => r.key === selectedRange);
        if (!range || range.days === null) {
            // Return all data
            return activeData;
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - range.days);

        return activeData.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= cutoffDate;
        });
    }, [activeData, selectedRange]);

    // Format data for chart
    const chartData = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return [];

        return filteredData.map(item => ({
            date: item.date,
            close: item.close ?? 0,
            formattedDate: formatDate(item.date, selectedRange),
        }));
    }, [filteredData, selectedRange]);

    // Calculate price change stats
    const priceStats = useMemo(() => {
        if (!chartData || chartData.length < 2) {
            return { change: 0, changePercent: 0, isPositive: true, startPrice: 0 };
        }

        const startPrice = chartData[0].close;
        const endPrice = chartData[chartData.length - 1].close;
        const change = endPrice - startPrice;
        const changePercent = startPrice !== 0 ? (change / startPrice) * 100 : 0;

        return {
            change,
            changePercent,
            isPositive: change >= 0,
            startPrice,
        };
    }, [chartData]);

    // Get min/max for Y axis
    const yDomain = useMemo(() => {
        if (!chartData || chartData.length === 0) return [0, 100];

        const prices = chartData.map(d => d.close);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const padding = (max - min) * 0.1 || max * 0.05;

        return [Math.max(0, min - padding), max + padding];
    }, [chartData]);

    // Currency symbol
    const currencySymbol = currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

    // Check if we have no data at all
    const hasNoData = !data || !Array.isArray(data) || data.length === 0;

    if (hasNoData && selectedRange !== '1D') {
        return (
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg h-96 flex items-center justify-center">
                <p className="text-gray-500">No chart data available</p>
            </div>
        );
    }

    // Green for positive, Red for negative
    const chartColor = priceStats.isPositive ? '#22c55e' : '#ef4444';
    const gradientId = priceStats.isPositive ? 'colorPriceGreen' : 'colorPriceRed';

    // Show loading state for intraday
    const showIntradayLoading = selectedRange === '1D' && intradayLoading;
    const showIntradayError = selectedRange === '1D' && intradayError && !intradayData;
    const showChart = chartData.length > 0 && !showIntradayLoading;

    return (
        <div className="bg-gray-900 rounded-lg shadow-lg overflow-hidden">
            {/* Header with symbol and price */}
            <div className="p-4 pb-2">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                    <span className="font-medium text-white">{symbol}</span>
                    <span>·</span>
                    <span>{selectedRange === '1D' ? 'Today' : `${TIME_RANGES.find(r => r.key === selectedRange)?.label || ''}`}</span>
                </div>

                {/* Price change for selected period */}
                {showChart && (
                    <div className={`text-sm ${priceStats.isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {priceStats.isPositive ? '+' : ''}{currencySymbol}{Math.abs(priceStats.change).toFixed(2)} ({priceStats.isPositive ? '+' : ''}{priceStats.changePercent.toFixed(2)}%)
                    </div>
                )}
            </div>

            {/* Chart */}
            <div className="h-72 px-2">
                {showIntradayLoading && (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-gray-400">
                            <svg className="animate-spin h-8 w-8 mx-auto mb-2" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>Loading intraday data...</span>
                        </div>
                    </div>
                )}

                {showIntradayError && (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center text-gray-500">
                            <p className="mb-2">{intradayError}</p>
                            <p className="text-xs">Try selecting a different time range</p>
                        </div>
                    </div>
                )}

                {showChart && (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                        >
                            <defs>
                                <linearGradient id="colorPriceGreen" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorPriceRed" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>

                            <XAxis
                                dataKey="formattedDate"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 11 }}
                                interval="preserveStartEnd"
                                minTickGap={50}
                            />

                            <YAxis
                                domain={yDomain}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 11 }}
                                tickFormatter={(value) => `${currencySymbol}${value.toFixed(0)}`}
                                width={60}
                                orientation="right"
                            />

                            {/* Reference line at starting price */}
                            <ReferenceLine
                                y={priceStats.startPrice}
                                stroke="#4b5563"
                                strokeDasharray="3 3"
                                strokeWidth={1}
                            />

                            <Tooltip
                                content={<CustomTooltip currencySymbol={currencySymbol} isIntraday={selectedRange === '1D'} />}
                            />

                            <Area
                                type="monotone"
                                dataKey="close"
                                stroke={chartColor}
                                strokeWidth={2}
                                fill={`url(#${gradientId})`}
                                dot={false}
                                activeDot={{ r: 4, fill: chartColor, stroke: '#fff', strokeWidth: 2 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Time range selector */}
            <div className="flex justify-center gap-1 p-4 pt-2 border-t border-gray-800">
                {TIME_RANGES.map((range) => (
                    <button
                        key={range.key}
                        onClick={() => setSelectedRange(range.key)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            selectedRange === range.key
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                    >
                        {range.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// Custom tooltip component
function CustomTooltip({ active, payload, label, currencySymbol, isIntraday }) {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const price = data.close;
    const date = new Date(data.date);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl">
            <div className="text-white font-bold text-lg">
                {currencySymbol}{price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-gray-400 text-sm">
                {isIntraday ? (
                    date.toLocaleString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        month: 'short',
                        day: 'numeric'
                    })
                ) : (
                    date.toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    })
                )}
            </div>
        </div>
    );
}

// Format date based on time range
function formatDate(dateStr, range) {
    const date = new Date(dateStr);

    switch (range) {
        case '1D':
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        case '1W':
            return date.toLocaleDateString('en-US', { weekday: 'short' });
        case '1M':
        case '3M':
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        case '6M':
        case '1Y':
            return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        case '5Y':
        case 'ALL':
            return date.toLocaleDateString('en-US', { year: 'numeric' });
        default:
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

export default PriceChart;
