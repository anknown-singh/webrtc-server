import {
  Consumer,
  Producer,
  Router,
  RtpCapabilities,
  Transport,
} from "mediasoup/types";

// Room model
export interface Room {
  id: string;
  router: Router;
  peers: Map<string, Peer>;
}

export interface Peer {
  transports: Map<string, Transport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  rtpCapabilities: RtpCapabilities | null;
}
