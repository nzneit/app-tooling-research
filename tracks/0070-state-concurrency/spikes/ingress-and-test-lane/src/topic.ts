// MQTT topic-pattern matching for StreamDecl.topic (design.md graft 2).

/** True when the pattern spans more than one concrete topic. */
export function isWildcardPattern(pattern: string): boolean {
  return pattern.includes("+") || pattern.includes("#");
}

/** MQTT §4.7 topic filter match: `+` = one level, `#` = zero-or-more, last only. */
export function matchesTopic(pattern: string, topic: string): boolean {
  const p = pattern.split("/");
  const t = topic.split("/");
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    if (seg === "#") return i === p.length - 1;
    if (i >= t.length) return false;
    if (seg === "+") continue;
    if (seg !== t[i]) return false;
  }
  return p.length === t.length;
}

export function compileMatcher(topic: string | ((topic: string) => boolean)): {
  match: (concrete: string) => boolean;
  wildcard: boolean;
} {
  if (typeof topic === "function") {
    // A predicate can span any set of concrete topics; treat it as wildcarded
    // so invariant 4's unstamped guard key includes the concrete topic.
    return { match: topic, wildcard: true };
  }
  return { match: (concrete) => matchesTopic(topic, concrete), wildcard: isWildcardPattern(topic) };
}
