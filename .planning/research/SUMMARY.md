# Project Research Summary

**Project:** GSD CLI Hardening
**Domain:** Node.js CLI tool hardening (security, testing, reliability, code quality)
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

The GSD CLI is a mature, production-used Node.js meta-prompting tool with a deliberate zero-dependency architecture that serves as both a feature and a constraint. Research across four domains (stack, features, architecture, pitfalls) reveals a clear hardening path: the tool's core functionality is solid, but lacks critical safety infrastructure (error visibility, input validation, atomic operations, test coverage) that makes it fragile during failures and difficult to maintain as it grows.

The recommended approach prioritizes **incremental hardening without disruption**: eliminate silent failures first to make problems visible, add characterization tests to capture current behavior before any refactoring, then systematically decompose the 4,597-line monolith into testable modules while implementing atomic writes and file locking. The key architectural insight is that this must be done in dependency order (helpers → commands → transaction support) with tests passing at every step, not as a big-bang rewrite.

The primary risk is **breaking the installer during refactoring**, as it's the first-run user experience with zero test coverage and three different runtime targets. Secondary risks include changing regex matching behavior that orchestrators depend on, and implementing atomicity incorrectly creating new failure modes. Mitigation: write installer tests before any refactoring, build regex test corpus from real `.planning/` directories, and implement atomicity incrementally starting with highest-risk operations only.

## Key Findings

### Recommended Stack

The hardening stack leverages Node.js built-ins exclusively to maintain the zero-dependency constraint while adding modern tooling for development. The constraint limits choices but prevents supply chain attacks—a critical property for a tool that runs in CI/CD pipelines and modifies user config directories.

**Core technologies:**
- **node:test (built-in)**: Testing framework — Already in use, stable in Node 20+, includes mocking and snapshots, zero-dependency
- **ESLint 8.57.1 (pinned)**: JavaScript linting — Last v8 release, supports Node 16.7+, ESLint 9+ requires Node 18.18+ (incompatible with current floor)
- **Semgrep CE**: Deep static analysis — Free open-source, 2,000+ rules, catches security patterns ESLint misses (command injection, path traversal)
- **Prettier 3.8.1**: Code formatting — Zero-config, eliminates style debates, works with Node 16.7+ constraint
- **Knip 5.x (CI only)**: Dead code detection — Finds unused exports/files/dependencies, requires Node 18+ (development only)
- **lockfile-lint**: Lockfile integrity — Detects malicious registry substitution in npm lockfiles

**Version constraint impact:** Node 16.7+ minimum limits tooling choices. Strong recommendation to bump to Node 18.18+ in a future milestone to unlock ESLint 9, stable `node:test`, coverage thresholds, and Permission Model. Development/CI already runs on Node 18+ (tests require it), so the constraint is runtime compatibility for end users, not a development constraint.

### Expected Features

The feature landscape is shaped by two forces: (1) CONCERNS.md documenting specific gaps in the existing codebase, and (2) industry expectations for mature CLI tools. Features fall into three categories with clear prioritization.

**Must have (table stakes):**
- **Eliminate silent failures** — 46+ empty catch blocks across gsd-tools.js mean failures vanish; mature CLIs log or propagate errors
- **Structured error classes with exit codes** — Users expect non-zero exit codes on failure and actionable messages; currently ad-hoc strings
- **Input validation for all commands** — Users expect clear feedback on bad input; documented weak validation in frontmatter, phases, file paths
- **Path traversal prevention** — Any tool accepting file paths must prevent scope escape; `--file` args and `@references` lack validation
- **Atomic file writes** — Multi-step operations leave inconsistent state on partial failure; write-tmp-then-rename is standard approach
- **Test coverage for critical paths** — No installer tests exist; core commands have ~100 tests but major gaps in error recovery
- **Graceful signal handling** — Users expect Ctrl+C to clean up temp files and release locks, not leave half-written state
- **Config schema migration** — Config schema changed multiple times; old configs lack new fields causing silent failures

**Should have (competitive):**
- **File-based operation locking** — Prevents race conditions when multiple CLI instances run concurrently; documented as missing
- **Dry-run mode** — Preview phase add/remove/complete effects before committing; builds trust for destructive operations
- **Debug/verbose mode** — Enables detailed output for troubleshooting without cluttering normal output; currently no `--verbose` flag
- **Comprehensive validation suite** — Validate STATE.md integrity, ROADMAP.md consistency, phase numbering, frontmatter schemas
- **Regex hardening** — Fragile regex patterns compiled fresh each call; need caching and safer patterns escaping special chars

**Defer (v2+):**
- **Dry-run mode** — High complexity relative to value during initial hardening (requires plan-then-execute refactor)
- **Installation rollback** — High complexity; installer changes risky to batch with other hardening
- **Full async/await conversion** — Massive refactor scope; sync I/O is correct for CLI that runs one command per invocation

**Anti-features (deliberately NOT building):**
- **Production dependencies** — Violates zero-dependency constraint; each dependency is supply chain attack surface
- **Full transaction/rollback system** — Over-engineering; complexity disproportionate to problem (phase ops modify 2-3 files)
- **Modular command architecture refactor during hardening** — Changes every import path, creates merge conflicts; defer to dedicated refactoring milestone

### Architecture Approach

The current architecture is a 4,597-line monolith (`gsd-tools.js`) containing ~90 commands in a dispatch switch. The recommended approach is **incremental extraction** to a lazy-loading command registry where each command group becomes an independent module, shared logic moves to `lib/` modules, and the entry point shrinks to ~50 lines of routing logic.

**Major components:**
1. **lib/helpers.js** — `output()`, `error()`, `safeReadFile()`, `generateSlugInternal()`, path helpers (foundational, no dependencies)
2. **lib/frontmatter.js** — Extract, reconstruct, splice frontmatter; parse must_haves blocks (pure string manipulation)
3. **lib/config.js** — Load config, config-ensure, config-set, schema migration (depends on lib/helpers)
4. **lib/git.js** — `execGit()`, `isGitIgnored()`, commit operations (depends on lib/helpers, lib/config)
5. **lib/lock.js** — `acquireLock()`, `releaseLock()`, `withLock()` wrapper using mkdir-based atomic locking (NEW)
6. **lib/atomic.js** — Transaction class for multi-file atomic operations with collect-execute-rollback pattern (NEW)
7. **commands/*.js** — One module per command group (state, phase, roadmap, verify, template, scaffold, init, milestone, progress, misc)

**Key patterns:**
- **Lazy-loading registry:** Entry point maps command names to file paths, only `require()`s the invoked command module
- **mkdir-based locking:** Use `fs.mkdirSync()` for atomic lock acquisition (OS-level atomic operation, zero dependencies)
- **Multi-file transactions:** Collect operations → execute all → rollback on any failure (addresses documented data integrity risk)
- **Config schema migration:** Add `schema_version` field, apply sequential migration functions to upgrade old configs

**Strict dependency direction:** Entry point → commands/*.js → lib/*.js → Node.js built-ins. No circular dependencies, no command-to-command imports.

### Critical Pitfalls

Research identified seven critical pitfalls that have sunk similar refactoring efforts. Each includes prevention strategies and warning signs.

1. **Breaking the installer while refactoring other code** — Installer is first-run UX with zero test coverage and three runtime targets; shared extraction can break npx resolution. **Mitigation:** Write installer tests BEFORE any refactoring, test actual npx flow in CI, refactor installer LAST after gsd-tools.js is stable.

2. **Refactoring without characterization tests** — Decomposition changes internal structure; without capturing exact current behavior (stdout, stderr, exit codes), orchestrator workflows break silently. **Mitigation:** Write approval tests capturing ALL observable behaviors before extraction, test through CLI interface not internal functions.

3. **Fixing silent error handling by making it too loud** — 60% of empty catches are intentional fallbacks (file-not-found defaults, optional feature detection); converting all to thrown errors or logged warnings breaks graceful degradation. **Mitigation:** Classify each catch (intentional/optional/bug) before changing any, never add `console.error()` inside JSON-outputting commands.

4. **Regex hardening that changes matching behavior** — Current regex patterns evolved to handle specific markdown formats in real `.planning/` directories; "more correct" patterns can break against real-world files that relied on old pattern quirks. **Mitigation:** Collect corpus of real `.planning/` files, test regex changes against corpus, diff outputs before applying.

5. **Adding atomic operations that create new failure modes** — Naive atomicity implementations introduce stale lock deadlocks, accumulated temp files, cross-filesystem rename failures, and complex rollback bugs. **Mitigation:** Implement incrementally starting with highest-risk operations only, use simplest pattern (same-directory temp file + rename), test failure modes explicitly.

6. **Security fixes that break zero-dependency constraint** — Security best practices recommend packages for path traversal, JSONC parsing, command injection; this conflicts with zero-dependency philosophy. **Mitigation:** All security fixes MUST use zero production dependencies, implement with Node.js built-ins only (path validation, execFileSync array args, manual JSONC hardening).

7. **Test retrofitting that tests implementation instead of behavior** — Adding tests that assert internal function calls, exact error strings, or intermediate state breaks on every refactoring even when behavior is preserved. **Mitigation:** Test through CLI interface via `runGsdTools()` helper, assert on JSON structure/semantics not exact strings, create reusable fixture factories.

## Implications for Roadmap

Based on research, suggested phase structure prioritizes **visibility → safety → structure → optimization**. This order addresses the highest-risk gaps first (silent failures, missing tests) before refactoring (decomposition), then adds advanced safety features (transactions, locking) once the structure is stable.

### Phase 1: Foundation & Visibility
**Rationale:** Must establish safety nets before any code changes. Characterization tests capture current behavior so refactoring can be validated. Eliminating silent failures makes problems visible instead of hidden.

**Delivers:**
- Installer test suite (3 runtime targets, install/uninstall/upgrade)
- Characterization tests for all 90+ commands (stdout, stderr, exit codes)
- Classified empty catch blocks (intentional vs. bug)
- Test fixture factories for reusable test data
- Real `.planning/` directory corpus for regex validation

**Addresses:**
- T5: Test coverage for critical paths
- Pitfall 2: Refactoring without characterization tests
- Pitfall 1: Breaking the installer (write tests first)

**Avoids:**
- Making any code changes before tests are in place
- Big-bang test writing (build incrementally, validate as you go)

**Research needs:** Standard testing patterns, no additional research required.

---

### Phase 2: Input Validation & Error Classification
**Rationale:** With tests in place, next priority is input validation (security) and error classification (operational visibility). These are foundational safety features that enable all subsequent work.

**Delivers:**
- Structured error classes (`GsdError`, `ValidationError`, `FileSystemError`, `ConfigError`)
- Exit code standardization (0=success, 1=error, 2=usage, 3=config, 4=filesystem)
- Input validation utilities (`validatePhaseNumber()`, `validateFilePath()`, `validateJsonString()`)
- Path traversal prevention (`safePath(userPath, baseDir)` with symlink resolution)
- Prototype pollution prevention (`sanitizeObject()` filtering dangerous keys)
- Empty catch classification document (which are intentional, which are bugs)

**Addresses:**
- T2: Structured error classes with exit codes
- T3: Input validation for all commands
- T4: Path traversal prevention
- D8: Prototype pollution prevention
- Pitfall 3: Making silent errors too loud (classify first)
- Pitfall 6: Security fixes with zero dependencies

**Uses:**
- Node.js built-ins only (path, fs for validation)

**Research needs:** None — security patterns are well-documented, apply with zero-dependency constraint.

---

### Phase 3: Monolith Decomposition (Incremental)
**Rationale:** With tests and validation in place, decompose the monolith incrementally. Extract in dependency order (helpers first, commands last) so each extraction step is testable and reversible.

**Delivers:**
- `lib/helpers.js` — output(), error(), safeReadFile(), path utilities (no dependencies)
- `lib/frontmatter.js` — frontmatter extraction/reconstruction (pure functions)
- `lib/config.js` — config loading, config-ensure, config-set (depends on helpers)
- `lib/git.js` — git operations wrapper (depends on helpers, config)
- `commands/state.js` — all state subcommands
- `commands/frontmatter.js` — frontmatter CRUD
- `commands/verify.js` — verification suite
- `commands/template.js` — template select + fill
- ... (remaining command groups)

**Implements:**
- Lazy-loading command registry (Pattern 1 from ARCHITECTURE.md)
- Strict dependency direction (entry → commands → lib → built-ins)
- One module per command group

**Addresses:**
- Startup time optimization (only load invoked command)
- Testability (commands become importable, unit-testable)
- Maintainability (smaller files, clear boundaries)

**Avoids:**
- Pitfall 2: Big-bang rewrite (extract one module at a time)
- Anti-pattern 1: Commands importing commands (share via lib/)
- Anti-pattern 4: Extracting lib/ before commands (extract together)

**Research needs:** None — extraction follows documented patterns from ARCHITECTURE.md.

---

### Phase 4: Atomic Operations & Signal Handling
**Rationale:** With monolith decomposed and modules testable, add advanced safety features. Atomic writes and file locking prevent data corruption. Signal handling ensures clean shutdown.

**Delivers:**
- `lib/lock.js` — mkdir-based file locking with stale lock detection
- `lib/atomic.js` — Transaction class for multi-file operations
- Atomic file writes (write-to-temp-then-rename) for STATE.md, ROADMAP.md
- Signal handlers (SIGINT/SIGTERM) for cleanup and lock release
- Temp file cleanup on startup (remove stale `.tmp` files)

**Implements:**
- Pattern 2: mkdir-based file locking (ARCHITECTURE.md)
- Pattern 3: Multi-file atomic transactions (ARCHITECTURE.md)

**Addresses:**
- T6: Atomic file writes
- T7: Graceful signal handling
- D1: File-based operation locking
- Pitfall 5: Atomic operations creating new failure modes (implement incrementally)

**Uses:**
- Node.js built-ins only (fs.mkdirSync for locking, fs.renameSync for atomic writes)

**Research needs:** Test concurrent operations, verify lock cleanup, validate rollback behavior.

---

### Phase 5: Config Migration & Validation Suite
**Rationale:** Once core hardening is stable, add config migration (prevents upgrade failures) and comprehensive validation (catches problems early).

**Delivers:**
- `lib/migration.js` — config schema versioning + sequential migrations
- `schema_version` field in config.json
- Comprehensive validation suite extension (STATE.md integrity, ROADMAP.md consistency, phase numbering, frontmatter schemas, broken references)
- Backup-before-modification for state-modifying operations

**Implements:**
- Pattern 4: Config schema migration (ARCHITECTURE.md)

**Addresses:**
- T9: Config schema migration
- D6: Comprehensive validation suite
- D10: Backup before state-modifying operations

**Research needs:** None — migration patterns are standard.

---

### Phase 6: Polish & Advanced Features
**Rationale:** Core hardening complete. Add quality-of-life features for debugging and developer experience.

**Delivers:**
- Debug/verbose mode (`--verbose` / `--debug` flag)
- Operation timing and performance metrics (when `--verbose`)
- Regex hardening with caching (compile once at module scope)
- Improved error messages with context
- Windows compatibility testing

**Addresses:**
- D4: Debug/verbose mode
- D5: Operation timing
- D7: Regex hardening and caching

**Research needs:** None — polish features, no unknowns.

---

### Phase Ordering Rationale

- **Phase 1 before all others:** Cannot safely change code without tests capturing current behavior. Characterization tests are the prerequisite gate.
- **Phase 2 before Phase 3:** Error visibility and input validation must exist before decomposition, otherwise new modules inherit silent failure patterns.
- **Phase 3 before Phase 4:** Atomic operations and locking add complexity; decomposed modules are easier to test and debug than monolith.
- **Phase 4 before Phase 5:** Config migration and validation build on the decomposed structure and benefit from locking infrastructure.
- **Phase 6 last:** Polish features are nice-to-have; core hardening (Phases 1-5) delivers the critical safety improvements.

**Dependency chain:**
```
Phase 1 (tests) → Phase 2 (validation) → Phase 3 (decomposition) → Phase 4 (atomicity) → Phase 5 (migration) → Phase 6 (polish)
```

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 4:** Concurrent operation testing requires specific scenarios (race conditions, lock contention, rollback correctness). May need `/gsd:research-phase` for advanced locking patterns.

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Testing patterns are well-documented in TESTING.md and Node.js test runner docs.
- **Phase 2:** Input validation and error handling patterns are standard Node.js security practices.
- **Phase 3:** Extraction patterns documented in ARCHITECTURE.md with step-by-step sequence.
- **Phase 5:** Config migration is a solved problem with clear sequential migration pattern.
- **Phase 6:** Polish features are straightforward additions to existing infrastructure.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All tools verified against Node 16.7+ constraint; versions pinned; alternatives evaluated |
| Features | HIGH | Grounded in CONCERNS.md documenting specific gaps + industry expectations for mature CLI tools |
| Architecture | HIGH | Incremental extraction pattern proven in codebase analysis; dependency order validated |
| Pitfalls | HIGH | Codebase-specific analysis combined with verified domain patterns; each pitfall includes warning signs |

**Overall confidence:** HIGH

The research is grounded in direct codebase analysis (CONCERNS.md, ARCHITECTURE.md, TESTING.md, STRUCTURE.md) combined with verified best practices from official Node.js security docs, ESLint documentation, and proven CLI patterns from mature tools (npm, ESLint, Prettier). The zero-dependency constraint is well-understood and factored into all recommendations.

### Gaps to Address

**Node.js version floor (16.7+):** Limits tooling choices. Strong recommendation to bump to Node 18.18+ in a future milestone to unlock modern tooling (ESLint 9, stable coverage thresholds, Permission Model). This is a separate decision outside the hardening scope but impacts long-term maintainability.

**Windows path handling:** CONCERNS.md documents Windows path issues but provides limited real-world Windows test data. During Phase 3 decomposition, validate path normalization with Windows CI testing. Not a blocker—can be handled incrementally.

**Orchestrator output expectations:** The 90+ commands are called by orchestrator `.md` files with specific output format expectations. These expectations are undocumented. During Phase 1 characterization tests, grep all orchestrator files for command usage and document expected output formats. This is data collection, not a research gap.

**Lock file cleanup edge cases:** Stale lock detection (Phase 4) requires policy decisions: how long before a lock is considered stale? What happens if a process is genuinely slow vs. crashed? These are implementation details to resolve during Phase 4 planning, not blockers for roadmap creation.

## Sources

### Primary (HIGH confidence)
- `.planning/codebase/CONCERNS.md` — Direct codebase analysis documenting specific gaps and issues
- `.planning/codebase/ARCHITECTURE.md` — Direct codebase structure and pattern analysis
- `.planning/codebase/TESTING.md` — Current test coverage and gaps
- `.planning/codebase/STRUCTURE.md` — File organization and component inventory
- [Node.js Security Best Practices (Official)](https://nodejs.org/en/learn/getting-started/security-best-practices) — Official Node.js security guidance
- [Node.js v22 Test Runner Documentation](https://nodejs.org/docs/latest-v22.x/api/test.html) — Official test runner features, coverage, mocking
- [ESLint v8 EOL Announcement](https://eslint.org/blog/2024/09/eslint-v8-eol-version-support/) — Version constraint verification

### Secondary (MEDIUM confidence)
- [Node.js CLI Apps Best Practices by Liran Tal](https://github.com/lirantal/nodejs-cli-apps-best-practices) — Industry best practices for Node.js CLIs
- [write-file-atomic (npm)](https://github.com/npm/write-file-atomic) — Atomic write pattern reference (pattern only, not used as dependency)
- [proper-lockfile (npm)](https://www.npmjs.com/package/proper-lockfile) — mkdir-based locking reference implementation (pattern only, not used as dependency)
- [Understand Legacy Code: Testing untested code](https://understandlegacycode.com/blog/best-way-to-start-testing-untested-code/) — Characterization testing patterns
- [Preventing Command Injection in Node.js](https://auth0.com/blog/preventing-command-injection-attacks-in-node-js-apps/) — Confirms execSync vs execFileSync recommendation

### Tertiary (LOW confidence)
- None — all research findings grounded in HIGH or MEDIUM confidence sources

---
*Research completed: 2026-02-08*
*Ready for roadmap: yes*
