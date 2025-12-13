import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();

// Configure CORS for Express
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

const httpServer = createServer(app);

// Configure CORS for Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

interface Room {
  id: string;
  participants: Set<string>;
}

const rooms = new Map<string, Room>();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', ({ roomId }: { roomId: string }) => {
    console.log(`Creating room: ${roomId}`);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        participants: new Set([socket.id]),
      });
      socket.join(roomId);
      socket.emit('room-created', { roomId });
      console.log(`Room ${roomId} created by ${socket.id}`);
    } else {
      socket.emit('error', { message: 'Room already exists' });
    }
  });

  socket.on('join-room', ({ roomId }: { roomId: string }) => {
    console.log(`User ${socket.id} trying to join room: ${roomId}`);

    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('error', { message: 'Room does not exist' });
      return;
    }

    if (room.participants.size >= 2) {
      socket.emit('room-full', { message: 'Room is full' });
      return;
    }

    room.participants.add(socket.id);
    socket.join(roomId);

    socket.to(roomId).emit('user-joined', { userId: socket.id });
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('offer', ({ roomId, offer }: { roomId: string; offer: RTCSessionDescriptionInit }) => {
    console.log(`Offer from ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit('offer', { offer, userId: socket.id });
  });

  socket.on('answer', ({ roomId, answer }: { roomId: string; answer: RTCSessionDescriptionInit }) => {
    console.log(`Answer from ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit('answer', { answer, userId: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate }: { roomId: string; candidate: RTCIceCandidateInit }) => {
    console.log(`ICE candidate from ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit('ice-candidate', { candidate, userId: socket.id });
  });

  socket.on('leave-room', ({ roomId }: { roomId: string }) => {
    handleUserLeaving(socket.id, roomId);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    rooms.forEach((room, roomId) => {
      if (room.participants.has(socket.id)) {
        handleUserLeaving(socket.id, roomId);
      }
    });
  });

  function handleUserLeaving(socketId: string, roomId: string) {
    const room = rooms.get(roomId);

    if (room) {
      room.participants.delete(socketId);
      socket.to(roomId).emit('user-left', { userId: socketId });
      socket.leave(roomId);

      console.log(`User ${socketId} left room ${roomId}`);

      if (room.participants.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted`);
      }
    }
  }
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
