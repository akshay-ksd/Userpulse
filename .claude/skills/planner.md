# Planner Skill

Plan a user story and produce a development task file in `harness/tasks/`.

## When to use

Use this skill when:
- The user types `/planner` or asks to plan a specific user story
- The `dispatch` skill delegates planning for the next story

## Instructions

You are the **Planner Agent**. Your job is to take a single user story from `harness/user-stories.md` and produce a comprehensive development task file in `harness/tasks/`.

### Step 1 — Identify the story

If a story ID is provided (e.g. `US-003`), use that. Otherwise, read `harness/progress.md` and pick the **next story with status "Not Started"**, in ID order (US-003, US-004, US-005, ...). Skip stories already marked Done, In Progress, Testing, In Review, or Blocked.

### Step 2 — Gather context

Before writing the task, read and understand:

1. **The story** from `harness/user-stories.md` — its acceptance criteria, priority, and epic.
2. **The PRD** (`harness/prd.md`) — the relevant functional requirements section.
3. **The architecture** (`harness/architecture.md`) — relevant components, data ownership, boundaries.
4. **The milestone** (`harness/milestone.md`) — which milestone this story belongs to and its exit criteria.
5. **The current codebase** — inspect the relevant `apps/`, `packages/` directories to understand what exists today. Read key files, check existing patterns, modules, and conventions.
6. **Existing task files** — read 1-2 completed task files in `harness/tasks/` to match the format and depth.
7. **Dependencies** — check `harness/progress.md` for upstream story statuses. If a dependency is not Done, note it as a blocker.
8. **CLAUDE.md** (`harness/CLAUDE.md`) — follow all project guidelines.
9. **AGENTS.md** files — read `apps/api/AGENTS.md` and `apps/web/AGENTS.md` for technology-specific guidance.

### Step 3 — Write the task file

Create `harness/tasks/US-{ID}-{slug}.md` following the exact format of existing task files (e.g. `US-001-register-account.md`, `US-002-sign-in.md`). The file must include:

1. **Header** — Story ID, epic, priority, milestone, source reference, status (Not Started), created date.
2. **Story** — The user story verbatim from `user-stories.md`.
3. **Acceptance criteria** — Listed as unchecked checkboxes `- [ ]`.
4. **Story review** — Your analysis of the story: scope boundaries, assumptions, decisions, edge cases, what is in/out of scope. Be specific about implementation choices.
5. **Current codebase state** — What exists today that this story builds on. Mention specific files, modules, patterns, and their state. Verify by reading actual files.
6. **Dependencies** — Upstream (what must be done first) and downstream (what depends on this).
7. **Implementation subtasks** — Numbered sections broken by layer (Database, API, Web, Tests, etc.). Each subtask is an unchecked checkbox `- [ ]` with specific implementation guidance:
   - Exact file paths where code should be added/modified
   - Module/service/controller names
   - Validation rules, error codes, response shapes
   - Database changes (Prisma models, migrations)
   - API endpoints (method, path, request/response shape, status codes)
   - Web pages/components (routes, states, behavior)
   - Test cases to write (unit, e2e, what to assert)
8. **Verification** — Exact commands to run and manual checks to perform.
9. **Definition of Done** — Checkboxes matching the project's DoD.
10. **Assumptions / open questions** — Decisions made and things to confirm.

### Step 4 — Update progress.md

After creating the task file:

1. In `harness/progress.md`, find the story row and update:
   - **Story title**: Copy the actual title from `user-stories.md` (replace "Copy from `user-stories.md`")
   - **Status**: Keep as "Not Started" (the builder will change it)
   - **Blocker / Next action**: "Task created: `harness/tasks/US-{ID}-{slug}.md`"
2. Do NOT change the status to "In Progress" — that's the builder's job.

### Output

After completing the plan, report:
- Which story was planned (ID and title)
- The task file path created
- Key implementation decisions made
- Any blockers or dependencies noted
- Confirmation that progress.md was updated
