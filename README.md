# WebRTC Signaling Server

A standalone WebSocket signaling server for WebRTC peer-to-peer connections using Socket.io and Express.

## Features

- Room-based signaling for peer-to-peer connections
- WebSocket support via Socket.io
- CORS configuration for cross-origin requests
- Health check endpoint
- Automatic room cleanup
- Support for unlimited participants per room (mesh topology)
- Peer-specific message routing for multi-peer connections

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
   # Note: Railway automatically provides PORT environment variable
   # No need to set it manually

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
   - Go to <https://railway.app>
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
   - Go to <https://render.com>
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

## Architecture

### Mesh Topology

The server uses a **full mesh topology** where:

- Each participant connects directly to every other participant
- Server acts as signaling intermediary only (no media routing)
- N participants = N×(N-1)/2 total peer connections

**Example:** With 4 participants, there are 6 peer connections total:

- Participant A connects to B, C, D (3 connections)
- Participant B connects to C, D (2 connections)
- Participant C connects to D (1 connection)
- Total: 6 connections

### Signaling Flow

1. **User A creates room**
   - Server creates room with User A as first participant
   - User A receives `room-created` event

2. **User B joins room**
   - Server sends `room-joined` event to User B with list: `[User A]`
   - Server sends `user-joined` event to User A with User B's ID

3. **Peer connection establishment**
   - User B creates offer and sends to User A
   - User A receives offer, creates answer, sends back to User B
   - ICE candidates exchanged between peers
   - Direct P2P connection established

4. **User C joins** (and so on)
   - User C receives list of existing participants: `[User A, User B]`
   - User C creates offers to both User A and User B
   - Each existing user creates answer back to User C
   - User C now has 2 peer connections

### Peer-Specific Routing

All signaling messages include `targetUserId` for direct peer-to-peer delivery:

- **Offers** are sent to specific peers using `io.to(targetUserId).emit()`
- **Answers** are returned to specific peers
- **ICE candidates** are routed to specific peers

This enables multiple simultaneous peer connections per room, allowing unlimited participants.

### Bandwidth Considerations

Mesh topology bandwidth requirements grow quadratically:

- 2 users: 2 streams (1 up, 1 down per user)
- 4 users: 12 streams (3 up, 3 down per user)
- 6 users: 30 streams (5 up, 5 down per user)
- 10 users: 90 streams (9 up, 9 down per user)

For rooms with 6+ participants, consider implementing an SFU (Selective Forwarding Unit) architecture for better scalability.

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
| `offer` | `{ roomId: string, targetUserId: string, offer: RTCSessionDescriptionInit }` | Send WebRTC offer to specific peer |
| `answer` | `{ roomId: string, targetUserId: string, answer: RTCSessionDescriptionInit }` | Send WebRTC answer to specific peer |
| `ice-candidate` | `{ roomId: string, targetUserId: string, candidate: RTCIceCandidateInit }` | Send ICE candidate to specific peer |
| `leave-room` | `{ roomId: string }` | Leave room |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room-created` | `{ roomId: string }` | Room successfully created |
| `room-joined` | `{ roomId: string, participants: string[] }` | Room joined with list of existing participants |
| `user-joined` | `{ userId: string }` | New user joined room |
| `user-left` | `{ userId: string }` | User left room |
| `offer` | `{ offer: RTCSessionDescriptionInit, userId: string }` | Received offer from peer |
| `answer` | `{ answer: RTCSessionDescriptionInit, userId: string }` | Received answer from peer |
| `ice-candidate` | `{ candidate: RTCIceCandidateInit, userId: string }` | Received ICE candidate from peer |
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

- Server supports unlimited participants in mesh topology
- CORS restricted to specified CLIENT_URL
- No authentication built-in (add if needed for production)
- Consider adding rate limiting for production use
- Room IDs should be UUIDs to prevent guessing attacks

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

- Railway Docs: <https://docs.railway.app>
- Render Docs: <https://render.com/docs>
- Socket.io Docs: <https://socket.io/docs>

## License

MIT
