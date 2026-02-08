# Architecture Research

**Domain:** Node.js CLI tool modularization and hardening
**Researched:** 2026-02-08
**Confidence:** HIGH

## Current Architecture Analysis

The GSD CLI is a single-file monolith (`get-shit-done/bin/gsd-tools.js`, 4,597 lines) containing ~90 commands, a dispatch switch, shared helpers, frontmatter parsing, state management, phase operations, verification suites, template filling, and compound "init" commands. The installer (`bin/install.js`, 1,739 lines) mixes three runtime targets (Claude Code, OpenCode, Gemini) with path resolution, JSONC parsing, frontmatter conversion, and file copying logic.

### What Works Today

- **Zero dependencies.** The entire tool runs on Node.js built-ins (fs, path, child_process, crypto). This is a feature, not debt.
- **Consistent CLI interface.** Every consumer calls `node gsd-tools.js <command> [args] [--raw]`. All output goes through `output()` or `error()` functions.
- **JSON-or-text output.** The `--raw` flag provides machine-readable JSON; without it, output is human-friendly. This duality is preserved by the `output()` helper.
- **Internal helper reuse.** Functions like `findPhaseInternal()`, `resolveModelInternal()`, `generateSlugInternal()` are shared across commands.

### What Breaks Down

- **No isolation.** Every `require()` loads all 4,597 lines regardless of which single command runs. Startup tax grows with every new command.
- **No unit testing of individual commands.** The test file (2,033 lines) shells out via `execSync` for every assertion because functions are not importable.
- **Shared mutable state between functions.** Functions like `cmdPhaseRemove` (253 lines, 2677-2930) contain inline multi-file operations with no atomicity guarantees.
- **Concurrent access collisions.** Multiple CLI invocations can write to STATE.md or ROADMAP.md simultaneously with no coordination.

## Recommended Architecture

### System Overview

```
                            CLI Entry Point
                         (gsd-tools.js ~50 lines)
                                  |
                        +---------+---------+
                        |                   |
                   arg parsing         command registry
                   (minimal)           (lazy loading)
                        |                   |
                        +--------+----------+
                                 |
                    require('./commands/<name>.js')
                                 |
                    +------------+------------+
                    |            |            |
               state/*     phase/*     verify/*  ...
                    |            |            |
                    +------+-----+------+----+
                           |            |
                      lib/helpers    lib/lock
                      lib/config     lib/atomic
                      lib/frontmatter
                      lib/git
```

### Component Boundaries

| Component | Responsibility | Communicates With | Lines (est.) |
|-----------|---------------|-------------------|-------------|
| **Entry point** (`gsd-tools.js`) | Parse args, resolve command name, lazy-load module, invoke | Command modules | ~50 |
| **Command registry** (`lib/registry.js`) | Map command names to module paths, validate subcommands | Entry point | ~60 |
| **lib/helpers.js** | `output()`, `error()`, `safeReadFile()`, `generateSlugInternal()`, `normalizePhaseName()`, `parseIncludeFlag()` | All commands | ~80 |
| **lib/config.js** | `loadConfig()`, `cmdConfigEnsureSection()`, `cmdConfigSet()`, config schema migration | Commands needing config, lib/migration | ~120 |
| **lib/frontmatter.js** | `extractFrontmatter()`, `reconstructFrontmatter()`, `spliceFrontmatter()`, `parseMustHavesBlock()` | State, phase, verify, template commands | ~150 |
| **lib/git.js** | `execGit()`, `isGitIgnored()`, `cmdCommit()` | Phase ops, verify commits | ~80 |
| **lib/lock.js** | `acquireLock()`, `releaseLock()`, `withLock()` wrapper | Any command writing to `.planning/` | ~80 |
| **lib/atomic.js** | `Transaction` class: collect operations, execute-or-rollback | Phase add/remove/complete, milestone complete | ~120 |
| **lib/migration.js** | Config schema versioning, upgrade functions per version | lib/config, entry point | ~100 |
| **commands/state.js** | `load`, `get`, `update`, `patch`, `advance-plan`, `record-metric`, `update-progress`, `add-decision`, `add-blocker`, `resolve-blocker`, `record-session`, `snapshot` | lib/helpers, lib/frontmatter, lib/lock | ~350 |
| **commands/phase.js** | `next-decimal`, `add`, `insert`, `remove`, `complete`, `list` | lib/helpers, lib/frontmatter, lib/git, lib/lock, lib/atomic | ~550 |
| **commands/roadmap.js** | `get-phase`, `analyze` | lib/helpers, lib/frontmatter | ~200 |
| **commands/verify.js** | `plan-structure`, `phase-completeness`, `references`, `commits`, `artifacts`, `key-links`, `summary` | lib/helpers, lib/frontmatter, lib/git | ~350 |
| **commands/frontmatter.js** | `get`, `set`, `merge`, `validate` | lib/frontmatter, lib/helpers | ~80 |
| **commands/template.js** | `select`, `fill` | lib/helpers, lib/frontmatter, lib/config | ~220 |
| **commands/scaffold.js** | `context`, `uat`, `verification`, `phase-dir` | lib/helpers | ~70 |
| **commands/init.js** | All `init <workflow>` compound commands | All other commands (internal), lib/config | ~650 |
| **commands/milestone.js** | `complete` | lib/helpers, lib/frontmatter, lib/git, lib/atomic | ~140 |
| **commands/progress.js** | `json`, `table`, `bar` renderers | lib/helpers, commands/state (internal read) | ~80 |
| **commands/misc.js** | `generate-slug`, `current-timestamp`, `list-todos`, `verify-path-exists`, `history-digest`, `summary-extract`, `phase-plan-index`, `websearch`, `todo complete`, `validate consistency` | lib/helpers, lib/frontmatter | ~400 |

### Dependency Direction (strict)

```
Entry point
    |
    v
Command modules (commands/*.js)
    |
    v
Library modules (lib/*.js)
    |
    v
Node.js built-ins (fs, path, child_process, crypto)
```

**Rule: lib/ modules never import from commands/. Commands never import from other commands.** Shared logic lives in lib/. If two commands share a function, it moves to lib/.

## Recommended Project Structure

```
get-shit-done/bin/
├── gsd-tools.js           # Entry point: arg parse + lazy dispatch (~50 lines)
├── lib/
│   ├── registry.js        # Command name -> module path mapping
│   ├── helpers.js          # output(), error(), safeReadFile(), slug, timestamps
│   ├── config.js           # loadConfig(), config-ensure, config-set, defaults
│   ├── frontmatter.js      # extract, reconstruct, splice, parseMustHaves
│   ├── git.js              # execGit(), isGitIgnored(), cmdCommit()
│   ├── lock.js             # mkdir-based file locking for .planning/
│   ├── atomic.js           # Transaction class for multi-file operations
│   └── migration.js        # Config schema versioning + upgrade functions
├── commands/
│   ├── state.js            # All state subcommands
│   ├── phase.js            # Phase CRUD + complete
│   ├── roadmap.js          # Roadmap extraction + analysis
│   ├── verify.js           # Verification suite
│   ├── frontmatter.js      # Frontmatter CRUD
│   ├── template.js         # Template select + fill
│   ├── scaffold.js         # Scaffolding commands
│   ├── init.js             # Compound init commands (workflow context loaders)
│   ├── milestone.js        # Milestone operations
│   ├── progress.js         # Progress rendering
│   └── misc.js             # slug, timestamp, todos, history-digest, websearch, validate
└── gsd-tools.test.js       # Integration tests (existing, untouched during refactor)
    tests/
    ├── state.test.js       # Unit tests for state module
    ├── phase.test.js       # Unit tests for phase module
    ├── frontmatter.test.js # Unit tests for frontmatter lib
    ├── lock.test.js        # Unit tests for locking
    ├── atomic.test.js      # Unit tests for transactions
    └── ...
```

### Structure Rationale

- **lib/ vs commands/:** Clear separation between reusable infrastructure (lib/) and command implementations (commands/). This matches the existing conceptual split in gsd-tools.js where helper functions (lines 141-475) are separate from command functions (lines 482+).
- **One file per command group:** Commands are already grouped by the switch statement in `main()` (state, phase, roadmap, verify, frontmatter, template, scaffold, init, milestone, progress). Each case block maps to one file.
- **Flat commands/:** No nesting. The command group is determined by the first arg, the subcommand by the second. The registry maps `"state"` to `"./commands/state.js"`.

## Architectural Patterns

### Pattern 1: Lazy-Loading Command Registry

**What:** Entry point maps command names to file paths. When a command is invoked, only that module is `require()`'d. All other modules stay on disk.

**When to use:** Always. This is the core pattern for the refactored entry point.

**Trade-offs:** Slightly more indirection (command name -> file lookup -> require -> function call) vs. significant startup time reduction. For 90+ commands where only 1 runs per invocation, this is unambiguously correct.

**Example:**

```javascript
// gsd-tools.js (new entry point, ~50 lines)
const COMMANDS = {
  'state':       './commands/state.js',
  'phase':       './commands/phase.js',
  'roadmap':     './commands/roadmap.js',
  'verify':      './commands/verify.js',
  'frontmatter': './commands/frontmatter.js',
  'template':    './commands/template.js',
  'scaffold':    './commands/scaffold.js',
  'init':        './commands/init.js',
  'milestone':   './commands/milestone.js',
  'progress':    './commands/progress.js',
  // Flat commands route to misc
  'generate-slug':      './commands/misc.js',
  'current-timestamp':  './commands/misc.js',
  'list-todos':         './commands/misc.js',
  'verify-path-exists': './commands/misc.js',
  'verify-summary':     './commands/misc.js',
  'history-digest':     './commands/misc.js',
  'commit':             './commands/misc.js',
  'find-phase':         './commands/misc.js',
  'resolve-model':      './commands/misc.js',
  'config-ensure-section': './commands/misc.js',
  'config-set':         './commands/misc.js',
  'summary-extract':    './commands/misc.js',
  'state-snapshot':     './commands/misc.js',
  'phase-plan-index':   './commands/misc.js',
  'phases':             './commands/misc.js',
  'websearch':          './commands/misc.js',
  'todo':               './commands/misc.js',
  'validate':           './commands/misc.js',
};

async function main() {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  const command = args[0];
  if (!command || !COMMANDS[command]) {
    const { error } = require('./lib/helpers');
    error(`Unknown command: ${command}\nAvailable: ${Object.keys(COMMANDS).join(', ')}`);
  }

  const mod = require(COMMANDS[command]);
  await mod(command, args.slice(1), raw, process.cwd());
}

main();
```

### Pattern 2: mkdir-Based File Locking (Zero Dependencies)

**What:** Use `fs.mkdirSync()` to create a `.lock` directory as an atomic lock acquisition. Directory creation is atomic at the OS level on all platforms. If `EEXIST`, another process holds the lock.

**When to use:** Any command that writes to `.planning/STATE.md`, `.planning/ROADMAP.md`, or modifies phase directories. Not needed for read-only commands.

**Trade-offs:** Advisory locking only (respecting processes must cooperate). Stale lock detection adds complexity. But for a CLI tool where concurrent access is occasional, not constant, this is the right weight.

**Example:**

```javascript
// lib/lock.js
const fs = require('fs');
const path = require('path');

const LOCK_DIR = '.planning/.gsd-lock';
const STALE_MS = 30000; // 30 seconds

function acquireLock(cwd, retries = 10, intervalMs = 200) {
  const lockPath = path.join(cwd, LOCK_DIR);

  for (let i = 0; i < retries; i++) {
    try {
      fs.mkdirSync(lockPath);
      // Write PID + timestamp for stale detection
      fs.writeFileSync(path.join(lockPath, 'info'), JSON.stringify({
        pid: process.pid,
        time: Date.now(),
      }));
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Check for stale lock
        try {
          const info = JSON.parse(fs.readFileSync(path.join(lockPath, 'info'), 'utf-8'));
          if (Date.now() - info.time > STALE_MS) {
            // Stale lock -- break it
            fs.rmSync(lockPath, { recursive: true });
            continue; // Retry immediately
          }
        } catch {
          // Can't read info -- assume stale, break it
          try { fs.rmSync(lockPath, { recursive: true }); } catch {}
          continue;
        }
        // Lock is fresh -- wait and retry
        const waitMs = intervalMs + Math.random() * 50;
        const end = Date.now() + waitMs;
        while (Date.now() < end) { /* busy wait for sync context */ }
        continue;
      }
      throw err;
    }
  }
  return false; // Could not acquire lock
}

function releaseLock(cwd) {
  const lockPath = path.join(cwd, LOCK_DIR);
  try {
    fs.rmSync(lockPath, { recursive: true });
  } catch {}
}

function withLock(cwd, fn) {
  if (!acquireLock(cwd)) {
    throw new Error('Could not acquire lock on .planning/ -- another gsd-tools process may be running');
  }
  try {
    return fn();
  } finally {
    releaseLock(cwd);
  }
}

module.exports = { acquireLock, releaseLock, withLock };
```

### Pattern 3: Multi-File Atomic Transactions (Collect-Execute-Rollback)

**What:** Accumulate a list of file operations (write, mkdir, rename, delete) into a transaction. Execute all at once. If any step fails, rollback all completed steps by undoing in reverse order. Backup original files before overwriting.

**When to use:** `phase add`, `phase insert`, `phase remove`, `phase complete`, `milestone complete` -- any command that modifies multiple files where partial completion leaves inconsistent state.

**Trade-offs:** Adds ~120 lines of infrastructure. Rollback is best-effort (if the disk itself is failing, rollback may also fail). But the current state -- no rollback at all -- is strictly worse.

**Example:**

```javascript
// lib/atomic.js
const fs = require('fs');
const path = require('path');

class Transaction {
  constructor(cwd) {
    this.cwd = cwd;
    this.ops = [];
    this.completed = [];
    this.backupDir = null;
  }

  write(filePath, content) {
    this.ops.push({ type: 'write', filePath, content });
    return this;
  }

  mkdir(dirPath) {
    this.ops.push({ type: 'mkdir', dirPath });
    return this;
  }

  remove(targetPath) {
    this.ops.push({ type: 'remove', targetPath });
    return this;
  }

  rename(oldPath, newPath) {
    this.ops.push({ type: 'rename', oldPath, newPath });
    return this;
  }

  execute() {
    // Create temp backup dir
    this.backupDir = path.join(this.cwd, '.planning', '.tx-backup-' + Date.now());
    fs.mkdirSync(this.backupDir, { recursive: true });

    for (const op of this.ops) {
      try {
        this._executeOp(op);
        this.completed.push(op);
      } catch (err) {
        this._rollback();
        // Clean up backup dir
        try { fs.rmSync(this.backupDir, { recursive: true }); } catch {}
        throw new Error(`Transaction failed at ${op.type} ${op.filePath || op.dirPath || op.targetPath}: ${err.message}`);
      }
    }

    // Success -- clean up backup dir
    try { fs.rmSync(this.backupDir, { recursive: true }); } catch {}
    return this.completed.length;
  }

  _executeOp(op) {
    switch (op.type) {
      case 'write': {
        // Backup existing file if it exists
        if (fs.existsSync(op.filePath)) {
          const rel = path.relative(this.cwd, op.filePath);
          const backupPath = path.join(this.backupDir, rel);
          fs.mkdirSync(path.dirname(backupPath), { recursive: true });
          fs.copyFileSync(op.filePath, backupPath);
          op._backup = backupPath;
        }
        fs.mkdirSync(path.dirname(op.filePath), { recursive: true });
        fs.writeFileSync(op.filePath, op.content, 'utf-8');
        break;
      }
      case 'mkdir': {
        if (!fs.existsSync(op.dirPath)) {
          fs.mkdirSync(op.dirPath, { recursive: true });
          op._created = true;
        }
        break;
      }
      case 'remove': {
        if (fs.existsSync(op.targetPath)) {
          const rel = path.relative(this.cwd, op.targetPath);
          const backupPath = path.join(this.backupDir, rel);
          fs.mkdirSync(path.dirname(backupPath), { recursive: true });
          fs.cpSync(op.targetPath, backupPath, { recursive: true });
          op._backup = backupPath;
          fs.rmSync(op.targetPath, { recursive: true });
        }
        break;
      }
      case 'rename': {
        fs.renameSync(op.oldPath, op.newPath);
        break;
      }
    }
  }

  _rollback() {
    // Reverse completed operations
    for (let i = this.completed.length - 1; i >= 0; i--) {
      const op = this.completed[i];
      try {
        switch (op.type) {
          case 'write':
            if (op._backup) {
              fs.copyFileSync(op._backup, op.filePath);
            } else {
              fs.unlinkSync(op.filePath);
            }
            break;
          case 'mkdir':
            if (op._created) fs.rmSync(op.dirPath, { recursive: true });
            break;
          case 'remove':
            if (op._backup) fs.cpSync(op._backup, op.targetPath, { recursive: true });
            break;
          case 'rename':
            fs.renameSync(op.newPath, op.oldPath);
            break;
        }
      } catch {
        // Best effort rollback -- log but continue
      }
    }
  }
}

module.exports = { Transaction };
```

### Pattern 4: Config Schema Migration

**What:** Add a `schema_version` field to `config.json`. On load, compare against the current expected version. If older, run sequential migration functions to upgrade. Each migration is a pure function that transforms config v(N) to v(N+1).

**When to use:** Any time the config schema changes (new fields, renamed fields, restructured sections).

**Trade-offs:** Small overhead on every config load (version check). But prevents "works on new installs, breaks on upgrades" which is the current failure mode.

**Example:**

```javascript
// lib/migration.js
const CURRENT_SCHEMA_VERSION = 2;

const MIGRATIONS = {
  // v1 -> v2: Added brave_search, normalized parallelization
  1: (config) => {
    if (config.brave_search === undefined) config.brave_search = false;
    if (typeof config.parallelization === 'object') {
      config.parallelization = config.parallelization.enabled ?? true;
    }
    config.schema_version = 2;
    return config;
  },
};

function migrateConfig(config) {
  const version = config.schema_version || 1;
  let current = { ...config };

  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    if (MIGRATIONS[v]) {
      current = MIGRATIONS[v](current);
    }
  }
  return current;
}

module.exports = { migrateConfig, CURRENT_SCHEMA_VERSION };
```

## Data Flow

### Command Execution Flow

```
[CLI invocation: node gsd-tools.js state update field value --raw]
    |
    v
[Entry point] parses: command="state", args=["update","field","value"], raw=true
    |
    v
[Registry lookup] COMMANDS["state"] => "./commands/state.js"
    |
    v
[Lazy require] require("./commands/state.js")
    |
    v
[commands/state.js] dispatches subcommand "update"
    |
    v
[cmdStateUpdate] calls:
    lib/helpers.js  -> safeReadFile()
    lib/lock.js     -> withLock()
    lib/config.js   -> loadConfig()
    fs.writeFileSync (inside lock)
    |
    v
[lib/helpers.js] output() -> JSON to stdout
```

### Write-Path Data Flow (with locking)

```
[Command wanting to write]
    |
    v
[lib/lock.js] acquireLock(cwd)
    |  Creates .planning/.gsd-lock/ directory (atomic mkdir)
    |  Writes PID + timestamp to .gsd-lock/info
    v
[Command performs writes]
    |  Reads current file -> modifies -> writes back
    |  For multi-file: uses Transaction from lib/atomic.js
    v
[lib/lock.js] releaseLock(cwd)
    |  Removes .planning/.gsd-lock/ directory
    v
[Done]
```

### Atomic Multi-File Operation Flow

```
[cmdPhaseRemove(cwd, targetPhase)]
    |
    v
[withLock(cwd, () => {
    const tx = new Transaction(cwd);
    tx.write(roadmapPath, newRoadmapContent);   // Update ROADMAP.md
    tx.remove(phaseDir);                         // Remove phase directory
    tx.rename(nextPhaseDir, renumberedDir);       // Renumber subsequent phases
    tx.write(statePath, newStateContent);         // Update STATE.md
    tx.execute();                                 // All-or-nothing
})]
    |
    +--> Success: all 4 operations committed, backup cleaned
    +--> Failure at step 3: steps 1-2 rolled back, error thrown
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (<100 phases) | Modularization alone solves the maintainability problem. File locking prevents corruption. |
| 100-500 phases | Phase index file (`.planning/phase-index.json`) avoids repeated directory scanning. Incremental history digest caches previous results. |
| 500+ phases | Stream-based ROADMAP parsing instead of loading entire file into memory. This scale is unlikely for this tool. |

### Scaling Priorities

1. **First bottleneck:** Startup time from loading all code. Fixed by lazy loading -- only the invoked command module loads.
2. **Second bottleneck:** Directory scanning for phase lookups. Fixed by building a phase index on write operations and reading it back.

## Anti-Patterns

### Anti-Pattern 1: Big-Bang Rewrite

**What people do:** Rewrite the entire 4,597-line file from scratch into the new module structure in a single PR.
**Why it is wrong:** High risk of regression. The test suite runs via `execSync` against the compiled entry point, so the external interface must remain identical at every step. A big-bang rewrite makes bisecting regressions impossible.
**Do this instead:** Incremental extraction. Move one function group at a time (e.g., lib/frontmatter.js first), re-export from the monolith, run tests, repeat. The monolith shrinks by ~150 lines per extraction step.

### Anti-Pattern 2: Commands Importing Commands

**What people do:** Have `commands/init.js` directly `require('./phase.js')` to call phase-finding logic, creating circular or spaghetti dependencies.
**Why it is wrong:** Creates hidden coupling. If phase.js changes its internal API, init.js breaks silently.
**Do this instead:** Share logic via lib/ modules. Both init.js and phase.js call `findPhaseInternal()` from lib/helpers.js. No command knows about another command's existence.

### Anti-Pattern 3: Async Locking in Sync CLI

**What people do:** Use `async` lock acquisition with polling intervals, Promise-based retry, etc.
**Why it is wrong:** The entire gsd-tools.js codebase is synchronous (except `cmdWebsearch`). Introducing async locking means converting all callers to async, a massive refactor with no user-facing benefit.
**Do this instead:** Use synchronous `fs.mkdirSync()` for lock acquisition with a sync busy-wait retry loop. Matches the existing execution model. The lock is held for milliseconds (file writes), not seconds.

### Anti-Pattern 4: Extracting lib/ Before commands/

**What people do:** Create all lib/ modules first, then try to refactor commands to use them.
**Why it is wrong:** You cannot know exactly which helper interface each command needs until you extract the command. Over-designing lib/ upfront creates unused abstractions.
**Do this instead:** Extract one command group + its helpers together. For example, extract `commands/frontmatter.js` and simultaneously move `extractFrontmatter()`, `reconstructFrontmatter()`, `spliceFrontmatter()` into `lib/frontmatter.js`. The lib/ module API is shaped by actual consumers.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Entry point -> Command module | `require()` + function call with `(command, args, raw, cwd)` | Uniform interface for all command modules |
| Command module -> lib/ | Direct `require()` + function call | Sync calls, no events or callbacks |
| lib/lock.js -> filesystem | `fs.mkdirSync()` / `fs.rmSync()` | Advisory locking via directory creation |
| lib/atomic.js -> filesystem | Backup-execute-rollback pattern | Uses temp dir under `.planning/` |
| lib/migration.js -> lib/config.js | Called during `loadConfig()` | Transparent to command modules |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Git (via child_process) | `execSync('git ...')` through lib/git.js | No change from current pattern |
| Brave Search API | `https.request()` in commands/misc.js (websearch) | Only async command; isolated |
| Filesystem (.planning/) | `fs.*Sync` through lib/ modules | All writes go through lock |

## Migration Strategy: Incremental Extraction

### Principle: Shrink the Monolith, Never Break Tests

Every extraction step must:
1. Move functions from `gsd-tools.js` to the new module
2. `require()` and re-export them back from the original location
3. Run `npm test` -- all existing tests must pass
4. Only after tests pass, update internal callers to use the new module directly

### Step-by-step extraction sequence for gsd-tools.js:

**Step 1: Extract lib/helpers.js** (lines 141-475)
- Move: `parseIncludeFlag`, `safeReadFile`, `normalizePhaseName`, `output`, `error`, `generateSlugInternal`, `pathExistsInternal`
- Dependencies: None (pure functions + fs)
- Risk: LOW -- these are leaf functions with no callers inside the same layer

**Step 2: Extract lib/frontmatter.js** (lines 252-465)
- Move: `extractFrontmatter`, `reconstructFrontmatter`, `spliceFrontmatter`, `parseMustHavesBlock`
- Dependencies: None (pure string manipulation)
- Risk: LOW -- most complex function is `extractFrontmatter` at 75 lines, well-defined I/O

**Step 3: Extract lib/config.js** (lines 157-208 + 571-665)
- Move: `loadConfig`, `cmdConfigEnsureSection`, `cmdConfigSet`
- Dependencies: lib/helpers.js (safeReadFile, output, error)
- Risk: LOW -- self-contained config operations

**Step 4: Extract lib/git.js** (lines 210-241 + 1380-1426)
- Move: `isGitIgnored`, `execGit`, `cmdCommit`
- Dependencies: lib/helpers.js (output, error), lib/config.js (loadConfig for commit_docs check)
- Risk: LOW -- isolated external process calls

**Step 5: Extract commands/state.js** (lines 951-1315 + 1844-1943)
- Move: All `cmdState*` functions + `stateExtractField`, `stateReplaceField`, `cmdStateSnapshot`
- Dependencies: lib/helpers, lib/frontmatter, lib/config
- Risk: MEDIUM -- largest command group, 15 functions, but well-scoped

**Step 6: Extract commands/frontmatter.js** (lines 2066-2128)
- Move: `cmdFrontmatterGet`, `cmdFrontmatterSet`, `cmdFrontmatterMerge`, `cmdFrontmatterValidate`
- Dependencies: lib/helpers, lib/frontmatter
- Risk: LOW -- thin wrappers around lib/frontmatter

**Step 7: Extract commands/verify.js** (lines 2130-2420 + 1428-1522)
- Move: All `cmdVerify*` functions + `cmdVerifySummary`
- Dependencies: lib/helpers, lib/frontmatter, lib/git
- Risk: MEDIUM -- some functions are complex (cmdVerifyArtifacts has must_haves parsing)

**Step 8: Extract commands/template.js** (lines 1524-1734)
- Move: `cmdTemplateSelect`, `cmdTemplateFill`
- Dependencies: lib/helpers, lib/frontmatter, lib/config
- Risk: LOW -- two functions, well-defined

**Step 9: Extract commands/phase.js** (lines 752-950 + 2540-2929 + 2930-3071)
- Move: `cmdPhasesList`, `cmdPhaseNextDecimal`, `cmdPhaseAdd`, `cmdPhaseInsert`, `cmdPhaseRemove`, `cmdPhaseComplete`
- Dependencies: lib/helpers, lib/frontmatter, lib/git, lib/config
- Risk: HIGH -- `cmdPhaseRemove` is 253 lines with complex renumbering logic. Extract as-is first, then add atomic/lock later.

**Step 10: Extract commands/roadmap.js** (lines 824-881 + 2422-2539)
- Move: `cmdRoadmapGetPhase`, `cmdRoadmapAnalyze`
- Dependencies: lib/helpers, lib/frontmatter
- Risk: LOW -- two self-contained functions

**Step 11: Extract commands/milestone.js** (lines 3072-3191)
- Move: `cmdMilestoneComplete`, `getMilestoneInfo`
- Dependencies: lib/helpers, lib/frontmatter, lib/git
- Risk: MEDIUM -- milestone archive logic touches multiple files

**Step 12: Extract commands/init.js** (lines 3475-4213)
- Move: All `cmdInit*` + internal helpers (`resolveModelInternal`, `findPhaseInternal`, etc.)
- Dependencies: lib/helpers, lib/frontmatter, lib/config, lib/git
- Risk: MEDIUM -- 12 functions, but each is a data aggregator, not a modifier

**Step 13: Extract remaining into commands/misc.js**
- Move: `cmdGenerateSlug`, `cmdCurrentTimestamp`, `cmdListTodos`, `cmdVerifyPathExists`, `cmdHistoryDigest`, `cmdSummaryExtract`, `cmdPhasePlanIndex`, `cmdWebsearch`, `cmdTodoComplete`, `cmdValidateConsistency`, `cmdProgressRender`, `cmdScaffold`
- Dependencies: lib/helpers, lib/frontmatter
- Risk: LOW -- independent leaf commands

**Step 14: Replace main() switch with lazy-loading registry**
- At this point, all functions have been extracted. The monolith is empty except for `main()`.
- Replace `main()` with the registry pattern from Pattern 1.
- Risk: LOW -- all commands already work as modules

**Step 15: Add lib/lock.js and lib/atomic.js**
- New code, not extraction. Wire into commands/phase.js and commands/milestone.js.
- Test with concurrent invocation scenarios.
- Risk: MEDIUM -- new functionality, needs dedicated tests

**Step 16: Add lib/migration.js**
- New code. Wire into lib/config.js `loadConfig()`.
- Risk: LOW -- purely additive

## Build Order (Dependencies Between Refactoring Steps)

```
Step 1:  lib/helpers.js        <-- No dependencies, extract first
Step 2:  lib/frontmatter.js    <-- No dependencies
Step 3:  lib/config.js         <-- Depends on lib/helpers
Step 4:  lib/git.js            <-- Depends on lib/helpers, lib/config
    |
    +-- Steps 1-4 create the full lib/ foundation
    |
Step 5:  commands/state.js     <-- Depends on lib/*
Step 6:  commands/frontmatter.js  <-- Depends on lib/*
Step 7:  commands/verify.js    <-- Depends on lib/*
Step 8:  commands/template.js  <-- Depends on lib/*
Step 9:  commands/phase.js     <-- Depends on lib/* (highest risk)
Step 10: commands/roadmap.js   <-- Depends on lib/*
Step 11: commands/milestone.js <-- Depends on lib/*
Step 12: commands/init.js      <-- Depends on lib/* (reads from all domains)
Step 13: commands/misc.js      <-- Depends on lib/*
    |
    +-- Steps 5-13 can be done in any order, but init.js last (it depends on internal helpers
    |   that other commands also use, so extracting those first reduces churn)
    |
Step 14: Entry point rewrite   <-- Depends on all commands/* being extracted
    |
Step 15: lib/lock.js + lib/atomic.js  <-- New code, wired after structure stabilizes
Step 16: lib/migration.js      <-- New code, wired into lib/config.js
```

### Parallel Opportunities

Steps 5-13 (command extraction) are independent of each other and can be done in parallel by different agents if the lib/ foundation (Steps 1-4) is complete. However, each step should be committed separately so tests can be run after each extraction.

## Install.js Refactoring (Separate Track)

The installer refactoring follows the same incremental pattern but is an independent workstream:

| Module | Extract From | Responsibility |
|--------|-------------|----------------|
| `lib/install/runtime-claude.js` | install.js | Claude Code-specific path resolution, config format |
| `lib/install/runtime-opencode.js` | install.js | OpenCode path resolution, JSONC config, permission setup |
| `lib/install/runtime-gemini.js` | install.js | Gemini path resolution, TOML conversion |
| `lib/install/converter.js` | install.js | `convertClaudeToOpencodeFrontmatter`, `convertClaudeToGeminiAgent`, `convertClaudeToGeminiToml`, `stripSubTags`, `convertToolName` |
| `lib/install/manifest.js` | install.js | `generateManifest`, `writeManifest`, `fileHash`, `saveLocalPatches`, `reportLocalPatches` |
| `lib/install/settings.js` | install.js | `readSettings`, `writeSettings`, `getCommitAttribution`, `processAttribution` |
| `lib/install/core.js` | install.js | `install()`, `uninstall()`, `copyFlattenedCommands`, `copyWithPathReplacement` |

**Build order:** converter.js first (pure functions), then manifest.js and settings.js (independent), then runtime modules (depend on converter + settings), then core.js (depends on everything).

## Sources

- Codebase analysis: `/Users/naveennegi/Documents/codebase/poc/get-shit-done/.planning/codebase/ARCHITECTURE.md`
- Codebase concerns: `/Users/naveennegi/Documents/codebase/poc/get-shit-done/.planning/codebase/CONCERNS.md`
- Codebase structure: `/Users/naveennegi/Documents/codebase/poc/get-shit-done/.planning/codebase/STRUCTURE.md`
- [Lazy-Loading Node Modules with Commander](https://alexramsdell.com/writing/lazy-loading-node-modules-with-commander/) -- Pattern for delayed require in CLI tools
- [Understanding Node.js file locking (LogRocket)](https://blog.logrocket.com/understanding-node-js-file-locking/) -- mkdir-based locking strategy
- [proper-lockfile (npm)](https://www.npmjs.com/package/proper-lockfile) -- Reference implementation for mkdir locking
- [write-file-atomic (npm)](https://github.com/npm/write-file-atomic) -- Atomic write pattern (temp file + rename)
- [atomically (npm)](https://www.npmjs.com/package/atomically) -- Zero-dependency atomic file operations reference
- [JavaScript Modules in 2026](https://thelinuxcode.com/javascript-modules-in-2026-practical-patterns-with-commonjs-and-es-modules/) -- CJS/ESM patterns

---
*Architecture research for: GSD CLI modularization and hardening*
*Researched: 2026-02-08*
