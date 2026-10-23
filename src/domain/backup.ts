import { z } from 'zod';
import { SCHEMA_VERSION, Store } from './schemas';

// Covers Chrome's default 10 MiB local-storage quota, including older formatted exports.
export const MAX_IMPORT_BYTES = 12_000_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** JSON.parse for untrusted text: size cap and prototype-pollution key rejection. */
export function parseUntrustedJson(text: string, maxBytes = MAX_IMPORT_BYTES): Parsed<unknown> {
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, error: `File is larger than ${Math.round(maxBytes / 1000)} KB.` };
  try {
    const value = JSON.parse(text, (key, v) => {
      if (FORBIDDEN_KEYS.has(key)) throw new Error('forbidden key');
      return v;
    });
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: (e as Error).message === 'forbidden key' ? 'File contains a forbidden key.' : 'File is not valid JSON.' };
  }
}

/** migrations[n] upgrades a version-n document to version n+1. */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;
export const migrations: Record<number, Migration> = {
  5: (d) => d, // content is optional; old applications retain their existing fill behavior
  1: (d) => ({ ...d, applications: [] }),
  3: (d) => ({ ...d, answers: [], sensitiveAnswers: [] }),
  4: (d) => ({ ...d, accounts: [], applications: (d.applications as Record<string, unknown>[]).map((a) => ({ ...a, submittedAt: '', stepsSeen: [] })) }),
  2: (d) => ({ ...d, skillAliases: [], applications: (d.applications as Record<string, unknown>[]).map((a) => ({ ...a, skillSelections: [] })) }),
};

/** Runs migrations on a copy; the input is never mutated, so a failure leaves the caller's data intact. */
export function migrate(input: unknown, steps: Record<number, Migration> = migrations, target = SCHEMA_VERSION): Parsed<unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, error: 'Not a backup file.' };
  let doc = structuredClone(input) as Record<string, unknown>;
  const v = doc.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > target) return { ok: false, error: `Unsupported schema version: ${String(v)}.` };
  try {
    for (let n = v; n < target; n++) {
      const step = steps[n];
      if (!step) return { ok: false, error: `No migration from version ${n}.` };
      doc = { ...step(doc), schemaVersion: n + 1 };
    }
  } catch {
    return { ok: false, error: `Migration from version ${String(doc.schemaVersion)} failed.` };
  }
  return { ok: true, value: doc };
}

export function validateStore(doc: unknown): Parsed<Store> {
  const r = Store.safeParse(doc);
  if (!r.success) return { ok: false, error: describeIssues(r.error) };
  if (new TextEncoder().encode(JSON.stringify(r.data)).length > MAX_IMPORT_BYTES) return { ok: false, error: 'Saved data exceeds the backup size limit. Export a backup and remove unused records.' };
  return { ok: true, value: r.data };
}

/** Full pipeline for a backup file the user picked. */
export function parseBackup(text: string, steps = migrations): Parsed<Store> {
  const json = parseUntrustedJson(text);
  if (!json.ok) return json;
  const migrated = migrate(json.value, steps);
  return migrated.ok ? validateStore(migrated.value) : migrated;
}

// Paths only, never values: issue text must not echo personal data.
function describeIssues(error: z.ZodError): string {
  const paths = error.issues.slice(0, 3).map((i) => i.path.join('.') || '(root)');
  return `Invalid data at ${paths.join(', ')}${error.issues.length > 3 ? ` and ${error.issues.length - 3} more` : ''}.`;
}
