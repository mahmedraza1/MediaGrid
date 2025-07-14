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

// Serve client build files in production
const CLIENT_BUILD_PATH = path.join(__dirname, '../Client/dist');
const clientBuildExists = await fs.pathExists(CLIENT_BUILD_PATH);

if (clientBuildExists) {
  console.log('📦 Serving client build files from:', CLIENT_BUILD_PATH);
  // Serve static files from the React build
  app.use(express.static(CLIENT_BUILD_PATH));
} else {
  console.log('⚠️  No client build found. Run "npm run build" in Client directory for production.');
}

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

// Check existing chunks for resume functionality
app.get('/api/check-chunks', async (req, res) => {
  try {
    const { filename, targetPath, totalChunks } = req.query;
    
    if (!filename || !totalChunks) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Sanitize filename to match what will be saved
    const sanitizedFilename = sanitizeFilename(filename);
    
    const uploadsPath = path.join(UPLOADS_DIR, targetPath || '/');
    const tempDir = path.join(uploadsPath, '.chunks');
    
    const existingChunks = [];
    
    // Check if temp directory exists
    if (await fs.pathExists(tempDir)) {
      const files = await fs.readdir(tempDir);
      const fileChunks = files.filter(chunk => chunk.startsWith(`${sanitizedFilename}.part`));
      
      // Extract chunk indices
      fileChunks.forEach(chunkFile => {
        const match = chunkFile.match(new RegExp(`^${sanitizedFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.part(\\d+)$`));
        if (match) {
          existingChunks.push(parseInt(match[1]));
        }
      });
    }
    
    res.json({
      existingChunks: existingChunks.sort((a, b) => a - b),
      totalFound: existingChunks.length,
      totalExpected: parseInt(totalChunks)
    });
  } catch (error) {
    console.error('Check chunks error:', error);
    res.status(500).json({ error: 'Failed to check existing chunks' });
  }
});

// Chunked upload support
app.post('/api/upload-chunk', express.raw({ type: 'application/octet-stream', limit: '50mb' }), async (req, res) => {
  try {
    const { filename, chunkIndex, totalChunks, targetPath } = req.query;
    
    if (!filename || chunkIndex === undefined || !totalChunks) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Sanitize filename to replace spaces with hyphens
    const sanitizedFilename = sanitizeFilename(filename);
    
    const uploadsPath = path.join(UPLOADS_DIR, targetPath || '/');
    fs.ensureDirSync(uploadsPath);
    
    const tempDir = path.join(uploadsPath, '.chunks');
    fs.ensureDirSync(tempDir);
    
    const chunkPath = path.join(tempDir, `${sanitizedFilename}.part${chunkIndex}`);
    
    // Write chunk to disk
    await fs.writeFile(chunkPath, req.body);
    
    // Check if all chunks are uploaded
    const uploadedChunks = await fs.readdir(tempDir);
    const fileChunks = uploadedChunks.filter(chunk => chunk.startsWith(`${sanitizedFilename}.part`));
    
    if (fileChunks.length === parseInt(totalChunks)) {
      // All chunks uploaded, combine them
      const finalPath = path.join(uploadsPath, sanitizedFilename);
      const writeStream = fs.createWriteStream(finalPath);
      
      // Combine chunks in order
      for (let i = 0; i < parseInt(totalChunks); i++) {
        const chunkPath = path.join(tempDir, `${sanitizedFilename}.part${i}`);
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
      const relativePath = path.join(targetPath || '/', sanitizedFilename);
      
      const file = {
        name: sanitizedFilename,
        path: relativePath.replace(/\\/g, '/'), // Normalize path separators
        size: stats.size,
        isVideo: isVideoFile(sanitizedFilename),
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

// Get system stats (CPU and RAM) - optimized for low resource usage
const getSystemStats = async () => {
  try {
    // Get accurate real-time CPU usage using vmstat (more reliable than /proc/stat snapshots)
    let cpuUsage = 0;
    try {
      // vmstat 1 2 takes two measurements 1 second apart for accurate current usage
      const vmstatOutput = execSync('vmstat 1 2 | tail -1', { encoding: 'utf8', timeout: 3000 });
      const vmstatData = vmstatOutput.trim().split(/\s+/);
      // vmstat column 15 is idle percentage, so CPU usage = 100 - idle
      const idlePercent = parseInt(vmstatData[14]); // 0-based index, column 15
      cpuUsage = Math.round(100 - idlePercent);
    } catch (vmstatError) {
      // Fallback to top command if vmstat fails
      try {
        const topOutput = execSync('top -bn1 | grep "Cpu(s)" | head -1', { encoding: 'utf8', timeout: 2000 });
        const cpuMatch = topOutput.match(/(\d+\.?\d*)%\s*us/);
        if (cpuMatch) {
          cpuUsage = Math.round(parseFloat(cpuMatch[1]));
        }
      } catch (topError) {
        // Last fallback to /proc/loadavg approximation
        const loadOutput = execSync('cat /proc/loadavg', { encoding: 'utf8' });
        const load1min = parseFloat(loadOutput.split(' ')[0]);
        // Rough approximation: load average * 100 / number of cores
        const coresOutput = execSync('nproc', { encoding: 'utf8' });
        const cores = parseInt(coresOutput.trim());
        cpuUsage = Math.min(Math.round((load1min / cores) * 100), 100);
      }
    }

    // Get memory info from /proc/meminfo (very efficient)
    let memStats = {
      total: 0,
      used: 0,
      available: 0,
      usage: 0
    };
    
    try {
      const memOutput = execSync('cat /proc/meminfo | head -3', { encoding: 'utf8' });
      const memLines = memOutput.split('\n');
      const totalMem = parseInt(memLines[0].match(/(\d+)/)[1]);
      const freeMem = parseInt(memLines[1].match(/(\d+)/)[1]);
      const availableMem = parseInt(memLines[2].match(/(\d+)/)[1]);
      const usedMem = totalMem - availableMem;
      const memUsage = Math.round((usedMem / totalMem) * 100);

      memStats = {
        total: Math.round(totalMem / 1024 / 1024 * 100) / 100,
        used: Math.round(usedMem / 1024 / 1024 * 100) / 100,
        available: Math.round(availableMem / 1024 / 1024 * 100) / 100,
        usage: memUsage
      };
    } catch (memError) {
      console.warn('Error reading memory stats:', memError.message);
      // Fallback values
      memStats = {
        total: 0,
        used: 0,
        available: 0,
        usage: 0
      };
    }

    return {
      cpu: {
        usage: cpuUsage,
        status: cpuUsage > 80 ? 'High' : cpuUsage > 60 ? 'Medium' : 'Low'
      },
      memory: {
        total: `${memStats.total}GB`,
        used: `${memStats.used}GB`,
        available: `${memStats.available}GB`,
        usage: memStats.usage,
        status: memStats.usage > 85 ? 'High' : memStats.usage > 70 ? 'Medium' : 'Low'
      }
    };
  } catch (error) {
    console.error('Error getting system stats:', error);
    return {
      cpu: { usage: 0, status: 'Unknown' },
      memory: { total: 'Unknown', used: 'Unknown', available: 'Unknown', usage: 0, status: 'Unknown' }
    };
  }
};

// Utility function to sanitize filename
const sanitizeFilename = (filename) => {
  // Replace spaces with hyphens and remove special characters
  return filename
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^\w\-_.]/g, '')      // Remove special characters except hyphens, underscores, dots
    .replace(/--+/g, '-')           // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '');       // Remove leading/trailing hyphens
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

    // Get disk usage and system stats
    const diskUsage = await getDiskUsage();
    const systemStats = await getSystemStats();

    res.json({
      currentPath: requestedPath,
      folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
      diskUsage,
      systemStats
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

    // Sanitize filename to replace spaces with hyphens
    const sanitizedFilename = sanitizeFilename(req.file.originalname);
    
    console.log('File received:', req.file.originalname, '-> Sanitized:', sanitizedFilename); // Debug log
    console.log('Target path from body:', req.body.path); // Debug log

    // Get target path and ensure it exists
    const targetPath = req.body.path || '/';
    const targetDir = path.join(UPLOADS_DIR, targetPath);
    await fs.ensureDir(targetDir);
    
    // Write file to target directory with sanitized filename
    const finalPath = path.join(targetDir, sanitizedFilename);
    await fs.writeFile(finalPath, req.file.buffer);

    console.log('File written to:', finalPath); // Debug log

    // Build the correct path for the response
    const relativePath = path.posix.join(targetPath, sanitizedFilename);

    const uploadedFile = {
      name: sanitizedFilename,
      path: relativePath,
      size: req.file.size,
      isVideo: isVideoFile(sanitizedFilename),
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

    // Sanitize the new name on server side as well (consistency with upload)
    const sanitizedNewName = sanitizeFilename(newName);

    const fullOldPath = path.join(UPLOADS_DIR, oldPath);
    const fullNewPath = path.join(path.dirname(fullOldPath), sanitizedNewName);
    
    // Ensure both paths are within uploads directory
    if (!fullOldPath.startsWith(UPLOADS_DIR) || !fullNewPath.startsWith(UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // Check if source exists
    if (!await fs.pathExists(fullOldPath)) {
      return res.status(404).json({ error: 'Source file or folder not found' });
    }

    // Check if destination already exists
    if (await fs.pathExists(fullNewPath)) {
      return res.status(409).json({ error: 'A file or folder with that name already exists' });
    }

    await fs.move(fullOldPath, fullNewPath);
    
    res.json({
      message: 'Renamed successfully',
      newPath: path.relative(UPLOADS_DIR, fullNewPath),
      sanitizedName: sanitizedNewName
    });
  } catch (error) {
    console.error('Error renaming:', error);
    // Provide more specific error messages
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'File or folder not found' });
    } else if (error.code === 'EEXIST') {
      res.status(409).json({ error: 'A file or folder with that name already exists' });
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(500).json({ error: `Failed to rename: ${error.message}` });
    }
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Catch-all handler for SPA routing (must be last)
if (clientBuildExists) {
  app.use((req, res, next) => {
    // Don't serve index.html for API routes or video files
    if (req.path.startsWith('/api/') || req.path.startsWith('/videos/')) {
      return next(); // Let other middleware handle it
    }
    
    // For all other routes, serve the React app
    res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 MediaGrid Server running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${UPLOADS_DIR}`);
  if (clientBuildExists) {
    console.log(`🌐 Serving React app at http://localhost:${PORT}`);
    console.log(`🔧 API endpoints available at http://localhost:${PORT}/api/`);
  } else {
    console.log(`🔧 API-only mode - run "npm run build" in Client directory for full app`);
  }
});
