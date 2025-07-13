import React from 'react';
import { toast } from 'react-hot-toast';

const VideoPreviewModal = ({ isOpen, onClose, video }) => {
  if (!isOpen || !video) return null;

  // Get the video server URL - adapts to development/production
  const getVideoBaseUrl = () => {
    const customApiUrl = import.meta.env.VITE_API_URL;
    if (customApiUrl) {
      // If custom API URL is set, replace /api with /videos
      return customApiUrl.replace('/api', '/videos');
    }
    
    // In development, use separate server on port 5000
    if (import.meta.env.DEV) {
      return window.location.origin.replace(/:\d+/, ':5000') + '/videos';
    }
    
    // In production, same origin
    return window.location.origin + '/videos';
  };
  
  // Encode each path segment properly while preserving the path structure
  const pathSegments = video.path.split('/').map(segment => encodeURIComponent(segment));
  const encodedPath = pathSegments.join('/');
  const videoUrl = `${getVideoBaseUrl()}${encodedPath}`;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const copyVideoLink = async () => {
    try {
      await navigator.clipboard.writeText(videoUrl);
      toast.success('Video link copied to clipboard!', {
        icon: '📋',
        duration: 2000,
      });
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast.error('Failed to copy link to clipboard');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {video.name}
            </h2>
            <p className="text-sm text-gray-500">
              {formatFileSize(video.size)} • {new Date(video.modified).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video Player */}
        <div className="p-4">
          <video
            controls
            className="w-full h-auto max-h-[60vh] bg-black rounded-lg"
            preload="metadata"
          >
            <source src={videoUrl} type="video/mp4" />
            <source src={videoUrl} type="video/webm" />
            <source src={videoUrl} type="video/ogg" />
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Video Info */}
        <div className="px-4 pb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Video Information</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div>
                <span className="font-medium">File name:</span> {video.name}
              </div>
              <div>
                <span className="font-medium">File size:</span> {formatFileSize(video.size)}
              </div>
              <div>
                <span className="font-medium">Created:</span> {new Date(video.created).toLocaleString()}
              </div>
              <div>
                <span className="font-medium">Modified:</span> {new Date(video.modified).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <div className="flex justify-end space-x-2">
            <button
              onClick={copyVideoLink}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center space-x-2"
            >
              <span>📋</span>
              <span>Copy Link</span>
            </button>
            <a
              href={videoUrl}
              download={video.name}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Download
            </a>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPreviewModal;
