import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import FileManager from './components/FileManager';
import VideoPreviewModal from './components/VideoPreviewModal';
import DiskUsageStats from './components/DiskUsageStats';
import './App.css';

const API_BASE_URL = 'http://localhost:5000/api';

function App() {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [diskUsage, setDiskUsage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

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
      setCurrentPath(data.currentPath || path);
    } catch (error) {
      console.error('Error loading files:', error);
      toast.error('Failed to load files');
    } finally {
      setIsLoading(false);
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

  // Chunked upload for large files (>50MB)
  const uploadFileChunked = async (file, path = '/', batchInfo = null) => {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const toastId = batchInfo ? batchInfo.toastId : `upload-${file.name}-${Date.now()}`;
    
    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        
        const chunkProgress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        
        // Update progress notification
        if (!batchInfo) {
          toast.loading(
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900">Uploading Large File</div>
                <div className="text-xs text-gray-600 mb-1">{file.name}</div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${chunkProgress}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Chunk {chunkIndex + 1} of {totalChunks} ({chunkProgress}%)
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
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Chunk upload failed');
        }
        
        const data = await response.json();
        
        // If this was the last chunk and file is complete
        if (data.chunked) {
          // Handle completion
          if (!batchInfo) {
            toast.success(
              <div>
                <div className="font-medium text-sm text-gray-900">✅ Upload Complete!</div>
                <div className="text-xs text-gray-600">{file.name}</div>
              </div>,
              { id: toastId, duration: 4000 }
            );
            
            // Refresh immediately after upload
            await loadFiles(currentPath);
          }
          break;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Chunked upload error:', error);
      
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
    
    // Prevent default drag behaviors on the entire page (but allow drop events to propagate)
    const preventDefaults = (e) => {
      e.preventDefault();
    };
    
    // Only prevent dragover and drop on document to avoid interference with our drop zone
    document.addEventListener('dragover', preventDefaults, false);
    document.addEventListener('drop', preventDefaults, false);
    
    return () => {
      document.removeEventListener('dragover', preventDefaults, false);
      document.removeEventListener('drop', preventDefaults, false);
    };
  }, []);

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
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  MediaGrid
                </h1>
                <p className="text-sm text-gray-600 mt-1 font-medium">Professional Video File Manager</p>
              </div>
              
              {/* Horizontal Storage Stats */}
              <div className="hidden lg:block">
                <DiskUsageStats diskUsage={diskUsage} />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Mobile Storage Stats */}
              <div className="lg:hidden">
                <DiskUsageStats diskUsage={diskUsage} compact={true} />
              </div>
              
              <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-600 font-medium">Online</span>
              </div>
            </div>
          </div>
        </div>
      </header>

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
