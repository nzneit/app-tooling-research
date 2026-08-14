// App-side policy table for the composition root. Hand-written type guards
// stand in for 0010's compiled Ajv standalone validators — the MQTT leg's own
// checks (test/fixtures.ts) run against REAL ajv@8; this table exists only so
// the composition root can construct a boundary whose REST leg the orval checks
// drive.

import type { CompiledValidator } from "../src/index.js";

export interface PlantTelemetry {
  tempC: number;
  at: string;
}

export const validatePlantTelemetry: CompiledValidator<PlantTelemetry> = (
  data: unknown,
): data is PlantTelemetry =>
  typeof data === "object" &&
  data !== null &&
  typeof (data as PlantTelemetry).tempC === "number" &&
  typeof (data as PlantTelemetry).at === "string";

export const appPolicy = {
  "plant/{plantId}/telemetry": { validate: validatePlantTelemetry, qos: 1 },
} as const;
