import { z } from 'zod';

// Strings are bounded so a hostile import can't bloat storage. Empty string means "unknown".
export const text = (max = 200) => z.string().trim().max(max);
export const id = z.string().min(1).max(64);

/** "YYYY" or "YYYY-MM". Never a made-up day or month. */
export const PartialDate = z.string().trim().regex(/^(|\d{4}(-(0[1-9]|1[0-2]))?)$/, 'Use YYYY or YYYY-MM');

/** http(s) only; javascript:, data: etc. are rejected. */
export const SafeUrl = z.union([z.literal(''), z.httpUrl().max(2048)]);

