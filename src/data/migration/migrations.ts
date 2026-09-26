import { migrateV1ToV2 } from './v1ToV2.js';

/** Migrates a document from version N to N+1. Pure; assumes its input already validated at N. */
export type Migration = (doc: unknown) => unknown;

/** Keyed by source version: the entry at N takes a document from N to N+1. */
export const MIGRATIONS = new Map<number, Migration>([[1, migrateV1ToV2]]);
