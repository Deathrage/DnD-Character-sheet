import { migrateV1ToV2 } from './v1ToV2.js';
import { migrateV2ToV3 } from './v2ToV3.js';
import { migrateV3ToV4 } from './v3ToV4.js';
import { migrateV4ToV5 } from './v4ToV5.js';
import { migrateV5ToV6 } from './v5ToV6.js';

/** Migrates a document from version N to N+1. Pure; assumes its input already validated at N. */
export type Migration = (doc: unknown) => unknown;

/** Keyed by source version: the entry at N takes a document from N to N+1. */
export const MIGRATIONS = new Map<number, Migration>([
  [1, migrateV1ToV2],
  [2, migrateV2ToV3],
  [3, migrateV3ToV4],
  [4, migrateV4ToV5],
  [5, migrateV5ToV6],
]);
