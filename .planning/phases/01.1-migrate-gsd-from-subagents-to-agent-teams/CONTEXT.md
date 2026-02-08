# Phase 01.1 Context: Migrate GSD from Subagents to Agent Teams

## Why (Urgent)

The current GSD architecture spawns subagents via `Task()` that cannot talk to each other. Agents communicate only through files (RESEARCH.md, PLAN.md, SUMMARY.md, STATE.md). This creates:
- No real-time course correction between agents
- Quality depends entirely on completeness of input files serialized into prompts
- No ability for a planner to ask a researcher a follow-up question
- No ability for parallel executors to coordinate on discovered issues
- Revision loops are sequential (planner -> checker -> planner) instead of collaborative

**Agent Teams solves this** by giving each agent its own Claude Code session with direct messaging (`SendMessage`), shared task lists (`TaskCreate/TaskUpdate/TaskList`), and centralized coordination through a team lead.

## Reference Architecture

[disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) implements builder/validator team patterns with meta-prompts. Key insight: a **meta-agent** creates task-specific agents, and a **team lead** orchestrates them through shared task lists rather than file handoffs.

## What Exists Today

### 11 GSD Subagent Types (`~/.claude/agents/`)
| Agent | Role | Spawned By |
|-------|------|-----------|
| `gsd-executor` | Executes PLAN.md, per-task commits | `/gsd:execute-phase` |
| `gsd-planner` | Creates PLAN.md files | `/gsd:plan-phase` |
| `gsd-verifier` | Goal-backward phase verification | Post-execution |
| `gsd-phase-researcher` | Researches before planning | `/gsd:plan-phase` |
| `gsd-project-researcher` | Ecosystem research for new projects | `/gsd:new-project` |
| `gsd-plan-checker` | Verifies plan quality | `/gsd:plan-phase` |
| `gsd-roadmapper` | Creates ROADMAP.md | `/gsd:new-project` |
| `gsd-debugger` | Scientific debugging | `/gsd:debug` |
| `gsd-integration-checker` | Cross-phase E2E verification | Milestone audit |
| `gsd-research-synthesizer` | Synthesizes parallel research | `/gsd:new-project` |
| `gsd-codebase-mapper` | Maps codebase structure | `/gsd:map-codebase` |

### 3 Primary Orchestrator Workflows (`~/.claude/get-shit-done/workflows/`)
1. **`plan-phase.md`** — Research -> Plan -> Verify -> Done (revision loop max 3)
2. **`execute-phase.md`** — Wave-based parallel execution with checkpoint handling
3. **`new-project.md`** — Parallel research -> Roadmap -> Planning

### Current Communication: File-Based Only
```
researcher writes RESEARCH.md
    -> planner reads RESEARCH.md, writes PLAN.md
        -> checker reads PLAN.md, returns issues
            -> planner reads issues, revises PLAN.md
                -> executor reads PLAN.md, writes SUMMARY.md
                    -> verifier reads SUMMARY.md + codebase
```
No agent can ask another agent a question. No agent knows what another is doing.

### Current Spawning Pattern
```javascript
Task(
  subagent_type="gsd-executor",
  model="{executor_model}",
  prompt="First, read ~/.claude/agents/gsd-executor.md...\n\n{context}",
  description="Execute Plan 01-02"
)
// Returns result. Agent is gone. No further interaction possible.
```

## Target Architecture: Agent Teams

### Prerequisite
```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Core Concept Change
| Aspect | Before (Subagents) | After (Agent Teams) |
|--------|-------------------|-------------------|
| Lifecycle | Fire-and-forget | Persistent sessions, messageable |
| Communication | File-based only | Direct messaging via `SendMessage` |
| Coordination | Orchestrator manages everything | Shared `TaskList` with self-coordination |
| Context | Serialized into spawn prompt | Own session, loads CLAUDE.md + MCP servers |
| Collaboration | None | Teammates message each other directly |
| Cost | Lower (results summarized back) | Higher (each teammate = separate instance) |

### Agent Teams API Surface
```
TeamCreate({ team_name, description })
TaskCreate({ subject, description, activeForm })
TaskUpdate({ taskId, status, owner, ... })
TaskList()
SendMessage({ type: "message", recipient, content, summary })
SendMessage({ type: "broadcast", content, summary })
SendMessage({ type: "shutdown_request", recipient })
TeamDelete()
```

## Migration Strategy: Workflow by Workflow

### Workflow 1: `/gsd:plan-phase` -> Planning Team

**Team:** `gsd-plan-{phase}` with researcher, planner, checker teammates

**Key improvements:**
- Planner can `SendMessage` to researcher for follow-up questions mid-planning
- Checker can message planner directly: "Task 3 contradicts Task 1 — intentional?"
- Revision loop is planner<->checker direct, no orchestrator bottleneck

**Meta-prompts needed:** researcher, planner, checker (each with Team Communication Protocol)

### Workflow 2: `/gsd:execute-phase` -> Execution Team

**Team:** `gsd-exec-{phase}` with per-wave executor teammates + verifier

**Key improvements:**
- Parallel executors warn each other about shared dependency changes
- Verifier can query executors about discrepancies in SUMMARYs

### Workflow 3: `/gsd:new-project` -> Research Team

**Team:** `gsd-init-{project}` with 4 parallel researchers + synthesizer + roadmapper

**Key improvements:**
- Researchers cross-pollinate: "auth library requires Redis — flagging for architecture"
- Synthesizer can ask researchers for clarification

### Workflow 4: `/gsd:debug` -> Debug Team (Competing Hypotheses)

**Team:** `gsd-debug-{issue}` with 3 hypothesis investigators

**Key improvements:**
- Agents actively challenge each other's hypotheses
- Lead synthesizes: which hypothesis survived peer review?

## Implementation Guidance

### Step 1: Enable Agent Teams
```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" },
  "teammateMode": "in-process"
}
```

### Step 2: Create Team-Aware Agent Definitions
Extend each `~/.claude/agents/gsd-*.md` with Team Communication Protocol section.

### Step 3: Modify Orchestrator Workflows
Replace sequential `Task()` spawning with:
```
TeamCreate -> TaskCreate (with dependencies) -> Task (spawn teammates) -> TaskUpdate (assign) -> Monitor/Synthesize -> Shutdown -> TeamDelete
```

### Step 4: Preserve Existing Strengths
Keep unchanged:
- Wave-based parallelization (now via task dependencies)
- File-based artifacts (PLAN.md, SUMMARY.md, STATE.md, RESEARCH.md)
- Goal-backward verification
- Deviation rules (1-4)
- CONTEXT.md user decisions (LOCKED)
- gsd-tools.js CLI
- Checkpoint protocol (escalated via SendMessage)

### Step 5: Add Team Hooks (Optional Enhancement)
Hooks for TaskCompleted and TeammateIdle validation.

## Key Differences to Watch For

| Concern | Mitigation |
|---------|-----------|
| Higher token cost | Only use teams for multi-agent workflows. Keep single-agent workflows as-is. |
| Experimental/unstable | Plan graceful degradation: fall back to subagent mode if teams fail. |
| File conflicts | Keep wave-based file ownership and `files_modified` frontmatter. |
| Lead doing work itself | Use delegate mode to keep lead coordination-only. |
| Shutdown cleanup | Always shutdown teammates before TeamDelete(). |
| One team per session | Each workflow creates ONE team, cleans up when done. |

## What NOT to Change

- `gsd-tools.js` CLI — purely functional, no agent awareness needed
- `.planning/` file structure — still the persistent state layer
- PLAN.md frontmatter format — still drives wave calculation
- Git commit protocol — still per-task atomic commits
- User-facing `/gsd:*` slash commands — same interface, different internal orchestration
- CLAUDE.md and project context — automatically loaded by teammates

## User Decisions

### Locked
- Agent Teams is the target orchestration model (no alternatives)
- File-based artifacts remain the source of truth
- gsd-tools.js CLI unchanged
- User-facing slash commands unchanged

### Claude's Discretion
- Order of workflow migration (plan-phase first recommended)
- Meta-prompt structure and content
- Team naming conventions
- Whether to implement graceful fallback to subagents or hard-cut
- Hook integration depth

### Deferred Ideas
- Custom MCP server for team coordination
- Persistent team sessions across /clear boundaries
- Team performance analytics
