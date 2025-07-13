import React from 'react';

const SystemStats = ({ diskUsage, systemStats, compact = false, onRefresh, refreshInterval = 30 }) => {
  if (!diskUsage && !systemStats) {
    return (
      <div className={`text-sm text-gray-500 ${compact ? 'text-xs' : ''}`}>
        {compact ? '💻 Loading...' : 'Loading system stats...'}
      </div>
    );
  }

  const parsePercentage = (percentStr) => {
    if (typeof percentStr === 'string') {
      return parseInt(percentStr.replace('%', '')) || 0;
    }
    return percentStr || 0;
  };

  const diskPercentage = diskUsage ? parsePercentage(diskUsage.usePercentage) : 0;
  const cpuPercentage = systemStats?.cpu?.usage || 0;
  const memoryPercentage = systemStats?.memory?.usage || 0;

  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getUsageIcon = (percentage, type) => {
    const color = percentage >= 90 ? '🔴' : percentage >= 75 ? '🟡' : '🟢';
    const icons = {
      disk: '💾',
      cpu: '🖥️',
      memory: '🧠'
    };
    return compact ? color : icons[type];
  };

  if (compact) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center space-x-1">
            <span className="text-sm">{getUsageIcon(diskPercentage, 'disk')}</span>
            <span className="text-xs font-medium text-gray-700">{diskUsage?.usePercentage || '0%'}</span>
          </div>
          <div className="w-px h-3 bg-gray-300"></div>
          <div className="flex items-center space-x-1">
            <span className="text-sm">{getUsageIcon(cpuPercentage, 'cpu')}</span>
            <span className="text-xs font-medium text-gray-700">{cpuPercentage}%</span>
          </div>
          <div className="w-px h-3 bg-gray-300"></div>
          <div className="flex items-center space-x-1">
            <span className="text-sm">{getUsageIcon(memoryPercentage, 'memory')}</span>
            <span className="text-xs font-medium text-gray-700">{memoryPercentage}%</span>
          </div>
          {onRefresh && (
            <>
              <div className="w-px h-3 bg-gray-300"></div>
              <button
                onClick={onRefresh}
                className="text-xs text-blue-600 hover:text-blue-800 p-1 rounded transition-colors"
                title="Refresh stats now"
              >
                🔄
              </button>
            </>
          )}
        </div>
        {/* Refresh info for compact view */}
        <div className="text-xs text-gray-400 text-center mt-1">
          Auto-refresh every {refreshInterval}s
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center space-x-6 bg-white px-6 py-3 rounded-2xl border border-gray-200 shadow-lg">
        {/* Storage Stats */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
            <span className="text-lg">💾</span>
          </div>
          <div className="flex flex-col">
            <div className="text-lg font-bold text-gray-900">{diskUsage?.usePercentage || '0%'}</div>
            <div className="w-12 bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${getUsageColor(diskPercentage)}`}
                style={{ width: `${diskPercentage}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-500 font-medium">Storage</div>
          </div>
        </div>

        {/* CPU Stats */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100">
            <span className="text-lg">🖥️</span>
          </div>
          <div className="flex flex-col">
            <div className="text-lg font-bold text-gray-900">{cpuPercentage}%</div>
            <div className="w-12 bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${getUsageColor(cpuPercentage)}`}
                style={{ width: `${cpuPercentage}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-500 font-medium">CPU</div>
          </div>
        </div>

        {/* Memory Stats */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-100">
            <span className="text-lg">🧠</span>
          </div>
          <div className="flex flex-col">
            <div className="text-lg font-bold text-gray-900">{memoryPercentage}%</div>
            <div className="w-12 bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${getUsageColor(memoryPercentage)}`}
                style={{ width: `${memoryPercentage}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-500 font-medium">RAM</div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-12 bg-gray-200"></div>
        
        {/* Detailed Info */}
        <div className="space-y-1">
          {diskUsage && (
            <>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-xs font-medium text-gray-700">Available:</span>
                <span className="text-xs font-bold text-emerald-600">{diskUsage.available}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs font-medium text-gray-700">Total:</span>
                <span className="text-xs font-bold text-gray-900">{diskUsage.total}</span>
              </div>
            </>
          )}
          {systemStats?.memory && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span className="text-xs font-medium text-gray-700">RAM:</span>
              <span className="text-xs font-bold text-gray-900">{systemStats.memory.used}/{systemStats.memory.total}</span>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <>
            <div className="w-px h-12 bg-gray-200"></div>
            <button
              onClick={onRefresh}
              className="flex items-center space-x-2 px-3 py-2 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 transition-all duration-200 font-medium shadow-sm hover:shadow"
              title="Refresh stats now"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          </>
        )}
      </div>
      
      {/* Refresh info line */}
      <div className="text-xs text-gray-400 text-center mt-2 flex items-center justify-center space-x-2">
        <span>Stats refresh every {refreshInterval} seconds</span>
        {onRefresh && (
          <>
            <span>•</span>
            <button
              onClick={onRefresh}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Refresh now
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default SystemStats;
