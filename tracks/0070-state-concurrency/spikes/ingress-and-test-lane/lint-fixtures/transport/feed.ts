// The raw transport feed — importable ONLY from the composition root
// (design.md invariant 2: single dispatch; D-0002 layering lint).
// Fixture for test/layering-lint.test.ts; not part of the kit.

export const rigFeed = {
  subscribe(_topic: string, _onMessage: (payload: unknown) => void): () => void {
    return () => {};
  },
};
