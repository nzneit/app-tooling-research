// Synthetic topic scheme keyed like AsyncAPI channels, with REAL ajv@8
// validators standing in for 0010's compiled standalone validators.

import Ajv from "ajv";
import type { CompiledValidator } from "../src/index.js";
import { plantsContract } from "../app/contract.js";

export const ajv = new Ajv.default({ allErrors: true, strict: false });

export interface PlantTelemetry {
  tempC: number;
  at: string;
}
export interface PlantCommand {
  action: "start" | "stop";
}
export interface PlantStatus {
  ok: boolean;
  code: string;
  detail?: string;
}

export const validateTelemetry = ajv.compile<PlantTelemetry>({
  $id: "plant-telemetry",
  type: "object",
  required: ["tempC", "at"],
  additionalProperties: false,
  properties: { tempC: { type: "number" }, at: { type: "string" } },
}) as CompiledValidator<PlantTelemetry>;

export const validateCommand = ajv.compile<PlantCommand>({
  $id: "plant-command",
  type: "object",
  required: ["action"],
  additionalProperties: false,
  properties: { action: { type: "string", enum: ["start", "stop"] } },
}) as CompiledValidator<PlantCommand>;

export const validateStatus = ajv.compile<PlantStatus>({
  $id: "plant-status",
  type: "object",
  required: ["ok", "code"],
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
    code: { type: "string" },
    detail: { type: "string" },
  },
}) as CompiledValidator<PlantStatus>;

/** The spike's policy table. `as const` keeps the channel keys literal. */
export const policy = {
  "plant/{plantId}/telemetry": { validate: validateTelemetry, qos: 1 },
  "plant/{plantId}/command": {
    validate: validateCommand,
    direction: "out",
    qos: 1,
  },
  "plant/{plantId}/status": {
    validate: validateStatus,
    qos: 1,
    reasonCode: {
      select: (p: PlantStatus) => ({ code: p.code, detail: p.detail }),
    },
  },
} as const;

/**
 * The REST half of the fixture set. `contract` is the app's declared-status
 * table (app/contract.ts), built from orval's generated per-status zod schemas
 * — so the declared/undeclared split under test is driven by generated
 * artifacts, not by hand-written stand-ins.
 */
export const rest = { baseUrl: "https://api.example", contract: plantsContract } as const;

/** A body that satisfies the generated `ListPlants200Response` schema. */
export const validPlantList = {
  plants: [{ id: "p1", name: "Plant One", tempC: 21.5 }],
  total: 1,
} as const;
