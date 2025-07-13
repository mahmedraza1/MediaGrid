import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import FileManager from './components/FileManager';
import VideoPreviewModal from './components/VideoPreviewModal';
import SystemStats from './components/SystemStats';
import './App.css';

// API Configuration - automatically adapts to development/production
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

function App() {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [diskUsage, setDiskUsage] = useState(null);
  const [systemStats, setSystemStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [pendingUploads, setPendingUploads] = useState([]);

  // Check for path parameter in URL on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathParam = urlParams.get('path');
    if (pathParam) {
      const decodedPath = decodeURIComponent(pathParam);
      setCurrentPath(decodedPath);
      loadFiles(decodedPath);
    } else {
      loadFiles('/');
    }
  }, []);

  // Update URL when path changes
  const updateURL = (path) => {
    const url = new URL(window.location);
    if (path === '/') {
      url.searchParams.delete('path');
    } else {
      url.searchParams.set('path', encodeURIComponent(path));
    }
    window.history.replaceState({}, '', url);
  };

  // Load files and folders
  const loadFiles = async (path = '/') => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/files?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error('Failed to load files');
      
      const data = await response.json();
      setFiles(data.files || []);
      setFolders(data.folders || []);
      setDiskUsage(data.diskUsage || null);
      setSystemStats(data.systemStats || null);
      setCurrentPath(data.currentPath || path);
    } catch (error) {
      console.error('Error loading files:', error);
      toast.error('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  // Manual refresh for system stats
  const refreshStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/files?path=${encodeURIComponent(currentPath)}`);
      if (!response.ok) throw new Error('Failed to refresh stats');
      
      const data = await response.json();
      setDiskUsage(data.diskUsage || null);
      setSystemStats(data.systemStats || null);
      
      toast.success('Stats refreshed!', {
        duration: 2000,
        icon: '🔄',
      });
    } catch (error) {
      console.error('Error refreshing stats:', error);
      toast.error('Failed to refresh stats');
    }
  };

  // Upload file with progress
  const uploadFile = async (file, path = '/', batchInfo = null) => {
    // Use chunked upload for files larger than 50MB
    const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
    
    if (file.size > LARGE_FILE_THRESHOLD) {
      return await uploadFileChunked(file, path, batchInfo);
    }
    
    // Regular upload for smaller files
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', path);

    const toastId = batchInfo ? batchInfo.toastId : `upload-${file.name}-${Date.now()}`;
    
    try {
      // Show progress notification for single files too
      if (!batchInfo) {
        toast.loading(
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <div className="flex-1">
              <div className="font-medium text-sm text-gray-900">Uploading File</div>
              <div className="text-xs text-gray-600 mb-1">{file.name}</div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">Processing...</div>
            </div>
          </div>,
          { 
            id: toastId,
            duration: Infinity
          }
        );
      } else {
        // Update batch notification
        const progress = Math.round(((batchInfo.currentIndex + 1) / batchInfo.totalFiles) * 100);
        toast.loading(
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <div className="flex-1">
              <div className="font-medium text-sm text-gray-900">
                Uploading {batchInfo.folderName || 'Files'}
              </div>
              <div className="text-xs text-gray-600 mb-1">
                {file.name} ({batchInfo.currentIndex + 1} of {batchInfo.totalFiles})
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">{progress}% complete</div>
            </div>
          </div>,
          { 
            id: toastId,
            duration: Infinity
          }
        );
      }
      
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      const data = await response.json();
      
      // Handle single file completion
      if (!batchInfo) {
        toast.success(
          <div>
            <div className="font-medium text-sm text-gray-900">✅ Upload Complete!</div>
            <div className="text-xs text-gray-600">{file.name}</div>
          </div>,
          { id: toastId, duration: 4000 }
        );
        
        // Refresh immediately after single file upload
        await loadFiles(currentPath);
      }
      
      return { success: true, isVideo: data.file.isVideo, fileName: file.name };
    } catch (error) {
      console.error('Upload error:', error);
      
      if (!batchInfo) {
        toast.error(
          <div>
            <div className="font-medium text-sm text-gray-900">❌ Upload Failed</div>
            <div className="text-xs text-gray-600">{file.name}</div>
            <div className="text-xs text-red-600 mt-1">{error.message}</div>
          </div>,
          { id: toastId, duration: 6000 }
        );
      }
      
      return { success: false, error: error.message };
    }
  };

  // Enhanced chunked upload with retry logic for GB-sized files
  const uploadFileChunked = async (file, path = '/', batchInfo = null) => {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const toastId = batchInfo ? batchInfo.toastId : `upload-${file.name}-${Date.now()}`;
    const uploadId = `${file.name}-${file.size}-${file.lastModified}`;
    
    // Retry configuration
    const MAX_RETRIES = 5;
    const BASE_RETRY_DELAY = 1000; // 1 second
    const MAX_RETRY_DELAY = 30000; // 30 seconds
    
    // Load progress from localStorage
    const progressKey = `upload_progress_${uploadId}`;
    let uploadProgress = JSON.parse(localStorage.getItem(progressKey) || '{}');
    let startChunkIndex = 0;
    
    // Find the last successfully uploaded chunk
    if (uploadProgress.completedChunks) {
      const completedChunks = Object.keys(uploadProgress.completedChunks).map(Number).sort((a, b) => a - b);
      if (completedChunks.length > 0) {
        startChunkIndex = completedChunks[completedChunks.length - 1] + 1;
        console.log(`Resuming upload from chunk ${startChunkIndex} of ${totalChunks}`);
      }
    } else {
      uploadProgress.completedChunks = {};
      uploadProgress.totalChunks = totalChunks;
      uploadProgress.fileName = file.name;
      uploadProgress.startTime = Date.now();
    }
    
    // Save initial progress
    localStorage.setItem(progressKey, JSON.stringify(uploadProgress));
    
    try {
      // Check server for existing chunks first
      if (startChunkIndex > 0) {
        try {
          const checkResponse = await fetch(`${API_BASE_URL}/check-chunks?filename=${encodeURIComponent(file.name)}&targetPath=${encodeURIComponent(path)}&totalChunks=${totalChunks}`);
          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            if (checkData.existingChunks) {
              // Update our progress with server state
              checkData.existingChunks.forEach(chunkIndex => {
                uploadProgress.completedChunks[chunkIndex] = true;
              });
              const serverCompletedChunks = Object.keys(uploadProgress.completedChunks).map(Number).sort((a, b) => a - b);
              if (serverCompletedChunks.length > 0) {
                startChunkIndex = Math.max(startChunkIndex, serverCompletedChunks[serverCompletedChunks.length - 1] + 1);
              }
              localStorage.setItem(progressKey, JSON.stringify(uploadProgress));
            }
          }
        } catch (error) {
          console.warn('Could not check existing chunks, continuing with local progress:', error);
        }
      }

      for (let chunkIndex = startChunkIndex; chunkIndex < totalChunks; chunkIndex++) {
        // Skip if chunk is already completed
        if (uploadProgress.completedChunks[chunkIndex]) {
          continue;
        }

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        const overallProgress = Math.round(((Object.keys(uploadProgress.completedChunks).length + 1) / totalChunks) * 100);
        let retryAttempt = 0;
        let chunkUploaded = false;
        
        while (!chunkUploaded && retryAttempt <= MAX_RETRIES) {
          try {
            // Update progress notification
            if (!batchInfo) {
              const retryText = retryAttempt > 0 ? ` (Retry ${retryAttempt}/${MAX_RETRIES})` : '';
              toast.loading(
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">Uploading Large File{retryText}</div>
                    <div className="text-xs text-gray-600 mb-1">{file.name}</div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                        style={{ width: `${overallProgress}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Chunk {chunkIndex + 1} of {totalChunks} ({overallProgress}%)
                      {retryAttempt > 0 && <span className="text-orange-600 ml-2">⚠️ Retrying...</span>}
                    </div>
                  </div>
                </div>,
                { 
                  id: toastId,
                  duration: Infinity
                }
              );
            }

            const response = await fetch(`${API_BASE_URL}/upload-chunk?filename=${encodeURIComponent(file.name)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}&targetPath=${encodeURIComponent(path)}`, {
              method: 'POST',
              body: chunk,
              headers: {
                'Content-Type': 'application/octet-stream'
              },
              // Add timeout for better error handling
              signal: AbortSignal.timeout(60000) // 60 second timeout per chunk
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
              throw new Error(errorData.error || `Chunk upload failed: HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Mark chunk as completed
            uploadProgress.completedChunks[chunkIndex] = true;
            uploadProgress.lastUpdated = Date.now();
            localStorage.setItem(progressKey, JSON.stringify(uploadProgress));
            
            chunkUploaded = true;
            
            // If this was the last chunk and file is complete
            if (data.chunked) {
              // Clear progress from localStorage
              localStorage.removeItem(progressKey);
              
              // Check for other pending uploads
              checkPendingUploads();
              
              // Handle completion
              if (!batchInfo) {
                toast.success(
                  <div>
                    <div className="font-medium text-sm text-gray-900">✅ Upload Complete!</div>
                    <div className="text-xs text-gray-600">{file.name}</div>
                    <div className="text-xs text-green-600 mt-1">
                      {totalChunks} chunks uploaded successfully
                    </div>
                  </div>,
                  { id: toastId, duration: 4000 }
                );
                
                // Refresh immediately after upload
                await loadFiles(currentPath);
              }
              return true;
            }
            
          } catch (error) {
            retryAttempt++;
            console.warn(`Chunk ${chunkIndex} upload attempt ${retryAttempt} failed:`, error);
            
            if (retryAttempt <= MAX_RETRIES) {
              // Calculate exponential backoff with jitter
              const baseDelay = Math.min(BASE_RETRY_DELAY * Math.pow(2, retryAttempt - 1), MAX_RETRY_DELAY);
              const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
              const delay = baseDelay + jitter;
              
              console.log(`Retrying chunk ${chunkIndex} in ${Math.round(delay)}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              // Max retries exceeded for this chunk
              throw new Error(`Chunk ${chunkIndex} failed after ${MAX_RETRIES} retries: ${error.message}`);
            }
          }
        }
      }
      
      // If we get here, all chunks were uploaded successfully
      localStorage.removeItem(progressKey);
      return true;
      
    } catch (error) {
      console.error('Chunked upload error:', error);
      
      // Save current progress for potential resume
      uploadProgress.lastError = error.message;
      uploadProgress.lastUpdated = Date.now();
      localStorage.setItem(progressKey, JSON.stringify(uploadProgress));
      
      if (!batchInfo) {
        toast.error(
          <div>
            <div className="font-medium text-sm text-gray-900">❌ Upload Failed</div>
            <div className="text-xs text-gray-600">{file.name}</div>
            <div className="text-xs text-red-600 mt-1">{error.message}</div>
            <div className="text-xs text-blue-600 mt-2">
              💾 Progress saved - you can resume this upload later
            </div>
          </div>,
          { id: toastId, duration: 8000 }
        );
      }
      
      throw error;
    }
  };

  // Upload multiple files with batch notification
  const uploadMultipleFiles = async (files, path = '/', folderName = null) => {
    if (files.length === 0) return;

    const toastId = `batch-upload-${Date.now()}`;
    let successCount = 0;
    let failedFiles = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const batchInfo = {
          toastId,
          currentIndex: i,
          totalFiles: files.length,
          folderName
        };

        const result = await uploadFile(file, path, batchInfo);
        
        if (result.success) {
          successCount++;
        } else {
          failedFiles.push({ name: file.name, error: result.error });
        }
      }

      // Refresh files after batch upload
      await loadFiles(currentPath);

      // Show final batch result
      if (failedFiles.length === 0) {
        toast.success(
          <div>
            <div className="font-medium text-sm text-gray-900">
              ✅ {folderName ? 'Folder' : 'Files'} Uploaded Successfully!
            </div>
            <div className="text-xs text-gray-600">
              {successCount} file{successCount !== 1 ? 's' : ''} uploaded
              {folderName && ` from ${folderName}`}
            </div>
          </div>,
          { id: toastId, duration: 4000 }
        );
      } else {
        toast.error(
          <div>
            <div className="font-medium text-sm text-gray-900">⚠️ Upload Completed with Errors</div>
            <div className="text-xs text-gray-600">
              {successCount} succeeded, {failedFiles.length} failed
            </div>
          </div>,
          { id: toastId, duration: 6000 }
        );
      }

    } catch (error) {
      console.error('Batch upload error:', error);
      toast.error(
        <div>
          <div className="font-medium text-sm text-gray-900">❌ Batch Upload Failed</div>
          <div className="text-xs text-red-600 mt-1">{error.message}</div>
        </div>,
        { id: toastId, duration: 6000 }
      );
    }
  };

  // Create folder
  const createFolder = async (name, path = '/') => {
    try {
      const response = await fetch(`${API_BASE_URL}/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create folder');
      }
      
      const data = await response.json();
      
      // Only show success toast for new folders, not existing ones
      if (data.message === 'Folder created successfully') {
        toast.success(`📁 Folder "${name}" created successfully!`);
      }
      
      await loadFiles(currentPath);
    } catch (error) {
      console.error('Create folder error:', error);
      // Only show error if it's not about folder already existing
      if (!error.message.includes('already exists')) {
        toast.error(`Failed to create folder "${name}": ${error.message}`);
      }
    }
  };

  // Delete file
  const deleteFile = async (filePath) => {
    try {
      const response = await fetch(`${API_BASE_URL}/file`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });

      if (!response.ok) throw new Error('Failed to delete file');
      
      toast.success('File deleted successfully!');
      await loadFiles(currentPath);
    } catch (error) {
      console.error('Delete file error:', error);
      toast.error('Failed to delete file');
    }
  };

  // Delete folder
  const deleteFolder = async (folderPath) => {
    try {
      const response = await fetch(`${API_BASE_URL}/folder`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      });

      if (!response.ok) throw new Error('Failed to delete folder');
      
      toast.success('Folder deleted successfully!');
      await loadFiles(currentPath);
    } catch (error) {
      console.error('Delete folder error:', error);
      toast.error('Failed to delete folder');
    }
  };

  // Rename file or folder
  const renameItem = async (oldPath, newName) => {
    try {
      const response = await fetch(`${API_BASE_URL}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newName }),
      });

      if (!response.ok) throw new Error('Failed to rename');
      
      toast.success('Renamed successfully!');
      await loadFiles(currentPath);
    } catch (error) {
      console.error('Rename error:', error);
      toast.error('Failed to rename');
    }
  };

  // Navigate to folder
  const navigateToFolder = (folderPath) => {
    setCurrentPath(folderPath);
    updateURL(folderPath);
    loadFiles(folderPath);
  };

  // Navigate up one level
  const navigateUp = () => {
    if (currentPath !== '/') {
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
      setCurrentPath(parentPath);
      updateURL(parentPath);
      loadFiles(parentPath);
    }
  };

  // Preview video
  const previewVideo = (file) => {
    setSelectedVideo(file);
    setIsVideoModalOpen(true);
  };

  // Load files on component mount
  useEffect(() => {
    loadFiles();
    
    // Set up automatic refresh for system stats every 30 seconds
    const statsInterval = setInterval(() => {
      loadFiles(); // This will refresh system stats along with files
    }, 30000); // 30 seconds
    
    // Prevent default drag behaviors on the entire page (but allow drop events to propagate)
    const preventDefaults = (e) => {
      e.preventDefault();
    };
    
    // Only prevent dragover and drop on document to avoid interference with our drop zone
    document.addEventListener('dragover', preventDefaults, false);
    document.addEventListener('drop', preventDefaults, false);
    
    return () => {
      clearInterval(statsInterval);
      document.removeEventListener('dragover', preventDefaults, false);
      document.removeEventListener('drop', preventDefaults, false);
    };
  }, []);

  // Check for pending uploads on app load
  useEffect(() => {
    checkPendingUploads();
  }, []);

  // Check for pending/failed uploads in localStorage
  const checkPendingUploads = () => {
    const pending = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('upload_progress_')) {
        try {
          const progress = JSON.parse(localStorage.getItem(key));
          if (progress && progress.fileName) {
            const completedChunks = Object.keys(progress.completedChunks || {}).length;
            if (completedChunks < progress.totalChunks) {
              pending.push({
                key,
                fileName: progress.fileName,
                totalChunks: progress.totalChunks,
                completedChunks,
                progress: Math.round((completedChunks / progress.totalChunks) * 100),
                lastUpdated: progress.lastUpdated,
                hasError: !!progress.lastError
              });
            } else {
              // Upload was completed, clean up
              localStorage.removeItem(key);
            }
          }
        } catch (error) {
          console.warn('Invalid upload progress data:', key);
          localStorage.removeItem(key);
        }
      }
    }
    setPendingUploads(pending);
  };

  // Clear a specific pending upload
  const clearPendingUpload = (key) => {
    localStorage.removeItem(key);
    checkPendingUploads();
    toast.success('Upload progress cleared');
  };

  // Resume a pending upload notification
  const showResumeUploadInfo = (uploadData) => {
    toast.error(
      <div>
        <div className="font-medium text-sm text-gray-900">Resume Upload</div>
        <div className="text-xs text-gray-600 mt-1">
          To resume "{uploadData.fileName}" ({uploadData.progress}% complete), 
          please re-select the same file and upload again.
        </div>
        <div className="text-xs text-blue-600 mt-1">
          ✨ The system will automatically skip already uploaded chunks
        </div>
      </div>,
      { duration: 8000 }
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#ffffff',
            color: '#1f2937',
            border: '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxWidth: '420px',
            padding: '16px',
            fontSize: '14px',
          },
          success: {
            style: {
              border: '1px solid #10b981',
              background: '#f0fdf4',
              color: '#065f46',
            },
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          error: {
            style: {
              border: '1px solid #ef4444',
              background: '#fef2f2',
              color: '#991b1b',
            },
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
          loading: {
            style: {
              border: '1px solid #3b82f6',
              background: '#eff6ff',
              color: '#1e40af',
            },
          },
        }}
      />
      
      {/* Modern Header */}
      <header className="bg-gradient-to-r from-white to-gray-50 shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-8">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Learn</h1>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">MediaGrid</h1>
                <p className="text-sm text-gray-600 mt-1 font-medium">Professional Video File Manager</p>
              </div>
              
              {/* Horizontal Storage Stats */}
              <div className="hidden lg:block">
                <SystemStats diskUsage={diskUsage} systemStats={systemStats} onRefresh={refreshStats} />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Mobile Storage Stats */}
              <div className="lg:hidden">
                <SystemStats diskUsage={diskUsage} systemStats={systemStats} compact={true} onRefresh={refreshStats} />
              </div>
              
              <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-600 font-medium">Online</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Pending Uploads Notification */}
      {pendingUploads.length > 0 && (
        <div className="mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
                <h3 className="text-sm font-semibold text-blue-900">
                  {pendingUploads.length} Incomplete Upload{pendingUploads.length > 1 ? 's' : ''}
                </h3>
              </div>
              <button
                onClick={() => setPendingUploads([])}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                title="Hide notifications"
              >
                Hide
              </button>
            </div>
            <div className="space-y-2">
              {pendingUploads.map((upload) => (
                <div key={upload.key} className="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {upload.fileName}
                      </span>
                      {upload.hasError && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          Failed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 mt-1">
                      <div className="text-xs text-gray-500">
                        {upload.completedChunks}/{upload.totalChunks} chunks ({upload.progress}%)
                      </div>
                      <div className="w-24 bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                          style={{ width: `${upload.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => showResumeUploadInfo(upload)}
                      className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-md hover:bg-blue-200 transition-colors font-medium"
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => clearPendingUpload(upload.key)}
                      className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-blue-700 bg-blue-100 rounded-lg p-2">
              💡 <strong>Tip:</strong> To resume an upload, re-select the same file and upload again. 
              The system will automatically skip chunks that were already uploaded.
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FileManager
          currentPath={currentPath}
          files={files}
          folders={folders}
          isLoading={isLoading}
          onUploadFile={uploadFile}
          onUploadMultipleFiles={uploadMultipleFiles}
          onCreateFolder={createFolder}
          onDeleteFile={deleteFile}
          onDeleteFolder={deleteFolder}
          onRenameItem={renameItem}
          onNavigateToFolder={navigateToFolder}
          onNavigateUp={navigateUp}
          onPreviewVideo={previewVideo}
        />
      </main>

      {/* Video Preview Modal */}
      <VideoPreviewModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        video={selectedVideo}
      />
    </div>
  );
}

export default App;
