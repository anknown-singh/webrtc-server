# Quick Deploy to Railway

This is a quick guide to get your WebRTC video calling app deployed to Vercel in minutes.

## Prerequisites

- A GitHub account
- A Vercel account (sign up at <https://vercel.com>)
- A Railway account for the signaling server (sign up at <https://railway.app>)

## Step-by-Step Deployment

### Deploy Signaling Server (5 minutes)

1. **Install Railway CLI**

   ```bash
   npm i -g @railway/cli
   ```

2. **Deploy the server**

   ```bash
   railway login
   railway init
   railway up
   ```

3. **Set environment variables**

   ```bash
   railway variables --set PORT=3001
   railway variables --set CLIENT_URL=https://your-vercel-app.vercel.app
   ```

4. **Get your server URL**

   ```bash
   railway domain
   ```

   **Copy this URL** - you'll need it for Vercel deployment.
   Example: `https://webrtc-signaling-production.up.railway.app`
