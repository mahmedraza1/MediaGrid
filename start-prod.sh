#!/bin/bash

# MediaGrid Production Startup Script
# This script builds the client and starts the production server

echo "🏗️  Building MediaGrid for production..."

# Navigate to client directory and build
cd Client
echo "📦 Building React application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Client build failed!"
    exit 1
fi

echo "✅ Client build completed successfully!"

# Navigate to server directory and start
cd ../Server
echo "🚀 Starting production server..."
echo "📍 The application will be available at: http://localhost:5000"
echo "🔧 Press Ctrl+C to stop the server"
echo ""

npm start
