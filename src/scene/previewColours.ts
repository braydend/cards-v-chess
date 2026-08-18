/**
 * The build-preview overlay colours, shared between `CoveragePreview` and the
 * placement ghost.
 *
 * Shared so the two refusals agree by construction: the ghost's illegal tint
 * and `CoveragePreview`'s red marker read the same constant. Pure module for
 * the Fast Refresh reason `towerGeometry.ts` gives.
 */
export const COVERED = '#4fd1c5'
export const ILLEGAL = '#f56565'