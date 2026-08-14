// The REST contract table — caller-owned app code, not package code.
//
// Every row is the OpenAPI operation's `responses` object, flattened: the
// DECLARED statuses and the schema each body must parse against. The schemas
// are orval's generated per-status zod output (`generateEachHttpStatus: true`),
// referenced, never re-declared — so this file is wiring, and the contract
// remains the single source of truth.
//
// 418 appears nowhere, on purpose: it is the undeclared status the class-4
// `undeclared-status` branch is tested with.

import type { RestContract } from "../src/index.js";
import {
  GetPlant200Response,
  GetPlant409Response,
  GetPlant422Response,
  ListPlants200Response,
  ListPlants409Response,
  ListPlants422Response,
  SendPlantCommand202Response,
  SendPlantCommand409Response,
  SendPlantCommand422Response,
} from "./api/generated/plants.zod.js";

export const plantsContract = {
  "GET /v1/plants": {
    200: ListPlants200Response,
    409: ListPlants409Response,
    422: ListPlants422Response,
  },
  "GET /v1/plants/{plantId}": {
    200: GetPlant200Response,
    409: GetPlant409Response,
    422: GetPlant422Response,
  },
  "POST /v1/plants/{plantId}/commands": {
    202: SendPlantCommand202Response,
    409: SendPlantCommand409Response,
    422: SendPlantCommand422Response,
  },
} satisfies RestContract;
