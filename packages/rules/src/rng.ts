export type DeterministicRng = {
  readonly seed: string;
  readonly step: number;
  nextUint32: () => { value: number; rng: DeterministicRng };
  nextIntInclusive: (min: number, max: number) => { value: number; rng: DeterministicRng };
};

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32Uint(a: number): number {
  let t = (a + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

function uintFromSeedStep(seed: string, step: number): number {
  const base = fnv1a32(seed);
  const mixed = (base + Math.imul(step >>> 0, 0x9e3779b1)) >>> 0;
  return mulberry32Uint(mixed);
}

export function createRng(seed: string, step = 0): DeterministicRng {
  return {
    seed,
    step,
    nextUint32: () => {
      const value = uintFromSeedStep(seed, step);
      return { value, rng: createRng(seed, step + 1) };
    },
    nextIntInclusive: (min: number, max: number) => {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max)
        throw new Error('INVALID_RANGE');
      const { value: u, rng } = createRng(seed, step).nextUint32();
      const span = max - min + 1;
      const value = min + (u % span);
      return { value, rng };
    },
  };
}

export function rollDice(seed: string, step: number): { dice: [number, number]; nextStep: number } {
  const r0 = createRng(seed, step);
  const a = r0.nextIntInclusive(1, 6);
  const b = a.rng.nextIntInclusive(1, 6);
  return { dice: [a.value, b.value], nextStep: step + 2 };
}
