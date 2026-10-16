import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
const lint = async (filePath: string, code: string) => (await eslint.lintText(code, { filePath }))[0]!.messages.map((m) => m.ruleId);

describe('module boundaries', { timeout: 30_000 }, () => {
  it('rejects adapter imports from domain code', async () => {
    expect(await lint('src/domain/fixture.ts', "import { x } from '../adapters/workday/scan';\nexport const y = x;\n")).toContain('no-restricted-imports');
  });

  it('allows adapter imports from the registry', async () => {
    expect(await lint('src/platform/registry.ts', "import { x } from '../adapters/workday/scan';\nexport const y = x;\n")).not.toContain('no-restricted-imports');
  });
});
