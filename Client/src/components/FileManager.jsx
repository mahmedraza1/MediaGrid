import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';

const FileManager = ({
  currentPath,
  files,
  folders,
  isLoading,
  onUploadFile,
  onUploadMultipleFiles,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onDeleteMultipleItems,
  onRenameItem,
  onNavigateToFolder,
  onNavigateUp,
  onPreviewVideo,
}) => {
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [renamingItem, setRenamingItem] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Clear selection when path changes
  React.useEffect(() => {
    setSelectedItems(new Set());
    setIsSelectionMode(false);
  }, [currentPath]);

  // Copy absolute link to clipboard
  const copyAbsoluteLink = async (itemPath, isFolder = false) => {
    let absoluteUrl = '';
    
    try {
      if (isFolder) {
        // For folders, create a link to the MediaGrid app with the folder path
        const encodedPath = encodeURIComponent(itemPath);
        absoluteUrl = `${window.location.origin}?path=${encodedPath}`;
      } else {
        // For files, create a direct link to the file on the server
        // Get the file server URL - adapts to development/production
        const getFileBaseUrl = () => {
          const customApiUrl = import.meta.env.VITE_API_URL;
          if (customApiUrl) {
            // If custom API URL is set, replace /api with /videos
            return customApiUrl.replace('/api', '/videos');
          }
          
          // In development, use separate server on port 5000
          if (import.meta.env.DEV) {
            return window.location.origin.replace(/:\d+/, ':5000') + '/videos';
          }
          
          // In production (including VPS), same origin serves both app and files
          return window.location.origin + '/videos';
        };
        
        // Encode each path segment properly while preserving the path structure
        const pathSegments = itemPath.split('/').map(segment => encodeURIComponent(segment));
        const encodedPath = pathSegments.join('/');
        absoluteUrl = `${getFileBaseUrl()}${encodedPath}`;
        
        console.log('Generated file URL:', absoluteUrl); // Debug log
      }
      
      await navigator.clipboard.writeText(absoluteUrl);
      toast.success(`Link copied to clipboard!`, {
        icon: '📋',
        duration: 2000,
      });
    } catch (error) {
      console.error('Failed to copy link:', error);
      
      // Fallback: Try to select text and copy manually
      try {
        // Create a temporary textarea element
        const textArea = document.createElement('textarea');
        textArea.value = absoluteUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          toast.success('Link copied to clipboard!', {
            icon: '📋',
            duration: 2000,
          });
        } else {
          throw new Error('Fallback copy failed');
        }
      } catch (fallbackError) {
        console.error('Fallback copy also failed:', fallbackError);
        // Show the URL to user so they can copy manually
        toast.error(
          <div>
            <div className="font-medium">Copy failed</div>
            <div className="text-xs mt-1 p-2 bg-gray-100 rounded border max-w-xs overflow-x-auto">
              {absoluteUrl}
            </div>
            <div className="text-xs text-gray-600 mt-1">Please copy the URL above manually</div>
          </div>,
          { duration: 8000 }
        );
      }
    }
  };

  // Handle file selection
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    console.log('Selected files:', files.length); // Debug log
    
    if (files.length === 0) return;
    
    // Check if this is a folder upload (webkitRelativePath exists)
    const isFolder = files[0].webkitRelativePath;
    
    if (isFolder) {
      // Handle folder upload
      const folderName = files[0].webkitRelativePath.split('/')[0];
      
      // Group files by their directory structure
      const filesByPath = files.reduce((acc, file) => {
        const pathParts = file.webkitRelativePath.split('/');
        const relativePath = pathParts.slice(0, -1).join('/');
        const targetPath = relativePath ? `${currentPath}/${relativePath}` : currentPath;
        
        if (!acc[targetPath]) acc[targetPath] = [];
        acc[targetPath].push(file);
        return acc;
      }, {});
      
      // Create folder structure first
      const allPaths = Object.keys(filesByPath).sort();
      for (const targetPath of allPaths) {
        if (targetPath !== currentPath) {
          const pathParts = targetPath.replace(currentPath + '/', '').split('/');
          let currentFolder = currentPath;
          
          for (const folderName of pathParts) {
            await onCreateFolder(folderName, currentFolder);
            currentFolder = `${currentFolder}/${folderName}`;
          }
        }
      }
      
      // Upload files by path
      for (const [targetPath, pathFiles] of Object.entries(filesByPath)) {
        await onUploadMultipleFiles(pathFiles, targetPath, folderName);
      }
    } else {
      // Handle individual file uploads
      if (files.length === 1) {
        await onUploadFile(files[0], currentPath);
      } else {
        await onUploadMultipleFiles(files, currentPath);
      }
    }
    
    e.target.value = ''; // Reset input
  };

  // Create new folder
  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), currentPath);
      setNewFolderName('');
      setShowNewFolderInput(false);
    }
  };

  // Handle rename
  const startRename = (item) => {
    setRenamingItem(item);
    setRenameValue(item.name);
  };

  const handleRename = () => {
    if (renameValue.trim() && renameValue !== renamingItem.name) {
      onRenameItem(renamingItem.path, renameValue.trim());
    }
    setRenamingItem(null);
    setRenameValue('');
  };

  // Handle multiple item selection
  const toggleItemSelection = (itemPath) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemPath)) {
      newSelection.delete(itemPath);
    } else {
      newSelection.add(itemPath);
    }
    setSelectedItems(newSelection);
  };

  const selectAllItems = () => {
    const allItems = [...folders.map(f => f.path), ...files.map(f => f.path)];
    setSelectedItems(new Set(allItems));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setIsSelectionMode(false);
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (!isSelectionMode) {
      setSelectedItems(new Set());
    }
  };

  // Handle bulk delete with concurrent processing
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return;

    const confirmMessage = `Are you sure you want to delete ${selectedItems.size} selected item${selectedItems.size > 1 ? 's' : ''}?`;
    if (!window.confirm(confirmMessage)) return;

    // Prepare items for concurrent deletion
    const itemsToDelete = Array.from(selectedItems).map(itemPath => {
      const isFolder = folders.some(f => f.path === itemPath);
      const item = isFolder 
        ? folders.find(f => f.path === itemPath)
        : files.find(f => f.path === itemPath);
      
      return {
        path: itemPath,
        name: item ? item.name : itemPath.split('/').pop(),
        isFolder
      };
    });

    // Use the new concurrent delete function
    if (onDeleteMultipleItems) {
      await onDeleteMultipleItems(itemsToDelete);
    } else {
      // Fallback to sequential deletion if concurrent function not available
      let successCount = 0;
      let errorCount = 0;

      for (const item of itemsToDelete) {
        try {
          if (item.isFolder) {
            await onDeleteFolder(item.path);
          } else {
            await onDeleteFile(item.path);
          }
          successCount++;
        } catch (error) {
          console.error(`Failed to delete ${item.path}:`, error);
          errorCount++;
        }
      }

      // Show result notification
      if (errorCount === 0) {
        toast.success(`Successfully deleted ${successCount} item${successCount > 1 ? 's' : ''}`);
      } else {
        toast.error(`Deleted ${successCount} items, ${errorCount} failed`);
      }
    }

    // Clear selection after deletion
    clearSelection();
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Breadcrumb navigation
  const renderBreadcrumb = () => {
    const pathParts = currentPath.split('/').filter(part => part);
    const breadcrumbs = [{ name: 'Home', path: '/' }];
    
    let currentBreadcrumbPath = '';
    pathParts.forEach(part => {
      currentBreadcrumbPath += '/' + part;
      breadcrumbs.push({ name: part, path: currentBreadcrumbPath });
    });

    return (
      <nav className="flex mb-4" aria-label="Breadcrumb">
        <ol className="flex items-center space-x-1 bg-white px-4 py-2.5 rounded-xl border border-gray-200 shadow-sm">
          {breadcrumbs.map((crumb, index) => (
            <li key={crumb.path} className="flex items-center">
              {index > 0 && <span className="text-gray-400 mx-2 text-sm">•</span>}
              <button
                onClick={() => onNavigateToFolder(crumb.path)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-all duration-200 ${
                  index === breadcrumbs.length - 1
                    ? 'text-gray-900 font-semibold bg-gray-100'
                    : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-medium'
                }`}
              >
                {crumb.name}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Modern Toolbar */}
      <div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={onNavigateUp}
                disabled={currentPath === '/'}
                className="px-4 py-2.5 text-sm bg-white text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-all duration-200 shadow-sm border border-gray-200 hover:shadow-md"
              >
                <span className="text-lg">↑</span>
                <span className="font-medium">Up</span>
              </button>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 flex items-center space-x-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span className="text-lg">📄</span>
                  <span className="font-medium">Upload Files</span>
                </button>
                
                <button
                  onClick={() => folderInputRef.current?.click()}
                  className="px-5 py-2.5 text-sm bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl hover:from-indigo-700 hover:to-indigo-800 flex items-center space-x-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span className="text-lg">📁</span>
                  <span className="font-medium">Upload Folder</span>
                </button>
                
                <button
                  onClick={() => setShowNewFolderInput(true)}
                  className="px-5 py-2.5 text-sm bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-700 hover:to-emerald-800 flex items-center space-x-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <span className="text-lg">➕</span>
                  <span className="font-medium">New Folder</span>
                </button>
                
                <button
                  onClick={toggleSelectionMode}
                  className={`px-5 py-2.5 text-sm rounded-xl flex items-center space-x-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium ${
                    isSelectionMode 
                      ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white hover:from-orange-700 hover:to-orange-800' 
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  <span className="text-lg">☑️</span>
                  <span>{isSelectionMode ? 'Exit Select' : 'Select'}</span>
                </button>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="px-4 py-2 bg-white rounded-xl text-sm text-gray-600 border border-gray-200 shadow-sm">
                <span className="font-medium">{files.length + folders.length}</span> items
              </div>
              {isLoading && (
                <div className="flex items-center space-x-2 text-sm text-blue-600 bg-blue-50 px-4 py-2 rounded-xl border border-blue-200">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="font-medium">Loading...</span>
                </div>
              )}
            </div>
          </div>

          {/* Selection toolbar */}
          {isSelectionMode && (
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm mb-4">
              <div className="flex items-center space-x-6">
                <span className="text-sm font-semibold text-blue-900">
                  {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={selectAllItems}
                  className="text-sm text-blue-700 hover:text-blue-900 underline font-medium transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="text-sm text-blue-700 hover:text-blue-900 underline font-medium transition-colors"
                >
                  Clear Selection
                </button>
              </div>
              <div className="flex items-center space-x-2">
                {selectedItems.size > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="px-4 py-2 text-sm bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 flex items-center space-x-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium"
                  >
                    <span className="text-lg">🗑️</span>
                    <span>Delete Selected</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {renderBreadcrumb()}

          {/* New folder input */}
          {showNewFolderInput && (
            <div className="flex items-center space-x-3 mt-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name..."
                className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm flex-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className="px-6 py-2.5 text-sm bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 font-medium shadow-lg"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewFolderInput(false);
                  setNewFolderName('');
                }}
                className="px-6 py-2.5 text-sm bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-200 border border-gray-200 font-medium"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            webkitdirectory=""
            directory=""
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Modern File/Folder List */}
      <div className="overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center space-x-3 text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-lg font-medium">Loading files...</span>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Folders */}
            {folders.map((folder) => (
              <div
                key={folder.path}
                className={`p-5 hover:bg-gradient-to-r hover:from-gray-50 hover:to-slate-50 flex items-center justify-between group transition-all duration-200 ${
                  selectedItems.has(folder.path) ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500' : ''
                }`}
              >
                <div className="flex items-center space-x-4 flex-1">
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedItems.has(folder.path)}
                      onChange={() => toggleItemSelection(folder.path)}
                      className="h-5 w-5 text-blue-600 rounded-lg border-gray-300 focus:ring-blue-500 focus:ring-2"
                    />
                  )}
                  <div className="text-3xl opacity-80">📁</div>
                  <div className="flex-1 min-w-0">
                    {renamingItem?.path === folder.path ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRename}
                        onKeyPress={(e) => e.key === 'Enter' && handleRename()}
                        className="px-3 py-2 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => onNavigateToFolder(folder.path)}
                        className="text-left font-semibold text-gray-900 hover:text-blue-600 truncate block text-lg transition-colors"
                      >
                        {folder.name}
                      </button>
                    )}
                    <div className="text-sm text-gray-500 mt-1">
                      Modified: {formatDate(folder.modified)}
                    </div>
                  </div>
                </div>
                <div className={`flex items-center space-x-2 transition-all duration-200 ${
                  isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                  <button
                    onClick={() => copyAbsoluteLink(folder.path, true)}
                    className="px-3 py-2 text-xs bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 transition-all duration-200 font-medium shadow-sm hover:shadow"
                    title="Copy link to folder"
                  >
                    🔗 Copy Link
                  </button>
                  <button
                    onClick={() => startRename(folder)}
                    className="px-3 py-2 text-xs bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-all duration-200 font-medium shadow-sm hover:shadow"
                  >
                    ✏️ Rename
                  </button>
                  <button
                    onClick={() => onDeleteFolder(folder.path)}
                    className="px-3 py-2 text-xs bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-all duration-200 font-medium shadow-sm hover:shadow"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}

            {/* Files */}
            {files.map((file) => (
              <div
                key={file.path}
                className={`p-5 hover:bg-gradient-to-r hover:from-gray-50 hover:to-slate-50 flex items-center justify-between group transition-all duration-200 ${
                  selectedItems.has(file.path) ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500' : ''
                }`}
              >
                <div className="flex items-center space-x-4 flex-1">
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedItems.has(file.path)}
                      onChange={() => toggleItemSelection(file.path)}
                      className="h-5 w-5 text-blue-600 rounded-lg border-gray-300 focus:ring-blue-500 focus:ring-2"
                    />
                  )}
                  <div className="text-3xl opacity-80">
                    {file.isVideo ? '🎬' : '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    {renamingItem?.path === file.path ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={handleRename}
                        onKeyPress={(e) => e.key === 'Enter' && handleRename()}
                        className="px-3 py-2 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        autoFocus
                      />
                    ) : (
                      <div
                        className={`font-semibold text-gray-900 truncate text-lg ${
                          file.isVideo ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''
                        }`}
                        onClick={() => file.isVideo && onPreviewVideo(file)}
                      >
                        {file.name}
                      </div>
                    )}
                    <div className="text-sm text-gray-500 mt-1">
                      {formatFileSize(file.size)} • Modified: {formatDate(file.modified)}
                    </div>
                  </div>
                </div>
                <div className={`flex items-center space-x-2 transition-all duration-200 ${
                  isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                  {file.isVideo && (
                    <button
                      onClick={() => onPreviewVideo(file)}
                      className="px-3 py-2 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 transition-all duration-200 font-medium shadow-sm hover:shadow"
                    >
                      ▶️ Preview
                    </button>
                  )}
                  <button
                    onClick={() => copyAbsoluteLink(file.path, false)}
                    className="px-3 py-2 text-xs bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 transition-all duration-200 font-medium shadow-sm hover:shadow"
                    title="Copy direct link to file"
                  >
                    🔗 Copy Link
                  </button>
                  <button
                    onClick={() => startRename(file)}
                    className="px-3 py-2 text-xs bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-all duration-200 font-medium shadow-sm hover:shadow"
                  >
                    ✏️ Rename
                  </button>
                  <button
                    onClick={() => onDeleteFile(file.path)}
                    className="px-3 py-2 text-xs bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-all duration-200 font-medium shadow-sm hover:shadow"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}

            {folders.length === 0 && files.length === 0 && (
              <div className="p-16 text-center">
                <div className="text-6xl mb-4 opacity-50">📂</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No files or folders</h3>
                <p className="text-gray-500">This directory is empty. Upload some files to get started!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileManager;
