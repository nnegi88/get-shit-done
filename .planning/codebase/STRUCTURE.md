# Codebase Structure

**Analysis Date:** 2026-02-08

## Directory Layout

```
get-shit-done/
├── .git/                          # Git repository metadata
├── .github/                       # GitHub workflows and metadata
├── .planning/                     # Generated planning artifacts (user-created)
│   ├── codebase/                 # Codebase analysis documents (STACK.md, ARCHITECTURE.md, etc.)
│   ├── config.json               # Project configuration (model_profile, research, verifier settings)
│   ├── STATE.md                  # Project state and metrics
│   ├── PROJECT.md                # Project vision and requirements
│   ├── ROADMAP.md                # Phase and milestone definitions
│   ├── phases/                   # Phase-specific plans and summaries
│   │   ├── 01-phase-name/
│   │   ├── 02-phase-name/
│   │   └── ...
│   └── todos/                    # Captured ideas and pending work
├── agents/                        # Specialized subagent definitions (Claude Code format)
│   ├── gsd-executor.md           # Executes plans with atomic commits
│   ├── gsd-planner.md            # Creates executable phase plans
│   ├── gsd-phase-researcher.md   # Researches technical approach for phase
│   ├── gsd-project-researcher.md # Researches project and market context
│   ├── gsd-research-synthesizer.md # Synthesizes research into coherent narrative
│   ├── gsd-codebase-mapper.md    # Maps codebase to documents
│   ├── gsd-verifier.md           # Verifies completion claims
│   ├── gsd-plan-checker.md       # Validates plan structure and completeness
│   ├── gsd-debugger.md           # Debugs failed plans and execution issues
│   ├── gsd-integration-checker.md # Validates external API integrations
│   └── gsd-roadmapper.md         # Creates project roadmap from requirements
├── assets/                        # Project-level assets (logos, images)
├── bin/                          # Installation and bootstrap
│   └── install.js                # NPM package installer script
├── commands/                      # User-callable slash commands
│   └── gsd/                       # GSD command definitions
│       ├── new-project.md        # Project initialization command
│       ├── plan-phase.md         # Phase planning command
│       ├── execute-phase.md      # Phase execution command
│       ├── execute-plan.md       # Single plan execution command
│       ├── map-codebase.md       # Codebase mapping command
│       ├── verify-work.md        # Verification command
│       ├── complete-milestone.md # Milestone completion command
│       ├── progress.md           # Progress reporting command
│       ├── add-phase.md          # Add phase to roadmap
│       ├── remove-phase.md       # Remove phase from roadmap
│       ├── insert-phase.md       # Insert decimal phase
│       ├── check-todos.md        # List pending todos
│       ├── add-todo.md           # Capture new todo
│       ├── pause-work.md         # Pause execution
│       ├── resume-project.md     # Resume after pause
│       ├── help.md               # Command reference
│       └── ... (20+ commands)
├── get-shit-done/                # Core GSD system files
│   ├── bin/
│   │   └── gsd-tools.js          # CLI utility with ~90+ operations (state, phase, commit, validate)
│   │   └── gsd-tools.test.js     # Unit tests for gsd-tools.js
│   ├── workflows/                # Workflow orchestration files
│   │   ├── execute-phase.md      # Orchestrator for phase execution
│   │   ├── plan-phase.md         # Orchestrator for phase planning
│   │   ├── new-project.md        # Orchestrator for project init
│   │   ├── execute-plan.md       # Plan execution orchestrator
│   │   ├── map-codebase.md       # Codebase mapping orchestrator
│   │   ├── help.md               # Help reference content
│   │   └── ... (25+ workflows)
│   ├── templates/                # Boilerplate document templates
│   │   ├── state.md              # STATE.md template
│   │   ├── project.md            # PROJECT.md template
│   │   ├── context.md            # CONTEXT.md (phase-specific user decisions)
│   │   ├── roadmap.md            # ROADMAP.md template
│   │   ├── summary.md            # SUMMARY.md template
│   │   ├── summary-minimal.md    # SUMMARY.md minimal variant
│   │   ├── summary-complex.md    # SUMMARY.md complex variant
│   │   ├── requirements.md       # REQUIREMENTS.md template
│   │   ├── research.md           # RESEARCH.md template
│   │   ├── verification-report.md # VERIFICATION.md template
│   │   ├── UAT.md                # UAT.md template
│   │   ├── phase-prompt.md       # Dynamic phase prompt template
│   │   ├── config.json           # Default config.json structure
│   │   ├── codebase/             # Codebase analysis document templates
│   │   │   ├── stack.md
│   │   │   ├── integrations.md
│   │   │   ├── architecture.md
│   │   │   ├── structure.md
│   │   │   ├── conventions.md
│   │   │   ├── testing.md
│   │   │   └── concerns.md
│   │   └── research-project/     # Research phase templates
│   ├── references/               # Reference documentation and guides
│   │   ├── checkpoints.md        # Checkpoint protocol and patterns
│   │   ├── continuation-format.md # Format for resuming paused work
│   │   ├── decimal-phase-calculation.md # Decimal phase numbering guide
│   │   ├── git-integration.md    # Git branching strategy
│   │   ├── tdd.md                # Test-driven development patterns
│   │   ├── ui-brand.md           # UI terminology and brand guidelines
│   │   ├── verification-patterns.md # Verification strategies
│   │   ├── questioning.md        # Deep questioning techniques
│   │   ├── model-profiles.md     # Model selection guide
│   │   └── planning-config.md    # Configuration options reference
├── hooks/                        # Background operations (installed to user's config)
│   ├── gsd-check-update.js       # SessionStart hook — checks for updates
│   ├── gsd-statusline.js         # Statusline hook — shows context window usage
│   └── dist/                     # Built hooks (bundled with npm package)
├── scripts/                      # Build scripts
│   └── build-hooks.js            # Bundles hooks with dependencies
├── package.json                  # NPM package definition (v1.18.0)
├── package-lock.json             # Dependency lock
├── README.md                      # Project overview and getting started
├── CHANGELOG.md                   # Version history and release notes
└── LICENSE                        # MIT license
```

## Directory Purposes

**`.planning/` (User-Created):**
- Purpose: Living project context created during `/gsd:new-project` and updated through project lifecycle
- Contains: Project metadata, state, roadmaps, phase-specific plans and summaries
- Committed to: Yes, team repo
- User-modified: Yes, especially during deep questioning phase

**`agents/`:**
- Purpose: Specialized subagent definitions that execute specific roles
- Contains: Agent YAML frontmatter + execution instructions and prompts
- Key files: gsd-executor.md, gsd-planner.md, gsd-phase-researcher.md
- Installed to: User's Claude Code `~/.claude/agents/gsd-*.md`

**`commands/gsd/`:**
- Purpose: User-callable slash commands invoked as `/gsd:command-name`
- Contains: Command YAML frontmatter + execution context references
- Key files: new-project.md, plan-phase.md, execute-phase.md, map-codebase.md
- Installed to: User's Claude Code `~/.claude/commands/gsd/`

**`get-shit-done/bin/`:**
- Purpose: CLI utilities for state management, validation, and atomic operations
- Key file: gsd-tools.js (161KB, ~90+ commands for state/phase/commit/validate operations)
- Invoked by: Orchestrators and agents via `node ~/.claude/get-shit-done/bin/gsd-tools.js`
- NOT installed separately — referenced by absolute path in prompts

**`get-shit-done/workflows/`:**
- Purpose: Orchestration logic that coordinates agents and manages workflows
- Key files: execute-phase.md, plan-phase.md, new-project.md, execute-plan.md
- Contains: Agent spawning prompts, error handling, state transitions
- Installed to: User's Claude Code `~/.claude/get-shit-done/workflows/`
- Referenced by: Commands via @-syntax in execution_context

**`get-shit-done/templates/`:**
- Purpose: Boilerplate structure for project documents without imposing rigid constraints
- Contains: Markdown templates with examples, optional sections, guidance
- Key files: state.md, project.md, summary.md, requirements.md, PLAN template patterns
- Subdirectory `codebase/`: Templates for codebase analysis documents (used by map-codebase)
- Installed to: User's Claude Code `~/.claude/get-shit-done/templates/`
- Referenced by: Orchestrators and agents when scaffolding new documents

**`get-shit-done/references/`:**
- Purpose: Authoritative guides on patterns, protocols, and decision frameworks
- Contains: Checkpoints, continuation format, decimal phases, TDD, verification patterns, questioning techniques
- Key files: checkpoints.md (pause/resume), verification-patterns.md, tdd.md
- Installed to: User's Claude Code `~/.claude/get-shit-done/references/`
- Referenced by: Agents and orchestrators when implementing specific patterns

**`hooks/`:**
- Purpose: Background operations installed in user's config for SessionStart and statusline
- Key files: gsd-check-update.js, gsd-statusline.js
- Installed to: User's Claude Code `~/.claude/hooks/`
- Subdirectory `dist/`: Pre-built hooks bundled during install

## Key File Locations

**Entry Points:**
- `bin/install.js`: NPM installer — user runs `npx get-shit-done-cc@latest`
- `commands/gsd/new-project.md`: First user command — `/gsd:new-project`
- `commands/gsd/help.md`: Help reference — `/gsd:help`
- `get-shit-done/bin/gsd-tools.js`: Core CLI utility invoked by all agents/orchestrators

**Configuration:**
- `package.json`: NPM metadata, version, install target
- `.planning/config.json`: User project configuration (model_profile, research, verifier settings)
- `get-shit-done/templates/config.json`: Default config template

**Core Logic:**
- `get-shit-done/bin/gsd-tools.js`: ~3500 lines implementing ~90+ CLI commands
- `commands/gsd/execute-phase.md`: Phase orchestration (spawns parallel executors, groups by wave)
- `agents/gsd-executor.md`: Plan execution (atomic commits, deviation rules, checkpoints)
- `agents/gsd-planner.md`: Plan creation (objectives, tasks, frontmatter, verification)

**Testing:**
- `get-shit-done/bin/gsd-tools.test.js`: Unit tests for gsd-tools.js commands
- Run via: `npm test` (node --test)

**Project Artifacts:**
- `.planning/STATE.md`: Project state (position, metrics, decisions)
- `.planning/PROJECT.md`: Project vision (what it is, core value, requirements)
- `.planning/ROADMAP.md`: Phase/milestone definitions and descriptions
- `.planning/phases/{N}-{slug}/`: Phase directories containing PLANs and SUMMARYs

## Naming Conventions

**Files:**

- **Commands:** `commands/gsd/{command-name}.md` — lowercase with hyphens, matches `/gsd:command-name` invocation
  - Example: `plan-phase.md` invoked as `/gsd:plan-phase`
- **Agents:** `agents/gsd-{role}.md` — lowercase with hyphens, prefixed `gsd-`
  - Example: `gsd-executor.md`, `gsd-planner.md`
- **Workflows:** `get-shit-done/workflows/{workflow-name}.md` — lowercase with hyphens, referenced by commands
  - Example: `execute-phase.md`, `plan-phase.md`
- **Templates:** `get-shit-done/templates/{template-name}.md` — lowercase with hyphens or uppercase for project docs
  - Examples: `state.md`, `project.md`, `summary.md`, `requirements.md`
- **Project artifacts:** `.planning/{UPPERCASE}.md` — UPPERCASE for user-facing project docs
  - Examples: `STATE.md`, `PROJECT.md`, `ROADMAP.md`, `RESEARCH.md`
- **Phase plans:** `.planning/phases/{padded_phase}-{slug}/{phase}-{plan_type}-{name}.md`
  - Example: `.planning/phases/01-core/01-01-PLAN.md`
- **Hooks:** `hooks/{hook-name}.js` — kebab-case prefix with `gsd-`
  - Example: `gsd-statusline.js`, `gsd-check-update.js`

**Directories:**

- **Phases:** `.planning/phases/{padded_phase}-{slug}` — {padded_phase} is zero-padded (01, 02, 2.1), {slug} is URL-safe
  - Example: `.planning/phases/01-core`, `.planning/phases/02.1-refinement`
- **Commands group:** `commands/gsd/` — plural, gsd-specific
- **Agents group:** `agents/` — plural, includes gsd-specific agents
- **Workflows:** `get-shit-done/workflows/` — plural
- **Templates:** `get-shit-done/templates/` — plural, nested subdirs for specific types
- **References:** `get-shit-done/references/` — plural, flat structure

## Where to Add New Code

**New GSD Command:**
- Primary code: `commands/gsd/{command-name}.md`
- Format: YAML frontmatter (name, description, allowed-tools, color) + objective/execution_context/process sections
- Register: Automatically — slash commands auto-discovered in `.claude/commands/gsd/`
- Reference workflow: `get-shit-done/workflows/{workflow-name}.md` if complex orchestration needed

**New Subagent Role:**
- Implementation: `agents/gsd-{role}.md`
- Format: YAML frontmatter (name, description, tools, color) + <role>, <execution_flow>, instructions
- When to add: When work needs specialization (e.g., debugger, integration checker)
- Spawned by: Orchestrators via `Task(subagent_type="gsd-{role}", ...)`

**New CLI Utility Command (gsd-tools.js):**
- Location: `get-shit-done/bin/gsd-tools.js`
- Pattern: Add handler in main command dispatcher, implement operation function
- Called by: Orchestrators/agents via `node ~/.claude/get-shit-done/bin/gsd-tools.js <command> [args]`
- Examples: `state load`, `phase add <description>`, `verify plan-structure <file>`

**New Workflow Orchestration:**
- Location: `get-shit-done/workflows/{workflow-name}.md`
- Format: Markdown with <process>, <step name="..."> sections
- Invoked by: Command via `@~/.claude/get-shit-done/workflows/{workflow-name}.md` in execution_context
- Contains: Agent spawning prompts, error handling, state transitions, success criteria

**New Template (scaffolding):**
- Location: `get-shit-done/templates/{template-name}.md`
- Format: Markdown with <template>, <guidelines> sections, optional parts marked
- Used by: Orchestrators/agents when creating new documents via `template fill` commands
- Example: User runs `/gsd:plan-phase` → orchestrator uses `template fill plan --phase 1` → agent generates PLAN.md from template

**New Reference (guidance):**
- Location: `get-shit-done/references/{topic}.md`
- Format: Markdown, comprehensive guide or pattern reference
- Included by: Agents via `@~/.claude/get-shit-done/references/{topic}.md` in prompts
- Examples: checkpoints.md (pause/resume protocol), tdd.md (test-driven patterns), verification-patterns.md

## Special Directories

**`.planning/` (User Project Context):**
- Purpose: Living project documentation created and maintained during use
- Generated: Yes, by `/gsd:new-project` and orchestrators
- Committed: Yes, to team repo
- Modified by: Users (PROJECT.md, CONTEXT.md) and orchestrators (STATE.md updates, phase creation)

**`get-shit-done/` (System Files):**
- Purpose: Core GSD system — commands, workflows, agents, templates, utilities
- Generated: No (source repo content)
- Committed: Yes, to GSD repo
- Installed to: User's `~/.claude/get-shit-done/` during `npx get-shit-done-cc`

**`hooks/dist/` (Built Hooks):**
- Purpose: Hooks bundled with npm package (built during prepublish)
- Generated: Yes, via `npm run build:hooks`
- Source: `hooks/gsd-*.js` source files
- Committed: Yes, pre-built `dist/` committed for installation speed

**`.github/` (CI/CD):**
- Purpose: GitHub workflows for testing and releasing
- Generated: No (source repo content)
- Committed: Yes
- Used by: GSD developers (not users)

---

*Structure analysis: 2026-02-08*
