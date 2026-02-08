---
phase: 02-error-handling-security
plan: 01
subsystem: error-handling
tags: [error-classes, exit-codes, posix, cli]

requires:
  - phase: 01
    provides: characterization tests for gsd-tools.js
provides:
  - GsdError base class with ValidationError, FileSystemError, ConfigError, PhaseError subclasses
  - POSIX exit code constants (EXIT_SUCCESS=0, EXIT_ERROR=1, EXIT_USAGE=2, EXIT_CONFIG=3, EXIT_FILESYSTEM=4)
  - error() function with optional exit code parameter
affects: [02-03-catch-block-audit, 02-04-input-validation, 02-05-integration-tests]

tech-stack:
  added: []
  patterns: [error-class-hierarchy, posix-exit-codes]

key-files:
  created: []
  modified: [get-shit-done/bin/gsd-tools.js]

key-decisions:
  - "Inline error classes in gsd-tools.js following existing monolith pattern -- Phase 3 will extract"
  - "EXIT_USAGE for all missing args and unknown subcommands, EXIT_CONFIG for missing planning files, EXIT_FILESYSTEM for missing user-specified paths"

patterns-established:
  - "Error class hierarchy: GsdError > ValidationError/FileSystemError/ConfigError/PhaseError"
  - "Exit code convention: 0=success 1=error 2=usage 3=config 4=filesystem"

duration: 11min
completed: 2026-02-09
---

# Phase 02 Plan 01: Error Class Hierarchy and POSIX Exit Codes Summary

**GsdError class hierarchy with 4 subclasses and POSIX exit codes applied to ~50 error() call sites across gsd-tools.js**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-08T19:56:55Z
- **Completed:** 2026-02-08T20:07:33Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Created GsdError base class with ValidationError, FileSystemError, ConfigError, PhaseError subclasses
- Defined POSIX exit code constants (0-4) for programmatic error classification
- Refactored error() function to accept optional exit code parameter
- Categorized ~50 error() call sites into EXIT_USAGE, EXIT_CONFIG, EXIT_FILESYSTEM, and EXIT_ERROR

## Task Commits

Each task was committed atomically:

1. **Task 1: Create error class hierarchy and POSIX exit code constants** - `3d6194f` (feat)
2. **Task 2: Refactor error() and output() functions to use POSIX exit codes** - `059e946` (feat)

## Files Created/Modified
- `get-shit-done/bin/gsd-tools.js` - Error class hierarchy, exit code constants, and categorized error() call sites

## Decisions Made
- Inline error classes in gsd-tools.js following existing monolith pattern -- Phase 3 decomposition will extract them
- EXIT_USAGE (2) for all missing required arguments and unknown subcommand errors
- EXIT_CONFIG (3) for missing STATE.md, ROADMAP.md, config.json, and phase-not-found-in-roadmap errors
- EXIT_FILESYSTEM (4) for missing user-specified file paths, directories, and write failures

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Error classes ready for Plan 03 (catch block audit) to throw typed errors
- Exit codes ready for Plan 04 (input validation) to use appropriate codes
- All 214 existing characterization tests pass unchanged

---
*Phase: 02-error-handling-security*
*Completed: 2026-02-09*
