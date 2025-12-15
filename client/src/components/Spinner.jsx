import React from 'react';

function Spinner() {
    return (
        <div className="flex justify-center items-center p-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
             <p className="ml-4 text-lg">Analyzing...</p>
        </div>
    );
}

export default Spinner;
