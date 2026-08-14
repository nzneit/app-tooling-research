# Spike: __SPIKE_SLUG__

Part of `__TRACK_DIR__`. Scope: the report checks listed in [findings.md](findings.md).

## Run

npm ci && npm test

Isolated per the
[spike harness spec](../../../../docs/superpowers/specs/2026-08-14-spike-harness-design.md):
standalone package, exact-pinned deps, no imports across the spike boundary.
