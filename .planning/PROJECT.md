# GSD Hardening

## What This Is

A systematic hardening pass across the get-shit-done codebase — addressing security risks, reliability issues, tech debt, performance bottlenecks, and test coverage gaps. This is a brownfield project improving an existing CLI-based project management system that orchestrates AI agents for software development workflows.

## Core Value

Every fix must leave the system more reliable and maintainable without breaking existing installations or `.planning/` directory compatibility.

## Requirements

### Validated

- ✓ Orchestrator-executor pattern with subagent specialization — existing
- ✓ Multi-runtime installation (Claude Code, OpenCode, Gemini CLI) — existing
- ✓ Central state management via `.planning/STATE.md` — existing
- ✓ ~90+ CLI commands in gsd-tools.js for atomic operations — existing
- ✓ Phase/plan/summary abstractions with frontmatter — existing
- ✓ Checkpoint-based pause/resume for long-running work — existing
- ✓ Local patch preservation with SHA256 manifests — existing
- ✓ JSONC parsing for OpenCode compatibility — existing
- ✓ Cross-platform path handling (Mac, Windows, Linux) — existing
- ✓ Node.js built-in test runner with basic test coverage — existing

### Active

- [ ] Fix security vulnerabilities (env exposure, path traversal, command injection)
- [ ] Fix known bugs (classifyHandoffIfNeeded, orphaned hooks, JSONC crashes, patch detection)
- [ ] Eliminate silent failures (empty catches, swallowed errors)
- [ ] Add input validation to command handlers
- [ ] Refactor monolithic gsd-tools.js into command modules
- [ ] Refactor install.js into runtime-specific modules
- [ ] Add atomic multi-file operations with rollback
- [ ] Add conflict detection for concurrent operations
- [ ] Add config schema migration system
- [ ] Add installation rollback capability
- [ ] Fix fragile areas (frontmatter extraction, phase numbering, regex parsing, state field replacement, milestone versioning)
- [ ] Fix performance bottlenecks (sync I/O, regex caching, progress indicators, incremental digest)
- [ ] Expand test coverage (Windows paths, JSONC edge cases, frontmatter conversion, reference validation, phase numbering, error recovery)

### Out of Scope

- Adding external production dependencies — zero-dep philosophy is a strength, not tech debt
- Rewriting the orchestrator/agent markdown system — that's working well
- UI/UX changes to the CLI output — focus is internal quality
- New features or commands — this is a hardening pass only

## Context

- Codebase is ~4,600 lines in gsd-tools.js, ~1,740 lines in install.js
- Zero production dependencies (Node.js built-ins only)
- esbuild is the sole dev dependency (hook bundling)
- Test runner: `node --test` (Node.js built-in)
- CONCERNS.md documents all known issues across 8 categories with specific file locations and line numbers
- Codebase mapping already completed (ARCHITECTURE.md, STACK.md, STRUCTURE.md, CONCERNS.md, CONVENTIONS.md, INTEGRATIONS.md, TESTING.md)

## Constraints

- **Backward compatibility**: Existing `.planning/` directories and `config.json` files must keep working after changes
- **Installation stability**: The `npx get-shit-done-cc` install flow must remain functional throughout — it's the first user touchpoint
- **Zero production deps**: No new entries in `dependencies` — only `devDependencies` allowed
- **Node.js >= 16.7.0**: Must maintain minimum engine requirement

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Risk-ordered priority | Security and data-loss risks have highest blast radius | — Pending |
| Proper engineering for each fix | Thin fixes create new debt; tests prevent regressions | — Pending |
| Protect install + backward compat | Breaking existing users is worse than slow progress | — Pending |
| Full sweep across all categories | Partial fixes leave interconnected issues unresolved | — Pending |

---
*Last updated: 2026-02-08 after initialization*
