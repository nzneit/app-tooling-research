// Policy table compilation + match. The table is compiled once at construction
// (mqtt-pattern filters pre-parsed); per-message cost is a linear scan of tens
// of rows (design.md, Performance notes).

import { clean, exec, fill, matches } from "mqtt-pattern";
import type { ChannelPolicy, PolicyTable, TopicParams } from "../types.js";

export interface CompiledRow {
  /** AsyncAPI-style channel key, e.g. 'plant/{plantId}/telemetry' */
  readonly channel: string;
  /** mqtt-pattern pattern, e.g. 'plant/+plantId/telemetry' */
  readonly pattern: string;
  /** concrete broker filter, e.g. 'plant/+/telemetry' */
  readonly filter: string;
  readonly policy: ChannelPolicy<unknown>;
  readonly direction: "in" | "out" | "inout";
  readonly qos: 0 | 1;
  readonly sample: number;
}

const SEGMENT = /^\{[A-Za-z_$][A-Za-z0-9_$]*\}$/;

/**
 * AsyncAPI channel keys use `{name}` for a named parameter; mqtt-pattern uses
 * `+name` / `#name`. One translation, at construction.
 */
export function toPattern(channel: string): string {
  const segments = channel.split("/");
  return segments
    .map((s, i) => {
      if (SEGMENT.test(s)) {
        const name = s.slice(1, -1);
        return i === segments.length - 1 && name.startsWith("$")
          ? `#${name.slice(1)}`
          : `+${name}`;
      }
      return s;
    })
    .join("/");
}

/** Throws a plain Error on a malformed channel key (programmer error). */
function assertChannelKey(channel: string): void {
  if (channel.length === 0) throw new Error("boundary: empty channel key");
  const segments = channel.split("/");
  segments.forEach((s, i) => {
    if (s === "") throw new Error(`boundary: malformed channel key "${channel}" (empty segment)`);
    if (s.includes("{") && !SEGMENT.test(s))
      throw new Error(`boundary: malformed channel key "${channel}" (bad parameter segment "${s}")`);
    if (s.startsWith("#") && i !== segments.length - 1)
      throw new Error(`boundary: malformed channel key "${channel}" ('#' must be last)`);
  });
}

export function compilePolicy(table: PolicyTable): readonly CompiledRow[] {
  const channels = Object.keys(table);
  if (channels.length === 0) throw new Error("boundary: empty policy table");
  return channels.map((channel) => {
    assertChannelKey(channel);
    const policy = table[channel] as ChannelPolicy<unknown>;
    if (typeof policy.validate !== "function")
      throw new Error(`boundary: channel "${channel}" has no compiled validator`);
    const sample = policy.sample ?? 1;
    if (sample < 0 || sample > 1)
      throw new Error(`boundary: channel "${channel}" has sample outside 0..1`);
    const pattern = toPattern(channel);
    return {
      channel,
      pattern,
      filter: clean(pattern),
      policy,
      direction: policy.direction ?? "in",
      qos: policy.qos ?? 0,
      sample,
    };
  });
}

export interface PolicyMatch {
  readonly row: CompiledRow;
  readonly params: TopicParams;
}

/** Linear scan; first inbound row whose filter matches wins. */
export function matchTopic(
  rows: readonly CompiledRow[],
  topic: string,
): PolicyMatch | null {
  for (const row of rows) {
    if (row.direction === "out") continue;
    const params = exec(row.pattern, topic);
    if (params !== null) return { row, params: stringify(params) };
  }
  return null;
}

function stringify(params: Record<string, unknown>): TopicParams {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = Array.isArray(v) ? v.join("/") : String(v);
  }
  return out;
}

/** Build a concrete publish topic from a channel key + params. */
export function fillTopic(row: CompiledRow, params: TopicParams | undefined): string {
  const topic = fill(row.pattern, (params ?? {}) as never) as string;
  if (topic.includes("undefined") && !row.channel.includes("undefined"))
    throw new Error(`boundary: publish to "${row.channel}" is missing topic params`);
  if (!matches(row.pattern, topic))
    throw new Error(`boundary: publish to "${row.channel}" produced an invalid topic "${topic}"`);
  return topic;
}
