import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  initializeWorkers,
  getOrCreateRouter,
  createWebRtcTransport,
  connectTransport,
  createProducer,
  createConsumer,
  resumeConsumer,
  getProducersInRoom,
  cleanupPeer,
  getRoomStats,
  getNextWorker,
  getPeerTransport,
} from "./sfu-server";
import { Room } from "./types";
import { config } from "./config/mediasoup.config";

const app = express();

// Configure CORS for Express
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",")
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

const httpServer = createServer(app);

// Configure CORS for Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const rooms = new Map<string, Room>();

// Initialize mediasoup workers on startup
initializeWorkers().catch((error) => {
  console.error("Failed to initialize mediasoup workers:", error);
  process.exit(1);
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.emit("welcome", { participant: socket.id });

  socket.on("create-room", async ({ roomId }, cb) => {
    if (rooms.has(roomId)) {
      return cb({ error: "Room already exists" });
    }

    const worker = getNextWorker();

    const router = await worker.createRouter({
      mediaCodecs: config.router.mediaCodecs,
    });

    const room: Room = {
      id: roomId,
      router,
      peers: new Map(),
    };

    rooms.set(roomId, room);

    cb({ roomId });
  });

  // socket.on("create-room", ({ roomId }: { roomId: string }) => {
  //   console.log(`Creating room: ${roomId}`);

  //   if (!rooms.has(roomId)) {
  //     rooms.set(roomId, {
  //       id: roomId,
  //       participants: new Set([socket.id]),
  //     });
  //     socket.join(roomId);
  //     socket.emit("room-created", { roomId });
  //     console.log(`Room ${roomId} created by ${socket.id}`);
  //   } else {
  //     socket.emit("error", { message: "Room already exists" });
  //   }
  // });

  socket.on("joinRoom", async ({ roomId, rtpCapabilities }, cb) => {
    console.log(`User ${socket.id} trying to join room: ${roomId}`);

    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("error", { message: "Room does not exist" });
      return;
    }

    // Always cleanup before (handles refresh / reconnect)
    cleanupPeer(room.id, socket.id);

    room.peers.set(socket.id, {
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      rtpCapabilities,
    });

    // Send existing participants list to the new user
    socket.emit("test-joined", { roomId, participants: "test ok" });
    socket.emit("room-joined", {
      roomId,
      participants: room.peers,
    });

    cb({ rtpCapabilities: room.router.rtpCapabilities });

    // Replay existing producers to late joiner
    const producers = getProducersInRoom(room.id, socket.id);
    socket.emit("existingProducers", producers);

    // Notify existing participants about the new user
    socket.to(roomId).emit("user-joined", { userId: socket.id });

    console.log(
      `User ${socket.id} joined room ${roomId}. Total participants: ${room.peers.size}`
    );

    // console.log(`User ${socket.id} trying to join room: ${roomId}`);

    // const room = rooms.get(roomId);

    // if (!room) {
    //   socket.emit("error", { message: "Room does not exist" });
    //   return;
    // }

    // // Get existing participants before adding new user
    // const existingParticipants = Array.from(room.participants);

    // // Add new user to room
    // room.participants.add(socket.id);
    // socket.join(roomId);

    // // Send existing participants list to the new user
    // socket.emit("test-joined", { roomId, participants: "test ok" });
    // socket.emit("room-joined", { roomId, participants: existingParticipants });

    // // Notify existing participants about the new user
    // socket.to(roomId).emit("user-joined", { userId: socket.id });

    // console.log(
    //   `User ${socket.id} joined room ${roomId}. Total participants: ${room.participants.size}`
    // );
  });

  // SFU Event Handlers

  // Get router RTP capabilities
  socket.on("getRouterRtpCapabilities", async ({ roomId }, callback) => {
    try {
      console.log(`Getting RTP capabilities for room: ${roomId}`);
      const router = await getOrCreateRouter(roomId);
      callback({ rtpCapabilities: router.rtpCapabilities });
    } catch (error: any) {
      console.error("Error getting RTP capabilities:", error);
      callback({ error: error.message });
    }
  });

  // Create WebRTC transport
  socket.on("createWebRtcTransport", async ({ roomId }, callback) => {
    try {
      console.log(
        `Creating WebRTC transport for peer: ${socket.id} in room: ${roomId}`
      );
      const { params } = await createWebRtcTransport(roomId, socket.id);
      callback(params);
    } catch (error: any) {
      console.error("Error creating WebRTC transport:", error);
      callback({ error: error.message });
    }
  });

  // Connect transport
  // socket.on(
  //   "connectTransport",
  //   async ({ roomId, transportId, dtlsParameters }, callback) => {
  //     try {
  //       console.log(
  //         `Connecting transport: ${transportId} for peer: ${socket.id}`
  //       );
  //       await connectTransport(roomId, socket.id, transportId, dtlsParameters);
  //       callback({ success: true });
  //     } catch (error: any) {
  //       console.error("Error connecting transport:", error);
  //       callback({ error: error.message });
  //     }
  //   }
  // );

  socket.on(
    "connectTransport",
    async ({ roomId, transportId, dtlsParameters }, callback) => {
      try {
        const room = rooms.get(roomId);

        if (!room) {
          socket.emit("error", { message: "Room does not exist" });
          return;
        }

        const transport = getPeerTransport(room, socket.id, transportId);

        console.log({ transport });
        await transport.connect({ dtlsParameters });
        callback({ connected: true });
      } catch (error: any) {
        console.error("Error connecting transport:", error);
        callback({ error: error.message });
      }
    }
  );

  // Produce (send media)
  socket.on(
    "produce",
    async ({ roomId, transportId, kind, rtpParameters }, callback) => {
      try {
        console.log(
          `Producing ${kind} for peer: ${socket.id} in room: ${roomId}`
        );
        const producer = await createProducer(
          roomId,
          socket.id,
          transportId,
          kind,
          rtpParameters
        );

        // Notify other peers about the new producer
        socket.to(roomId).emit("newProducer", {
          producerId: producer.id,
          peerId: socket.id,
          kind: producer.kind,
        });

        callback({ id: producer.id });
      } catch (error: any) {
        console.error("Error producing:", error);
        callback({ error: error.message });
      }
    }
  );

  // Consume (receive media)
  socket.on(
    "consume",
    async ({ roomId, transportId, producerId, rtpCapabilities }, callback) => {
      try {
        console.log(`Consuming producer: ${producerId} for peer: ${socket.id}`);
        const consumer = await createConsumer(
          roomId,
          socket.id,
          transportId,
          producerId,
          rtpCapabilities
        );

        callback({
          id: consumer.id,
          producerId: consumer.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (error: any) {
        console.error("Error consuming:", error);
        callback({ error: error.message });
      }
    }
  );

  // Resume consumer
  socket.on("resumeConsumer", async ({ roomId, consumerId }, callback) => {
    try {
      console.log(`Resuming consumer: ${consumerId} for peer: ${socket.id}`);
      await resumeConsumer(roomId, socket.id, consumerId);
      callback({ success: true });
    } catch (error: any) {
      console.error("Error resuming consumer:", error);
      callback({ error: error.message });
    }
  });

  // Get existing producers when joining
  socket.on("getProducers", ({ roomId }, callback) => {
    try {
      console.log(
        `Getting producers for peer: ${socket.id} in room: ${roomId}`
      );
      const producers = getProducersInRoom(roomId, socket.id);
      callback({ producers });
    } catch (error: any) {
      console.error("Error getting producers:", error);
      callback({ error: error.message });
    }
  });

  socket.on("leave-room", ({ roomId }: { roomId: string }) => {
    handleUserLeaving(socket.id, roomId);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    rooms.forEach((room, roomId) => {
      if (room.peers.has(socket.id)) {
        handleUserLeaving(socket.id, roomId);
      }
    });
  });

  async function handleUserLeaving(socketId: string, roomId: string) {
    const room = rooms.get(roomId);

    if (room) {
      room.peers.delete(socketId);
      socket.to(roomId).emit("user-left", { userId: socketId });
      socket.leave(roomId);

      // Cleanup mediasoup resources
      await cleanupPeer(roomId, socketId);

      console.log(`User ${socketId} left room ${roomId}`);

      if (room.peers.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted`);
      }
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    rooms: rooms.size,
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
