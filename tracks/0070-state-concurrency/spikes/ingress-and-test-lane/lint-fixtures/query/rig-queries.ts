// The REST/query layer — the QueryCache's single writer lives here.
// Fixture for test/layering-lint.test.ts; not part of the kit.

export const rigQueryKey = (rigId: string): readonly unknown[] => ["rig", rigId];

export async function fetchRig(rigId: string): Promise<{ rigId: string; speed: number }> {
  return { rigId, speed: 0 };
}
