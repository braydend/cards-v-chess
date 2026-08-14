/**
 * The pinned run seeds the balance matrix exercises.
 *
 * Deterministic forever: a win-rate change across these seeds is a real balance
 * change, never sampling noise. Extend this list when wider coverage is wanted;
 * do not replace it wholesale, or every threshold drifts in one commit.
 */
export const SEEDS: readonly string[] = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
