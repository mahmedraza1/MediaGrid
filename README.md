# MediaGrid - Professional Video File Manager

A modern, local-first web application for managing video files and media content, built with Node.js (Express) and React (Vite). Features a beautiful, responsive interface with advanced file management capabilities.

## ✨ Features

### 🗂️ **Advanced File Management**
- Browse, upload, delete, rename files and folders
- Drag & drop file uploads with visual feedback
- Multiple file selection and bulk operations
- **Robust chunked uploads** for large files (>50MB) with automatic retry
- **Resume capability** - continue interrupted uploads from where they left off
- **Network failure resilience** - automatic retry with exponential backoff
- Real-time file listing and navigation
- Copy absolute links for files and folders
- Breadcrumb navigation with modern UI

### 🎬 **Video Features**
- Preview video files in modal player
- Support for MP4, MKV, MOV, AVI, WMV, FLV, WebM, M4V
- Direct file serving for media playback
- Video thumbnail generation (coming soon)

### 📊 **System Information**
- Beautiful horizontal disk space usage statistics
- File size and date information
- Real-time upload progress
- Responsive storage indicators

### 🎨 **Modern User Experience**
- Clean, professional interface with Tailwind CSS
- Gradient backgrounds and smooth animations
- Toast notifications for all actions
- Loading states and comprehensive error handling
- Mobile-responsive design
- Dark mode support (coming soon)

### 🔧 **Technical Features**
- RESTful API with Express.js
- Memory-efficient file uploads
- **Enterprise-grade upload reliability** with chunk-level retry logic
- **Progress persistence** - uploads survive browser refreshes and network failures
- **Intelligent resume** - automatically detects and skips completed chunks
- Direct file storage without temporary files
- Path-based file organization
- CORS configuration for cross-origin requests

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v16 or higher)
- **npm** or **yarn**

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd MediaGrid
   ```

2. **Install dependencies:**
   ```bash
   # Install server dependencies
   cd Server
   npm install
   
   # Install client dependencies
   cd ../Client
   npm install
   ```

3. **Start development environment:**
   ```bash
   # From the root directory (if you have the start script)
   ./start-dev.sh
   ```

   Or start services manually:
   ```bash
   # Terminal 1 - Start server (from Server directory)
   cd Server
   npm start
   
   # Terminal 2 - Start client (from Client directory)
   cd Client
   npm run dev
   ```

   **For production mode (single server):**
   ```bash
   # Quick production startup (builds and starts automatically)
   ./start-prod.sh
   
   # Or manually:
   cd Client && npm run build && cd ../Server && npm start
   ```

4. **Access the application:**
   
   **Development mode (separate servers):**
   - Frontend: http://localhost:5173 (Vite dev server)
   - Backend API: http://localhost:5000
   - File serving: http://localhost:5000/videos/

   **Production mode (single server):**
   ```bash
   # Build the client first
   cd Client
   npm run build
   
   # Start production server (serves both React app and API)
   cd ../Server
   npm start
   
   # Access everything at: http://localhost:5000
   ```

## 📁 Project Structure

```
MediaGrid/
├── Client/                     # React frontend (Vite)
│   ├── public/
│   │   └── vite.svg
│   ├── src/
│   │   ├── components/         # React components
│   │   │   ├── FileManager.jsx      # Main file browser
│   │   │   ├── VideoPreviewModal.jsx # Video player modal
│   │   │   └── DiskUsageStats.jsx   # Storage statistics
│   │   ├── assets/             # Static assets
│   │   ├── App.jsx             # Main app component
│   │   ├── App.css             # Global styles
│   │   ├── index.css           # Tailwind imports
│   │   └── main.jsx            # App entry point
│   ├── package.json
│   ├── vite.config.js          # Vite configuration
│   ├── tailwind.config.js      # Tailwind CSS config
│   └── eslint.config.js        # ESLint configuration
├── Server/                     # Node.js backend (Express)
│   ├── uploads/                # File storage (git-ignored)
│   ├── index.js                # Server entry point
│   └── package.json
├── .gitignore                  # Git ignore rules
├── start-dev.sh               # Development startup script
├── start-prod.sh              # Production startup script
└── README.md
```

## 🛠️ API Endpoints

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| `GET` | `/api/files` | List files and folders | `?path=/folder/path` |
| `POST` | `/api/upload` | Upload single file | `FormData: file, path` |
| `POST` | `/api/upload-chunk` | Upload file chunks | `Query: filename, chunkIndex, totalChunks, targetPath` |
| `POST` | `/api/folder` | Create new folder | `Body: name, path` |
| `DELETE` | `/api/file` | Delete file | `Body: path` |
| `DELETE` | `/api/folder` | Delete folder | `Body: path` |
| `POST` | `/api/rename` | Rename file/folder | `Body: oldPath, newName` |
| `GET` | `/api/check-chunks` | Check existing chunks for resume | `Query: filename, targetPath, totalChunks` |
| `GET` | `/api/health` | Health check | None |
| `GET` | `/videos/*` | Serve static files | File path |

## 🎯 Usage Guide

### 📤 Uploading Files
- **Drag & Drop**: Simply drag files into the blue drop zone
- **File Picker**: Click "Upload Files" button to browse and select
- **Folder Upload**: Click "Upload Folder" to upload entire directories
- **Large Files**: Files over 50MB use chunked upload automatically
- **Network Resilience**: Automatic retry with exponential backoff for failed chunks
- **Resume Uploads**: Interrupted uploads can be resumed by re-selecting the same file
- **Progress Persistence**: Upload progress is saved and survives browser refreshes
- **Multiple Files**: Select multiple files for batch upload
- **GB-Scale Support**: Optimized for multi-gigabyte file uploads

### 📁 File & Folder Management
- **Navigation**: Click folder names or use breadcrumb navigation
- **Create Folders**: Use "New Folder" button
- **Selection Mode**: Toggle selection mode for bulk operations
- **Bulk Delete**: Select multiple items and delete them together
- **Rename**: Click rename button or double-click items (coming soon)
- **Copy Links**: Get direct download links for files or app links for folders

### 🎬 Video Features
- **Preview**: Click video file names or "Preview" button
- **Download**: Right-click and save video files
- **Supported Formats**: MP4, MKV, MOV, AVI, WMV, FLV, WebM, M4V

### 🧭 Navigation
- **Breadcrumbs**: Click any part of the path to navigate
- **Up Button**: Go to parent directory
- **Home**: Click "Home" in breadcrumbs to return to root

## ⚙️ Configuration

### Server Configuration (Server/index.js)
```javascript
const PORT = process.env.PORT || 5000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// File size limits
limits: {
  fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit
  fieldSize: 25 * 1024 * 1024        // 25MB field size
}
```

### Client Configuration (Client/src/App.jsx)
```javascript
const API_BASE_URL = 'http://localhost:5000/api';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
```

### Environment Variables
Create `.env` files for custom configuration:

**Server/.env:**
```env
PORT=5000
UPLOADS_DIR=./uploads
MAX_FILE_SIZE=5368709120
```

**Client/.env:**
```env
VITE_API_URL=http://localhost:5000/api
```

## 🚀 Development

### 🎨 Styling and Theming
- Built with **Tailwind CSS** for modern, responsive design
- Custom gradient backgrounds and animations
- Consistent color scheme and typography
- Mobile-first responsive design

### 🔧 Adding Features
- **New File Types**: Modify `isVideoFile()` function
- **Custom Upload Logic**: Edit upload handlers in server
- **UI Components**: Add new React components in `Client/src/components/`
- **API Endpoints**: Extend server routes in `Server/index.js`

### 🐛 Testing
```bash
# Run client tests (if configured)
cd Client
npm test

# Run server tests (if configured)
cd Server
npm test
```

## 📦 Deployment

### 🌐 Production Build
```bash
# Build client for production
cd Client
npm run build

# Start production server (serves both API and React app)
cd ../Server
npm start

# Access the full application at http://localhost:5000
```

**Note:** When the client build exists (`Client/dist/`), the server automatically serves the React application on the same port as the API. This eliminates the need for separate frontend/backend servers in production.

### 🖥️ Local Network Access
1. Build the client: `cd Client && npm run build`
2. Find your machine's IP address
3. Start the server: `cd Server && npm start`
4. Access via `http://YOUR_IP:5000`

### ☁️ VPS/Cloud Deployment
1. **Build client**: `npm run build` in Client directory
2. **Start server**: The server automatically detects and serves the build files
3. **Set up reverse proxy** (nginx recommended) - point to single port
4. **Configure SSL** with Let's Encrypt
5. **Set environment variables** for production
6. **Configure firewall** and security

**Example nginx config:**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 🐳 Docker (Coming Soon)
```dockerfile
# Example Dockerfile structure
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## Troubleshooting

### Upload Failures
- Check available disk space
- Verify file permissions on upload directory
- Check file size limits (default: 5GB limit)
- **For interrupted uploads**: Look for blue "Incomplete Uploads" notification
- **To resume**: Re-select the same file - the system automatically skips completed chunks
- **Clear stuck uploads**: Use the "Clear" button in the pending uploads section
- **Network issues**: Uploads automatically retry failed chunks up to 5 times

### Performance
- Large files may take time to upload depending on your network speed
- Monitor disk space usage to ensure adequate storage

## 📄 License

**MediaGrid Proprietary License**  
Copyright © 2025 Muhammad Ahmed Raza (professionally known as Mark)

This software is proprietary and all rights are reserved.

**Restrictions:**
- No modification, distribution, or resale without written permission
- No use in public-facing or multi-client environments without authorization
- No reverse engineering or decompilation

For commercial licensing inquiries, contact: **developer.mahmedraza@gmail.com**

## 🤝 Contributing

**Note:** This is proprietary software with restricted access.

For authorized contributors:
1. Contact the developer for permission
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request for review

---

**Built with ❤️ by:**
- **Developer:** Muhammad Ahmed Raza (professionally known as Mark)
- **Backend:** Node.js, Express, Multer
- **Frontend:** React, Vite, Tailwind CSS, React Hot Toast
- **File Management:** fs-extra
