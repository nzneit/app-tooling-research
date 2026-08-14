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
        connectTimeout: opts.connectTimeoutMs,
        resubscribe: false,
        protocolVersion: 4,
        username: opts.username,
        password: opts.password,
        transformWsUrl: opts.transformWsUrl
          ? (url: string) => (opts.transformWsUrl as (u: string) => string)(url)
          : undefined,
      });

      // Named so teardown can detach exactly these and nothing else.
      const onMessage = (topic: string, payload: Buffer, packet: { messageId?: number; dup?: boolean; qos: 0 | 1 | 2 }) => {
        handlers.onMessage(topic, new Uint8Array(payload), {
          messageId: packet.messageId,
          dup: packet.dup === true,
          qos: packet.qos,
        });
      };
      const onConnect = () => handlers.onLifecycle("connect");
      const onReconnect = () => handlers.onLifecycle("reconnect");
      const onClose = () => handlers.onLifecycle("close");
      const onOffline = () => handlers.onLifecycle("offline");
      // Always attached: an unhandled 'error' on an EventEmitter would throw.
      const onError = (err: Error) => handlers.onLifecycle("error", err);
      /** Keeps the 'error' slot occupied while end() tears the socket down. */
      const swallowError = () => {};

      client.on("message", onMessage);
      client.on("connect", onConnect);
      client.on("reconnect", onReconnect);
      client.on("close", onClose);
      client.on("offline", onOffline);
      client.on("error", onError);

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
            // Detach only OUR forwarding listeners. removeAllListeners() would
            // also strip mqtt.js's own internal self-listeners AND leave the
            // 'error' slot empty — and end() on the give-up path can be racing
            // an in-flight reconnect socket that still emits 'error', which on
            // a listener-less EventEmitter is a thrown, process-killing error.
            // The boundary's generation guard already makes any late callback
            // inert, so detaching is about noise, never about correctness.
            client.off("message", onMessage);
            client.off("connect", onConnect);
            client.off("reconnect", onReconnect);
            client.off("close", onClose);
            client.off("offline", onOffline);
            client.off("error", onError);
            client.on("error", swallowError);
            client.end(true, {}, () => {
              client.off("error", swallowError);
              resolve();
            });
          }),
      };
    },
  };
}
