// Plain-language error text for the side panel and popup. Names what was wrong, never the values (no personal data).
import type { z } from 'zod';

/** A rejected message: which part and which rule, e.g. "Too much at once: request.items allows at most 50." */
export function requestError(error: z.ZodError): string {
  const issue = error.issues[0];
  const where = issue?.path.join('.') || 'request';
  if (issue?.code === 'too_big') return `Too much at once: ${where} allows at most ${String(issue.maximum)}. Try fewer at a time.`;
  if (issue?.code === 'too_small') return `Something required is missing (${where}).`;
  return `The extension couldn't use this request (${where}). Reload the page and try again.`;
}

/** A failure while handling a valid message; the common one is a page that lost its connection after a reload. */
export function extensionError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/receiving end does not exist|could not establish connection|cannot access|no tab with id/i.test(m)) {
    return 'The page is no longer connected to the extension. Reload the page, then activate the extension on it again.';
  }
  return 'Something went wrong in the extension. Reload the page and try again.';
}
