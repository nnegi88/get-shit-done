<purpose>
Orchestrate debug investigations using team-based competing hypotheses (3 investigators that challenge each other) or parallel subagent mode (fallback). When spawned from UAT, investigates gaps in parallel. When spawned from /gsd:debug, investigates a single issue.

In team mode, 3 hypothesis investigators actively challenge each other's findings via messaging. The team lead synthesizes which hypothesis survived peer review. Falls back to single-debugger subagent mode if Agent Teams is unavailable.

Orchestrator stays lean: derive hypotheses, spawn investigators, collect peer-reviewed results, report root cause.
</purpose>

<paths>
DEBUG_DIR=.planning/debug

Debug files use the `.planning/debug/` path (hidden directory with leading dot).
</paths>

<core_principle>
**Diagnose before planning fixes.**

UAT tells us WHAT is broken (symptoms). Debug agents find WHY (root cause). plan-phase --gaps then creates targeted fixes based on actual causes, not guesses.

Without diagnosis: "Comment doesn't refresh" -> guess at fix -> maybe wrong
With diagnosis: "Comment doesn't refresh" -> "useEffect missing dependency" -> precise fix

**Competing hypotheses principle:** Multiple investigators with different hypotheses challenge each other's findings. The hypothesis that survives peer review is more likely to be the true root cause than a single investigator's conclusion.
</core_principle>

<process>

<step name="parse_input">
**Determine input mode:**

**UAT mode** (spawned from verify-work with gaps):
Read the "Gaps" section from UAT.md (YAML format):
```yaml
- truth: "Comment appears immediately after submission"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  artifacts: []
  missing: []
```

For each gap, also read the corresponding test from "Tests" section to get full context.

Build gap list:
```
gaps = [
  {truth: "Comment appears immediately...", severity: "major", test_num: 2, reason: "..."},
  {truth: "Reply button positioned correctly...", severity: "minor", test_num: 5, reason: "..."},
  ...
]
```

**Interactive mode** (spawned from /gsd:debug with user-described issue):
Extract issue description from $ARGUMENTS. Build single gap:
```
gaps = [
  {truth: "{user description}", severity: "unknown", reason: "{user description}"}
]
```
</step>

<step name="report_plan">
**Report diagnosis plan to user:**

```
## Diagnosing {N} Gap(s)

Spawning debug investigators to find root causes:

| Gap (Truth) | Severity |
|-------------|----------|
| Comment appears immediately after submission | major |
| Reply button positioned correctly | minor |
| Delete removes comment | blocker |

Each gap gets 3 competing hypothesis investigators that challenge each other's findings.

This runs in parallel - all gaps investigated simultaneously.
```
</step>

<step name="investigate_gaps">

For each gap (or single issue), attempt team-based investigation:

## Team Creation (or Fallback)

```
TeamCreate({ team_name: "gsd-debug-{issue_slug}", description: "Debug team for: {issue_description}" })
```

---

### TEAM MODE (if TeamCreate succeeds) — Competing Hypotheses

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DEBUGGING (TEAM MODE — COMPETING HYPOTHESES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Team "gsd-debug-{issue_slug}" created
◆ Deriving 3 competing hypotheses...
```

#### Derive initial hypotheses

Before spawning investigators, the orchestrator analyzes the bug report symptoms and derives 3 distinct, independently testable hypotheses:

1. Analyze symptoms reported (expected vs actual behavior, errors, reproduction steps)
2. Generate 3 distinct hypotheses that could each explain ALL symptoms
3. Each hypothesis must be independently testable (falsifiable)
4. Hypotheses should cover different layers/components when possible

```
hypotheses = [
  { id: 1, description: "...", layer: "...", test_approach: "..." },
  { id: 2, description: "...", layer: "...", test_approach: "..." },
  { id: 3, description: "...", layer: "...", test_approach: "..." }
]
```

Display derived hypotheses:
```
◆ Hypothesis 1: {description} ({layer})
◆ Hypothesis 2: {description} ({layer})
◆ Hypothesis 3: {description} ({layer})
◆ Spawning 3 investigators...
```

#### Create investigation tasks

```
hyp1_task = TaskCreate({
  subject: "Investigate hypothesis 1: {hypothesis_1}",
  description: "Investigate whether {hypothesis_1} explains the symptoms. Gather evidence for and against. Challenge other investigators' findings.",
  activeForm: "Investigating hypothesis 1"
})

hyp2_task = TaskCreate({
  subject: "Investigate hypothesis 2: {hypothesis_2}",
  description: "Investigate whether {hypothesis_2} explains the symptoms. Gather evidence for and against. Challenge other investigators' findings.",
  activeForm: "Investigating hypothesis 2"
})

hyp3_task = TaskCreate({
  subject: "Investigate hypothesis 3: {hypothesis_3}",
  description: "Investigate whether {hypothesis_3} explains the symptoms. Gather evidence for and against. Challenge other investigators' findings.",
  activeForm: "Investigating hypothesis 3"
})
```

#### Spawn investigator teammates

```
Task(
  team_name: "gsd-debug-{issue_slug}",
  name: "investigator-1",
  subagent_type: "gsd-debugger",
  prompt: "First, read /Users/naveennegi/.claude/agents/gsd-debugger.md for your role.

You are investigator-1 on a debug team. You are investigating hypothesis: '{hypothesis_1}'.

**Competing Hypotheses Protocol:**
- Investigate your hypothesis using scientific method (observe, hypothesize, predict, test)
- When you find evidence, broadcast it so other investigators can evaluate:
  SendMessage({ type: 'broadcast', content: 'Evidence: {finding}. Supports/contradicts hypotheses: {list}', summary: 'Evidence found' })
- When another investigator shares evidence, evaluate how it affects YOUR hypothesis
- Actively challenge other hypotheses if your evidence contradicts them:
  SendMessage({ type: 'message', recipient: 'investigator-{N}', content: 'Your hypothesis does not explain {symptom} because {evidence}', summary: 'Challenging hypothesis' })
- When challenged, defend with evidence or acknowledge and revise
- When investigation is complete, summarize: hypothesis confirmed/eliminated/inconclusive with evidence

**Bug Report:**
Expected: {expected_behavior}
Actual: {actual_behavior}
Errors: {errors}
Reproduction: {reproduction_steps}

**Codebase context:**
{relevant_file_paths}

**Investigation goal:** find_root_cause_only

Check TaskList() for your task. Claim it with TaskUpdate and begin investigation.
When complete, mark your task completed with a summary of your findings."
)

Task(
  team_name: "gsd-debug-{issue_slug}",
  name: "investigator-2",
  subagent_type: "gsd-debugger",
  prompt: "First, read /Users/naveennegi/.claude/agents/gsd-debugger.md for your role.

You are investigator-2 on a debug team. You are investigating hypothesis: '{hypothesis_2}'.

**Competing Hypotheses Protocol:**
- Investigate your hypothesis using scientific method (observe, hypothesize, predict, test)
- When you find evidence, broadcast it so other investigators can evaluate:
  SendMessage({ type: 'broadcast', content: 'Evidence: {finding}. Supports/contradicts hypotheses: {list}', summary: 'Evidence found' })
- When another investigator shares evidence, evaluate how it affects YOUR hypothesis
- Actively challenge other hypotheses if your evidence contradicts them:
  SendMessage({ type: 'message', recipient: 'investigator-{N}', content: 'Your hypothesis does not explain {symptom} because {evidence}', summary: 'Challenging hypothesis' })
- When challenged, defend with evidence or acknowledge and revise
- When investigation is complete, summarize: hypothesis confirmed/eliminated/inconclusive with evidence

**Bug Report:**
Expected: {expected_behavior}
Actual: {actual_behavior}
Errors: {errors}
Reproduction: {reproduction_steps}

**Codebase context:**
{relevant_file_paths}

**Investigation goal:** find_root_cause_only

Check TaskList() for your task. Claim it with TaskUpdate and begin investigation.
When complete, mark your task completed with a summary of your findings."
)

Task(
  team_name: "gsd-debug-{issue_slug}",
  name: "investigator-3",
  subagent_type: "gsd-debugger",
  prompt: "First, read /Users/naveennegi/.claude/agents/gsd-debugger.md for your role.

You are investigator-3 on a debug team. You are investigating hypothesis: '{hypothesis_3}'.

**Competing Hypotheses Protocol:**
- Investigate your hypothesis using scientific method (observe, hypothesize, predict, test)
- When you find evidence, broadcast it so other investigators can evaluate:
  SendMessage({ type: 'broadcast', content: 'Evidence: {finding}. Supports/contradicts hypotheses: {list}', summary: 'Evidence found' })
- When another investigator shares evidence, evaluate how it affects YOUR hypothesis
- Actively challenge other hypotheses if your evidence contradicts them:
  SendMessage({ type: 'message', recipient: 'investigator-{N}', content: 'Your hypothesis does not explain {symptom} because {evidence}', summary: 'Challenging hypothesis' })
- When challenged, defend with evidence or acknowledge and revise
- When investigation is complete, summarize: hypothesis confirmed/eliminated/inconclusive with evidence

**Bug Report:**
Expected: {expected_behavior}
Actual: {actual_behavior}
Errors: {errors}
Reproduction: {reproduction_steps}

**Codebase context:**
{relevant_file_paths}

**Investigation goal:** find_root_cause_only

Check TaskList() for your task. Claim it with TaskUpdate and begin investigation.
When complete, mark your task completed with a summary of your findings."
)
```

#### Monitor team progress

```
Monitor via TaskList():
- Poll TaskList() periodically to check task statuses
- When all 3 investigator tasks are "completed", investigation is done
- Read each investigator's task completion message for their findings
```

#### Synthesize results (team lead)

After all 3 investigators complete their tasks:

1. Read each investigator's findings (from their task completion messages and debug files)
2. Determine which hypothesis survived peer review:
   - Hypothesis confirmed by evidence AND not contradicted by other evidence = likely root cause
   - Hypothesis eliminated by evidence = ruled out
   - Multiple hypotheses surviving = may be compound root cause
3. Present synthesis:

```
## Debug Team Results

**Issue:** {description}

| Hypothesis | Investigator | Status | Key Evidence |
|-----------|-------------|--------|--------------|
| {H1} | investigator-1 | Confirmed/Eliminated/Inconclusive | {evidence} |
| {H2} | investigator-2 | Confirmed/Eliminated/Inconclusive | {evidence} |
| {H3} | investigator-3 | Confirmed/Eliminated/Inconclusive | {evidence} |

**Root Cause:** {surviving hypothesis with highest evidence support}
**Confidence:** {HIGH/MEDIUM/LOW based on evidence consensus}

**Peer Review Summary:**
- {which challenges were made and how they were resolved}
```

4. Offer: Fix the issue? / Investigate further? / Close debug session

#### Shutdown and cleanup

```
For each investigator:
  SendMessage({ type: "shutdown_request", recipient: "investigator-{N}", content: "Investigation complete" })
  # Wait for shutdown_response
TeamDelete()
```

---

### FALLBACK MODE (if TeamCreate fails) — Single Debugger Subagents

Display: `Agent Teams unavailable. Using single debugger mode.`

Execute the original parallel subagent workflow:

**Spawn debug agents in parallel:**

For each gap, fill the debug-subagent-prompt template and spawn:

```
Task(
  prompt=filled_debug_subagent_prompt,
  subagent_type="general-purpose",
  description="Debug: {truth_short}"
)
```

**All agents spawn in single message** (parallel execution).

Template placeholders:
- `{truth}`: The expected behavior that failed
- `{expected}`: From UAT test
- `{actual}`: Verbatim user description from reason field
- `{errors}`: Any error messages from UAT (or "None reported")
- `{reproduction}`: "Test {test_num} in UAT"
- `{timeline}`: "Discovered during UAT"
- `{goal}`: `find_root_cause_only` (UAT flow - plan-phase --gaps handles fixes)
- `{slug}`: Generated from truth

**Collect root causes from agents:**

Each agent returns with:
```
## ROOT CAUSE FOUND

**Debug Session:** ${DEBUG_DIR}/{slug}.md

**Root Cause:** {specific cause with evidence}

**Evidence Summary:**
- {key finding 1}
- {key finding 2}
- {key finding 3}

**Files Involved:**
- {file1}: {what's wrong}
- {file2}: {related issue}

**Suggested Fix Direction:** {brief hint for plan-phase --gaps}
```

Parse each return to extract:
- root_cause: The diagnosed cause
- files: Files involved
- debug_path: Path to debug session file
- suggested_fix: Hint for gap closure plan

If agent returns `## INVESTIGATION INCONCLUSIVE`:
- root_cause: "Investigation inconclusive - manual review needed"
- Note which issue needs manual attention
- Include remaining possibilities from agent return

</step>

<step name="update_uat">
**Update UAT.md gaps with diagnosis (UAT mode only):**

For each gap in the Gaps section, add artifacts and missing fields:

```yaml
- truth: "Comment appears immediately after submission"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  root_cause: "useEffect in CommentList.tsx missing commentCount dependency"
  artifacts:
    - path: "src/components/CommentList.tsx"
      issue: "useEffect missing dependency"
  missing:
    - "Add commentCount to useEffect dependency array"
    - "Trigger re-render when new comment added"
  debug_session: .planning/debug/comment-not-refreshing.md
```

Update status in frontmatter to "diagnosed".

Commit the updated UAT.md:
```bash
node /Users/naveennegi/.claude/get-shit-done/bin/gsd-tools.js commit "docs({phase}): add root causes from diagnosis" --files ".planning/phases/XX-name/{phase}-UAT.md"
```
</step>

<step name="report_results">
**Report diagnosis results and hand off:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DIAGNOSIS COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Gap (Truth) | Root Cause | Confidence | Files |
|-------------|------------|------------|-------|
| Comment appears immediately | useEffect missing dependency | HIGH | CommentList.tsx |
| Reply button positioned correctly | CSS flex order incorrect | MEDIUM | ReplyButton.tsx |
| Delete removes comment | API missing auth header | HIGH | api/comments.ts |

Debug sessions: ${DEBUG_DIR}/
Mode: {Team (competing hypotheses) | Single debugger (fallback)}

Proceeding to plan fixes...
```

**If UAT mode:** Return to verify-work orchestrator for automatic planning.
Do NOT offer manual next steps - verify-work handles the rest.

**If interactive mode:** Offer: Fix the issue? / Investigate further? / Close debug session
</step>

</process>

<team_vs_fallback_comparison>

| Aspect | Team Mode (Competing Hypotheses) | Fallback (Single Debugger Subagent) |
|--------|----------------------------------|-------------------------------------|
| Investigation depth | 3 hypotheses investigated in parallel | Single investigator, sequential hypotheses |
| Peer review | Investigators challenge each other via SendMessage | No peer review |
| Evidence sharing | Broadcast evidence to all investigators | Evidence in debug file only |
| Root cause confidence | Higher — survived peer review | Lower — single perspective |
| Token cost | 3x investigator cost | 1x per gap |
| Debug file persistence | Still writes to .planning/debug/ | Same |
| Structured returns | ROOT CAUSE FOUND, INVESTIGATION INCONCLUSIVE | Same |
| Checkpoint handling | Via SendMessage to team lead | Via checkpoint return to orchestrator |
| Team cleanup | Graceful shutdown + TeamDelete | None (fire-and-forget) |

</team_vs_fallback_comparison>

<context_efficiency>
**Team mode:** Orchestrator derives hypotheses and synthesizes results. Each investigator gets fresh 200k context focused on a single hypothesis. Cross-pollination via messaging.

**Fallback mode:** Same as before -- orchestrator coordinates, subagents get fresh 200k each. No polling (Task blocks). No context bleed. Agents start with symptoms pre-filled from UAT (no symptom gathering). Agents only diagnose -- plan-phase --gaps handles fixes (no fix application).
</context_efficiency>

<failure_handling>
**Both modes:**

**Agent fails to find root cause:**
- Mark gap as "needs manual review"
- Continue with other gaps
- Report incomplete diagnosis

**Agent times out:**
- Check DEBUG-{slug}.md for partial progress
- Can resume with /gsd:debug

**All agents fail:**
- Something systemic (permissions, git, etc.)
- Report for manual investigation
- Fall back to plan-phase --gaps without root causes (less precise)

**Team mode additional:**

**Teammate crash:** If an investigator stops responding, check TaskList for task status. If stuck, mark as inconclusive and synthesize from remaining investigators.

**Partial results:** If 2 of 3 investigators complete but 1 crashes, synthesize from available results. Two investigators with peer review is still better than zero.

**Team creation failure mid-investigation:** Not possible -- team is created once at start. If team becomes unstable, synthesize from whatever results are available, then clean up.
</failure_handling>

<success_criteria>
- [ ] Gaps parsed from UAT.md (UAT mode) or issue extracted from arguments (interactive mode)
- [ ] Team created with 3 competing hypothesis investigators (or fallback to single debugger subagents)
- [ ] Hypotheses derived from symptoms before spawning investigators
- [ ] Investigators challenge each other's findings via messaging (team mode)
- [ ] Root causes collected from all investigators
- [ ] Team lead synthesizes which hypothesis survived peer review (team mode)
- [ ] UAT.md gaps updated with artifacts and missing (UAT mode)
- [ ] Debug sessions saved to ${DEBUG_DIR}/
- [ ] Team shutdown and cleanup (team mode)
- [ ] Hand off to verify-work for automatic planning (UAT mode)
</success_criteria>
