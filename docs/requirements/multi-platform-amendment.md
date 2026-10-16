# Multi-platform amendment (revised requirement)

Reconstructed from the approved plan (`docs/plans/claude-code-implementation-plan.md`), which summarizes the ChatGPT revision. Where it conflicts with `MASTER_IMPLEMENTATION_PLAN.md`, this amendment wins.

1. The product is renamed **Job Application Copilot**.
2. A shared, platform-neutral engine (profiles, applications, resumes, skills, answer memory, review, account registry) sits behind an `ApplicationAdapter` contract (`src/platform/adapter.ts`).
3. **v1 ships one adapter: Workday.** No stubs for other platforms, no remote plugin loader, no generic unknown-site adapter.
4. Code is structured so Greenhouse, Lever and others can be added later by implementing the contract and registering in `src/platform/registry.ts`; `docs/adding-an-adapter.md` documents this.
5. Application records carry `platformId`, `portalOrigin` and `tenantKey`.
6. Codex plan refinements adopted:
   - **Stale-plan invalidation:** an approved fill plan is bound to a step revision; any page change invalidates it.
   - **Adapters never receive the full profile:** only an approved fill plan.
   - **Contract test suite:** one parameterized suite runs against every registered adapter, plus a test-only fake adapter proving the engine has no Workday dependency.
