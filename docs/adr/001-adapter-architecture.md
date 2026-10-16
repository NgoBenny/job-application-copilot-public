# ADR-001: Shared engine behind an ApplicationAdapter contract

**Status:** accepted (Phase 0)

**Context.** v1 targets Workday only, but the product should later support other ATSs (Greenhouse, Lever). Workday markup varies by tenant and changes without notice.

**Decision.** All platform-neutral logic (profiles, applications, matching, policy, fill plans, review) lives in `src/domain`, `src/features` and `src/platform`. ATS-specific DOM code lives in `src/adapters/<platform>/` and implements `ApplicationAdapter` (`src/platform/adapter.ts`). `src/platform/registry.ts` is the sole composition root; an ESLint rule forbids adapter imports anywhere else. Adapters receive a sanitized page context and an `ApprovedFillPlan`, never the profile. `apply` can only report `attempted`; `verify` re-reads the page to mark `verified`.

**Consequences.** A new platform is one folder plus one registry line, validated by the shared contract-test kit. A test-only fake adapter proves the engine has no Workday dependency. Cost: a small amount of indirection in v1 with a single real adapter.
