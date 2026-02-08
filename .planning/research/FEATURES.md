# Feature Research: Node.js CLI Hardening

**Domain:** Node.js CLI tool hardening (security, reliability, error handling, testing, performance)
**Researched:** 2026-02-08
**Confidence:** HIGH (grounded in codebase analysis + Node.js official docs + CLI best practices literature)

## Context

This research targets a hardening pass for an existing Node.js CLI tool with zero production dependencies. The codebase consists of a ~4,600-line main CLI file (`gsd-tools.js`), a ~1,740-line installer (`install.js`), hook scripts, and a build script. Known issues are documented in `.planning/codebase/CONCERNS.md` and include: silent failures (empty catches in 46+ locations), weak input validation, path traversal risks, environment variable exposure, fragile regex parsing, no atomic multi-file operations, no concurrent operation locking, and thin test coverage.

The zero-dependency constraint is non-negotiable and a deliberate architectural choice (immune to supply chain attacks). All hardening must use Node.js built-in modules only.

---

## Feature Landscape

### Table Stakes (Must Have or Users/Developers Leave)

Features that any mature, maintained CLI tool is expected to have. Missing these signals unmaintained software and erodes trust.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| T1 | **Eliminate silent failures (empty catches)** | Developers expect errors to be visible. 46+ empty `catch {}` blocks across gsd-tools.js mean failures vanish silently, making debugging nearly impossible. Every mature CLI logs or propagates errors. | LOW | Systematic pass: replace `catch {}` with `catch (e) { /* log or propagate */ }`. Categorize each: (a) truly ignorable (file-not-found where fallback is intended), (b) should warn, (c) should error. ~2-3 hours of review + replacement. |
| T2 | **Structured error classes with exit codes** | Users expect non-zero exit codes on failure and actionable error messages. Currently, errors are ad-hoc strings. POSIX convention: exit 0 = success, 1 = general error, 2 = misuse. Mature CLIs (npm, git) follow this rigorously. | MEDIUM | Create `GsdError` base class + subclasses (`ValidationError`, `FileSystemError`, `ConfigError`, `PhaseError`). Map each to an exit code (1-124 range). Wire into command dispatch. |
| T3 | **Input validation for all commands** | Users expect clear feedback on bad input, not silent misbehavior. CONCERNS.md documents weak validation in frontmatter commands, phase operations, and file paths. OWASP and Node.js security docs list input validation as foundational. | MEDIUM | Create validation utility functions: `validatePhaseNumber()`, `validateFilePath()`, `validateJsonString()`, `validateFieldName()`. Apply at command dispatch before any logic runs. Reject bad input early with specific messages. |
| T4 | **Path traversal prevention** | Any tool that accepts user-provided file paths must prevent escape from intended scope. CONCERNS.md documents that `--file` args and `@references` lack validation. Node.js official security best practices explicitly call this out (CWE-427). | MEDIUM | Implement `safePath(userPath, baseDir)` that: (a) resolves to absolute path, (b) resolves symlinks via `fs.realpathSync`, (c) verifies result starts with `baseDir`, (d) rejects paths containing `..` segments after resolution. Apply to all file-accepting commands. |
| T5 | **Test coverage for critical paths** | No installer tests exist. Core commands have ~100 tests but major gaps in Windows paths, JSONC parsing, frontmatter conversion, error recovery. Untested code is untrustworthy code. Node.js built-in test runner supports coverage thresholds natively via `--test-coverage-lines`. | HIGH | Add test suites for: (a) install.js (mock file system via temp dirs), (b) JSONC parser edge cases, (c) error paths in every command, (d) frontmatter conversion for all three runtimes. Target: 80% line coverage for gsd-tools.js, 60% for install.js. |
| T6 | **Atomic file writes** | Multi-step operations (phase add/remove update ROADMAP + create directories) currently leave inconsistent state on partial failure. CONCERNS.md documents this as a missing critical feature. The write-tmp-then-rename pattern is the standard approach. | MEDIUM | Implement `atomicWriteFileSync(filePath, content)`: write to `filePath.tmp.{pid}`, then `fs.renameSync` to final path. Rename is atomic on POSIX. On failure, clean up temp file. Apply to all state-modifying writes (STATE.md, ROADMAP.md, config.json). |
| T7 | **Graceful signal handling (SIGINT/SIGTERM)** | Users expect Ctrl+C to clean up temp files and release locks, not leave half-written state. POSIX signal handling is listed in Liran Tal's Node.js CLI best practices as a core requirement. | LOW | Register `process.on('SIGINT', cleanup)` and `process.on('SIGTERM', cleanup)` handlers. Cleanup: remove temp files, release any locks, exit with code 130 (128 + SIGINT signal number 2). |
| T8 | **Proper process exit codes** | CI/CD pipelines, shell scripts, and other tools depend on exit codes to determine success/failure. Currently only 3 `process.exit()` calls exist with inconsistent codes. POSIX convention is well-documented and universally expected. | LOW | Audit all exit paths. Map: 0 = success, 1 = general error, 2 = usage/argument error, 3 = config error, 4 = file system error. Ensure every error path calls `process.exit(N)` with appropriate code. |
| T9 | **Config schema migration** | Config schema has changed multiple times (e.g., `plan_check` added in v1.13). Old configs lack new fields, causing silent failures. Every mature CLI with persistent config has a migration story (npm, ESLint, Prettier). | MEDIUM | Add `schema_version` field to config.json. Implement `migrateConfig(config)` that applies sequential migrations (v1 -> v2 -> v3). Auto-upgrade on load with sensible defaults. Back up old config before migration. |

### Differentiators (Competitive Advantage for Code Quality)

Features that go beyond table stakes. Having these signals a mature, well-engineered tool. Not expected, but respected.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **File-based operation locking** | Prevents race conditions when multiple CLI instances run concurrently. CONCERNS.md documents this as a missing critical feature. Most mature CLIs with shared state implement this (npm uses lockfiles, git uses index.lock). | MEDIUM | Implement `acquireLock(resource)` / `releaseLock(resource)` using `fs.mkdirSync` (atomic on all filesystems). Lock file: `.planning/.lock-{resource}`. Include PID + timestamp for stale lock detection. Timeout after 10s, force-release stale locks (>30s). Zero dependencies -- `mkdir` is the gold standard approach used by proper-lockfile. |
| D2 | **Dry-run mode for destructive operations** | Users can preview phase add/remove/complete effects before committing. Builds trust and reduces anxiety around irreversible operations. Differentiates from tools that just "do it." | MEDIUM | Add `--dry-run` flag to phase operations. Collect all planned mutations (file writes, directory creates, git commits) into a list. Print the list instead of executing. Requires refactoring mutation code to be plan-then-execute rather than inline. |
| D3 | **Installation rollback on failure** | If installation fails mid-way, restore previous state automatically. CONCERNS.md documents this as missing. npm itself implements install rollback. Differentiating for a meta-prompting tool that modifies config directories. | HIGH | Before installation: snapshot target directory as `.backup-{timestamp}`. On failure: restore from snapshot, remove partial install. On success: remove snapshot. Requires wrapping entire install flow in try/catch with rollback in catch. |
| D4 | **Debug/verbose mode** | Liran Tal's CLI best practices (item 6.3) lists debug mode as a best practice. Enables detailed output for troubleshooting without cluttering normal output. Currently no `--verbose` or `--debug` flag exists. | LOW | Add `--verbose` / `--debug` flag parsed at startup. When active: log file paths read/written, regex match counts, timing for each operation, config values loaded. Use stderr for debug output (stdout stays clean for piping). |
| D5 | **Operation timing and performance metrics** | Track execution time per command. Enables identifying slow commands and regression detection. Differentiates by showing engineering discipline. | LOW | Wrap command dispatch with `process.hrtime.bigint()` start/end. When `--verbose`, emit timing. Store aggregated metrics in `.planning/metrics.json` for trend analysis. |
| D6 | **Comprehensive validation suite** | Go beyond basic input validation: validate STATE.md integrity, ROADMAP.md consistency, phase numbering, frontmatter schemas, reference links. Currently `validate consistency` exists but is thin. A thorough `validate --all` command that catches problems before they surface during execution. | MEDIUM | Extend existing `validate consistency` to cover: orphaned phase directories, duplicate phase numbers, frontmatter schema violations across all plans, broken `@`-references, STATE.md field completeness. Run as a single pre-flight check. |
| D7 | **Regex hardening and caching** | CONCERNS.md documents fragile regex patterns compiled fresh each call and linear scanning of large files. Compiled regex caching and safer patterns (escaping special chars in field names) prevents subtle bugs and improves performance. | LOW | (a) Escape user-provided strings before use in `new RegExp()` with `str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. (b) Cache compiled patterns at module scope. (c) Replace regex-based field replacement in STATE.md with literal string search where possible. |
| D8 | **Prototype pollution prevention** | JSON.parse on user-provided data (JSONC parser, frontmatter merge) could inject `__proto__` or `constructor` properties. Node.js official security docs highlight this (CWE-1321). Using `Object.create(null)` for parsed objects and filtering dangerous keys. | LOW | Add `sanitizeObject(obj)` that deletes `__proto__`, `constructor`, `prototype` keys recursively. Apply after JSON.parse in JSONC parser, frontmatter merge, and config loading. Use `Object.create(null)` for internal config objects. |
| D9 | **Coverage threshold enforcement in CI** | Node.js built-in test runner supports `--test-coverage-lines=N` natively. Setting a threshold (e.g., 80%) prevents coverage regression. Zero dependency -- this is built into Node.js. | LOW | Add npm script: `"test:coverage": "node --test --experimental-test-coverage --test-coverage-lines=80 get-shit-done/bin/gsd-tools.test.js"`. Enforce in CI. Requires Node.js 20+ for coverage flags (current minimum is 16.7 -- may need to bump). |
| D10 | **Backup before state-modifying operations** | Before any operation that modifies STATE.md, ROADMAP.md, or phase directories, create a lightweight backup. Enables manual recovery even without full transaction support. | LOW | Implement `backupFile(filePath)` that copies to `filePath.bak.{timestamp}`. Apply before phase add/remove/complete and state update. Rotate: keep last 3 backups, delete older ones. |

### Anti-Features (Things to Deliberately NOT Build in a Hardening Pass)

Features that seem beneficial but would introduce complexity, scope creep, or violate the zero-dependency constraint. Deliberately excluded.

| # | Anti-Feature | Why Requested | Why Problematic | Alternative |
|---|--------------|---------------|-----------------|-------------|
| A1 | **Full async/await conversion** | CONCERNS.md mentions sync I/O as a performance bottleneck. Converting all file operations to async/await seems like the "modern" approach. | Massive refactor scope. CLI tools are inherently sequential -- sync I/O is simpler and correct for single-command-at-a-time execution. Async adds complexity (error handling, race conditions) with minimal benefit for a CLI that runs one command per invocation. The performance concern is real only for batch operations (history-digest), not for typical single-command use. | Keep sync I/O for single-file operations. Add async only for targeted batch operations (manifest generation, history digest) where parallelism actually helps. |
| A2 | **Adding production dependencies (yaml parser, ora spinners, chalk)** | CONCERNS.md notes the custom YAML/frontmatter parser is fragile and suggests adding a yaml package. Adding chalk/ora would improve UX. | Violates zero-dependency constraint. Each dependency is a supply chain attack surface. The custom parsers work for the specific subset of YAML used (frontmatter with simple key-value, arrays, nested objects). Adding a full YAML parser for this is overkill. | Harden the existing custom parsers with comprehensive tests and edge case handling. Add fuzz-like test cases for JSONC parser. |
| A3 | **Full transaction/rollback system** | CONCERNS.md requests atomic multi-file operations with rollback. A full transaction system (like database transactions) would guarantee all-or-nothing semantics. | Over-engineering for a CLI tool. Transaction systems require journaling, write-ahead logs, and recovery protocols. The complexity is disproportionate to the problem (phase operations modifying 2-3 files). | Use atomic writes (T6) for individual files + backup before operations (D10) + dry-run mode (D2). This covers 95% of failure scenarios without the complexity of a transaction system. |
| A4 | **Modular command architecture refactor** | CONCERNS.md suggests splitting gsd-tools.js into per-command modules with lazy loading. This would improve maintainability and testability. | Not a hardening feature -- it is a refactoring/architecture concern. Doing it during a hardening pass creates massive merge conflicts with concurrent work, changes every import/require path, and makes the hardening diff unreadable. | Defer to a dedicated refactoring milestone. Hardening should work with the existing monolithic structure, adding safety nets without restructuring. |
| A5 | **Network-level security (rate limiting, TLS pinning)** | Node.js security best practices cover HTTP hardening extensively. The Brave Search API integration makes network calls. | The tool makes exactly one type of HTTP call (Brave Search) and it is optional. Network security hardening (rate limiting, TLS pinning, certificate validation) is relevant for servers, not CLI tools that make occasional outbound API calls. | Add query length limits to Brave Search (currently unbounded). Validate API response structure. Do not add rate limiting or TLS infrastructure. |
| A6 | **Permission model / sandbox** | Node.js has an experimental `--permission` flag for restricting file/network/child_process access. Sounds ideal for security. | Experimental feature, not production-ready. Requires Node.js 20+ (current minimum is 16.7). Would break the tool's fundamental operations (it needs to read/write files and spawn git processes). | Implement path scoping (T4) for file operations. Document which directories the tool reads/writes. Do not restrict via Node.js permission model. |
| A7 | **Comprehensive logging framework** | Structured logging with levels (debug/info/warn/error), log rotation, and file output. Standard in server applications. | Over-engineering for a CLI tool. CLI output goes to stdout/stderr and is consumed by humans or piped to other tools. A logging framework adds complexity without value -- users do not read log files from CLI tools. | Use stderr for warnings/debug output (D4). Use stdout for command output. Use structured JSON output (already implemented via `--raw` flag) for machine consumption. |
| A8 | **Automated dependency vulnerability scanning** | Tools like `npm audit`, Snyk, Socket scan for vulnerable dependencies. | Zero production dependencies means zero dependency vulnerabilities. Running `npm audit` would only flag devDependencies (esbuild), which is a build-time concern, not a runtime security concern. | Keep the zero-dependency architecture. Run `npm audit` in CI for devDependency awareness, but do not add security scanning tooling. |

---

## Feature Dependencies

```
T1 (Eliminate silent failures)
    └──enables──> T2 (Structured error classes)
                      └──enables──> T8 (Proper exit codes)

T3 (Input validation)
    └──enables──> T4 (Path traversal prevention)
    └──enables──> D6 (Comprehensive validation suite)

T6 (Atomic file writes)
    └──enables──> D1 (File-based locking)
    └──enhances──> D10 (Backup before modifications)
    └──enables──> D3 (Installation rollback)

T7 (Signal handling)
    └──requires──> D1 (Locking -- must release locks on signal)

T5 (Test coverage)
    └──validates──> ALL other features

T9 (Config migration)
    └──independent, but should be early (affects config loading)

D2 (Dry-run)
    └──requires──> T6 (Atomic writes -- needs plan-then-execute pattern)

D4 (Debug mode)
    └──enhances──> T1 (Visible errors + verbose gives full picture)
    └──enhances──> D5 (Timing metrics)

D7 (Regex hardening)
    └──independent, but apply before T5 (tests validate hardened regexes)

D8 (Prototype pollution prevention)
    └──independent, apply to T3 (input validation layer)
```

### Dependency Notes

- **T1 enables T2:** You cannot create structured error classes until you have identified all error sites (by eliminating silent catches first).
- **T2 enables T8:** Exit codes require error classification, which requires structured error classes.
- **T6 enables D1:** File locking builds on the atomic write primitive (lock acquisition itself must be atomic).
- **T7 requires D1:** Signal handlers must release locks on cleanup; implementing signals without locking means there is nothing meaningful to clean up.
- **T3 enables T4:** Path traversal prevention is a specialized form of input validation.
- **D2 requires T6:** Dry-run mode requires the plan-then-execute pattern that atomic writes introduce.
- **T5 validates ALL:** Tests should be written alongside each feature, not deferred to the end.

---

## MVP Definition

### Launch With (v1 -- Core Hardening)

Minimum viable hardening pass. These features address the most critical concerns from CONCERNS.md and establish a safety foundation.

- [x] T1 -- Eliminate silent failures (empty catches) -- **prerequisite for everything**
- [x] T2 -- Structured error classes with exit codes -- **prerequisite for reliable error handling**
- [x] T3 -- Input validation for all commands -- **prerequisite for security**
- [x] T4 -- Path traversal prevention -- **addresses documented security risk**
- [x] T6 -- Atomic file writes -- **addresses documented data integrity risk**
- [x] T7 -- Graceful signal handling -- **POSIX compliance, low effort**
- [x] T8 -- Proper process exit codes -- **POSIX compliance, low effort**
- [x] D7 -- Regex hardening and caching -- **addresses documented fragility, low effort**
- [x] D8 -- Prototype pollution prevention -- **addresses documented security risk, low effort**

### Add After Validation (v1.x -- Quality Layer)

Features to add once core hardening is stable and tested.

- [ ] T5 -- Test coverage for critical paths -- **triggered by: core hardening complete, need to validate it works**
- [ ] T9 -- Config schema migration -- **triggered by: next config schema change**
- [ ] D1 -- File-based operation locking -- **triggered by: user reports of concurrent operation corruption**
- [ ] D4 -- Debug/verbose mode -- **triggered by: user reports of hard-to-diagnose issues**
- [ ] D6 -- Comprehensive validation suite -- **triggered by: core validation (T3) complete**
- [ ] D10 -- Backup before state-modifying operations -- **triggered by: atomic writes (T6) complete**

### Future Consideration (v2+ -- Polish)

Features to defer until hardening foundation is solid and battle-tested.

- [ ] D2 -- Dry-run mode -- **why defer: requires plan-then-execute refactor, high complexity relative to value during hardening**
- [ ] D3 -- Installation rollback on failure -- **why defer: high complexity, installer changes are risky to batch with other hardening**
- [ ] D5 -- Operation timing and performance metrics -- **why defer: nice-to-have, not a hardening concern**
- [ ] D9 -- Coverage threshold enforcement -- **why defer: requires Node.js 20+ minimum version bump, separate decision**

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| T1 -- Eliminate silent failures | HIGH | LOW | **P1** |
| T2 -- Structured error classes | HIGH | MEDIUM | **P1** |
| T3 -- Input validation | HIGH | MEDIUM | **P1** |
| T4 -- Path traversal prevention | HIGH | MEDIUM | **P1** |
| T5 -- Test coverage | HIGH | HIGH | **P1** |
| T6 -- Atomic file writes | HIGH | MEDIUM | **P1** |
| T7 -- Signal handling | MEDIUM | LOW | **P1** |
| T8 -- Proper exit codes | MEDIUM | LOW | **P1** |
| T9 -- Config migration | MEDIUM | MEDIUM | **P2** |
| D1 -- File-based locking | MEDIUM | MEDIUM | **P2** |
| D2 -- Dry-run mode | MEDIUM | MEDIUM | **P3** |
| D3 -- Installation rollback | MEDIUM | HIGH | **P3** |
| D4 -- Debug mode | MEDIUM | LOW | **P2** |
| D5 -- Timing metrics | LOW | LOW | **P3** |
| D6 -- Comprehensive validation | MEDIUM | MEDIUM | **P2** |
| D7 -- Regex hardening | MEDIUM | LOW | **P1** |
| D8 -- Prototype pollution prevention | MEDIUM | LOW | **P1** |
| D9 -- Coverage threshold | LOW | LOW | **P3** |
| D10 -- Backup before modifications | MEDIUM | LOW | **P2** |

**Priority key:**
- P1: Must have -- core hardening pass
- P2: Should have -- add when core is stable
- P3: Nice to have -- future consideration

---

## Competitor Feature Analysis

Comparison with mature Node.js CLI tools that have undergone hardening.

| Feature | npm CLI | ESLint CLI | Prettier CLI | Our Approach |
|---------|---------|------------|--------------|--------------|
| Error classes | Custom error hierarchy, npm-specific codes | Structured errors with rule IDs | Simple error messages | T2: GsdError hierarchy with exit codes |
| Input validation | Schema validation for package.json, arg parsing via nopt | JSON schema for config, rule validation | Minimal (file path only) | T3: Validation utilities per command |
| Path traversal | Realpath checks, symlink resolution | N/A (config file only) | N/A (file path only) | T4: safePath with symlink resolution |
| Atomic writes | write-file-atomic (npm's own package) | N/A (read-only tool) | fs.writeFileSync (no atomic) | T6: tmp-then-rename pattern |
| File locking | lockfile package for package-lock.json | N/A | N/A | D1: mkdir-based locking |
| Signal handling | Cleanup handlers for SIGINT/SIGTERM | Basic exit handler | None | T7: Full POSIX signal handling |
| Test coverage | >90% via tap | >95% via mocha | >90% via jest | T5: Target 80% via node:test |
| Config migration | npm config versioning, `npm config fix` | Schema migration via major version breaks | N/A | T9: Sequential migration functions |
| Debug mode | `--loglevel verbose`, `--timing` | `--debug` flag | `--loglevel` | D4: `--verbose`/`--debug` flag |
| Dry-run | `npm install --dry-run` | `--fix-dry-run` | `--check` mode | D2: `--dry-run` for phase operations |

---

## Sources

- [Node.js Security Best Practices (Official)](https://nodejs.org/en/learn/getting-started/security-best-practices) -- HIGH confidence
- [Node.js CLI Apps Best Practices by Liran Tal](https://github.com/lirantal/nodejs-cli-apps-best-practices) -- HIGH confidence
- [Node.js Built-in Test Runner Coverage](https://nodejs.org/en/learn/test-runner/collecting-code-coverage) -- HIGH confidence
- [write-file-atomic (npm's atomic write package)](https://github.com/npm/write-file-atomic) -- HIGH confidence, pattern reference
- [proper-lockfile (mkdir-based file locking)](https://www.npmjs.com/package/proper-lockfile) -- HIGH confidence, pattern reference
- [Node.js Secure Coding: Path Traversal Prevention](https://www.nodejs-security.com/blog/secure-coding-practices-nodejs-path-traversal-vulnerabilities) -- MEDIUM confidence
- [handle-cli-error (CLI error handling patterns)](https://github.com/ehmicky/handle-cli-error) -- MEDIUM confidence, pattern reference
- [Smashing Magazine: Error Handling with Error Classes](https://www.smashingmagazine.com/2020/08/error-handling-nodejs-error-classes/) -- MEDIUM confidence
- [Node.js January 2026 Security Releases](https://nodejs.org/en/blog/vulnerability/december-2025-security-releases) -- HIGH confidence, ecosystem context
- `.planning/codebase/CONCERNS.md` -- direct codebase analysis, HIGH confidence
- `.planning/codebase/TESTING.md` -- direct codebase analysis, HIGH confidence
- `.planning/codebase/ARCHITECTURE.md` -- direct codebase analysis, HIGH confidence
- `.planning/codebase/STACK.md` -- direct codebase analysis, HIGH confidence

---
*Feature research for: GSD CLI Hardening*
*Researched: 2026-02-08*
