// Composition root: the only module allowed to import from src/adapters/*.
import { ashby } from '../adapters/ashby';
import { greenhouse } from '../adapters/greenhouse';
import { workday } from '../adapters/workday';
import type { ApplicationAdapter, PlatformId } from './adapter';

export const adapters: readonly ApplicationAdapter[] = [workday, greenhouse, ashby];

export function getAdapter(id: PlatformId): ApplicationAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

