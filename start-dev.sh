#!/bin/bash

# MediaGrid Development Startup Script

echo "🚀 Starting MediaGrid Development Environment..."

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  Warning: FFmpeg is not installed. Video compression will not work."
    echo "   To install FFmpeg on Ubuntu/Debian: sudo apt update && sudo apt install ffmpeg"
    echo "   To install FFmpeg on macOS: brew install ffmpeg"
    echo "   To install FFmpeg on other systems, visit: https://ffmpeg.org/download.html"
    echo ""
fi

# Start server in background
echo "📦 Starting server on port 5000..."
cd Server
npm run dev &
SERVER_PID=$!
cd ..

# Wait a moment for server to start
sleep 2

# Start client
echo "🌐 Starting client on port 3000..."
cd Client
npm run dev &
CLIENT_PID=$!
cd ..

echo ""
echo "✅ MediaGrid is starting up!"
echo "📱 Client: http://localhost:3000"
echo "🔧 Server: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop both services..."

# Function to cleanup when script is interrupted
cleanup() {
    echo ""
    echo "🛑 Shutting down MediaGrid..."
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    exit 0
}

# Set trap for cleanup
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
