import React from 'react';

const DiskUsageStats = ({ diskUsage, compact = false }) => {
  if (!diskUsage) {
    return (
      <div className={`text-sm text-gray-500 ${compact ? 'text-xs' : ''}`}>
        {compact ? '💾 Loading...' : 'Loading disk usage...'}
      </div>
    );
  }

  const parsePercentage = (percentStr) => {
    if (typeof percentStr === 'string') {
      return parseInt(percentStr.replace('%', '')) || 0;
    }
    return 0;
  };

  const usagePercentage = parsePercentage(diskUsage.usePercentage);
  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getUsageIcon = (percentage) => {
    if (percentage >= 90) return '🔴';
    if (percentage >= 75) return '🟡';
    return '🟢';
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
        <span className="text-lg">{getUsageIcon(usagePercentage)}</span>
        <div className="text-xs">
          <div className="font-semibold text-gray-900">{diskUsage.usePercentage}</div>
          <div className="text-gray-500">Used</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-6 bg-white px-6 py-3 rounded-2xl border border-gray-200 shadow-lg">
      {/* Storage Icon */}
      <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
        <span className="text-2xl">💾</span>
      </div>
      
      {/* Storage Info */}
      <div className="flex items-center space-x-6">
        {/* Usage Percentage with Progress Bar */}
        <div className="flex flex-col items-center">
          <div className="text-2xl font-bold text-gray-900 mb-1">{diskUsage.usePercentage}</div>
          <div className="w-16 bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getUsageColor(usagePercentage)}`}
              style={{ width: `${usagePercentage}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-500 mt-1 font-medium">Used</div>
        </div>
        
        {/* Divider */}
        <div className="w-px h-12 bg-gray-200"></div>
        
        {/* Storage Details */}
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700">Total:</span>
              <span className="text-sm font-bold text-gray-900">{diskUsage.total}</span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-gray-700">Available:</span>
              <span className="text-sm font-bold text-emerald-600">{diskUsage.available}</span>
            </div>
          </div>
        </div>
        
        {/* Status Indicator */}
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            usagePercentage >= 90 ? 'bg-red-100' : 
            usagePercentage >= 75 ? 'bg-yellow-100' : 'bg-green-100'
          }`}>
            <span className="text-lg">{getUsageIcon(usagePercentage)}</span>
          </div>
          <div className={`text-xs font-semibold mt-1 ${
            usagePercentage >= 90 ? 'text-red-600' : 
            usagePercentage >= 75 ? 'text-yellow-600' : 'text-green-600'
          }`}>
            {usagePercentage >= 90 ? 'Critical' : 
             usagePercentage >= 75 ? 'Warning' : 'Healthy'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiskUsageStats;
