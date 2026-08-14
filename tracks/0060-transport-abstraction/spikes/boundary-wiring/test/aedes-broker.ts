// In-process aedes broker over WebSocket, for the broker-realism checks.
// aedes 1.1.1 + ws 8.21.3 + node:http; mqtt.js connects to it over ws://.
// Every server is closed in afterEach so vitest exits cleanly.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Aedes } from "aedes";
import { WebSocketServer, createWebSocketStream, type WebSocket } from "ws";

export interface TestBroker {
  readonly url: string;
  readonly port: number;
  /** broker-side publish, so tests can inject traffic without a second client */
  publish(topic: string, payload: string | Uint8Array, qos?: 0 | 1): Promise<void>;
  /** every SUBSCRIBE packet the broker has seen, in order (resubscribe evidence) */
  readonly subscribeLog: readonly { clientId: string; filters: readonly string[] }[];
  readonly clientCount: number;
  /** kill the listener and every live socket — the offline window */
  stop(): Promise<void>;
  /** re-listen on the same port */
  restart(): Promise<void>;
  close(): Promise<void>;
}

export async function startBroker(): Promise<TestBroker> {
  const aedes = await Aedes.createBroker();
  const subscribeLog: { clientId: string; filters: readonly string[] }[] = [];
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
    get clientCount() {
      return clientCount;
    },
    publish(topic, payload, qos = 0) {
      return new Promise<void>((resolve) => {
        aedes.publish(
          {
            cmd: "publish",
            topic,
            payload: typeof payload === "string" ? Buffer.from(payload) : Buffer.from(payload),
            qos,
            retain: false,
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
  throw new Error(`waitFor: ${label} did not hold within ${timeoutMs}ms`);
}
