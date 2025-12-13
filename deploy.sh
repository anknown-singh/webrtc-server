#!/bin/bash

# WebRTC Signaling Server - Railway Deployment Script
# This script helps you deploy the signaling server to Railway

set -e

echo "🚀 WebRTC Signaling Server - Railway Deployment"
echo "================================================"
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed."
    echo ""
    echo "Install it with:"
    echo "  npm install -g @railway/cli"
    echo ""
    exit 1
fi

echo "✅ Railway CLI is installed"
echo ""

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 You need to login to Railway first"
    echo ""
    railway login
    echo ""
fi

echo "✅ Logged in to Railway"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file"
        echo ""
        echo "⚠️  IMPORTANT: Update CLIENT_URL in .env after deploying your frontend!"
        echo ""
    else
        echo "❌ .env.example not found!"
        exit 1
    fi
fi

# Ask if this is a new project or updating existing
echo "Is this a new deployment or an update?"
echo "1) New deployment (first time)"
echo "2) Update existing deployment"
read -p "Enter choice (1 or 2): " choice
echo ""

if [ "$choice" = "1" ]; then
    echo "📦 Initializing new Railway project..."
    railway init
    echo ""

    echo "🔧 Setting environment variables..."
    railway variables set PORT=3001

    # Ask for CLIENT_URL
    read -p "Enter your frontend URL (or press Enter to set later): " client_url
    if [ ! -z "$client_url" ]; then
        railway variables set CLIENT_URL="$client_url"
    else
        railway variables set CLIENT_URL="http://localhost:3000"
        echo "⚠️  Using localhost:3000 as default. Update this after deploying frontend!"
    fi
    echo ""
fi

echo "🚀 Deploying to Railway..."
railway up
echo ""

echo "✅ Deployment complete!"
echo ""

# Get the domain
echo "📡 Getting your server URL..."
railway domain
echo ""

echo "✅ Deployment Summary"
echo "===================="
echo ""
echo "1. Copy the URL above"
echo "2. Test health check: curl https://your-url.railway.app/health"
echo "3. Add this URL to your Vercel frontend:"
echo "   NEXT_PUBLIC_SIGNALING_SERVER_URL=https://your-url.railway.app"
echo "4. Update CLIENT_URL on Railway after deploying frontend:"
echo "   railway variables set CLIENT_URL=https://your-frontend.vercel.app"
echo ""
echo "📊 View logs: railway logs"
echo "🔍 Status: railway status"
echo ""
echo "Happy video calling! 🎉"
