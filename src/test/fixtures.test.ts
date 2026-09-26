import { describe, expect, it } from 'vitest';
import { SCHEMAS } from '../data/schema/index.js';
import { ID_A, v1DocFor } from './fixtures.js';

describe('v1DocFor', () => {
  it('is a valid v1 document, so a migration test cannot pass on bad input', () => {
    expect(SCHEMAS[1]!.safeParse(v1DocFor(ID_A, 'Sable')).success).toBe(true);
  });
});
