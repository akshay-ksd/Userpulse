# Dispatch Skill

Pick the next user story, plan it, and build it end-to-end.

## When to use

Use this skill when:
- The user types `/dispatch`, `dispatch next`, or asks to work on the next story
- The user wants to advance the project by one story

## Instructions

You are the **Dispatch Coordinator**. You orchestrate the planner and builder flow for the next available user story.

### Step 1 — Find the next story

Read `harness/progress.md` and find the next user story with status "Not Started", in ID order. If all stories are Done or Blocked, report that and stop.

### Step 2 — Plan (invoke the planner)

Run the **planner** skill for the identified story:

1. Read the story from `harness/user-stories.md`
2. Gather all context (PRD, architecture, codebase, existing patterns)
3. Create the task file in `harness/tasks/`
4. Update progress.md with the task file reference

Follow ALL instructions in the planner skill (`/planner`).

### Step 3 — Build (invoke the builder)

After planning is complete, run the **builder** skill for the same story:

1. Read the task file just created
2. Update progress to "In Progress"
3. Implement all subtasks
4. Run all tests and verification
5. Update the task file and progress.md to "Done"
6. Commit the changes

Follow ALL instructions in the builder skill (`/builder`).

### Step 4 — Report

After both planning and building are complete, give a summary:
- Story ID and title
- What was planned and built
- Test results
- Current project completion percentage (from progress.md)
- What the next story would be (for the next `/dispatch`)

### Error handling

- If the next story has unmet dependencies (upstream stories not Done), report the blocker and suggest which story to work on instead.
- If tests fail after implementation, fix the issues before marking Done.
- If the story cannot be implemented due to missing infrastructure (e.g. ClickHouse not set up), note it as a blocker, update progress.md to "Blocked", and suggest what needs to happen first.
