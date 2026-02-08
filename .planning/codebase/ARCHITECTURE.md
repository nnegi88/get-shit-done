# Architecture

**Analysis Date:** 2026-02-08

## Pattern Overview

**Overall:** Orchestrator-executor pattern with subagent specialization and hierarchical workflow delegation.

**Key Characteristics:**
- Lean orchestrators delegate work to specialized subagents
- Context compartmentalization — each agent loads only what it needs
- Atomic operations with per-task commits
- Checkpoint-based pause/resume for long-running work
- Central state management via `.planning/STATE.md`
- Tool-based CLI utilities for cross-cutting concerns

## Layers

**Orchestration Layer:**
- Purpose: Route user commands to appropriate workflow, spawn parallel subagents, wait for completion, aggregate results
- Location: `commands/gsd/*.md` and workflow files in `get-shit-done/workflows/*.md`
- Contains: Command definitions, workflow orchestration logic, agent spawning prompts, state transition logic
- Depends on: CLI tools (`bin/gsd-tools.js`), subagent agents (`agents/*.md`), workflow definitions
- Used by: Claude Code runtime via `/gsd:*` slash commands

**Subagent Layer:**
- Purpose: Execute specialized work within a compartmentalized context window
- Location: `agents/gsd-*.md`
- Contains: Specialized agents including executor, planner, researcher, verifier, debugger
- Depends on: Project state files (STATE.md, PROJECT.md), templates, references, workflow context
- Used by: Orchestration layer via Task() spawning, passes context via prompt injection

**Project State Layer:**
- Purpose: Persist project context, decisions, metrics, session continuity across work sessions
- Location: `.planning/` directory with STATE.md (position, metrics, decisions), PROJECT.md (vision, requirements), roadmap files
- Contains: Configuration, state snapshots, progress tracking, phase/plan definitions, archived milestones
- Depends on: Workflow operations that read/update state
- Used by: All orchestrators and agents to load context, determine next steps

**Tools/Utilities Layer:**
- Purpose: Centralize repetitive operations — config parsing, model resolution, git operations, file validation
- Location: `get-shit-done/bin/gsd-tools.js` (primary), `hooks/*.js` (secondary background operations)
- Contains: ~90+ CLI commands covering state, phase operations, validation, template filling, summaries
- Depends on: File system, git, Node.js standard library
- Used by: Orchestrators and agents via `node ~/.claude/get-shit-done/bin/gsd-tools.js <command>`

**Template/Reference Layer:**
- Purpose: Provide boilerplate structure and guidance without imposing rigid constraints
- Location: `get-shit-done/templates/` (PLAN.md, SUMMARY.md, RESEARCH.md, STATE.md, etc.) and `get-shit-done/references/` (UI brand, checkpoints, TDD patterns, verification)
- Contains: Frontmatter schemas, example structures, best practices, decision records
- Depends on: None (read-only reference material)
- Used by: Orchestrators and agents when scaffolding new documents or understanding patterns

**Installation/Bootstrap Layer:**
- Purpose: Install GSD into Claude Code, OpenCode, or Gemini CLI environments
- Location: `bin/install.js` (CLI), `hooks/` (built via `scripts/build-hooks.js`)
- Contains: Cross-platform path handling, config directory detection, permission setup, version migration
- Depends on: package.json (version info), source files for copying
- Used by: `npx get-shit-done-cc` command by end users

## Data Flow

**Project Initialization Flow:**

1. User runs `/gsd:new-project`
2. Orchestrator checks if project exists, offers brownfield mapping if needed
3. Executes deep questioning via inline prompts → synthesizes PROJECT.md
4. Spawns gsd-project-researcher and gsd-research-synthesizer agents in parallel
5. Agents write RESEARCH.md and requirements directly to `.planning/`
6. Orchestrator scaffolds ROADMAP.md via gsd-roadmapper
7. Creates phase directories, writes VERSION file, commits planning docs
8. Returns readiness for first planning phase

**Phase Planning Flow:**

1. User runs `/gsd:plan-phase <phase>`
2. Orchestrator loads phase context via `node gsd-tools.js init plan-phase <phase>`
3. If research missing and enabled: spawns gsd-phase-researcher → writes RESEARCH.md
4. Spawns gsd-planner → writes N PLAN.md files with frontmatter, objectives, tasks
5. If plan-check enabled: spawns gsd-plan-checker → validates structure, writes feedback
6. Revision loop (max 3 iterations) handles plan improvements
7. Commits all PLAN.md files atomically
8. Returns plans ready for execution

**Phase Execution Flow:**

1. User runs `/gsd:execute-phase <phase>` or `/gsd:execute-plan <phase>/<plan>`
2. Orchestrator discovers all incomplete plans, groups by wave dependency
3. For each wave: spawns gsd-executor agents in parallel (if parallelization enabled)
4. Each executor loads PLAN.md, executes tasks atomically, creates SUMMARY.md
5. Orchestrator spot-checks SUMMARY.md (files created, commits pushed, no failures)
6. On checkpoint: orchestrator pauses, returns structured context for continuation
7. After wave complete: aggregates summaries, triggers gsd-verifier for overall verification
8. Updates STATE.md with metrics, commits execution artifacts

**State Management:**

- `.planning/STATE.md` is source of truth for current position, metrics, decisions
- Updated by: executors (position, metrics), orchestrators (phase transitions)
- Read by: All agents at start via `node gsd-tools.js state load`
- Snapshots: `node gsd-tools.js state-snapshot` returns JSON for agent consumption
- Decisions logged in PROJECT.md Key Decisions table, summarized in STATE.md

## Key Abstractions

**Phase:**
- Purpose: Logical grouping of related plans
- Examples: `.planning/phases/01-core`, `.planning/phases/02.1-refinement`
- Pattern: Directory named `{padded_phase}-{slug}` containing PLAN.md, SUMMARY.md, RESEARCH.md files
- Decimal phases (2.1, 2.2) supported for breaking work mid-phase

**Plan:**
- Purpose: Executable unit of work with specific objective, tasks, and verification
- Examples: `.planning/phases/01-core/01-01-PLAN.md`
- Pattern: Frontmatter (phase, plan, type, autonomous, wave, depends_on) + objective + tasks + verification
- Types: `execute` (full implementation), `tdd` (test-driven), `gap_closure` (refinement)
- Wave grouping: plans executing concurrently vs. sequential dependencies

**Summary:**
- Purpose: Document what was built, decisions made, deviations taken
- Examples: `.planning/phases/01-core/01-01-SUMMARY.md`
- Pattern: Frontmatter (phase, plan, status) + self-check + what-was-built + key-files + commits + decisions
- Created by: gsd-executor after task completion
- Reviewed by: gsd-verifier to validate claims against disk

**Checkpoint:**
- Purpose: Pause execution to ask user for input or clarification before continuing
- Pattern: Task with `type="checkpoint:*"` in PLAN.md
- Behavior: Executor stops immediately, returns structured message with state context
- Continuation: Fresh agent spawned with completed_tasks[] and checkpoint data in prompt

**Research:**
- Purpose: Explore technical approach, options, and unknowns for a phase
- Examples: `.planning/phases/01-core/01-RESEARCH.md`
- Pattern: Problem statement → options explored → recommendation → rationale
- Trigger: Automatically if research enabled and RESEARCH.md missing, or --research flag

**Deviation:**
- Purpose: Track work not in original plan (bugs found, features added, logic corrected)
- Pattern: Executor records [Rule N - Type] description for each deviation
- Types: Rule 1 (auto-fix bugs), Rule 2 (add critical missing features), Rule 3 (improve UX/performance)
- Documented in: SUMMARY.md deviations[] array

## Entry Points

**User Command: `/gsd:new-project`**
- Location: `commands/gsd/new-project.md`
- Triggers: Project initialization workflow
- Responsibilities: Questions user, scaffolds project structure, runs research, builds roadmap

**User Command: `/gsd:plan-phase`**
- Location: `commands/gsd/plan-phase.md`
- Triggers: Phase planning workflow
- Responsibilities: Research phase if needed, spawn planner agents, validate plans, commit

**User Command: `/gsd:execute-phase`**
- Location: `commands/gsd/execute-phase.md`
- Triggers: Phase execution orchestration
- Responsibilities: Group plans by wave, spawn executors, verify summaries, update state

**User Command: `/gsd:map-codebase`**
- Location: `commands/gsd/map-codebase.md`
- Triggers: Parallel codebase mapping
- Responsibilities: Spawn 4 mapper agents (tech, arch, quality, concerns), write 7 docs

**CLI Tool Entry: `bin/gsd-tools.js`**
- Location: `get-shit-done/bin/gsd-tools.js`
- Triggers: Invoked by orchestrators and agents via `node ~/.claude/get-shit-done/bin/gsd-tools.js <command>`
- Responsibilities: Execute ~90+ atomic operations (load state, update phase, validate plan, etc.)

**Installer Entry: `bin/install.js`**
- Location: `bin/install.js`
- Triggers: `npx get-shit-done-cc@latest`
- Responsibilities: Bootstrap GSD into user's Claude Code / OpenCode / Gemini config directories

## Error Handling

**Strategy:** Errors are scoped to agents. Orchestrators validate preconditions, agents handle task-level failures.

**Patterns:**

- **Missing State:** If `.planning/STATE.md` missing but `.planning/` exists, offer reconstruction or continue
- **Invalid Phase:** Validate phase number exists in ROADMAP.md before proceeding
- **Plan Validation:** `verify plan-structure <file>` checks frontmatter, task count, success criteria
- **Summary Validation:** `verify-summary <path>` checks must_haves.artifacts and key-files exist on disk
- **Checkpoint Handling:** Executor stops immediately on checkpoint type, returns structured context for continuation
- **Deviation Auto-Recovery:** Rules 1-3 allow executor to fix bugs/add features inline without blocking
- **Git Conflicts:** Executor reports inability to commit, returns to orchestrator for resolution
- **Dependency Failures:** If wave N fails critical plan, orchestrator offers retry or skip remaining plans

## Cross-Cutting Concerns

**Logging:**
- Via stdout in orchestrator/agent prompts
- gsd-tools.js operations emit status to stdout (files created, manifests written, version checks)
- Hooks log to stdout (update check results, statusline render)

**Validation:**
- Frontmatter schema validation: `frontmatter validate <file> --schema plan|summary|verification`
- Reference validation: `verify references <file>` checks @-refs and paths resolve
- Plan structure: `verify plan-structure <file>` ensures required sections exist
- Commit validation: `verify commits <hash1> <hash2>` batch-checks git history

**Authentication:**
- Brave Search: env var `BRAVE_SEARCH_API_KEY` required if `brave_search: true` in config.json
- Model resolution: env var `CLAUDE_API_KEY` or runtime-specific models via profile system
- Git: Uses system git config for user.name / user.email for commits

**Configuration:**
- `.planning/config.json` defines: model_profile (quality/balanced/budget), research, plan_checker, verifier, parallelization, branching_strategy
- Model profiles in gsd-tools.js: each agent has quality/balanced/budget model assignment
- Defaults applied if missing: model_profile=balanced, commit_docs=true, research=true, parallelization=true

---

*Architecture analysis: 2026-02-08*
