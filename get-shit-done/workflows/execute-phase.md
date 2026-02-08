<purpose>
Execute all plans in a phase using team-based parallel execution with wave dependencies. Orchestrator creates an execution team, spawns per-plan executor teammates and a verifier teammate, coordinates via shared task lists and direct messaging. Falls back to sequential subagent spawning if Agent Teams is unavailable.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. In team mode: create team, create tasks with dependency chains, spawn teammates, monitor via TaskList, handle checkpoints via messaging. In fallback mode: sequential wave execution via subagent spawning. File-based artifacts remain the persistent state layer in both modes.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
</required_reading>

<process>

<step name="initialize" priority="first">
Load all context in one call:

```bash
INIT=$(node /Users/naveennegi/.claude/get-shit-done/bin/gsd-tools.js init execute-phase "${PHASE_ARG}")
```

Parse JSON for: `executor_model`, `verifier_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `state_exists`, `roadmap_exists`.

**If `phase_found` is false:** Error — phase directory not found.
**If `plan_count` is 0:** Error — no plans found in phase.
**If `state_exists` is false but `.planning/` exists:** Offer reconstruct or continue.

When `parallelization` is false, plans within a wave execute sequentially.
</step>

<step name="handle_branching">
Check `branching_strategy` from init:

**"none":** Skip, continue on current branch.

**"phase" or "milestone":** Use pre-computed `branch_name` from init:
```bash
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

All subsequent commits go to this branch. User handles merging.
</step>

<step name="validate_phase">
From init JSON: `phase_dir`, `plan_count`, `incomplete_count`.

Report: "Found {plan_count} plans in {phase_dir} ({incomplete_count} incomplete)"
</step>

<step name="discover_and_group_plans">
Load plan inventory with wave grouping in one call:

```bash
PLAN_INDEX=$(node /Users/naveennegi/.claude/get-shit-done/bin/gsd-tools.js phase-plan-index "${PHASE_NUMBER}")
```

Parse JSON for: `phase`, `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `files_modified`, `task_count`, `has_summary`), `waves` (map of wave number → plan IDs), `incomplete`, `has_checkpoints`.

**Filtering:** Skip plans where `has_summary: true`. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete plans" → exit.

Report:
```
## Execution Plan

**Phase {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="execute_waves">

After discover_and_group_plans, attempt team creation for coordinated execution.

## Team Creation (or Fallback)

```
TeamCreate({ team_name: "gsd-exec-{phase_number}", description: "Execution team for Phase {phase_number}: {phase_name}" })
```

---

### TEAM MODE (if TeamCreate succeeds)

**Create ALL tasks upfront with dependency chains:**

```
For each wave (1, 2, 3, ...):
  For each plan in wave:
    task = TaskCreate({
      subject: "Execute Plan {plan_id}: {plan_objective}",
      description: "Execute {plan_file}. Commit each task atomically. Create SUMMARY.md.",
      activeForm: "Executing plan {plan_id}"
    })
    # If wave > 1, add dependencies on all tasks from previous wave
    If wave > 1:
      TaskUpdate({ taskId: task.id, addBlockedBy: [all task IDs from previous wave] })

# Verifier task depends on ALL execution tasks
verifier_task = TaskCreate({
  subject: "Verify phase {phase_number} goal achievement",
  description: "Check must_haves against actual codebase. Create VERIFICATION.md.",
  activeForm: "Verifying phase goal",
  addBlockedBy: [all execution task IDs]
})
```

**Spawn executor teammates (one per plan, all at once):**

```
For each plan (across all waves):
  Task(
    team_name: "gsd-exec-{phase_number}",
    name: "executor-{plan_id}",
    subagent_type: "gsd-executor",
    prompt: "
      <objective>
      Execute plan {plan_number} of phase {phase_number}-{phase_name}.
      You are a teammate on an execution team. Check TaskList() for your task.
      Your task may be blocked — wait until it becomes available, then claim and execute.
      Commit each task atomically. Create SUMMARY.md. Update STATE.md.
      </objective>

      <team_awareness>
      You are executor-{plan_id} on team gsd-exec-{phase_number}.
      Other executors may be running in parallel. If you modify a file that could affect others:
      - Broadcast a warning: SendMessage({ type: 'broadcast', content: 'Modified {file}', summary: '{file} changed' })
      If another executor broadcasts about a file you depend on, check your imports.
      </team_awareness>

      <execution_context>
      @/Users/naveennegi/.claude/get-shit-done/workflows/execute-plan.md
      @/Users/naveennegi/.claude/get-shit-done/templates/summary.md
      @/Users/naveennegi/.claude/get-shit-done/references/checkpoints.md
      @/Users/naveennegi/.claude/get-shit-done/references/tdd.md
      </execution_context>

      <files_to_read>
      Read these files at execution start using the Read tool:
      - Plan: {phase_dir}/{plan_file}
      - State: .planning/STATE.md
      - Config: .planning/config.json (if exists)
      </files_to_read>
    "
  )
```

**Spawn verifier teammate:**

```
Task(
  team_name: "gsd-exec-{phase_number}",
  name: "verifier",
  subagent_type: "gsd-verifier",
  prompt: "
    You are the verifier on an execution team. Check TaskList() for your task.
    Your task is blocked until all executors complete. When unblocked, claim and verify.

    IMPORTANT: If you find discrepancies between SUMMARY.md claims and codebase:
    - Message the specific executor: SendMessage({ type: 'message', recipient: 'executor-{plan_id}', content: 'Discrepancy: ...', summary: 'Verification discrepancy' })
    - Wait for response before marking as gap

    Phase directory: {phase_dir}
    Phase goal: {goal from ROADMAP.md}
    Check must_haves against actual codebase. Create VERIFICATION.md.
  "
)
```

**Orchestrator monitoring in team mode:**

```
Monitor team progress:
- Use TaskList() to check task statuses
- Report wave completions as tasks complete (same wave completion banners as current)
- For each completed execution task, run the same spot-checks:
  * Verify SUMMARY.md exists
  * Check git commits present
  * Check for Self-Check: FAILED marker
- Handle checkpoint plans: if a task requires human interaction, the executor sends a message to the team lead
- When verifier task completes, read VERIFICATION.md status
```

**Checkpoint handling in team mode:**

Checkpoint plans (autonomous: false) in team mode work as follows:
- The executor reaches a checkpoint and messages the team lead:
  `SendMessage({ type: "message", recipient: "team-lead", content: "CHECKPOINT: {type}\n{details}\nAwaiting user input.", summary: "Checkpoint reached" })`
- The orchestrator (lead) presents the checkpoint to the user (same as current step 4 of checkpoint_handling)
- After user responds, the orchestrator messages the executor:
  `SendMessage({ type: "message", recipient: "executor-{plan_id}", content: "User response: {response}\nContinue execution.", summary: "Checkpoint resolved" })`
- The executor continues from where it paused (advantage: same session, no context loss)

**Shutdown sequence (team mode):**

```
After all tasks complete and verification done:
For each teammate:
  SendMessage({ type: "shutdown_request", recipient: teammate, content: "Phase execution complete" })
  # Wait for shutdown_response
TeamDelete()
```

---

### FALLBACK MODE (if TeamCreate fails)

Display: `Agent Teams unavailable. Using sequential subagent mode.`

Execute each wave in sequence. Within a wave: parallel if `PARALLELIZATION=true`, sequential if `false`.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each plan's `<objective>`. Extract what's being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

2. **Spawn executor agents:**

   Pass paths only — executors read files themselves with their fresh 200k context.
   This keeps orchestrator context lean (~10-15%).

   ```
   Task(
     subagent_type="gsd-executor",
     model="{executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md.
       </objective>

       <execution_context>
       @/Users/naveennegi/.claude/get-shit-done/workflows/execute-plan.md
       @/Users/naveennegi/.claude/get-shit-done/templates/summary.md
       @/Users/naveennegi/.claude/get-shit-done/references/checkpoints.md
       @/Users/naveennegi/.claude/get-shit-done/references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - Plan: {phase_dir}/{plan_file}
       - State: .planning/STATE.md
       - Config: .planning/config.json (if exists)
       </files_to_read>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] SUMMARY.md created in plan directory
       - [ ] STATE.md updated with position and decisions
       </success_criteria>
     "
   )
   ```

3. **Wait for all agents in wave to complete.**

4. **Report completion — spot-check claims first:**

   For each SUMMARY.md:
   - Verify first 2 files from `key-files.created` exist on disk
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns >=1 commit
   - Check for `## Self-Check: FAILED` marker

   If ANY spot-check fails: report which plan failed, route to failure handler — ask "Retry plan?" or "Continue with remaining waves?"

   If pass:
   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

   - Bad: "Wave 2 complete. Proceeding to Wave 3."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

5. **Handle failures:**

   **Known Claude Code bug (classifyHandoffIfNeeded):** If an agent reports "failed" with error containing `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a GSD or agent issue. The error fires in the completion handler AFTER all tool calls finish. In this case: run the same spot-checks as step 4 (SUMMARY.md exists, git commits present, no Self-Check: FAILED). If spot-checks PASS → treat as **successful**. If spot-checks FAIL → treat as real failure below.

   For real failures: report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.

6. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

7. **Proceed to next wave.**
</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Team mode checkpoint flow:**

1. Executor reaches checkpoint, messages team lead via SendMessage
2. Team lead receives message, presents checkpoint to user:
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from executor message]
   [Awaiting section from executor message]
   ```
3. User responds: "approved"/"done" | issue description | decision selection
4. Team lead messages executor with user response:
   `SendMessage({ type: "message", recipient: "executor-{plan_id}", content: "User response: {response}\nContinue execution.", summary: "Checkpoint resolved" })`
5. Executor continues from where it paused (same session, full context preserved)

**Fallback mode checkpoint flow:**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate → returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited
4. **Present to user:**
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from agent return]
   [Awaiting section from agent return]
   ```
5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops

**Why team mode is better for checkpoints:** The executor maintains its full session context across the checkpoint pause. No need for a fresh continuation agent to reconstruct state.

**Why fresh agent in fallback, not resume:** Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable.

**Checkpoints in parallel waves:** In team mode, executor pauses and waits for team lead response. Other parallel executors continue unaffected. In fallback mode, agent pauses and returns while others may complete. Present checkpoint, spawn continuation, wait for all before next wave.
</step>

<step name="aggregate_results">
After all waves (in both team and fallback modes):

```markdown
## Phase {X}: {Name} Execution Complete

**Waves:** {N} | **Plans:** {M}/{total} complete

| Wave | Plans | Status |
|------|-------|--------|
| 1 | plan-01, plan-02 | Complete |
| CP | plan-03 | Verified |
| 2 | plan-04 | Complete |

### Plan Details
1. **03-01**: [one-liner from SUMMARY.md]
2. **03-02**: [one-liner from SUMMARY.md]

### Issues Encountered
[Aggregate from SUMMARYs, or "None"]
```
</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed tasks.

**In team mode:** The verifier teammate handles this automatically (its task is blocked until all executors complete, then it runs verification and creates VERIFICATION.md). After the verifier task completes, read VERIFICATION.md status.

**In fallback mode:**

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}
Check must_haves against actual codebase. Create VERIFICATION.md.",
  subagent_type="gsd-verifier",
  model="{verifier_model}"
)
```

**Both modes — read status:**

```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/gsd:plan-phase {phase} --gaps` |

**If human_needed:**
```
## Phase {X}: {Name} — Human Verification Required

All automated checks passed. {N} items need human testing:

{From VERIFICATION.md human_verification section}

"approved" → continue | Report issues → gap closure
```

**If gaps_found:**
```
## Phase {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** {phase_dir}/{phase}-VERIFICATION.md

### What's Missing
{Gap summaries from VERIFICATION.md}

---
## Next Up

`/gsd:plan-phase {X} --gaps`

<sub>`/clear` first → fresh context window</sub>

Also: `cat {phase_dir}/{phase}-VERIFICATION.md` — full report
Also: `/gsd:verify-work {X}` — manual testing first
```

Gap closure cycle: `/gsd:plan-phase {X} --gaps` reads VERIFICATION.md → creates gap plans with `gap_closure: true` → user runs `/gsd:execute-phase {X} --gaps-only` → verifier re-runs.
</step>

<step name="update_roadmap">
Mark phase complete in ROADMAP.md (date, status).

```bash
node /Users/naveennegi/.claude/get-shit-done/bin/gsd-tools.js commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/phases/{phase_dir}/*-VERIFICATION.md .planning/REQUIREMENTS.md
```
</step>

<step name="offer_next">

**If more phases:**
```
## Next Up

**Phase {X+1}: {Name}** — {Goal}

`/gsd:plan-phase {X+1}`

<sub>`/clear` first for fresh context</sub>
```

**If milestone complete:**
```
MILESTONE COMPLETE!

All {N} phases executed.

`/gsd:complete-milestone`
```
</step>

</process>

<context_efficiency>
**Team mode:** Orchestrator stays lean (~10-15% context) as coordinator. Each teammate has fresh 200k context. Communication through TaskList and SendMessage, not context serialization.

**Fallback mode:** Same as before — orchestrator coordinates, subagents get fresh 200k each. No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
**Both modes:**
- **classifyHandoffIfNeeded false failure:** Agent reports "failed" but error is `classifyHandoffIfNeeded is not defined` → runtime bug, not GSD. Spot-check (SUMMARY exists, commits present) → if pass, treat as success
- **Agent fails mid-plan:** Missing SUMMARY.md → report, ask user how to proceed
- **Dependency chain breaks:** Wave 1 fails → Wave 2 dependents likely fail → user chooses attempt or skip
- **All agents in wave fail:** Systemic issue → stop, report for investigation
- **Checkpoint unresolvable:** "Skip this plan?" or "Abort phase execution?" → record partial progress in STATE.md

**Team mode additional:**
- **Teammate crash:** If a teammate stops responding, check TaskList for its task status. If task is still in_progress with no recent updates, message the teammate. If no response, mark the task as failed and offer to spawn a replacement executor as a standalone subagent (fallback for that specific plan)
- **Team creation failure mid-execution:** Not possible — team is created once at the start. If the team becomes unstable, complete current wave then fall back to subagent mode for remaining waves
- **Message delivery failure:** If SendMessage fails, fall back to TaskList polling for coordination. Task dependency chains still enforce wave ordering regardless of messaging
</failure_handling>

<resumption>
Re-run `/gsd:execute-phase {phase}` → discover_plans finds completed SUMMARYs → skips them → resumes from first incomplete plan → continues wave execution.

**Team mode resumption:** A new team is created for the remaining plans. Completed plans (with SUMMARYs) are skipped. Task dependency chains are recalculated from the remaining waves only.

**Fallback mode resumption:** Same as before — sequential wave execution from first incomplete plan.

STATE.md tracks: last completed plan, current wave, pending checkpoints.
</resumption>
