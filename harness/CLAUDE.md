# CLAUDE.md

Project-level behavioral and engineering guidelines for AI coding agents working on this product intelligence platform.

These instructions combine the four core behavioral principles (Think Before Coding, Simplicity First, Surgical Changes, and Goal-Driven Execution) with project-specific architecture, security, testing, and delivery requirements.

**Tradeoff:** These guidelines bias toward correctness, safety, and maintainability over speed. Use judgment for trivial changes, but never skip essential security or verification steps.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- Restate the task internally in terms of the expected user-visible or system behavior.
- Identify assumptions and uncertainties. Ask a focused question when an ambiguity materially affects the implementation.
- If multiple interpretations exist, explain the options rather than silently choosing one.
- Consider whether the requested change is necessary and whether a simpler solution exists.
- Push back respectfully when a requested approach conflicts with requirements, security, reliability, or the existing architecture.
- For multi-step work, provide a brief plan with verification criteria.

Do not ask questions whose answers are already available in the task, project documentation, or codebase.

## 2. Understand Before Changing

**Inspect the existing system before proposing or modifying it.**

Before coding:

- Read the relevant project instructions and the applicable PRD, architecture, LLD, user story, and acceptance criteria.
- Inspect the relevant source files, tests, data models, API contracts, and callers.
- Follow existing conventions and established patterns unless they are demonstrably unsuitable.
- Trace the affected flow across frontend, API, persistence, queues, workers, and analytics where relevant.
- Identify dependencies, downstream consumers, compatibility requirements, and likely regression areas.
- Do not invent existing functionality, schema fields, endpoints, environment variables, or infrastructure resources.

If documentation and implementation disagree, report the discrepancy and determine which is authoritative before making a consequential change.

## 3. Simplicity First

**Write the minimum code that correctly solves the problem. Nothing speculative.**

- Do not add features beyond the request or acceptance criteria.
- Avoid abstractions for single-use code.
- Do not introduce flexibility, configurability, frameworks, dependencies, or extension points without a demonstrated need.
- Prefer clear, direct implementations over clever or unnecessarily generic designs.
- Avoid duplicating existing functionality; reuse established project utilities and patterns where appropriate.
- Do not add defensive handling for impossible scenarios, but handle realistic failures at system boundaries.
- If an implementation is more complicated than necessary, simplify it before finishing.

Simplicity must not come at the expense of security, data integrity, observability, scalability requirements, or maintainability.

## 4. Surgical Changes

**Touch only what the task requires. Clean up only your own mess.**

When editing existing code:

- Keep changes tightly scoped to the request.
- Do not refactor unrelated code, rename unrelated symbols, reformat entire files, or change unrelated comments.
- Match the existing style and conventions.
- Preserve public API contracts and existing behavior unless a change is explicitly required.
- Remove imports, variables, or functions made unused by your own changes.
- Do not remove pre-existing dead code unless asked.
- Do not overwrite, discard, or modify another developer's uncommitted work.
- Do not run destructive commands or broad automated rewrites without understanding their impact and obtaining approval where appropriate.

Every changed line should be traceable to the task, a necessary compatibility change, or a directly related test.

If an unrelated issue is discovered, report it separately rather than silently fixing it.

## 5. Goal-Driven Execution

**Define success criteria and continue until the result is verified.**

Translate requests into observable outcomes:

- "Add validation" means invalid inputs are rejected and valid inputs continue to work.
- "Fix a bug" means a test reproduces the issue and passes after the fix.
- "Add an API" means its contract, authorization, validation, persistence, and error behavior are verified as applicable.
- "Refactor" means relevant behavior remains unchanged and regression checks pass.
- "Add an analytics insight" means the underlying calculation is correct and the displayed result is traceable to source data.

For multi-step tasks, state a concise plan:

```text
1. Inspect the existing implementation
   Verify: identify relevant modules, contracts, and constraints.

2. Implement the smallest scoped change
   Verify: code follows project patterns and acceptance criteria.

3. Test and inspect the diff
   Verify: relevant tests pass; no unrelated changes are included.

4. Report the outcome
   Verify: changed files, checks, and remaining limitations are stated.
```

Do not claim completion merely because code was generated.

## 6. Testing Discipline

**Tests and verification are part of implementation, not optional follow-up work.**

- Follow the repository's existing test framework, test organization, and naming conventions.
- Add or update tests for changed behavior.
- For bug fixes, add a regression test where practical.
- Cover relevant happy paths, validation failures, authorization failures, boundary conditions, and realistic error cases.
- Use unit tests for isolated logic, integration tests for component boundaries, and end-to-end tests for critical user journeys where the project supports them.
- Do not weaken, delete, skip, or rewrite tests merely to make a change pass.
- Do not mock away the behavior that the test is intended to verify.
- Run the narrowest relevant tests first, then broader checks when appropriate.
- Run linting, type checking, build checks, and relevant test suites when available and proportionate to the change.
- If a check cannot be run, state why. Never imply it passed.

For analytics calculations, test aggregation logic with known input events and expected output values. For AI-generated recommendations, test schema validation and deterministic safeguards independently of model quality.

## 7. Project Architecture and Technology Boundaries

**Respect the approved architecture. Do not change architectural decisions silently.**

This project is a multi-tenant SaaS platform for product intelligence. It collects structured product usage events, analyzes behavior, surfaces insights, and generates AI-backed product improvement recommendations. AI recommendations are advisory; humans make the decisions.

Approved baseline:

- **Frontend:** Next.js.
- **Backend/API:** NestJS deployed on AWS Lambda behind API Gateway.
- **Application database:** Amazon RDS PostgreSQL, using Prisma. Use RDS Proxy where appropriate for Lambda connection management.
- **Event ingestion and buffering:** Amazon SQS with a dead-letter queue (DLQ).
- **Event processing:** AWS Lambda.
- **Behavioral event analytics:** ClickHouse.
- **Scheduled analysis:** Amazon EventBridge.
- **AI:** Amazon Bedrock.
- **Object storage:** Amazon S3.
- **Monitoring and logs:** Amazon CloudWatch.

Architecture boundaries:

- PostgreSQL is the source of truth for application state, users, organizations, projects, configuration, and recommendation workflow state.
- ClickHouse is the analytical store for behavioral events and event-derived analytics.
- SQS buffers ingestion and decouples API acceptance from downstream processing.
- EventBridge triggers scheduled analysis workflows.
- Bedrock receives bounded, validated, aggregated analytical context; it must not receive raw event streams by default.
- S3 is for appropriate object storage, not a substitute for transactional application data.
- Do not introduce Redis, Step Functions, another database, or another queue unless a concrete requirement justifies it and the architecture owner approves the change.
- Do not move responsibilities between services or change the approved data ownership model without documenting the reason and impact.

When a task appears to require an architectural change, explain the options, operational consequences, cost implications, and migration requirements before implementing it.

## 8. Event Ingestion and Data Integrity

**Treat event correctness, delivery semantics, and tenant boundaries as first-class requirements.**

- Assume SQS/Lambda processing is at-least-once. Design consumers to tolerate retries and duplicate delivery.
- Implement or preserve an explicit idempotency/deduplication strategy appropriate to the event model.
- Do not assume a standard ClickHouse MergeTree table guarantees uniqueness or exactly-once processing.
- Be clear about ingestion acknowledgement semantics: accepting an event into SQS does not mean it has already been persisted to ClickHouse or included in analytics.
- Validate event structure, required fields, supported event types, payload size, timestamps, and project credentials at the ingestion boundary.
- Handle malformed events and processing failures through defined error and DLQ behavior; avoid silently dropping data.
- Preserve event schema compatibility. Version event schemas when changes could break existing SDKs or consumers.
- Avoid logging full event payloads when they may contain user data.
- Do not fabricate analytics values or infer behavior unsupported by collected events.

## 9. Analytics and AI Recommendation Integrity

**Every insight must be grounded in evidence; AI must not invent facts.**

- Calculate metrics and aggregates using deterministic, testable analytics logic.
- Provide the AI model with bounded, relevant, validated aggregates and context rather than unrestricted raw event data.
- Treat model output as untrusted input. Validate it against an explicit schema before storing or displaying it.
- Validate every numerical claim, metric, trend, percentage, and comparison against the source analytics.
- If evidence is insufficient, represent uncertainty or return no recommendation rather than inventing an explanation.
- Clearly distinguish observed facts, calculated metrics, hypotheses, and AI-generated suggestions.
- Recommendations are advisory only. Do not autonomously change product configuration, code, user accounts, or customer-facing behavior.
- Preserve human review and decision-making in the recommendation workflow.
- Use the agreed recommendation priority model, Reach × Impact × Confidence, only as a relative ranking score. It is not a probability or guarantee.
- Keep prompts, model configuration, output schemas, and evaluation logic maintainable and versioned where appropriate.
- Do not expose secrets, credentials, or unnecessary personal data in prompts or model context.

## 10. Multi-Tenant Security and Privacy

**Never weaken tenant isolation or data protection for implementation convenience.**

- Enforce organization/project authorization on every relevant API, query, job, export, and background processing path.
- Never rely only on frontend checks for authorization.
- Ensure tenant identity is derived from authenticated and authorized server-side context, not blindly trusted from request payloads.
- Keep PostgreSQL, ClickHouse, queue messages, analytics jobs, AI context, exports, and deletion workflows tenant-aware.
- Tracking API keys must be stored as hashes, revocable/rotatable, scoped to ingestion, and must not grant administrative access.
- Never hardcode credentials, API keys, tokens, or secrets. Use approved secret-management and environment configuration patterns.
- Do not log passwords, tokens, secrets, payment details, or sensitive event content.
- Do not collect passwords, payment details, or sensitive form contents through event tracking.
- Apply consent-aware tracking and the project's data retention, deletion, and privacy requirements.
- Consider applicable privacy obligations, including India's DPDP requirements and GDPR where relevant to the customer or data subject.
- Validate access control for cross-tenant reads and writes, including indirect paths such as exports and background jobs.
- Treat all customer-provided event data and AI-generated content as untrusted.

If a requested change weakens tenant isolation, credential safety, or privacy controls, stop and explain the risk.

## 11. API, Database, and Compatibility Practices

- Follow existing NestJS module, controller, service, DTO, validation, and exception-handling patterns.
- Keep API contracts explicit and consistent. Avoid breaking changes unless requested and planned.
- Validate and authorize inputs at the server boundary.
- Use Prisma and the established migration workflow for PostgreSQL schema changes.
- Never modify production data or run destructive migrations without explicit authorization and a reviewed migration plan.
- Consider indexes, query patterns, transaction boundaries, connection limits, and Lambda execution behavior when changing persistence logic.
- Keep ClickHouse query and table changes aligned with event volume, partitioning, ordering, retention, and query access patterns.
- Avoid N+1 queries and unbounded reads.
- Use pagination or bounded result sets for potentially large collections.
- Make retry behavior safe for operations that may be executed more than once.
- Document necessary API or event-schema compatibility changes.

## 12. Frontend and User Experience

- Follow the existing Next.js application structure, component patterns, styling system, and data-fetching conventions.
- Keep components focused and avoid unnecessary state-management abstractions.
- Handle loading, empty, success, and error states for user-facing data flows.
- Do not display fabricated, placeholder, or misleading analytics as real customer data.
- Clearly label AI-generated recommendations and distinguish them from measured product analytics.
- Preserve accessibility, responsive behavior, and existing user workflows.
- Do not add UI features beyond the story's acceptance criteria.

## 13. Context and Documentation Preservation

**Use project documentation as working context, not as a replacement for inspecting the code.**

- Follow the current PRD, architecture, LLD, user stories, and acceptance criteria relevant to the task.
- Check for existing decisions before proposing alternatives.
- Do not silently change documented product scope or architecture.
- Update documentation when the task changes a contract, schema, architecture decision, operational procedure, or user-visible behavior that the documentation describes.
- Keep updates focused; do not rewrite unrelated documents.
- If implementation reveals that a requirement or design is infeasible, report the conflict and propose a documented resolution.
- Do not invent decisions or claim that a decision was approved when it was not.

For multi-session work, leave concise, durable notes about important decisions, incomplete work, and verification status in the project's designated documentation or task-tracking system.

## 14. Transparent Reporting

**Make the result easy for a developer or reviewer to understand.**

At the end of a task, report:

1. **Summary:** What behavior was implemented or changed.
2. **Files changed:** The main files and their purpose.
3. **Important decisions:** Assumptions or tradeoffs that affected the implementation.
4. **Verification:** Tests, lint, type checks, builds, or manual checks actually executed, with outcomes.
5. **Limitations:** Checks not run, unresolved issues, risks, or follow-up work.

Keep the report concise and factual. Do not claim tests passed unless they were executed and passed.

---

## Definition of Done

A task is complete only when all applicable conditions are satisfied:

- [ ] The implementation meets the requested behavior and acceptance criteria.
- [ ] The solution follows the approved architecture and existing project conventions.
- [ ] Changes are limited to the task and necessary related updates.
- [ ] Relevant tests have been added or updated.
- [ ] Relevant tests and checks have been executed, or unrun checks are explicitly disclosed.
- [ ] Authorization, tenant isolation, privacy, and security implications have been considered.
- [ ] API, event, database, and documentation contracts are updated when required.
- [ ] No unrelated changes or destructive operations have been introduced.
- [ ] The final report accurately describes changes, verification, and remaining limitations.

**These guidelines are working if:** changes are smaller and easier to review, agents inspect before editing, requirements are clarified before risky implementation, analytics and AI outputs remain evidence-based, tenant boundaries stay intact, and completion claims are backed by actual verification.
