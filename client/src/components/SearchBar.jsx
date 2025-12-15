import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

function SearchBar({ onSearch, loading }) {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const debounceRef = useRef(null);

    // Fetch suggestions as user types
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (!query || query.length < 1) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const response = await axios.get(`${API_URL}/stock/search/${encodeURIComponent(query)}`);
                if (response.data && response.data.results) {
                    setSuggestions(response.data.results);
                    setShowSuggestions(response.data.results.length > 0);
                }
            } catch (err) {
                console.error('Search error:', err);
                setSuggestions([]);
            } finally {
                setIsSearching(false);
            }
        }, 300); // 300ms debounce

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                inputRef.current &&
                !inputRef.current.contains(event.target)
            ) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        setQuery(e.target.value);
        setSelectedIndex(-1);
    };

    const handleSelectStock = (stock) => {
        setQuery(stock.symbol);
        setShowSuggestions(false);
        setSuggestions([]);
        // Auto-detect exchange from symbol
        const exchange = stock.symbol.endsWith('.NS') ? 'NSE' :
                        stock.symbol.endsWith('.BO') ? 'BSE' : 'AUTO';
        onSearch(stock.symbol, exchange);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim()) {
            setShowSuggestions(false);
            onSearch(query.toUpperCase(), 'AUTO');
        }
    };

    const handleKeyDown = (e) => {
        if (!showSuggestions || suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev =>
                prev < suggestions.length - 1 ? prev + 1 : prev
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            handleSelectStock(suggestions[selectedIndex]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    return (
        <div className="relative">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <div className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                        placeholder="Search stocks..."
                        className="w-64 px-4 py-2.5 bg-gray-800 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        autoComplete="off"
                    />

                    {/* Search icon or loading spinner */}
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        {isSearching ? (
                            <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        ) : (
                            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        )}
                    </div>

                    {/* Suggestions dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div
                            ref={dropdownRef}
                            className="absolute z-50 w-80 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-80 overflow-y-auto"
                        >
                            {suggestions.map((stock, index) => (
                                <div
                                    key={stock.symbol}
                                    onClick={() => handleSelectStock(stock)}
                                    className={`px-4 py-3 cursor-pointer border-b border-gray-700 last:border-b-0 transition-colors ${
                                        index === selectedIndex
                                            ? 'bg-gray-700'
                                            : 'hover:bg-gray-700'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-white">
                                                    {stock.symbol.replace('.NS', '').replace('.BO', '')}
                                                </span>
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                    stock.exchangeDisplay === 'NSE' ? 'bg-blue-600 text-white' :
                                                    stock.exchangeDisplay === 'BSE' ? 'bg-purple-600 text-white' :
                                                    'bg-green-600 text-white'
                                                }`}>
                                                    {stock.exchangeDisplay}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-400 truncate mt-0.5">
                                                {stock.name}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* No results message */}
                    {showSuggestions && query.length >= 2 && suggestions.length === 0 && !isSearching && (
                        <div
                            ref={dropdownRef}
                            className="absolute z-50 w-80 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-4"
                        >
                            <p className="text-gray-400 text-center">
                                No stocks found for "{query}"
                            </p>
                        </div>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Loading
                        </span>
                    ) : 'Analyze'}
                </button>
            </form>
        </div>
    );
}

export default SearchBar;
