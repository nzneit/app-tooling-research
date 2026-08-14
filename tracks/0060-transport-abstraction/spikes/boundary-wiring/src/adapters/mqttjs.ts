// Production BrokerPort adapter — mqtt.js 5.15.2, entirely contained here.
// Taxonomy-free (I8): it delivers raw transport facts and never constructs or
// receives BoundaryError values. `resubscribe: false` because interest is
// module-owned and refcounted (O3) — mqtt.js's own resubscribe would race it.

import mqtt from "mqtt";
import type { BrokerHandlers, BrokerLink, BrokerPort, BrokerConnectOptions } from "../types.js";

export function mqttJsBrokerAdapter(): BrokerPort {
  return {
    connect(opts: BrokerConnectOptions, handlers: BrokerHandlers): BrokerLink {
      const client = mqtt.connect(opts.url, {
        clientId: opts.clientId,
        clean: opts.clean,
        reconnectPeriod: opts.reconnectPeriodMs,
        connectTimeout: 4000,
        resubscribe: false,
        protocolVersion: 4,
        username: opts.username,
        password: opts.password,
        transformWsUrl: opts.transformWsUrl
          ? (url: string) => (opts.transformWsUrl as (u: string) => string)(url)
          : undefined,
      });

      client.on("message", (topic, payload, packet) => {
        handlers.onMessage(topic, new Uint8Array(payload), {
          messageId: packet.messageId,
          dup: packet.dup === true,
          qos: packet.qos,
        });
      });
      client.on("connect", () => handlers.onLifecycle("connect"));
      client.on("reconnect", () => handlers.onLifecycle("reconnect"));
      client.on("close", () => handlers.onLifecycle("close"));
      client.on("offline", () => handlers.onLifecycle("offline"));
      // Always attached: an unhandled 'error' on an EventEmitter would throw.
      client.on("error", (err) => handlers.onLifecycle("error", err));

      return {
        subscribe: (filter, o) =>
          new Promise<void>((resolve, rejectPromise) => {
            client.subscribe(filter, { qos: o.qos }, (err) =>
              err ? rejectPromise(err) : resolve(),
            );
          }),
        unsubscribe: (filter) =>
          new Promise<void>((resolve, rejectPromise) => {
            client.unsubscribe(filter, (err) => (err ? rejectPromise(err) : resolve()));
          }),
        publish: (topic, payload, o) =>
          new Promise<void>((resolve, rejectPromise) => {
            client.publish(
              topic,
              Buffer.from(payload),
              { qos: o.qos, retain: o.retain ?? false },
              (err) => (err ? rejectPromise(err) : resolve()),
            );
          }),
        end: () =>
          new Promise<void>((resolve) => {
            client.removeAllListeners();
            client.end(true, {}, () => resolve());
          }),
      };
    },
  };
}
