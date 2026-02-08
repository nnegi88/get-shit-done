# Requirements: GSD Hardening

**Defined:** 2026-02-08
**Core Value:** Every fix must leave the system more reliable and maintainable without breaking existing installations or `.planning/` directory compatibility.

## v1 Requirements

Requirements for the hardening pass. Each maps to roadmap phases.

### Error Handling

- [ ] **ERRH-01**: All 46+ empty catch blocks are classified (intentional fallback vs bug) and either logged, propagated, or documented as intentional
- [ ] **ERRH-02**: Structured error class hierarchy exists (GsdError, ValidationError, FileSystemError, ConfigError, PhaseError) with error codes
- [ ] **ERRH-03**: Every command exit path uses POSIX-compliant exit codes (0=success, 1=error, 2=usage, 3=config, 4=filesystem)
- [ ] **ERRH-04**: User can run any command with --verbose flag to get detailed debug output on stderr without affecting stdout

### Security

- [ ] **SECU-01**: All commands validate inputs (phase numbers, file paths, JSON strings, field names) before execution and reject bad input with specific error messages
- [ ] **SECU-02**: File path arguments are validated against project scope — paths outside project root or traversing via symlinks are rejected
- [ ] **SECU-03**: User-provided strings are escaped before use in RegExp constructors, and compiled regex patterns are cached at module scope
- [ ] **SECU-04**: JSON.parse results are sanitized to remove __proto__, constructor, and prototype keys before use in config loading, frontmatter merge, and JSONC parsing

### Data Integrity

- [ ] **DATA-01**: State-modifying file writes (STATE.md, ROADMAP.md, config.json) use atomic write-to-temp-then-rename pattern
- [ ] **DATA-02**: SIGINT and SIGTERM signals trigger cleanup (remove temp files, release locks) and exit with appropriate code (130 for SIGINT)
- [ ] **DATA-03**: Concurrent CLI operations are prevented via mkdir-based file locking with stale lock detection and automatic timeout
- [ ] **DATA-04**: State files are backed up before modification with rotation (keep last 3 backups, delete older)

### Testing

- [ ] **TEST-01**: Installer has test coverage across all 3 runtime targets (Claude Code, OpenCode, Gemini CLI) for install/upgrade paths
- [ ] **TEST-02**: Characterization tests capture current stdout, stderr, and exit code behavior for all 90+ commands
- [ ] **TEST-03**: JSONC parser has edge case tests (nested comments, escaped quotes, BOM variants, malformed input)
- [ ] **TEST-04**: Frontmatter conversion has tests for all 3 runtime formats (Claude, OpenCode, Gemini)
- [ ] **TEST-05**: Error recovery paths are tested for every command (invalid input, missing files, corrupt state)
- [ ] **TEST-06**: Phase numbering is tested with edge cases (double-digit phases, decimal phases like 1.9 to 1.10)

### Architecture

- [ ] **ARCH-01**: gsd-tools.js is decomposed into lib/ modules (helpers, frontmatter, config, git) and commands/ modules with a lazy-loading command registry
- [ ] **ARCH-02**: install.js is decomposed into runtime-specific modules (claude, opencode, gemini) with shared installation logic
- [ ] **ARCH-03**: Entry point for gsd-tools.js is under 100 lines, routing to command modules via lazy require()

### Configuration

- [ ] **CONF-01**: config.json includes a schema_version field with sequential migration functions that auto-upgrade old configs with sensible defaults
- [ ] **CONF-02**: Old config.json files are backed up before migration

### Validation

- [ ] **VALD-01**: Comprehensive validation suite checks STATE.md integrity, ROADMAP.md consistency, phase numbering, frontmatter schemas, and broken @-references
- [ ] **VALD-02**: User can run a single validate --all command as a pre-flight check

### Developer Experience

- [ ] **DEVX-01**: User can preview effects of phase add/remove/complete operations with --dry-run flag before committing changes
- [ ] **DEVX-02**: Failed installations automatically restore previous state from backup
- [ ] **DEVX-03**: Command execution time is tracked and emitted when --verbose flag is active

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Performance

- **PERF-01**: History digest uses incremental updates instead of full rebuild
- **PERF-02**: Phase directory scanning uses cached index instead of linear scan

### Tooling

- **TOOL-01**: Node.js minimum version bumped to 18.18+ to unlock ESLint 9, stable coverage thresholds, Permission Model
- **TOOL-02**: CI pipeline with GitHub Actions running matrix tests (Node 18, 20, 22)
- **TOOL-03**: ESLint 8.57.1 + eslint-plugin-security configured for development linting
- **TOOL-04**: Coverage threshold enforcement via --test-coverage-lines in CI

### Platform

- **PLAT-01**: Windows-specific path handling validated in CI with Windows runner
- **PLAT-02**: PowerShell compatibility for hook commands and git HEREDOC patterns

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Adding production dependencies | Zero-dep philosophy is a strength — immune to supply chain attacks |
| Full async/await conversion | Sync I/O is correct for single-command CLI; async adds complexity without benefit |
| Full transaction/rollback system | Over-engineering — complexity disproportionate to 2-3 file operations |
| Network-level security (rate limiting, TLS) | CLI makes one optional HTTP call; not a server |
| Node.js Permission Model sandbox | Experimental, requires Node 20+, breaks fundamental operations |
| Comprehensive logging framework | Over-engineering — CLI output goes to stdout/stderr for humans |
| Automated dependency vulnerability scanning | Zero production dependencies = zero dependency vulnerabilities |
| New features or commands | This is a hardening pass only |
| UI/UX changes to CLI output | Focus is internal quality |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ERRH-01 | — | Pending |
| ERRH-02 | — | Pending |
| ERRH-03 | — | Pending |
| ERRH-04 | — | Pending |
| SECU-01 | — | Pending |
| SECU-02 | — | Pending |
| SECU-03 | — | Pending |
| SECU-04 | — | Pending |
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |
| TEST-06 | — | Pending |
| ARCH-01 | — | Pending |
| ARCH-02 | — | Pending |
| ARCH-03 | — | Pending |
| CONF-01 | — | Pending |
| CONF-02 | — | Pending |
| VALD-01 | — | Pending |
| VALD-02 | — | Pending |
| DEVX-01 | — | Pending |
| DEVX-02 | — | Pending |
| DEVX-03 | — | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28 ⚠️

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-08 after initial definition*
