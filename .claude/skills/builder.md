# Builder Skill

Implement a planned user story from its task file in `harness/tasks/`.

## When to use

Use this skill when:
- The user types `/builder` or asks to build/implement a specific story
- The `dispatch` skill delegates building after planning

## Instructions

You are the **Builder Agent**. Your job is to implement a user story following its task file exactly, then verify and update progress.

### Step 1 — Identify the task

If a story ID is provided (e.g. `US-003`), find its task file in `harness/tasks/`. Otherwise, read `harness/progress.md` and pick the next story that:
- Has a task file created (check `harness/tasks/` for a matching file)
- Has status "Not Started" or the blocker says "Task created: ..."

### Step 2 — Read and understand

Before writing any code:

1. **Read the task file thoroughly** — every section, every subtask, every acceptance criterion.
2. **Read `harness/CLAUDE.md`** — follow all project guidelines.
3. **Read `apps/api/AGENTS.md` and `apps/web/AGENTS.md`** — technology-specific conventions.
4. **Inspect the current codebase** — read the files mentioned in the task's "Current codebase state" section. Verify the state matches what the task describes.
5. **Check dependencies** — verify upstream stories are Done in `progress.md`. If not, report the blocker and stop.

### Step 3 — Update progress to In Progress

Update `harness/progress.md` immediately:
- **Status**: "In Progress"
- **Progress**: "10%"
- **Owner / Agent**: "Claude Code agent"
- **Started**: today's date
- **Updated**: today's date
- **Blocker / Next action**: "Implementation underway"

Add an entry to the **Development activity log** at the top (newest first):
```
| YYYY-MM-DD | US-XXX | Implementation started | Not Started → In Progress | Claude Code agent |
```

Update the **Overall project status** counts.

### Step 4 — Implement

Follow the task file's implementation subtasks in order. For each subtask:

1. **Implement** the change as described.
2. **Check off** the subtask in the task file as you complete it (`- [x]`).
3. **Follow project conventions** — match existing code patterns, naming, file structure.
4. **Update progress** in `progress.md` periodically (update the Progress percentage based on completed acceptance criteria).

Key implementation rules (from `harness/CLAUDE.md`):
- Surgical changes — touch only what the task requires
- Simplicity first — minimum code that correctly solves the problem
- Security — never weaken tenant isolation, never expose secrets
- Use existing patterns — match NestJS module/service/controller patterns, Prisma conventions, Next.js conventions
- ESM only — relative imports end in `.js`, use `vi.fn()` not `jest.fn()`

### Step 5 — Test and verify

Run all verification steps from the task file:

1. **Unit tests**: `pnpm --filter api test` (or relevant package)
2. **E2E tests**: `pnpm --filter api test:e2e` (if applicable)
3. **Lint**: `pnpm lint`
4. **Typecheck**: `pnpm typecheck`
5. **Build**: `pnpm build`
6. **Format**: `pnpm format:check`

If any check fails, fix the issue and re-run. Do not claim checks passed if they were not run.

### Step 6 — Update task file

After implementation and verification:

1. Check off all completed acceptance criteria in the task file.
2. Check off all completed subtasks.
3. Fill in the **Verification** section with actual test results (command run, pass/fail counts).
4. Check off the **Definition of Done** items.
5. Update the **Status** in the task header to "Done" with the date.

### Step 7 — Update progress.md

Update `harness/progress.md`:

1. **Story row**: Status → "Done", Progress → "100%", Updated → today's date, Blocker → "—"
2. **Story implementation notes** section: Add/update the subsection for this story following the template in progress.md. Include:
   - All acceptance criteria checked off with brief descriptions
   - Implementation notes (key files changed, decisions made)
   - Verification results (exact commands and outcomes)
   - Blockers/follow-up items
   - Completion note
3. **Development activity log**: Add completion entry.
4. **Overall project status**: Update the counts (increment Done, decrement Not Started, recalculate completion %).

### Step 8 — Commit

Stage and commit the changes with a descriptive message following the project's git conventions. Include:
- What was implemented (story ID and title)
- Key files changed
- Test results summary

### Output

After completing the build, report:
- Which story was implemented (ID and title)
- Summary of what was built
- Files changed
- Test results (commands and pass/fail)
- Any follow-up items or deferred work
- Confirmation that progress.md and the task file were updated
