// The ONE MQTT ingress (I5). This is the only module in the app permitted to
// import `mqtt`; the base rule bans it everywhere, an override grants it here.
import mqtt from "mqtt";
import type { BrokerPort } from "../../src/index.js";

export function connect(url: string): ReturnType<typeof mqtt.connect> {
  return mqtt.connect(url);
}

export declare const port: BrokerPort;
