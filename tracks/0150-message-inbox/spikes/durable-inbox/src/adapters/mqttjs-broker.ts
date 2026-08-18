// The mqtt.js adapter. This file is the entire deferral mechanism and the only
// place mqtt.js internals are touched.
//
// `handleMessage` is a METHOD assigned after construction, never an option —
// passing it in IClientOptions is silently ignored. It is the ONLY deferral hook
// at protocolVersion 4: `customHandleAcks` is replaced with a stub below MQTT 5,
// and `manualAcks` does not exist in mqtt.js 5.15.2.

import mqtt, { type IPublishPacket, type MqttClient } from "mqtt";
import type {
  BrokerConnectOptions,
  BrokerHandlers,
  BrokerLink,
  BrokerPort,
  PacketMeta,
} from "../ports.js";

type Continuation = (err?: Error) => void;

/** A6. A double call writes two PUBACKs for one messageId and throws an uncaught
 *  TypeError from mqtt.js's own unguarded bare call — an uncaught exception, not
 *  an `error` event, so it bypasses every `client.on('error')` tap. */
function callOnce(fn: Continuation): Continuation {
  let called = false;
  return (err?: Error) => {
    if (called) return;
    called = true;
    fn(err);
  };
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function toBytes(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) return payload;
  return new TextEncoder().encode(String(payload));
}

export function mqttjsBrokerPort(): BrokerPort {
  return {
    connect(opts: BrokerConnectOptions, handlers: BrokerHandlers): BrokerLink {
      let epoch = 0;
      let staleDiscarded = 0;

      const client: MqttClient = mqtt.connect(opts.url, {
        clientId: opts.clientId,
        clean: opts.clean,
        protocolVersion: 4,
        keepalive: opts.keepaliveSeconds ?? 30,
        reconnectPeriod: opts.reconnectPeriodMs,
        // Required on ActiveMQ Classic, which restores no QoS-0 subscription
        // state; redundant on Mosquitto, which restores all of them per
        // §3.1.2.4. Broker-conditional, so it stays configuration.
        resubscribe: true,
      });

      client.on("connect", () => {
        epoch += 1;
        handlers.onLifecycle("connect");
      });
      client.on("reconnect", () => handlers.onLifecycle("reconnect"));
      client.on("close", () => handlers.onLifecycle("close"));
      client.on("offline", () => handlers.onLifecycle("offline"));
      client.on("error", (e) => handlers.onLifecycle("error", e));

      client.handleMessage = (packet, cb) => {
        const publish = packet as IPublishPacket;
        const once = callOnce(cb as Continuation);
        const deliveredEpoch = epoch;
        const meta: PacketMeta = {
          messageId: publish.messageId,
          dup: publish.dup === true,
          retain: publish.retain === true,
          qos: publish.qos,
          epoch: deliveredEpoch,
        };

        let result: void | Promise<void>;
        try {
          result = handlers.onMessage(publish.topic, toBytes(publish.payload), meta);
        } catch (e) {
          once(asError(e)); // nothing below the boundary may throw into the pump
          return;
        }

        if (result === undefined) {
          once(); // immediate ack — the path every non-durable row takes
          return;
        }

        result.then(
          () => {
            // A4. A late PUBACK on a new connection acknowledges a DIFFERENT
            // message, because packet identifiers are reassigned on every
            // CONNACK. Calling the continuation WITH an error skips the PUBACK
            // and still advances the pump; dropping it stalls the parser until
            // the keepalive detector tears the client down at 1.5x keepalive.
            if (epoch !== deliveredEpoch || !client.connected) {
              staleDiscarded += 1;
              once(new Error("stale-epoch"));
              return;
            }
            once(); // A1: the PUBACK is written here, and only here
          },
          (err: unknown) => once(asError(err)), // A3: no PUBACK, broker redelivers
        );
      };

      return {
        subscribe(filter, subOpts) {
          return new Promise((resolve, reject) => {
            client.subscribe(filter, { qos: subOpts.qos }, (err) =>
              err ? reject(err) : resolve(),
            );
          });
        },
        end(force = false) {
          return new Promise((resolve) => client.end(force, {}, () => resolve()));
        },
        get epoch() {
          return epoch;
        },
        get staleDiscarded() {
          return staleDiscarded;
        },
        get connected() {
          return client.connected;
        },
      };
    },
  };
}
