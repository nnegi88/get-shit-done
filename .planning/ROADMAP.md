# Roadmap: GSD Hardening

## Overview

This roadmap delivers a systematic hardening pass across the GSD CLI codebase, ordered by risk: establish test safety nets first, then make errors visible and inputs validated, decompose the monolith into maintainable modules, add data integrity guarantees, build config migration and validation, and finish with developer experience polish. Every phase leaves the system more reliable without breaking existing installations or `.planning/` directory compatibility.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Test Safety Net** - Capture current behavior across all commands and runtimes before any code changes
- [ ] **Phase 2: Error Handling & Security** - Make failures visible and inputs validated with structured errors and security hardening
- [ ] **Phase 3: Monolith Decomposition** - Break gsd-tools.js and install.js into focused modules with lazy-loading registry
- [ ] **Phase 4: Data Integrity** - Protect state files with atomic writes, signal handling, file locking, and backups
- [ ] **Phase 5: Config Migration & Validation** - Auto-upgrade old configs and provide comprehensive integrity checks
- [ ] **Phase 6: Developer Experience** - Add dry-run previews, installation rollback, verbose diagnostics, and timing

## Phase Details

### Phase 1: Test Safety Net
**Goal**: Every existing behavior is captured in tests so subsequent phases can refactor with confidence
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. Running the test suite exercises all 3 installer runtime targets (Claude Code, OpenCode, Gemini CLI) for install and upgrade paths
  2. Every one of the 90+ CLI commands has a characterization test that captures its stdout, stderr, and exit code
  3. JSONC parser handles edge cases (nested comments, escaped quotes, BOM variants, malformed input) without crashing
  4. Frontmatter conversion is tested for all 3 runtime formats and produces correct output for each
  5. Phase numbering handles edge cases (double-digit phases, decimal transitions like 1.9 to 1.10) correctly in tests
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Error Handling & Security
**Goal**: Users get clear error messages on bad input, failures are visible instead of silent, and all inputs are validated against security threats
**Depends on**: Phase 1
**Requirements**: ERRH-01, ERRH-02, ERRH-03, SECU-01, SECU-02, SECU-03, SECU-04
**Success Criteria** (what must be TRUE):
  1. Every empty catch block in the codebase is classified as intentional-fallback or bug, and bugs are fixed to propagate or log errors
  2. Commands exit with POSIX-compliant codes (0=success, 1=error, 2=usage, 3=config, 4=filesystem) and a structured error class hierarchy exists
  3. Running any command with invalid input (bad phase numbers, malformed JSON, invalid field names) produces a specific rejection message instead of silent failure or stack trace
  4. File path arguments that traverse outside the project root or follow symlinks out of scope are rejected with an explanatory error
  5. User-provided strings used in RegExp are escaped, and JSON.parse results are sanitized against prototype pollution before use
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Monolith Decomposition
**Goal**: The 4,600-line gsd-tools.js and 1,740-line install.js are decomposed into focused modules that can be tested and maintained independently
**Depends on**: Phase 2
**Requirements**: ARCH-01, ARCH-02, ARCH-03
**Success Criteria** (what must be TRUE):
  1. gsd-tools.js entry point is under 100 lines and routes to command modules via a lazy-loading registry
  2. Shared logic lives in lib/ modules (helpers, frontmatter, config, git) with strict dependency direction (entry -> commands -> lib -> built-ins)
  3. install.js is decomposed into runtime-specific modules (claude, opencode, gemini) with shared installation logic factored out
  4. All existing characterization tests from Phase 1 still pass with identical stdout, stderr, and exit codes
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Data Integrity
**Goal**: State-modifying operations are protected against corruption from crashes, signals, and concurrent access
**Depends on**: Phase 3
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. Writes to STATE.md, ROADMAP.md, and config.json use atomic write-to-temp-then-rename so partial writes never corrupt files
  2. Pressing Ctrl+C (SIGINT) or receiving SIGTERM during any operation triggers cleanup of temp files and locks, then exits with code 130
  3. Running two CLI operations simultaneously on the same project is prevented by file locking with stale lock detection and automatic timeout
  4. State files are backed up before modification with rotation keeping the last 3 backups
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Config Migration & Validation
**Goal**: Old configs auto-upgrade without data loss and users can validate their entire .planning/ directory for integrity issues
**Depends on**: Phase 4
**Requirements**: CONF-01, CONF-02, VALD-01, VALD-02
**Success Criteria** (what must be TRUE):
  1. config.json includes a schema_version field and old configs are automatically upgraded via sequential migration functions with sensible defaults
  2. Old config.json files are backed up before any migration runs
  3. A comprehensive validation suite checks STATE.md integrity, ROADMAP.md consistency, phase numbering, frontmatter schemas, and broken @-references
  4. User can run a single `validate --all` command as a pre-flight check and get a clear pass/fail report
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Developer Experience
**Goal**: Users can preview destructive operations, recover from failed installations, and get detailed diagnostics when troubleshooting
**Depends on**: Phase 5
**Requirements**: DEVX-01, DEVX-02, DEVX-03, ERRH-04
**Success Criteria** (what must be TRUE):
  1. User can pass --dry-run to phase add/remove/complete operations and see what would change without committing changes
  2. Failed installations automatically restore previous state from backup
  3. User can run any command with --verbose flag to get detailed debug output on stderr (including execution timing) without affecting stdout
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Test Safety Net | 0/0 | Not started | - |
| 2. Error Handling & Security | 0/0 | Not started | - |
| 3. Monolith Decomposition | 0/0 | Not started | - |
| 4. Data Integrity | 0/0 | Not started | - |
| 5. Config Migration & Validation | 0/0 | Not started | - |
| 6. Developer Experience | 0/0 | Not started | - |

---
*Roadmap created: 2026-02-08*
*Last updated: 2026-02-08*
