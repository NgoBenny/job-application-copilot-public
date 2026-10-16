// The contract every ATS adapter implements. The shared engine depends only on this file.
// Adapters never receive the profile: they get a sanitized page context and an approved plan.
import type { Protection } from '../domain/policy';

export type PlatformId = 'workday' | 'greenhouse' | 'test-fake';

export type Capability = 'skillSearch' | 'repeaterAdd' | 'accountDetect' | 'uploadAssist' | 'confirmationDetect';

export type Outcome = 'verified' | 'skipped' | 'stale' | 'unsupported' | 'failed' | 'cancelled' | 'timedOut';

export type AdapterResult<T> = { ok: true; value: T } | { ok: false; outcome: Exclude<Outcome, 'verified'>; reason: string };

export interface PageContext {
  readonly url: URL;
  readonly document: Document;
}

export interface Binding {
  readonly platformId: PlatformId;
  readonly portalOrigin: string;
  readonly tenantKey: string;
  readonly applicationId: string;
}

export interface BoundPageContext extends PageContext {
  readonly binding: Binding;
}

export interface Detection {
  readonly status: 'supported' | 'uncertain' | 'unsupported';
  readonly tenantKey?: string;
  readonly evidence: readonly string[];
  /** Which adapter answered; set by the injected script so the binding records the right platform. */
  readonly platformId?: PlatformId;
}

/**
 * select = native <select>; dropdown = button that opens a single-choice listbox;
 * combobox = searchable single choice; multiselect = searchable multi choice (e.g. skills).
 */
export type FieldKind = 'text' | 'url' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'dropdown' | 'combobox' | 'multiselect' | 'date' | 'file' | 'unknown';

export interface ScannedField {
  readonly fieldId: string;
  readonly kind: FieldKind;
  readonly label: string;
  readonly section: string;
  readonly required: boolean;
  readonly disabled: boolean;
  /** Absent for credential and attestation fields: their values are never read. */
  readonly value?: string;
  /** Classified from label/section before the value is read. */
  readonly protection?: Protection;
  /** Platform-neutral meaning, e.g. "contact.firstName" or "employment.title". Absent when unknown. */
  readonly semantic?: string;
  /** Visible choices for native selects and radio groups (closed custom dropdowns aren't opened during a scan). */
  readonly options?: readonly string[];
  /** Repeated-record group (e.g. "workExperience-2"), when the field belongs to one. */
  readonly recordKey?: string;
  /** Label collided with another field or couldn't be resolved: never filled automatically. */
  readonly uncertain?: boolean;
}

/** Platform-neutral page type, from visible non-secret evidence. */
export type PageKind = 'application' | 'signIn' | 'createAccount' | 'verifyEmail' | 'confirmation' | 'unknown';

export interface ScanSnapshot {
  readonly stepId: string;
  readonly stepLabel: string;
  readonly revision: number;
  readonly fields: readonly ScannedField[];
  readonly errors: readonly string[];
  readonly page?: { readonly kind: PageKind; readonly sso: readonly string[] };
}

export type Provenance = 'master' | 'approved application' | 'resume JSON' | 'PDF extraction' | 'approved answer memory' | 'user';

export interface ApprovedAction {
  readonly actionId: string;
  /** set = write one field; addRecord = press the section's Add button once (fieldId names the section). */
  readonly type: 'set' | 'addRecord';
  readonly fieldId: string;
  readonly kind: FieldKind;
  /** The field's label at scan time; the action is stale if the id now names a different question. */
  readonly label: string;
  /** The value the field must still hold, or the action is stale. */
  readonly expectedCurrent: string;
  readonly proposed: string;
  readonly recordId?: string;
  /** Identity of the page record at scan time; the action is stale if that slot now holds another record. */
  readonly expectedRecord?: string;
  /** Only a sensitive answer the user saved may write a field of exactly this category. */
  readonly sensitiveCategory?: 'demographic' | 'authorization' | 'legal';
  readonly provenance: Provenance;
  readonly rationale: string;
}

export interface ApprovedFillPlan {
  readonly planId: string;
  readonly binding: Binding;
  readonly stepId: string;
  readonly revision: number;
  readonly actions: readonly ApprovedAction[];
}

export interface ActionResult {
  readonly actionId: string;
  readonly outcome: Outcome | 'attempted';
  readonly reason: string;
  /** Similar choices the user may approve instead (search-and-pick boxes). */
  readonly suggestions?: readonly string[];
}

export interface ApplyReport {
  readonly planId: string;
  readonly results: readonly ActionResult[];
}

export interface VerificationReport {
  readonly planId: string;
  readonly results: readonly (ActionResult & { readonly outcome: Outcome })[];
}

export interface SkillRequestItem {
  readonly name: string;
  /** Spellings to search, in order (name, then aliases). */
  readonly spellings: readonly string[];
  /** Set when the user approved a specific option text (a broader suggestion): select exactly that, nothing else. */
  readonly option?: string;
}

export interface SkillRequest {
  readonly fieldId: string;
  readonly items: readonly SkillRequestItem[];
}

/**
 * added: an option was selected and its chip verified. suggestions: only broader options exist (user decides).
 * notAvailable: every search confirmed no match. timedOut: a search never answered, so "not available" isn't proven.
 */
export interface SkillOutcome {
  readonly name: string;
  readonly status: 'added' | 'alreadySelected' | 'suggestions' | 'notAvailable' | 'timedOut' | 'cancelled' | 'failed' | 'full';
  readonly option?: string;
  readonly suggestions?: readonly string[];
}

export interface ApplicationAdapter {
  readonly id: PlatformId;
  readonly capabilities: ReadonlySet<Capability>;
  detect(ctx: PageContext): Promise<AdapterResult<Detection>>;
  scan(ctx: BoundPageContext, signal: AbortSignal): Promise<AdapterResult<ScanSnapshot>>;
  apply(ctx: BoundPageContext, plan: ApprovedFillPlan, signal: AbortSignal): Promise<AdapterResult<ApplyReport>>;
  verify(ctx: BoundPageContext, report: ApplyReport, signal: AbortSignal): Promise<AdapterResult<VerificationReport>>;
  observeChanges(ctx: BoundPageContext, onInvalidate: () => void, signal: AbortSignal): void;
  /** Present only with the 'skillSearch' capability. */
  searchSkills?(ctx: BoundPageContext, req: SkillRequest, signal: AbortSignal): Promise<AdapterResult<readonly SkillOutcome[]>>;
}
