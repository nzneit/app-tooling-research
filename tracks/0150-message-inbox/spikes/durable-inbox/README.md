# spike-0150-durable-inbox

Lab for the **inbox pattern** over IndexedDB transactions: an inbound MQTT message applies its
effect and records its identity in ONE transaction, and the PUBACK is written only after that
transaction completes — turning at-least-once delivery into effectively-once across page reloads
and tab crashes.

Runs **before** track 0150's survey and report, on user directive (D-0039).

- Interface: [design.md](design.md)
- Results: [findings.md](findings.md)

## Running it

```
npm ci
npx playwright install --only-shell chromium   # ~215 MB, OUT OF TREE — npm ci alone is not enough
npm test
npm run typecheck
```

The Chromium headless shell lands in `~/Library/Caches/ms-playwright`, outside this package, so a
clean `npm ci` does **not** reproduce the environment on its own.

## Lanes

| Lane | Files | Proves |
|---|---|---|
| node + fake-indexeddb | `check-1`, `check-2` | storage logic and ingest rules — shape, never durability |
| node + aedes | `check-3` | the deferral mechanism on a real wire |
| type system | `check-4` | illegal rows and the async-projection footgun do not compile |
| real Chromium | `check-10` | **the central claim**, under real process death |

`check-10` is the only lane that can falsify the claim, and its negative control is required to
reproduce the double-apply bug — a control that does not split fails the test.
