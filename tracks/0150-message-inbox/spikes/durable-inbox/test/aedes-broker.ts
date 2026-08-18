// In-process aedes broker over WebSocket, for the broker-realism checks.
// Adapted from the 0060 boundary-wiring spike's harness (copied, not imported —
// D-0017 forbids imports across the spike boundary), with three additions this
// track needs: persistent-session support, a PUBACK wire tap, and per-client
// publishing so the aedes QoS-0/QoS-1 interleave defect can be avoided.
//
// aedes 1.1.1 + ws 8.21.3 + node:http; mqtt.js connects over ws://.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Aedes } from "aedes";
import { WebSocketServer, createWebSocketStream, type WebSocket } from "ws";

export interface PubackRecord {
  readonly clientId: string;
  readonly messageId: number;
  readonly at: number;
}

export interface TestBroker {
  readonly url: string;
  readonly port: number;
  /** Broker-side publish, so tests can inject traffic without a second client. */
  publish(topic: string, payload: string | Uint8Array, qos?: 0 | 1, retain?: boolean): Promise<void>;
  /** Every SUBSCRIBE the broker has seen, in order — resubscribe evidence. */
  readonly subscribeLog: readonly { clientId: string; filters: readonly string[] }[];
  /** Every PUBACK the broker has received, in order. The [MQTT-4.6.0-2] witness. */
  readonly pubacks: readonly PubackRecord[];
  readonly clientCount: number;
  /** Kill the listener and every live socket — the offline window. */
  stop(): Promise<void>;
  restart(): Promise<void>;
  close(): Promise<void>;
}

export async function startBroker(): Promise<TestBroker> {
  const aedes = await Aedes.createBroker();
  const subscribeLog: { clientId: string; filters: readonly string[] }[] = [];
  const pubacks: PubackRecord[] = [];
  let clientCount = 0;

  aedes.on("subscribe", (subscriptions, client) => {
    subscribeLog.push({
      clientId: client?.id ?? "?",
      filters: subscriptions.map((s) => s.topic),
    });
  });
  aedes.on("client", () => {
    clientCount++;
  });
  aedes.on("clientDisconnect", () => {
    clientCount--;
  });
  // The wire-level ack tap. aedes emits `ack` once it has processed the PUBACK,
  // in receipt order, which is what makes it a usable ordering witness.
  // aedes emits `ack` with a null packet on some paths (a PUBACK arriving for a
  // messageId the broker has already retired — which this spike produces
  // deliberately every time a stale-epoch ack is discarded), so the guard is
  // load-bearing rather than defensive.
  aedes.on("ack", (packet, client) => {
    const id = (packet as { messageId?: number } | null | undefined)?.messageId;
    if (typeof id === "number") {
      pubacks.push({ clientId: client?.id ?? "?", messageId: id, at: Date.now() });
    }
  });

  let http: Server | null = null;
  let wss: WebSocketServer | null = null;
  let sockets = new Set<WebSocket>();
  let port = 0;

  async function listen(): Promise<void> {
    const server = createServer();
    const socketServer = new WebSocketServer({
      server,
      handleProtocols: (protocols) => (protocols.has("mqtt") ? "mqtt" : false),
    });
    socketServer.on("connection", (ws, req) => {
      sockets.add(ws);
      ws.on("close", () => sockets.delete(ws));
      const stream = createWebSocketStream(ws);
      stream.on("error", () => ws.terminate());
      aedes.handle(stream, req);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        port = (server.address() as AddressInfo).port;
        server.removeListener("error", reject);
        resolve();
      });
    });
    http = server;
    wss = socketServer;
  }

  async function tearDown(): Promise<void> {
    for (const ws of sockets) ws.terminate();
    sockets = new Set();
    const socketServer = wss;
    const server = http;
    wss = null;
    http = null;
    if (socketServer !== null) await new Promise<void>((r) => socketServer.close(() => r()));
    if (server !== null) {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  }

  await listen();

  return {
    get url() {
      return `ws://127.0.0.1:${port}`;
    },
    get port() {
      return port;
    },
    get subscribeLog() {
      return subscribeLog;
    },
    get pubacks() {
      return pubacks;
    },
    get clientCount() {
      return clientCount;
    },
    publish(topic, payload, qos = 0, retain = false) {
      return new Promise<void>((resolve) => {
        aedes.publish(
          {
            cmd: "publish",
            topic,
            payload: Buffer.from(payload as Uint8Array | string),
            qos,
            retain,
            dup: false,
          },
          () => resolve(),
        );
      });
    },
    stop: tearDown,
    restart: listen,
    async close() {
      await tearDown();
      await new Promise<void>((resolve) => aedes.close(() => resolve()));
    },
  };
}

/** Poll until `predicate` holds or the budget expires. */
export async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 5000, label = "condition" }: { timeoutMs?: number; label?: string } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`waitFor: ${label} did not hold within ${String(timeoutMs)}ms`);
}
