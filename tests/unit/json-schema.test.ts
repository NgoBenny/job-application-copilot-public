import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { TailoredResumeJSON } from '../../src/domain/resume/extract';

const FILE = 'examples/tailored-resume.schema.json';

// Regenerate with: UPDATE_SCHEMA=1 npx vitest run tests/unit/json-schema.test.ts
it('exported JSON Schema matches the Zod contract', () => {
  const schema = `${JSON.stringify({ title: 'Tailored resume companion JSON', ...z.toJSONSchema(TailoredResumeJSON, { io: 'input' }) }, null, 2)}\n`;
  if (process.env.UPDATE_SCHEMA || !existsSync(FILE)) writeFileSync(FILE, schema);
  expect(readFileSync(FILE, 'utf8')).toBe(schema);
});
