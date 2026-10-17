import { z } from 'zod';
import type { Binding, Detection, ScanSnapshot, SkillOutcome, VerificationReport } from '../platform/adapter';
import type { Store } from '../domain/schemas';

const tabId = z.number().int().nonnegative();

export const BindingSchema = z.strictObject({
  platformId: z.enum(['workday', 'greenhouse', 'ashby', 'test-fake']),
  portalOrigin: z.string().max(300),
  tenantKey: z.string().max(300),
  applicationId: z.string().min(1).max(64),
});
export type PlanInput = z.infer<typeof PlanSchema>;
export const SkillRequestSchema = z.strictObject({
  binding: BindingSchema,
  fieldId: z.string().max(300),
  items: z.array(z.strictObject({ name: z.string().min(1).max(100), spellings: z.array(z.string().min(1).max(200)).min(1).max(10), option: z.string().max(200).optional() })).max(50), // the side panel sends batches of 25
});
export type SkillRequestInput = z.infer<typeof SkillRequestSchema>;
const FieldKindSchema = z.enum(['text', 'url', 'textarea', 'select', 'radio', 'checkbox', 'dropdown', 'combobox', 'multiselect', 'date', 'file', 'unknown']);
/** Only approved actions travel to the page: field identity, expected current value, proposed value, provenance. Never the profile. */
export const PlanSchema = z.strictObject({
  planId: z.string().min(1).max(64),
  binding: BindingSchema,
  stepId: z.string().max(200),
  revision: z.number().int().nonnegative(),
  actions: z.array(z.strictObject({
    actionId: z.string().max(300),
    type: z.enum(['set', 'addRecord']),
    fieldId: z.string().max(300),
    kind: FieldKindSchema,
    label: z.string().max(3000), // some questions run to a long paragraph (live QA 2026-10-12)
    expectedCurrent: z.string().max(20_000),
    proposed: z.string().max(20_000),
    recordId: z.string().max(64).optional(),
    expectedRecord: z.string().max(1000).optional(),
    sensitiveCategory: z.enum(['demographic', 'authorization', 'legal']).optional(),
    provenance: z.enum(['master', 'approved application', 'resume JSON', 'PDF extraction', 'approved answer memory', 'user']),
    rationale: z.string().max(1000),
  })).max(200),
});


// Every message to the service worker is validated against this schema before it is handled.
export const Request = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('store/get') }),
  z.strictObject({ type: z.literal('store/save'), store: z.unknown() }),
  z.strictObject({ type: z.literal('store/import'), text: z.string() }),
  z.strictObject({ type: z.literal('store/wipe') }),
  z.strictObject({ type: z.literal('tab/status'), tabId }),
  z.strictObject({ type: z.literal('tab/activate'), tabId, applicationId: z.string().min(1).max(64) }),
  z.strictObject({ type: z.literal('tab/scan'), tabId }),
  z.strictObject({ type: z.literal('tab/fill'), tabId, plan: PlanSchema }),
  z.strictObject({ type: z.literal('tab/cancel'), tabId }),
  z.strictObject({ type: z.literal('tab/skills'), tabId, request: SkillRequestSchema }),
]);
export type Request = z.infer<typeof Request>;
export type StoreRequest = Extract<Request, { type: `store/${string}` }>;

export type TabStatus = { binding?: Binding; detection?: Detection };

type Payload = {
  'store/get': { store: Store };
  'store/save': { store: Store };
  'store/import': { store: Store };
  'store/wipe': { store: Store };
  'tab/status': TabStatus;
  'tab/activate': TabStatus;
  'tab/scan': { snapshot: ScanSnapshot; binding: Binding };
  'tab/fill': { report: VerificationReport; snapshot?: ScanSnapshot };
  'tab/cancel': TabStatus;
  'tab/skills': { outcomes: SkillOutcome[]; snapshot?: ScanSnapshot };
};
export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
export type ResponseFor<K extends Request['type']> = Result<Payload[K]>;
export type Response = ResponseFor<'store/get'>;

export async function send<R extends Request>(req: R): Promise<ResponseFor<R['type']>> {
  return (await chrome.runtime.sendMessage(req)) ?? { ok: false, error: 'No response from extension.' };
}

export const ContentRequest = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('copilot/detect') }),
  z.strictObject({ type: z.literal('copilot/scan'), binding: BindingSchema }),
  z.strictObject({ type: z.literal('copilot/fill'), plan: PlanSchema }),
  z.strictObject({ type: z.literal('copilot/cancel') }),
  z.strictObject({ type: z.literal('copilot/skills'), request: SkillRequestSchema }),
]);
export type ContentRequest = z.infer<typeof ContentRequest>;
export type ContentResponse = Result<{ detection?: Detection; snapshot?: ScanSnapshot; report?: VerificationReport; outcomes?: SkillOutcome[] }>;
