// Feature code: neither import is ever allowed here (I5 — exactly one ingress
// per protocol, and the generated client is reached only via the mutator).
import mqtt from "mqtt";
import { listPlants } from "../../app/api/generated/plants.js";

export const client = mqtt;
export const fetchPlants = listPlants;
