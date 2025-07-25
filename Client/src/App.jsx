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
      console.log('URL path parameter found:', decodedPath); // Debug log
      setCurrentPath(decodedPath);
      loadFiles(decodedPath);
    } else {
      console.log('No URL path parameter, loading root'); // Debug log
      loadFiles('/');
    }
  }, []);

  // Update URL when path changes
  const updateURL = (path) => {
    const url = new URL(window.location);
    if (path === '/') {
      url.searchParams.delete('path');
      console.log('Updating URL to root (no path param)'); // Debug log
    } else {
      url.searchParams.set('path', encodeURIComponent(path));
      console.log('Updating URL with path:', path); // Debug log
    }
    window.history.replaceState({}, '', url);
    console.log('Final URL:', url.toString()); // Debug log
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

  // Upload file with progress (no individual toasts for batch uploads)
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
      // Show progress notification only for single files (not in batch)
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

  // Enhanced chunked upload with concurrent chunk processing for GB-sized files
  const uploadFileChunked = async (file, path = '/', batchInfo = null) => {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const CONCURRENT_CHUNKS = 3; // Upload 3 chunks simultaneously
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

      // Process remaining chunks with concurrent upload
      const remainingChunks = [];
      for (let chunkIndex = startChunkIndex; chunkIndex < totalChunks; chunkIndex++) {
        if (!uploadProgress.completedChunks[chunkIndex]) {
          remainingChunks.push(chunkIndex);
        }
      }

      // Upload chunks in batches with concurrency
      for (let i = 0; i < remainingChunks.length; i += CONCURRENT_CHUNKS) {
        const chunkBatch = remainingChunks.slice(i, i + CONCURRENT_CHUNKS);
        
        // Upload this batch of chunks concurrently
        const chunkPromises = chunkBatch.map(async (chunkIndex) => {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          
          let retryAttempt = 0;
          let chunkUploaded = false;
          
          while (!chunkUploaded && retryAttempt <= MAX_RETRIES) {
            try {
              // Only update progress notification for single file uploads (not in batch)
              if (!batchInfo) {
                const completedChunks = Object.keys(uploadProgress.completedChunks).length;
                const overallProgress = Math.round((completedChunks / totalChunks) * 100);
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
                        <span className="text-blue-600 ml-2">🚀 Concurrent Upload</span>
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
              return data;
              
            } catch (error) {
              retryAttempt++;
              console.warn(`Chunk ${chunkIndex} upload attempt ${retryAttempt} failed:`, error);
              
              if (retryAttempt <= MAX_RETRIES) {
                // Calculate exponential backoff with jitter
                const baseDelay = Math.min(BASE_RETRY_DELAY * Math.pow(2, retryAttempt - 1), MAX_RETRY_DELAY);
                const jitter = Math.random() * 0.3 * baseDelay;
                const delay = baseDelay + jitter;
                
                console.log(`Retrying chunk ${chunkIndex} in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                throw new Error(`Chunk ${chunkIndex} failed after ${MAX_RETRIES} retries: ${error.message}`);
              }
            }
          }
        });

        // Wait for this batch to complete before starting the next batch
        try {
          const results = await Promise.allSettled(chunkPromises);
          
          // Check if any chunks in this batch failed
          const failedChunks = results.filter(result => result.status === 'rejected');
          if (failedChunks.length > 0) {
            throw new Error(`${failedChunks.length} chunks failed in batch`);
          }
          
          // Check if the file is complete after this batch
          const completedChunksCount = Object.keys(uploadProgress.completedChunks).length;
          if (completedChunksCount >= totalChunks) {
            // File is complete - clear progress and notify
            localStorage.removeItem(progressKey);
            checkPendingUploads();
            
            // Only show completion notification for single file uploads (not in batch)
            if (!batchInfo) {
              toast.success(
                <div>
                  <div className="font-medium text-sm text-gray-900">✅ Upload Complete!</div>
                  <div className="text-xs text-gray-600">{file.name}</div>
                  <div className="text-xs text-green-600 mt-1">
                    {totalChunks} chunks uploaded successfully with concurrent processing
                  </div>
                </div>,
                { id: toastId, duration: 4000 }
              );
              
              // Refresh immediately after upload
              await loadFiles(currentPath);
            }
            return { success: true };
          }
          
        } catch (batchError) {
          console.error('Batch upload error:', batchError);
          throw batchError;
        }
      }
      
      // If we get here, all chunks were uploaded successfully
      localStorage.removeItem(progressKey);
      return { success: true };
      
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

  // Unified progress tracking for batch uploads
  const uploadMultipleFiles = async (files, path = '/', folderName = null) => {
    if (files.length === 0) return;

    const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
    const SMALL_FILE_CONCURRENCY = 4; // Upload 4 small files simultaneously
    
    // Separate small and large files
    const smallFiles = [];
    const largeFiles = [];
    
    files.forEach(file => {
      if (file.size < LARGE_FILE_THRESHOLD) {
        smallFiles.push(file);
      } else {
        largeFiles.push(file);
      }
    });

    const toastId = `batch-upload-${Date.now()}`;
    let successCount = 0;
    let failedFiles = [];
    let totalProcessed = 0;

    try {
      // Phase 1: Upload small files concurrently in batches
      if (smallFiles.length > 0) {
        console.log(`Uploading ${smallFiles.length} small files concurrently...`);
        
        for (let i = 0; i < smallFiles.length; i += SMALL_FILE_CONCURRENCY) {
          const batch = smallFiles.slice(i, i + SMALL_FILE_CONCURRENCY);
          
          // Update unified progress for small files
          const overallProgress = Math.round((totalProcessed / files.length) * 100);
          toast.loading(
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900">
                  🚀 Uploading {folderName || `${files.length} Files`}
                </div>
                <div className="text-xs text-gray-600 mb-1">
                  Processing {batch.length} files simultaneously ({totalProcessed + 1}-{Math.min(totalProcessed + batch.length, files.length)} of {files.length})
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${overallProgress}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {overallProgress}% complete • Small files: {smallFiles.length} • Large files: {largeFiles.length}
                </div>
              </div>
            </div>,
            { 
              id: toastId,
              duration: Infinity
            }
          );

          // Upload batch concurrently (no individual toasts)
          const batchPromises = batch.map(async (file) => {
            const batchInfo = {
              toastId, // Share the same toast ID
              isBatch: true,
              totalFiles: files.length,
              folderName
            };

            return await uploadFile(file, path, batchInfo);
          });

          const results = await Promise.allSettled(batchPromises);
          
          // Process results and update counters
          results.forEach((result, index) => {
            totalProcessed++;
            if (result.status === 'fulfilled' && result.value.success) {
              successCount++;
            } else {
              const file = batch[index];
              const error = result.status === 'rejected' ? result.reason.message : result.value.error;
              failedFiles.push({ name: file.name, error });
            }
            
            // Update progress after each file completes
            const currentProgress = Math.round((totalProcessed / files.length) * 100);
            toast.loading(
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900">
                    🚀 Uploading {folderName || `${files.length} Files`}
                  </div>
                  <div className="text-xs text-gray-600 mb-1">
                    Completed {totalProcessed} of {files.length} files
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                      style={{ width: `${currentProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {currentProgress}% complete • ✅ {successCount} • ❌ {failedFiles.length}
                  </div>
                </div>
              </div>,
              { 
                id: toastId,
                duration: Infinity
              }
            );
          });
        }
      }

      // Phase 2: Upload large files sequentially with concurrent chunks
      if (largeFiles.length > 0) {
        console.log(`Uploading ${largeFiles.length} large files sequentially with concurrent chunks...`);
        
        for (let i = 0; i < largeFiles.length; i++) {
          const file = largeFiles[i];
          const currentProgress = Math.round((totalProcessed / files.length) * 100);
          
          // Update unified progress for large file
          toast.loading(
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900">
                  📦 Uploading {folderName || `${files.length} Files`}
                </div>
                <div className="text-xs text-gray-600 mb-1">
                  Large file: {file.name} ({i + 1} of {largeFiles.length})
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${currentProgress}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {currentProgress}% complete • Concurrent chunk processing • ✅ {successCount} • ❌ {failedFiles.length}
                </div>
              </div>
            </div>,
            { 
              id: toastId,
              duration: Infinity
            }
          );

          const batchInfo = {
            toastId,
            isBatch: true,
            isLargeFile: true,
            totalFiles: files.length,
            folderName
          };

          const result = await uploadFile(file, path, batchInfo);
          totalProcessed++;
          
          if (result && result.success) {
            successCount++;
          } else {
            failedFiles.push({ name: file.name, error: result ? result.error : 'Unknown error' });
          }
        }
      }

      // Refresh files after batch upload
      await loadFiles(currentPath);

      // Show final unified result
      if (failedFiles.length === 0) {
        toast.success(
          <div>
            <div className="font-medium text-sm text-gray-900">
              ✅ {folderName ? `Folder "${folderName}"` : 'Files'} Uploaded Successfully!
            </div>
            <div className="text-xs text-gray-600">
              {successCount} file{successCount !== 1 ? 's' : ''} uploaded in total
            </div>
            <div className="text-xs text-green-600 mt-1">
              🚀 {smallFiles.length} small files • 📦 {largeFiles.length} large files
            </div>
          </div>,
          { id: toastId, duration: 4000 }
        );
      } else {
        toast.error(
          <div>
            <div className="font-medium text-sm text-gray-900">⚠️ Upload Completed with Errors</div>
            <div className="text-xs text-gray-600">
              ✅ {successCount} succeeded • ❌ {failedFiles.length} failed
            </div>
            <div className="text-xs text-orange-600 mt-1">
              Check console for detailed error information
            </div>
          </div>,
          { id: toastId, duration: 6000 }
        );
        
        // Log failed files for debugging
        console.error('Failed files:', failedFiles);
      }

    } catch (error) {
      console.error('Batch upload error:', error);
      toast.error(
        <div>
          <div className="font-medium text-sm text-gray-900">❌ Upload Failed</div>
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

  // Concurrent delete operations for improved performance
  const deleteMultipleItems = async (items) => {
    if (items.length === 0) return;

    const toastId = `delete-batch-${Date.now()}`;
    const MAX_CONCURRENT_DELETES = 5; // Limit concurrent deletes to avoid overwhelming server
    
    try {
      toast.loading(
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
          <div className="flex-1">
            <div className="font-medium text-sm text-gray-900">Deleting Items</div>
            <div className="text-xs text-gray-600 mb-1">
              Processing {items.length} item{items.length > 1 ? 's' : ''} concurrently...
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-red-600 h-1.5 rounded-full animate-pulse" style={{ width: '50%' }}></div>
            </div>
            <div className="text-xs text-gray-500 mt-1">🚀 Concurrent processing</div>
          </div>
        </div>,
        { 
          id: toastId,
          duration: Infinity
        }
      );

      // Process items in batches to limit concurrency
      const results = [];
      for (let i = 0; i < items.length; i += MAX_CONCURRENT_DELETES) {
        const batch = items.slice(i, i + MAX_CONCURRENT_DELETES);
        
        const batchPromises = batch.map(async (item) => {
          try {
            const endpoint = item.isFolder ? 'folder' : 'file';
            const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: item.path }),
            });

            if (!response.ok) {
              throw new Error(`Failed to delete ${item.name}`);
            }
            
            return { success: true, name: item.name };
          } catch (error) {
            console.error(`Delete error for ${item.name}:`, error);
            return { success: false, name: item.name, error: error.message };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
      }

      // Process results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));

      // Refresh files after deletion
      await loadFiles(currentPath);

      // Show results
      if (failed.length === 0) {
        toast.success(
          <div>
            <div className="font-medium text-sm text-gray-900">✅ Items Deleted Successfully!</div>
            <div className="text-xs text-gray-600">
              {successful.length} item{successful.length > 1 ? 's' : ''} deleted concurrently
            </div>
          </div>,
          { id: toastId, duration: 4000 }
        );
      } else {
        toast.error(
          <div>
            <div className="font-medium text-sm text-gray-900">⚠️ Deletion Completed with Errors</div>
            <div className="text-xs text-gray-600">
              {successful.length} succeeded, {failed.length} failed
            </div>
          </div>,
          { id: toastId, duration: 6000 }
        );
      }

    } catch (error) {
      console.error('Batch delete error:', error);
      toast.error(
        <div>
          <div className="font-medium text-sm text-gray-900">❌ Batch Delete Failed</div>
          <div className="text-xs text-red-600 mt-1">{error.message}</div>
        </div>,
        { id: toastId, duration: 6000 }
      );
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

  // Rename file or folder with automatic space-to-hyphen replacement
  const renameItem = async (oldPath, newName) => {
    try {
      // Sanitize the new name by replacing spaces with hyphens
      const sanitizedName = newName.replace(/\s+/g, '-');
      
      // Show a notification if the name was modified
      if (sanitizedName !== newName) {
        toast(
          <div>
            <div className="font-medium text-sm text-gray-900">✏️ Name Sanitized</div>
            <div className="text-xs text-gray-600">Spaces replaced with hyphens</div>
            <div className="text-xs text-blue-600 mt-1">"{newName}" → "{sanitizedName}"</div>
          </div>,
          { 
            duration: 3000,
            style: {
              border: '1px solid #3b82f6',
              background: '#eff6ff',
              color: '#1e40af',
            },
            icon: '✏️'
          }
        );
      }
      
      const response = await fetch(`${API_BASE_URL}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newName: sanitizedName }),
      });

      if (!response.ok) {
        // Get detailed error message from server
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to rename`);
      }

      const data = await response.json();
      
      // Show success with final name if it was further sanitized on server
      const finalName = data.sanitizedName || sanitizedName;
      if (finalName !== sanitizedName) {
        toast(
          <div>
            <div className="font-medium text-sm text-gray-900">🔧 Server Sanitization</div>
            <div className="text-xs text-gray-600">Name further cleaned by server</div>
            <div className="text-xs text-blue-600 mt-1">"{sanitizedName}" → "{finalName}"</div>
          </div>,
          { 
            duration: 3000,
            style: {
              border: '1px solid #3b82f6',
              background: '#eff6ff',
              color: '#1e40af',
            },
            icon: '🔧'
          }
        );
      }
      
      toast.success(
        <div>
          <div className="font-medium text-sm text-gray-900">✅ Renamed Successfully!</div>
          <div className="text-xs text-gray-600">New name: {finalName}</div>
        </div>,
        { duration: 4000 }
      );
      
      await loadFiles(currentPath);
    } catch (error) {
      console.error('Rename error:', error);
      
      // Show specific error messages
      let errorMessage = error.message;
      let errorIcon = '❌';
      
      if (errorMessage.includes('already exists')) {
        errorIcon = '⚠️';
        errorMessage = 'A file or folder with that name already exists';
      } else if (errorMessage.includes('not found')) {
        errorIcon = '🔍';
        errorMessage = 'The file or folder could not be found';
      } else if (errorMessage.includes('Permission denied')) {
        errorIcon = '🔒';
        errorMessage = 'Permission denied - check file permissions';
      }
      
      toast.error(
        <div>
          <div className="font-medium text-sm text-gray-900">{errorIcon} Rename Failed</div>
          <div className="text-xs text-red-600 mt-1">{errorMessage}</div>
          {newName !== newName.replace(/\s+/g, '-') && (
            <div className="text-xs text-blue-600 mt-1">💡 Tip: Avoid special characters in names</div>
          )}
        </div>,
        { duration: 6000 }
      );
    }
  };

  // Navigate to folder
  const navigateToFolder = (folderPath) => {
    console.log('Navigating to folder:', folderPath); // Debug log
    setCurrentPath(folderPath);
    updateURL(folderPath);
    loadFiles(folderPath);
  };

  // Navigate up one level
  const navigateUp = () => {
    if (currentPath !== '/') {
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
      console.log('Navigating up from', currentPath, 'to', parentPath); // Debug log
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
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const pathParam = urlParams.get('path');
      const newPath = pathParam ? decodeURIComponent(pathParam) : '/';
      console.log('Browser navigation detected, loading path:', newPath); // Debug log
      setCurrentPath(newPath);
      loadFiles(newPath);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Set up automatic refresh for system stats (separate useEffect)
  useEffect(() => {
    const statsInterval = setInterval(() => {
      // Only refresh stats without changing path or triggering file reload
      refreshStats();
    }, 30000); // 30 seconds
    
    return () => {
      clearInterval(statsInterval);
    };
  }, []); // Empty dependency array to prevent recreation

  // Set up event listeners (separate useEffect)
  useEffect(() => {
    // Note: Drag and drop functionality has been removed as requested
    // No event listeners needed for drag/drop prevention
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
          onDeleteMultipleItems={deleteMultipleItems}
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
