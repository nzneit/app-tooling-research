// Production adapters for the two ambient seams (also the defaults).

import type { ClockPort, FetchLike } from "../types.js";

export const systemClock: ClockPort = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** bound globalThis.fetch */
export const globalFetchAdapter: FetchLike = (input, init) => globalThis.fetch(input, init);
