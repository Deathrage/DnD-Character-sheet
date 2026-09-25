import {
  parseVersioned,
  type ParseResult,
  type VersionedFormat,
} from '../../migration/versioned.js';
import { layoutV2Schema, type LayoutV2 } from './v2.js';

/**
 * The only way into `layout/` from outside it, like `src/data/schema/index.ts`: consumers ask for
 * the current layout, never a version file.
 */
export const CURRENT_LAYOUT = 2 as const;

export type CloudDocument = LayoutV2;
export type CloudVersionData = CloudDocument['characters'][string][string];

/**
 * No layout 1 here: it was many documents, and was wiped rather than migrated (spec §1). No
 * migrations until layout 3, which adds one, and a transactional write-back (spec §8).
 */
export const LAYOUT_FORMAT: VersionedFormat = {
  versionKey: 'layoutVersion',
  current: CURRENT_LAYOUT,
  schemas: { 2: layoutV2Schema },
  migrations: new Map(),
};

export const parseCloudDocument = (raw: unknown): ParseResult<CloudDocument> =>
  parseVersioned<CloudDocument>(raw, LAYOUT_FORMAT);
