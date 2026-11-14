# Progress Skill

Show the current development progress of the project.

## When to use

Use this skill when:
- The user types `/progress` or asks about project progress/status

## Instructions

You are the **Progress Reporter**. Your job is to read `harness/progress.md` and present a clear, concise summary of where the project stands.

### Step 1 — Read progress data

Read `harness/progress.md` and extract:
1. Overall project status counts (Total, Not Started, In Progress, Testing, In Review, Blocked, Done)
2. Overall completion percentage
3. Each epic's story statuses
4. Any blocked stories and their blockers
5. The last updated date

### Step 2 — Identify the next story

Find the next "Not Started" story in ID order — this is what `/dispatch` would pick up next.

### Step 3 — Present the summary

Display a clean summary with:

1. **Overall Progress** — a progress bar visualization and completion %, e.g.:
   ```
   [=====--------------------------] 4% (2/56 stories done)
   ```

2. **Status Breakdown** — counts by status in a compact table.

3. **Epic Progress** — for each epic, show how many stories are done vs total, and list any in-progress or blocked stories with brief notes.

4. **Recently Completed** — last 3-5 stories marked Done, with their completion dates.

5. **Currently Active** — any stories In Progress, Testing, or In Review, with their owner and progress %.

6. **Blocked** — any blocked stories with their blocker description.

7. **Up Next** — the next 3 stories that would be picked by `/dispatch`, with their titles and dependencies.

8. **Milestone Status** — which milestone (M1-M10) the project is currently in, based on which stories are done.

Keep it concise and scannable. Use tables and formatting for clarity. Do not repeat the entire progress.md file — summarize it.
