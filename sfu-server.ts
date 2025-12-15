import mediasoup from "mediasoup";
import {
  Worker,
  Router,
  Transport,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  DtlsParameters,
  MediaKind,
} from "mediasoup/types";
import { Room } from "./types";

import { config, numWorkers } from "./config/mediasoup.config";

// Worker management
const workers: Worker[] = [];
let workerIdx = 0;

// Room state management
interface RoomState {
  router: Router;
  peers: Map<string, PeerState>;
}

interface PeerState {
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
}

const rooms = new Map<string, RoomState>();

/**
 * Initialize mediasoup workers
 */
export async function initializeWorkers(): Promise<void> {
  console.log(`Creating ${numWorkers} mediasoup workers...`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: config.worker.logLevel,
      logTags: config.worker.logTags,
      rtcMinPort: config.worker.rtcMinPort,
      rtcMaxPort: config.worker.rtcMaxPort,
    });

    worker.on("died", () => {
      console.error(
        `mediasoup worker died, exiting in 2 seconds... [pid:${worker.pid}]`
      );
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
    console.log(`Worker ${i + 1} created [pid:${worker.pid}]`);
  }

  console.log("All mediasoup workers initialized");
}

/**
 * Get next worker using round-robin
 */
export function getNextWorker(): Worker {
  const worker = workers[workerIdx];
  workerIdx = (workerIdx + 1) % workers.length;
  return worker;
}

/**
 * Get or create router for a room
 */
export async function getOrCreateRouter(roomId: string): Promise<Router> {
  let room = rooms.get(roomId);

  if (!room) {
    console.log(`Creating new router for room: ${roomId}`);
    const worker = getNextWorker();
    const router = await worker.createRouter({
      mediaCodecs: config.router.mediaCodecs,
    });

    room = {
      router,
      peers: new Map(),
    };

    rooms.set(roomId, room);
    console.log(`Router created for room: ${roomId}`);
  }

  return room.router;
}

/**
 * Get or create peer state
 */
function getOrCreatePeerState(roomId: string, peerId: string): PeerState {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} does not exist`);
  }

  let peer = room.peers.get(peerId);
  if (!peer) {
    peer = {
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };
    room.peers.set(peerId, peer);
    console.log(`Peer state created: ${peerId} in room: ${roomId}`);
  }

  return peer;
}

/**
 * Create WebRTC transport
 */
export async function createWebRtcTransport(
  roomId: string,
  peerId: string
): Promise<{
  transport: WebRtcTransport;
  params: {
    id: string;
    iceParameters: any;
    iceCandidates: any;
    dtlsParameters: any;
  };
}> {
  const router = await getOrCreateRouter(roomId);
  const peer = getOrCreatePeerState(roomId, peerId);

  const transport = await router.createWebRtcTransport({
    listenInfos: config.webRtcTransport.listenInfos,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate:
      config.webRtcTransport.initialAvailableOutgoingBitrate,
  });

  if (config.webRtcTransport.maxIncomingBitrate) {
    try {
      await transport.setMaxIncomingBitrate(
        config.webRtcTransport.maxIncomingBitrate
      );
    } catch (error) {
      console.error("Error setting max incoming bitrate:", error);
    }
  }

  // Store transport
  peer.transports.set(transport.id, transport);

  console.log(`Transport created: ${transport.id} for peer: ${peerId}`);

  return {
    transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  };
}

/**
 * Connect transport
 */
export async function connectTransport(
  roomId: string,
  peerId: string,
  transportId: string,
  dtlsParameters: DtlsParameters
): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} does not exist`);
  }

  const peer = room.peers.get(peerId);
  if (!peer) {
    throw new Error(`Peer ${peerId} does not exist in room ${roomId}`);
  }

  const transport = peer.transports.get(transportId);
  if (!transport) {
    throw new Error(
      `Transport ${transportId} does not exist for peer ${peerId}`
    );
  }

  await transport.connect({ dtlsParameters });
  console.log(`Transport connected: ${transportId} for peer: ${peerId}`);
}

/**
 * Create producer
 */
export async function createProducer(
  roomId: string,
  peerId: string,
  transportId: string,
  kind: MediaKind,
  rtpParameters: any
): Promise<Producer> {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} does not exist`);
  }

  const peer = room.peers.get(peerId);
  if (!peer) {
    throw new Error(`Peer ${peerId} does not exist in room ${roomId}`);
  }

  const transport = peer.transports.get(transportId);
  if (!transport) {
    throw new Error(
      `Transport ${transportId} does not exist for peer ${peerId}`
    );
  }

  const producer = await transport.produce({
    kind,
    rtpParameters,
  });

  peer.producers.set(producer.id, producer);

  producer.on("transportclose", () => {
    console.log(`Producer transport closed: ${producer.id}`);
    peer.producers.delete(producer.id);
  });

  console.log(`Producer created: ${producer.id} (${kind}) for peer: ${peerId}`);

  return producer;
}

/**
 * Create consumer
 */
export async function createConsumer(
  roomId: string,
  peerId: string,
  transportId: string,
  producerId: string,
  rtpCapabilities: RtpCapabilities
): Promise<Consumer> {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} does not exist`);
  }

  const peer = room.peers.get(peerId);
  if (!peer) {
    throw new Error(`Peer ${peerId} does not exist in room ${roomId}`);
  }

  const transport = peer.transports.get(transportId);
  if (!transport) {
    throw new Error(
      `Transport ${transportId} does not exist for peer ${peerId}`
    );
  }

  // Check if router can consume the producer
  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error(`Router cannot consume producer ${producerId}`);
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: true, // Start paused, will be resumed by client
  });

  peer.consumers.set(consumer.id, consumer);

  consumer.on("transportclose", () => {
    console.log(`Consumer transport closed: ${consumer.id}`);
    peer.consumers.delete(consumer.id);
  });

  consumer.on("producerclose", () => {
    console.log(`Consumer producer closed: ${consumer.id}`);
    peer.consumers.delete(consumer.id);
  });

  console.log(`Consumer created: ${consumer.id} for peer: ${peerId}`);

  return consumer;
}

/**
 * Resume consumer
 */
export async function resumeConsumer(
  roomId: string,
  peerId: string,
  consumerId: string
): Promise<void> {
  console.log("resume consumer hit");
  console.log(roomId);
  console.log(peerId);
  console.log(consumerId);
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} does not exist`);
  }
  console.log("room found");

  const peer = room.peers.get(peerId);
  if (!peer) {
    throw new Error(`Peer ${peerId} does not exist in room ${roomId}`);
  }
  console.log("peer found");

  const consumer = peer.consumers.get(consumerId);
  if (!consumer) {
    throw new Error(`Consumer ${consumerId} does not exist for peer ${peerId}`);
  }

  console.log("consumer found");

  await consumer.resume();
  console.log(`Consumer resumed: ${consumerId} for peer: ${peerId}`);
}

export function getPeerTransport(
  room: Room,
  peerId: string,
  transportId: string
): Transport {
  const peer = room.peers.get(peerId);
  if (!peer) {
    throw new Error(`Peer not found: ${peerId}`);
  }

  const transport = peer.transports.get(transportId);
  if (!transport) {
    throw new Error(
      `Transport not found: peer=${peerId}, transport=${transportId}`
    );
  }

  return transport;
}

/**
 * Get all producers in a room except for a specific peer
 */
export function getProducersInRoom(
  roomId: string,
  excludePeerId: string
): Array<{ peerId: string; producerId: string; kind: MediaKind }> {
  const room = rooms.get(roomId);
  if (!room) {
    return [];
  }

  const producers: Array<{
    peerId: string;
    producerId: string;
    kind: MediaKind;
  }> = [];

  room.peers.forEach((peer, peerId) => {
    if (peerId !== excludePeerId) {
      peer.producers.forEach((producer, producerId) => {
        producers.push({
          peerId,
          producerId,
          kind: producer.kind,
        });
      });
    }
  });

  return producers;
}

/**
 * Clean up peer from room
 */
export async function cleanupPeer(
  roomId: string,
  peerId: string
): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const peer = room.peers.get(peerId);
  if (!peer) {
    return;
  }

  console.log(`Cleaning up peer: ${peerId} from room: ${roomId}`);

  // Close all transports (this will also close associated producers and consumers)
  peer.transports.forEach((transport) => {
    transport.close();
  });

  // Remove peer from room
  room.peers.delete(peerId);

  // If room is empty, remove it
  if (room.peers.size === 0) {
    console.log(`Room ${roomId} is empty, closing router`);
    room.router.close();
    rooms.delete(roomId);
  }
}

/**
 * Get producer by ID across all peers in a room
 */
export function getProducerById(
  roomId: string,
  producerId: string
): { producer: Producer; peerId: string } | null {
  const room = rooms.get(roomId);
  if (!room) {
    return null;
  }

  for (const [peerId, peer] of room.peers.entries()) {
    const producer = peer.producers.get(producerId);
    if (producer) {
      return { producer, peerId };
    }
  }

  return null;
}

/**
 * Get room stats
 */
export function getRoomStats(roomId: string): any {
  const room = rooms.get(roomId);
  if (!room) {
    return null;
  }

  const stats = {
    roomId,
    peerCount: room.peers.size,
    peers: [] as any[],
  };

  room.peers.forEach((peer, peerId) => {
    stats.peers.push({
      peerId,
      transports: peer.transports.size,
      producers: peer.producers.size,
      consumers: peer.consumers.size,
    });
  });

  return stats;
}
