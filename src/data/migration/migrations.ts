/** Migrates a document from version N to N+1. Pure; assumes its input already validated at N. */
export type Migration = (doc: unknown) => unknown;

/**
 * Keyed by source version. Empty at schema v1 — the first entry appears when
 * v2 is introduced, as `MIGRATIONS.set(1, migrateV1ToV2)`.
 */
export const MIGRATIONS = new Map<number, Migration>();
