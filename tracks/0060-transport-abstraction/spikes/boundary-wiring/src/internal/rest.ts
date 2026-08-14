// The REST leg's declared-status table — the analogue of internal/policy.ts.
//
// design.md, Error modes: class 3 is "a DECLARED non-2xx body that *parses*
// against its per-status schema"; class 4 covers the "undeclared status".
// Deciding which of those a response is requires knowing what the contract
// declares, so the contract is compiled once at construction into a matcher
// keyed by method + path template, exactly as the policy table is.

import type { ResponseSchema, RestContract } from "../types.js";

export interface CompiledEndpoint {
  /** the contract key, e.g. 'GET /v1/plants/{plantId}' — the stable endpoint identity */
  readonly key: string;
  readonly method: string;
  readonly test: RegExp;
  readonly statuses: Readonly<Record<number, ResponseSchema>>;
}

/** Escapes a path template's literal segments, then widens `{param}` to one segment. */
function toRegExp(pathTemplate: string): RegExp {
  const escaped = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The escape pass turned `{plantId}` into `\{plantId\}`; widen those back.
  const widened = escaped.replace(/\\\{[^/]*?\\\}/g, "[^/]+");
  return new RegExp(`^${widened}$`);
}

export function compileContract(contract: RestContract | undefined): CompiledEndpoint[] {
  if (contract === undefined) return [];
  return Object.entries(contract).map(([key, statuses]) => {
    const space = key.indexOf(" ");
    if (space <= 0)
      throw new Error(
        `boundary: rest.contract key "${key}" must be 'METHOD /path' (e.g. 'GET /v1/plants/{plantId}')`,
      );
    const method = key.slice(0, space).toUpperCase();
    const pathTemplate = key.slice(space + 1).trim();
    if (!pathTemplate.startsWith("/"))
      throw new Error(`boundary: rest.contract key "${key}" must carry an absolute path`);
    return { key, method, test: toRegExp(pathTemplate), statuses };
  });
}

/** The concrete request path, with query string and any baseUrl origin stripped. */
export function pathOf(url: string): string {
  const withoutQuery = url.split("?")[0] ?? url;
  const schemeEnd = withoutQuery.indexOf("://");
  if (schemeEnd === -1) return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const afterScheme = withoutQuery.slice(schemeEnd + 3);
  const slash = afterScheme.indexOf("/");
  return slash === -1 ? "/" : afterScheme.slice(slash);
}

export function matchEndpoint(
  endpoints: readonly CompiledEndpoint[],
  method: string,
  path: string,
): CompiledEndpoint | null {
  const m = method.toUpperCase();
  return endpoints.find((e) => e.method === m && e.test.test(path)) ?? null;
}
