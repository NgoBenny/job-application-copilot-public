// Composition root: the only module allowed to import from src/adapters/*.
import { greenhouse } from '../adapters/greenhouse';
import { workday } from '../adapters/workday';
import type { ApplicationAdapter, PageContext, PlatformId } from './adapter';

export const adapters: readonly ApplicationAdapter[] = [workday, greenhouse];

export function getAdapter(id: PlatformId): ApplicationAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

/** First adapter that reports `supported`. Uncertain pages stay inactive. */
export async function detectAdapter(ctx: PageContext): Promise<ApplicationAdapter | undefined> {
  for (const adapter of adapters) {
    const r = await adapter.detect(ctx).catch(() => undefined);
    if (r?.ok && r.value.status === 'supported') return adapter;
  }
  return undefined;
}
