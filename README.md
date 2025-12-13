# WebRTC Signaling Server

A standalone WebSocket signaling server for WebRTC peer-to-peer connections using Socket.io and Express.

## Features

- Room-based signaling for peer-to-peer connections
- WebSocket support via Socket.io
- CORS configuration for cross-origin requests
- Health check endpoint
- Automatic room cleanup
- Support for 2 participants per room

## Quick Deploy to Railway

### Method 1: Using Railway CLI (Recommended - 5 minutes)

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```bash
   railway login
   ```

3. **Initialize and Deploy**
   ```bash
   # Make sure you're in the server directory
   cd server

   # Initialize Railway project
   railway init

   # Deploy the server
   railway up
   ```

4. **Set Environment Variables**
   ```bash
   # Set the port (Railway provides this automatically, but we set a default)
   railway variables set PORT=3001

   # Set your Vercel frontend URL (update after deploying frontend)
   railway variables set CLIENT_URL=https://your-app.vercel.app
   ```

5. **Get Your Server URL**
   ```bash
   railway domain
   ```

   Copy this URL - you'll need it for your Vercel deployment!
   Example: `https://webrtc-signaling-production.up.railway.app`

6. **Test Your Deployment**
   Visit: `https://your-railway-url.railway.app/health`

   You should see:
   ```json
   {
     "status": "ok",
     "rooms": 0,
     "timestamp": "2024-..."
   }
   ```

### Method 2: Using Railway Dashboard (Web Interface)

1. **Create Railway Account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Authorize Railway to access your repositories
   - Select your repository

3. **Configure Deployment**
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`

4. **Add Environment Variables**
   - Go to Variables tab
   - Add `PORT`: `3001`
   - Add `CLIENT_URL`: `https://your-vercel-app.vercel.app`

5. **Deploy**
   - Railway will automatically deploy
   - Go to Settings → Generate Domain
   - Copy your server URL

## Alternative: Deploy to Render

1. **Create Render Account**
   - Go to https://render.com
   - Sign up with GitHub

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your repository
   - Root Directory: `server`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`

3. **Environment Variables**
   - Add `PORT`: `3001`
   - Add `CLIENT_URL`: `https://your-vercel-app.vercel.app`

4. **Deploy**
   - Click "Create Web Service"
   - Copy your service URL

## Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Create Environment File**
   ```bash
   cp .env.example .env
   ```

3. **Edit .env**
   ```env
   PORT=3001
   CLIENT_URL=http://localhost:3000
   ```

4. **Run Development Server**
   ```bash
   npm run dev
   ```

5. **Test Health Endpoint**
   ```bash
   curl http://localhost:3001/health
   ```

## Environment Variables

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3001` | Yes |
| `CLIENT_URL` | Frontend URL(s) for CORS | `https://app.vercel.app` | Yes |

**Multiple URLs:** Separate with commas
```bash
CLIENT_URL=https://app.vercel.app,https://staging.vercel.app,http://localhost:3000
```

## API Documentation

### HTTP Endpoints

#### `GET /health`
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "rooms": 0,
  "timestamp": "2024-12-13T10:30:00.000Z"
}
```

### Socket.io Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `create-room` | `{ roomId: string }` | Create a new room |
| `join-room` | `{ roomId: string }` | Join existing room |
| `offer` | `{ roomId: string, offer: RTCSessionDescriptionInit }` | Send WebRTC offer |
| `answer` | `{ roomId: string, answer: RTCSessionDescriptionInit }` | Send WebRTC answer |
| `ice-candidate` | `{ roomId: string, candidate: RTCIceCandidateInit }` | Send ICE candidate |
| `leave-room` | `{ roomId: string }` | Leave room |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room-created` | `{ roomId: string }` | Room successfully created |
| `user-joined` | `{ userId: string }` | User joined room |
| `user-left` | `{ userId: string }` | User left room |
| `offer` | `{ offer: RTCSessionDescriptionInit, userId: string }` | Received offer |
| `answer` | `{ answer: RTCSessionDescriptionInit, userId: string }` | Received answer |
| `ice-candidate` | `{ candidate: RTCIceCandidateInit, userId: string }` | Received ICE candidate |
| `room-full` | `{ message: string }` | Room at capacity |
| `error` | `{ message: string }` | Error occurred |

## Deployment Checklist

- [ ] Server deployed to Railway/Render
- [ ] `PORT` environment variable set
- [ ] `CLIENT_URL` environment variable set with your frontend URL
- [ ] `/health` endpoint returns 200 OK
- [ ] Domain/URL copied for frontend configuration
- [ ] CORS working (test from frontend)
- [ ] WebSocket connections working

## Monitoring

### Railway

**View Logs:**
```bash
railway logs
```

**Follow Logs:**
```bash
railway logs --follow
```

**Check Service Status:**
```bash
railway status
```

### Render

- View logs in Dashboard → Your Service → Logs
- Enable auto-deploy on push

## Troubleshooting

### Issue: CORS errors in browser

**Solution:**
```bash
# Make sure CLIENT_URL is set correctly
railway variables set CLIENT_URL=https://your-actual-vercel-url.vercel.app
```

### Issue: WebSocket connection fails

**Check:**
1. Server is running: `curl https://your-server.railway.app/health`
2. Client URL is correct in frontend environment variables
3. Railway/Render logs for errors: `railway logs`

### Issue: Port already in use locally

**Solution:**
```bash
# Change port in .env
PORT=3002
```

### Issue: Server crashes on startup

**Check Railway logs:**
```bash
railway logs
```

**Common causes:**
- Missing dependencies: Run `railway up` again
- Invalid environment variables
- Port configuration issue

## Updating the Server

### Update via Railway CLI
```bash
cd server
railway up
```

### Update via Git (if connected to Railway)
```bash
git add .
git commit -m "Update server"
git push origin main
# Railway auto-deploys
```

## Costs

### Railway
- **Free Tier**: $5 in free credits per month
- **After Free Tier**: ~$5-10/month for a small signaling server
- **Pricing**: Pay for what you use (CPU, RAM, bandwidth)

### Render
- **Free Tier**: 750 hours/month, spins down after 15 min inactivity
- **Paid Tier**: Starts at $7/month for always-on service

## Security Notes

- Server validates room capacity (max 2 users)
- CORS restricted to specified CLIENT_URL
- No authentication built-in (add if needed for production)
- Consider adding rate limiting for production use

## Production Recommendations

1. **Add Rate Limiting**
   ```bash
   npm install socket.io-rate-limit
   ```

2. **Add Logging**
   ```bash
   npm install winston
   ```

3. **Add Authentication** (optional)
   - JWT tokens
   - Session validation

4. **Monitor Performance**
   - Use Railway/Render metrics
   - Set up alerts for downtime

## Support

- Railway Docs: https://docs.railway.app
- Render Docs: https://render.com/docs
- Socket.io Docs: https://socket.io/docs

## License

MIT
