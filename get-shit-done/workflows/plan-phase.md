<purpose>
Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification. Default flow: Research (if needed) -> Plan -> Verify -> Done. Orchestrates gsd-phase-researcher, gsd-planner, and gsd-plan-checker agents as a team with direct messaging, falling back to sequential subagent spawning if Agent Teams is unavailable. Revision loop max 3 iterations — in team mode, planner and checker collaborate directly; in fallback mode, orchestrator mediates.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@~/.claude/get-shit-done/references/ui-brand.md
</required_reading>

<process>

## 1. Initialize

Load all context in one call (include file contents to avoid redundant reads):

```bash
INIT=$(node ~/.claude/get-shit-done/bin/gsd-tools.js init plan-phase "$PHASE" --include state,roadmap,requirements,context,research,verification,uat)
```

Parse JSON for: `researcher_model`, `planner_model`, `checker_model`, `research_enabled`, `plan_checker_enabled`, `commit_docs`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `padded_phase`, `has_research`, `has_context`, `has_plans`, `plan_count`, `planning_exists`, `roadmap_exists`.

**File contents (from --include):** `state_content`, `roadmap_content`, `requirements_content`, `context_content`, `research_content`, `verification_content`, `uat_content`. These are null if files don't exist.

**If `planning_exists` is false:** Error — run `/gsd:new-project` first.

## 2. Parse and Normalize Arguments

Extract from $ARGUMENTS: phase number (integer or decimal like `2.1`), flags (`--research`, `--skip-research`, `--gaps`, `--skip-verify`).

**If no phase number:** Detect next unplanned phase from roadmap.

**If `phase_found` is false:** Validate phase exists in ROADMAP.md. If valid, create the directory using `phase_slug` and `padded_phase` from init:
```bash
mkdir -p ".planning/phases/${padded_phase}-${phase_slug}"
```

**Existing artifacts from init:** `has_research`, `has_plans`, `plan_count`.

## 3. Validate Phase

```bash
PHASE_INFO=$(node ~/.claude/get-shit-done/bin/gsd-tools.js roadmap get-phase "${PHASE}")
```

**If `found` is false:** Error with available phases. **If `found` is true:** Extract `phase_number`, `phase_name`, `goal` from JSON.

## 4. Load CONTEXT.md

Use `context_content` from init JSON (already loaded via `--include context`).

**CRITICAL:** Use `context_content` from INIT — pass to researcher, planner, checker, and revision agents.

If `context_content` is not null, display: `Using phase context from: ${PHASE_DIR}/*-CONTEXT.md`

## 5. Handle Research Decision

**Skip research if:** `--gaps` flag, `--skip-research` flag, or `research_enabled` is false (from init) without `--research` override.

**If `has_research` is true (from init) AND no `--research` flag:** Use existing, skip to step 6.

**If RESEARCH.md missing OR `--research` flag:** Mark `research_needed = true`. Research will be spawned in step 8 (team mode) or step 8 fallback (subagent mode).

## 6. Check Existing Plans

```bash
ls "${PHASE_DIR}"/*-PLAN.md 2>/dev/null
```

**If exists:** Offer: 1) Add more plans, 2) View existing, 3) Replan from scratch.

## 7. Use Context Files from INIT

All file contents are already loaded via `--include` in step 1 (`@` syntax doesn't work across Task() boundaries):

```bash
# Extract from INIT JSON (no need to re-read files)
STATE_CONTENT=$(echo "$INIT" | jq -r '.state_content // empty')
ROADMAP_CONTENT=$(echo "$INIT" | jq -r '.roadmap_content // empty')
REQUIREMENTS_CONTENT=$(echo "$INIT" | jq -r '.requirements_content // empty')
RESEARCH_CONTENT=$(echo "$INIT" | jq -r '.research_content // empty')
VERIFICATION_CONTENT=$(echo "$INIT" | jq -r '.verification_content // empty')
UAT_CONTENT=$(echo "$INIT" | jq -r '.uat_content // empty')
CONTEXT_CONTENT=$(echo "$INIT" | jq -r '.context_content // empty')
```

## 8. Create Planning Team (or Fall Back to Subagents)

**Attempt team creation:**

```
TeamCreate({ team_name: "gsd-plan-{phase_number}", description: "Planning team for Phase {phase_number}: {phase_name}" })
```

---

### If TeamCreate succeeds — TEAM MODE

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PLANNING PHASE {X} (TEAM MODE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Team "gsd-plan-{phase_number}" created
◆ Spawning teammates...
```

#### 8a. Create tasks with dependency chain

```
# Only if research_needed is true (not skipped, not existing)
research_task_id = TaskCreate({
  subject: "Research phase {phase_number} domain",
  description: "Investigate technical domain for Phase {phase_number}. Write RESEARCH.md to {phase_dir}/{phase}-RESEARCH.md",
  activeForm: "Researching phase domain"
})
# Returns task ID (e.g., "1")

planning_task_id = TaskCreate({
  subject: "Create execution plans for phase {phase_number}",
  description: "Create PLAN.md files based on research and context. Phase dir: {phase_dir}",
  activeForm: "Creating execution plans",
  addBlockedBy: [research_task_id]  # blocked by research (omit addBlockedBy if research skipped)
})
# Returns task ID (e.g., "2")

# Only if --skip-verify is NOT set AND plan_checker_enabled is true
checker_task_id = TaskCreate({
  subject: "Verify plan quality for phase {phase_number}",
  description: "Check plans against phase goal using 7 verification dimensions. Plans dir: {phase_dir}",
  activeForm: "Verifying plan quality",
  addBlockedBy: [planning_task_id]  # blocked by planning
})
# Returns task ID (e.g., "3")
```

#### 8b. Spawn teammates

**Only if research_needed is true:**

```
Task(
  team_name: "gsd-plan-{phase_number}",
  name: "researcher",
  subagent_type: "gsd-phase-researcher",
  prompt: "First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\nYou are the researcher on a planning team. Check TaskList() for your task. Claim it with TaskUpdate and begin research.\n\n" + research_prompt_from_step_5_expanded
)
```

Where `research_prompt_from_step_5_expanded` is:

```markdown
<objective>
Research how to implement Phase {phase_number}: {phase_name}
Answer: "What do I need to know to PLAN this phase well?"
</objective>

<phase_context>
IMPORTANT: If CONTEXT.md exists below, it contains user decisions from /gsd:discuss-phase.
- **Decisions** = Locked — research THESE deeply, no alternatives
- **Claude's Discretion** = Freedom areas — research options, recommend
- **Deferred Ideas** = Out of scope — ignore

{context_content}
</phase_context>

<additional_context>
**Phase description:** {phase_description}
**Requirements:** {requirements}
**Prior decisions:** {decisions}
</additional_context>

<output>
Write to: {phase_dir}/{phase}-RESEARCH.md
</output>

<team_instructions>
When research is complete, update your task status to completed.
If you discover something the planner should know urgently, use SendMessage to notify them directly:
SendMessage({ type: "message", recipient: "planner", content: "...", summary: "..." })
</team_instructions>
```

**Always spawn planner:**

```
Task(
  team_name: "gsd-plan-{phase_number}",
  name: "planner",
  subagent_type: "general-purpose",
  prompt: "First, read ~/.claude/agents/gsd-planner.md for your role and instructions.\n\nYou are the planner on a planning team. Check TaskList() for your task. It is blocked until research completes (if research is being done). When unblocked, claim it and begin planning.\n\nIMPORTANT: If the researcher messages you with findings or you need clarification, use SendMessage to communicate directly.\n\n" + planner_prompt_expanded
)
```

Where `planner_prompt_expanded` is:

```markdown
<planning_context>
**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:** {state_content}
**Roadmap:** {roadmap_content}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: If context exists below, it contains USER DECISIONS from /gsd:discuss-phase.
- **Decisions** = LOCKED — honor exactly, do not revisit
- **Claude's Discretion** = Freedom — make implementation choices
- **Deferred Ideas** = Out of scope — do NOT include

{context_content}

**Research:** {research_content}
**Gap Closure (if --gaps):** {verification_content} {uat_content}
</planning_context>

<downstream_consumer>
Output consumed by /gsd:execute-phase. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>

<team_instructions>
When planning is complete, update your task status to completed.
If the checker sends you issues via SendMessage, revise the plans and notify them when done.

Revision loop limit: Maximum 3 iterations. Track iteration count.
- Iteration 1: Checker verifies initial plans, sends issues to you via SendMessage
- Iteration 2: You revise plans based on issues, notify checker via SendMessage; checker re-verifies
- Iteration 3: Final revision if needed
After 3 iterations: If the checker still reports issues, include remaining issues in your task completion message so the orchestrator can present options to the user.

When you receive a revision request from the checker:
1. Read the issues carefully
2. Make targeted updates to address checker issues (do NOT replan from scratch unless fundamental)
3. SendMessage({ type: "message", recipient: "checker", content: "Revised plans to address: [summary of fixes]. Please re-verify.", summary: "Plans revised, requesting re-check" })
</team_instructions>
```

**Only if --skip-verify is NOT set AND plan_checker_enabled is true, spawn checker:**

```
Task(
  team_name: "gsd-plan-{phase_number}",
  name: "checker",
  subagent_type: "gsd-plan-checker",
  prompt: "First, read ~/.claude/agents/gsd-plan-checker.md for your role and instructions.\n\nYou are the checker on a planning team. Check TaskList() for your task. It is blocked until planning completes. When unblocked, claim it and verify.\n\nIMPORTANT: Send issues directly to the planner via SendMessage. The planner will revise and message you back for re-verification. This is a direct collaboration — no orchestrator intermediary.\n\n" + checker_prompt_expanded
)
```

Where `checker_prompt_expanded` is:

```markdown
<verification_context>
**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}

**Plans to verify:** Read the PLAN.md files from {phase_dir}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: Plans MUST honor user decisions. Flag as issue if plans contradict.
- **Decisions** = LOCKED — plans must implement exactly
- **Claude's Discretion** = Freedom areas — plans can choose approach
- **Deferred Ideas** = Out of scope — plans must NOT include

{context_content}
</verification_context>

<expected_output>
After verification:
- If all checks pass: Update your task status to "completed" with message "VERIFICATION PASSED"
- If issues found: SendMessage to planner with structured issue list, then wait for their revision notification
</expected_output>

<team_instructions>
Revision loop limit: Maximum 3 iterations. Track iteration count.
- Iteration 1: Verify initial plans, send issues to planner if found
- Iteration 2: After planner notifies you of revisions, re-verify; send remaining issues if any
- Iteration 3: Final re-verification if needed
After 3 iterations: Mark your task as completed with message "ISSUES REMAIN: [list of remaining issues]" so the orchestrator can present options to the user.

When you find issues:
SendMessage({ type: "message", recipient: "planner", content: "Issues found:\n1. [issue]\n2. [issue]...", summary: "N issues found in plans" })

When planner notifies you of revisions:
1. Re-read the updated PLAN.md files
2. Verify the fixes address the reported issues
3. Check for any new issues introduced by the revisions
4. If all clear: update task to completed with "VERIFICATION PASSED"
5. If issues remain: SendMessage to planner again (increment iteration count)
</team_instructions>
```

#### 8c. Monitor team progress

The orchestrator monitors via TaskList(). Poll periodically to check task statuses.

**Monitoring logic:**

```
loop:
  tasks = TaskList()

  # Check if checker task exists and is completed
  if checker was spawned:
    checker_task = tasks.find(id == checker_task_id)
    if checker_task.status == "completed":
      if checker_task.completion_message contains "VERIFICATION PASSED":
        # Success — proceed to shutdown
        break
      if checker_task.completion_message contains "ISSUES REMAIN":
        # Max iterations reached, issues remain
        # Present to user (same as fallback step 12 max-iteration handling):
        Display: "Max iterations reached. Issues remain:"
        Display: remaining issues from checker's completion message
        Offer: 1) Force proceed, 2) Provide guidance and retry, 3) Abandon
        break

  # Check if planner task is completed (no checker spawned)
  if checker was NOT spawned:
    planner_task = tasks.find(id == planning_task_id)
    if planner_task.status == "completed":
      # No verification needed — proceed to shutdown
      break

  # Wait before polling again
  sleep(brief interval)
```

#### 8d. Shutdown and cleanup

```
# Shutdown sequence
SendMessage({ type: "shutdown_request", recipient: "researcher", content: "Planning complete" })
SendMessage({ type: "shutdown_request", recipient: "planner", content: "Planning complete" })
# Only if checker was spawned:
SendMessage({ type: "shutdown_request", recipient: "checker", content: "Planning complete" })
# Wait for shutdown_response from each active teammate
TeamDelete()
```

Proceed to step 13 (Present Final Status).

---

### If TeamCreate fails — FALLBACK to sequential subagent mode

Display: `Agent Teams unavailable. Using sequential subagent mode.`

Execute the following sequential steps (the original subagent workflow):

#### Fallback Step 5: Spawn Researcher (if research_needed)

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning researcher...
```

**Spawn gsd-phase-researcher:**

```bash
PHASE_DESC=$(node ~/.claude/get-shit-done/bin/gsd-tools.js roadmap get-phase "${PHASE}" | jq -r '.section')
# Use requirements_content from INIT (already loaded via --include requirements)
REQUIREMENTS=$(echo "$INIT" | jq -r '.requirements_content // empty' | grep -A100 "## Requirements" | head -50)
STATE_SNAP=$(node ~/.claude/get-shit-done/bin/gsd-tools.js state-snapshot)
# Extract decisions from state-snapshot JSON: jq '.decisions[] | "\(.phase): \(.summary) - \(.rationale)"'
```

Research prompt:

```markdown
<objective>
Research how to implement Phase {phase_number}: {phase_name}
Answer: "What do I need to know to PLAN this phase well?"
</objective>

<phase_context>
IMPORTANT: If CONTEXT.md exists below, it contains user decisions from /gsd:discuss-phase.
- **Decisions** = Locked — research THESE deeply, no alternatives
- **Claude's Discretion** = Freedom areas — research options, recommend
- **Deferred Ideas** = Out of scope — ignore

{context_content}
</phase_context>

<additional_context>
**Phase description:** {phase_description}
**Requirements:** {requirements}
**Prior decisions:** {decisions}
</additional_context>

<output>
Write to: {phase_dir}/{phase}-RESEARCH.md
</output>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-phase-researcher.md for your role and instructions.\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase}"
)
```

**Handle Researcher Return:**

- **`## RESEARCH COMPLETE`:** Display confirmation, continue to fallback step 6
- **`## RESEARCH BLOCKED`:** Display blocker, offer: 1) Provide context, 2) Skip research, 3) Abort

#### Fallback Step 6: Spawn gsd-planner Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
```

Planner prompt:

```markdown
<planning_context>
**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:** {state_content}
**Roadmap:** {roadmap_content}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: If context exists below, it contains USER DECISIONS from /gsd:discuss-phase.
- **Decisions** = LOCKED — honor exactly, do not revisit
- **Claude's Discretion** = Freedom — make implementation choices
- **Deferred Ideas** = Out of scope — do NOT include

{context_content}

**Research:** {research_content}
**Gap Closure (if --gaps):** {verification_content} {uat_content}
</planning_context>

<downstream_consumer>
Output consumed by /gsd:execute-phase. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-planner.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

#### Fallback Step 7: Handle Planner Return

- **`## PLANNING COMPLETE`:** Display plan count. If `--skip-verify` or `plan_checker_enabled` is false (from init): skip to step 13. Otherwise: fallback step 8.
- **`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation (fallback step 10)
- **`## PLANNING INCONCLUSIVE`:** Show attempts, offer: Add context / Retry / Manual

#### Fallback Step 8: Spawn gsd-plan-checker Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker...
```

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Checker prompt:

```markdown
<verification_context>
**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}

**Plans to verify:** {plans_content}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: Plans MUST honor user decisions. Flag as issue if plans contradict.
- **Decisions** = LOCKED — plans must implement exactly
- **Claude's Discretion** = Freedom areas — plans can choose approach
- **Deferred Ideas** = Out of scope — plans must NOT include

{context_content}
</verification_context>

<expected_output>
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Task(
  prompt=checker_prompt,
  subagent_type="gsd-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} plans"
)
```

#### Fallback Step 9: Handle Checker Return

- **`## VERIFICATION PASSED`:** Display confirmation, proceed to step 13.
- **`## ISSUES FOUND`:** Display issues, check iteration count, proceed to fallback step 10.

#### Fallback Step 10: Revision Loop (Max 3 Iterations)

Track `iteration_count` (starts at 1 after initial plan + check).

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Revision prompt:

```markdown
<revision_context>
**Phase:** {phase_number}
**Mode:** revision

**Existing plans:** {plans_content}
**Checker issues:** {structured_issues_from_checker}

**Phase Context:**
Revisions MUST still honor user decisions.
{context_content}
</revision_context>

<instructions>
Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Task(
  prompt="First, read ~/.claude/agents/gsd-planner.md for your role and instructions.\n\n" + revision_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

After planner returns -> spawn checker again (fallback step 8), increment iteration_count.

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain:` + issue list

Offer: 1) Force proceed, 2) Provide guidance and retry, 3) Abandon

## 13. Present Final Status

Route to `<offer_next>`.

</process>

<team_vs_fallback_comparison>

| Aspect | Team Mode | Fallback (Subagent) Mode |
|--------|-----------|--------------------------|
| Researcher-Planner | Direct messaging via SendMessage + file | File handoff only |
| Checker-Planner revision | Direct planner<->checker messaging | Orchestrator mediates each iteration |
| Revision loop | Same agents, persistent sessions, direct messages | Orchestrator spawns new agents each iteration |
| Max iterations | 3 (planner/checker self-manage, orchestrator monitors) | 3 (orchestrator counts and mediates) |
| Research skip | --skip-research flag, researcher not spawned in team | Same flag, researcher not spawned |
| Verify skip | --skip-verify flag, checker not spawned in team | Same flag, checker step skipped |
| plan_checker_enabled=false | Checker not spawned in team | Checker step skipped |
| Fallback | N/A (this IS the fallback) | Full sequential subagent workflow |

</team_vs_fallback_comparison>

<offer_next>
Output this markdown directly (not as a code block):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE {X} PLANNED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Execute Phase {X}** — run all {N} plans

/gsd:execute-phase {X}

<sub>/clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- cat .planning/phases/{phase-dir}/*-PLAN.md — review plans
- /gsd:plan-phase {X} --research — re-research first

───────────────────────────────────────────────────────────────
</offer_next>

<success_criteria>
- [ ] .planning/ directory validated
- [ ] Phase validated against roadmap
- [ ] Phase directory created if needed
- [ ] CONTEXT.md loaded early (step 4) and passed to ALL agents
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] Team created with TeamCreate (or fallback to subagent mode)
- [ ] gsd-phase-researcher spawned (as teammate or subagent) with CONTEXT.md
- [ ] Existing plans checked
- [ ] gsd-planner spawned (as teammate or subagent) with CONTEXT.md + RESEARCH.md
- [ ] Plans created (PLANNING COMPLETE or CHECKPOINT handled)
- [ ] gsd-plan-checker spawned (as teammate or subagent) with CONTEXT.md — unless --skip-verify or plan_checker_enabled=false
- [ ] Verification passed OR user override OR max iterations with user decision
- [ ] Team shutdown and cleanup (team mode) or subagent results processed (fallback mode)
- [ ] User sees status between agent spawns
- [ ] User knows next steps
</success_criteria>
