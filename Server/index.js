import express from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
await fs.ensureDir(UPLOADS_DIR);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (uploaded videos)
app.use('/videos', express.static(UPLOADS_DIR));

// Configure multer for direct file uploads
const upload = multer({ 
  storage: multer.memoryStorage(), // Use memory storage first
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit
    fieldSize: 25 * 1024 * 1024 // 25MB field size limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types
    cb(null, true);
  }
});

// Chunked upload support
app.post('/api/upload-chunk', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
  try {
    const { filename, chunkIndex, totalChunks, targetPath } = req.query;
    
    if (!filename || chunkIndex === undefined || !totalChunks) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const uploadsPath = path.join(UPLOADS_DIR, targetPath || '/');
    fs.ensureDirSync(uploadsPath);
    
    const tempDir = path.join(uploadsPath, '.chunks');
    fs.ensureDirSync(tempDir);
    
    const chunkPath = path.join(tempDir, `${filename}.part${chunkIndex}`);
    
    // Write chunk to disk
    await fs.writeFile(chunkPath, req.body);
    
    // Check if all chunks are uploaded
    const uploadedChunks = await fs.readdir(tempDir);
    const fileChunks = uploadedChunks.filter(chunk => chunk.startsWith(`${filename}.part`));
    
    if (fileChunks.length === parseInt(totalChunks)) {
      // All chunks uploaded, combine them
      const finalPath = path.join(uploadsPath, filename);
      const writeStream = fs.createWriteStream(finalPath);
      
      // Combine chunks in order
      for (let i = 0; i < parseInt(totalChunks); i++) {
        const chunkPath = path.join(tempDir, `${filename}.part${i}`);
        const chunkData = await fs.readFile(chunkPath);
        writeStream.write(chunkData);
        await fs.unlink(chunkPath); // Clean up chunk
      }
      
      writeStream.end();
      
      // Clean up temp directory if empty
      try {
        await fs.rmdir(tempDir);
      } catch (e) {
        // Directory not empty, that's fine
      }
      
      // Get file stats
      const stats = await fs.stat(finalPath);
      const relativePath = path.join(targetPath || '/', filename);
      
      const file = {
        name: filename,
        path: relativePath.replace(/\\/g, '/'), // Normalize path separators
        size: stats.size,
        isVideo: isVideoFile(filename),
        created: stats.birthtime,
        modified: stats.mtime
      };
      
      res.json({ 
        message: 'File uploaded successfully',
        file: file,
        chunked: true
      });
    } else {
      res.json({ 
        message: 'Chunk uploaded successfully',
        chunkIndex: parseInt(chunkIndex),
        totalChunks: parseInt(totalChunks),
        uploaded: fileChunks.length
      });
    }
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: 'Chunk upload failed: ' + error.message });
  }
});

// Helper function to get file stats
const getFileStats = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (error) {
    return null;
  }
};

// Helper function to check if file is a video
const isVideoFile = (filename) => {
  const videoExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.webm', '.m4v'];
  const ext = path.extname(filename).toLowerCase();
  return videoExtensions.includes(ext);
};

// Get disk space usage
const getDiskUsage = async () => {
  try {
    // Use df command to get disk usage for the uploads directory
    const output = execSync(`df -h "${UPLOADS_DIR}"`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    if (lines.length >= 2) {
      const stats = lines[1].split(/\s+/);
      return {
        total: stats[1],
        used: stats[2],
        available: stats[3],
        usePercentage: stats[4]
      };
    }
  } catch (error) {
    console.error('Error getting disk usage:', error);
  }
  return {
    total: 'Unknown',
    used: 'Unknown',
    available: 'Unknown',
    usePercentage: 'Unknown'
  };
};

// API Routes

// Get files and folders in a directory
app.get('/api/files', async (req, res) => {
  try {
    const requestedPath = req.query.path || '/';
    const fullPath = path.join(UPLOADS_DIR, requestedPath);
    
    // Ensure the path is within uploads directory
    if (!fullPath.startsWith(UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    await fs.ensureDir(fullPath);
    const items = await fs.readdir(fullPath);
    
    const files = [];
    const folders = [];

    for (const item of items) {
      const itemPath = path.join(fullPath, item);
      const stats = await getFileStats(itemPath);
      
      if (stats) {
        const fileInfo = {
          name: item,
          path: path.posix.join(requestedPath, item),
          size: stats.size,
          created: stats.created,
          modified: stats.modified,
          isVideo: !stats.isDirectory && isVideoFile(item)
        };

        if (stats.isDirectory) {
          folders.push({ ...fileInfo, type: 'folder' });
        } else {
          files.push({ ...fileInfo, type: 'file' });
        }
      }
    }

    // Get disk usage
    const diskUsage = await getDiskUsage();

    res.json({
      currentPath: requestedPath,
      folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
      diskUsage
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

// Upload file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File received:', req.file.originalname); // Debug log
    console.log('Target path from body:', req.body.path); // Debug log

    // Get target path and ensure it exists
    const targetPath = req.body.path || '/';
    const targetDir = path.join(UPLOADS_DIR, targetPath);
    await fs.ensureDir(targetDir);
    
    // Write file to target directory
    const finalPath = path.join(targetDir, req.file.originalname);
    await fs.writeFile(finalPath, req.file.buffer);

    console.log('File written to:', finalPath); // Debug log

    // Build the correct path for the response
    const relativePath = path.posix.join(targetPath, req.file.originalname);

    const uploadedFile = {
      name: req.file.originalname,
      path: relativePath,
      size: req.file.size,
      isVideo: isVideoFile(req.file.originalname),
      created: new Date(),
      modified: new Date()
    };

    res.json({ 
      message: 'File uploaded successfully',
      file: uploadedFile
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Create folder
app.post('/api/folder', async (req, res) => {
  try {
    const { name, path: folderPath = '/' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const fullPath = path.join(UPLOADS_DIR, folderPath, name);
    
    // Ensure the path is within uploads directory
    if (!fullPath.startsWith(UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // Check if folder already exists
    const exists = await fs.pathExists(fullPath);
    if (exists) {
      // Return success if folder already exists (useful for batch operations)
      return res.json({
        message: 'Folder already exists',
        folder: {
          name,
          path: path.posix.join(folderPath, name)
        }
      });
    }

    await fs.ensureDir(fullPath);
    
    res.json({
      message: 'Folder created successfully',
      folder: {
        name,
        path: path.posix.join(folderPath, name)
      }
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Delete file
app.delete('/api/file', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const fullPath = path.join(UPLOADS_DIR, filePath);
    
    // Ensure the path is within uploads directory
    if (!fullPath.startsWith(UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    await fs.remove(fullPath);
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Delete folder
app.delete('/api/folder', async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    
    if (!folderPath) {
      return res.status(400).json({ error: 'Folder path is required' });
    }

    const fullPath = path.join(UPLOADS_DIR, folderPath);
    
    // Ensure the path is within uploads directory
    if (!fullPath.startsWith(UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    await fs.remove(fullPath);
    
    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Rename file or folder
app.post('/api/rename', async (req, res) => {
  try {
    const { oldPath, newName } = req.body;
    
    if (!oldPath || !newName) {
      return res.status(400).json({ error: 'Old path and new name are required' });
    }

    const fullOldPath = path.join(UPLOADS_DIR, oldPath);
    const fullNewPath = path.join(path.dirname(fullOldPath), newName);
    
    // Ensure both paths are within uploads directory
    if (!fullOldPath.startsWith(UPLOADS_DIR) || !fullNewPath.startsWith(UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    await fs.move(fullOldPath, fullNewPath);
    
    res.json({
      message: 'Renamed successfully',
      newPath: path.relative(UPLOADS_DIR, fullNewPath)
    });
  } catch (error) {
    console.error('Error renaming:', error);
    res.status(500).json({ error: 'Failed to rename' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 MediaGrid Server running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${UPLOADS_DIR}`);
});
