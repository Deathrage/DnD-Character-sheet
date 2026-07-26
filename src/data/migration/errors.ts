import type { z } from 'zod';

/** A schema complaint, flattened so no Zod type escapes the data layer. */
export interface SchemaIssue {
  /** Dotted path to the offending field, or '' for the document root. */
  path: string;
  message: string;
}

/**
 * The one place a `ZodError` becomes `SchemaIssue[]`. Every refusal that originates in a Zod
 * parse — loading a stored document, and validating one on its way into storage — goes through
 * here, so the flattening exists once and callers outside the data layer never need to know a
 * `ZodError` was involved (see `SchemaIssue` above).
 */
export function toSchemaIssues(error: z.ZodError): SchemaIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export type LoadError =
  | { code: 'UNVERSIONED' }
  | { code: 'FROM_FUTURE'; found: number; current: number }
  | { code: 'INVALID_AT_VERSION'; version: number; issues: SchemaIssue[] }
  | { code: 'MIGRATION_FAILED'; version: number; cause: unknown };

/** Thrown internally so the migration walk can bail out; converted to a LoadResult at the edge. */
export class CharacterLoadError extends Error {
  constructor(readonly detail: LoadError) {
    super(detail.code);
    this.name = 'CharacterLoadError';
  }
}

export function describeLoadError(error: LoadError): string {
  switch (error.code) {
    case 'UNVERSIONED':
      return 'This file has no usable schemaVersion, so it cannot be read as a character.';
    case 'FROM_FUTURE':
      return `This file was written by a newer version of the app (schema ${error.found}, this build understands ${error.current}). Update the app to open it.`;
    case 'INVALID_AT_VERSION': {
      const detail = error.issues
        .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
        .join('; ');
      return `This file does not match schema version ${error.version}. ${detail}`;
    }
    case 'MIGRATION_FAILED':
      return `Upgrading this file from schema version ${error.version} failed.`;
  }
}
