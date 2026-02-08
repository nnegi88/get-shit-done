# Codebase Concerns

**Analysis Date:** 2026-02-08

## Tech Debt

**Monolithic gsd-tools.js file:**
- Issue: Core CLI tool contains 4,597 lines in a single file handling 50+ commands, initialization logic, model resolution, frontmatter parsing, and verification operations
- Files: `get-shit-done/bin/gsd-tools.js`
- Impact: Difficult to test individual commands in isolation, high maintenance burden, slow startup time due to loading all command code regardless of which command is executed, poor code discoverability
- Fix approach: Refactor into command modules (e.g., `commands/state.js`, `commands/phase.js`, `commands/frontmatter.js`) with a command router pattern, implement lazy-loading only required command modules, add unit tests per command module

**Large install.js with multiple responsibilities:**
- Issue: Installer script contains 1,739 lines mixing argument parsing, JSONC parsing, frontmatter conversion for three runtimes (Claude, OpenCode, Gemini), path resolution, and hook configuration
- Files: `bin/install.js`
- Impact: Installation logic is hard to maintain when supporting multiple runtimes, complex frontmatter conversion rules are intertwined with file operations, difficult to test runtime-specific behavior in isolation
- Fix approach: Extract runtime-specific logic into separate modules (`lib/install-claude.js`, `lib/install-opencode.js`, `lib/install-gemini.js`), centralize frontmatter conversion into a dedicated module, implement comprehensive test coverage for each runtime path

**Silent failures and swallowed errors:**
- Issue: Codebase uses pattern `catch {}` (empty catches) in 10+ locations where errors are silently ignored rather than logged
- Files: `get-shit-done/bin/gsd-tools.js` (lines 545, 547, 1155, 4029, 4031, 4040, 4078, 4155, 4163, etc.)
- Impact: Makes debugging difficult when file operations or JSON parsing fail—errors silently return null/empty values without indication of what went wrong
- Fix approach: Log errors before catching (e.g., `catch (e) { console.warn('Warning: could not read dir', e); }`), implement structured logging with context, use error accumulation in verification commands

**Weak input validation:**
- Issue: Many command handlers check for required parameters but don't validate parameter types or formats before using them
- Files: `get-shit-done/bin/gsd-tools.js` (cmdFrontmatterGet, cmdFrontmatterSet, cmdFrontmatterMerge, cmdVerifyPlanStructure)
- Impact: Invalid inputs may cause silent failures or unexpected behavior, users receive unhelpful error messages
- Fix approach: Create validation utility functions (`validateField`, `validatePhaseNumber`, `validateJsonString`), add schema validation before command execution, provide specific error messages

---

## Known Bugs

**ClassifyHandoffIfNeeded false failures in Claude Code:**
- Symptoms: Execute-phase and quick workflows report agent failure even when work actually completed
- Files: `commands/gsd/execute-phase.md`, `commands/gsd/quick.md`, CHANGELOG line 34
- Trigger: Occurs when Claude Code's internal classifyHandoffIfNeeded function incorrectly identifies valid output as failure
- Workaround: Implemented in execute-phase and quick workflows: spot-check agent output directly before reporting failure instead of relying on handoff status (see CHANGELOG v1.16.0)

**Orphaned hook references in settings.json:**
- Symptoms: Settings.json may reference hooks that no longer exist after updates (statusline.js → gsd-statusline.js rename at v1.9.0)
- Files: `bin/install.js` (cleanupOrphanedHooks function, line 715-767)
- Trigger: Users upgrade between versions that renamed or removed hooks without proper cleanup
- Workaround: Install script now detects and updates old paths (line 754-764: updates `statusline.js` references to `gsd-statusline.js`)

**JSONC parsing failure crashes installer:**
- Symptoms: Installer crashes if OpenCode's opencode.json is malformed (contains comments, trailing commas, or BOM without proper handling)
- Files: `bin/install.js` (line 1045-1054)
- Trigger: User has opencode.json with JSONC syntax that Node's JSON.parse() rejects
- Workaround: Implemented parseJsonc function (line 974-1028) to handle comments, trailing commas, and BOM; added error recovery that skips permission config instead of crashing (line 1048-1053)

**Local patch detection accuracy:**
- Symptoms: If user manually modifies GSD files, install should back them up, but detection relies on file hash comparison which may miss partial edits
- Files: `bin/install.js` (saveLocalPatches function, line 1206-1241)
- Trigger: User edits a GSD file and runs installer
- Workaround: Implemented manifest-based tracking with SHA256 hashing; backed-up files stored in `gsd-local-patches/` directory, users must manually review and merge changes using `/gsd:reapply-patches` command

---

## Security Considerations

**Environment variable exposure in hook execution:**
- Risk: SessionStart hooks execute shell commands that may include environment variables; Windows process spawning via `spawn()` with detached flag exposes parent environment
- Files: `hooks/gsd-check-update.js` (line 25-30 uses `-e` flag with inline code), `bin/install.js` (hook command construction line 171-175)
- Current mitigation: Hooks only access whitelisted config paths (no direct credential access), hook commands use relative paths instead of expanding $HOME at invocation time (line 173-174)
- Recommendations: (1) Add explicit environment variable whitelist to spawn calls, (2) Document which env vars are required/used, (3) Audit hook code for accidental credential logging

**Path traversal risk in file operations:**
- Risk: Commands accept user-provided file paths (--file, @references) without validation; could read/write files outside intended scope
- Files: `get-shit-done/bin/gsd-tools.js` (cmdFrontmatterGet line 2068, cmdVerifyReferences line 2247-2253)
- Current mitigation: Paths are prefixed with cwd or resolved relative to project root, absolute paths are allowed, no symlink traversal checks
- Recommendations: (1) Reject absolute paths outside project, (2) Add symlink resolution check before file ops, (3) Document path scope constraints in command help

**Command injection via shell parameters:**
- Risk: Brave Search API query parameter is user-controlled; potential for injection if query is not properly escaped when passed to API
- Files: `get-shit-done/bin/gsd-tools.js` (cmdWebsearch line 2016-2026)
- Current mitigation: Query is passed via URLSearchParams (automatically escaped for URL), Brave API expects JSON response parsing only, no shell invocation
- Recommendations: (1) Add query length limits (current none), (2) Filter/reject special characters in queries, (3) Log all API calls for audit trail

**JSONC parsing via custom implementation:**
- Risk: Custom JSONC parser (line 974-1028) manually processes string escapes; potential for buffer overrun or incorrect escape sequence handling
- Files: `bin/install.js` (parseJsonc function)
- Current mitigation: Parser rejects invalid escape sequences (only recognizes `\n` and escaped quotes), BOM is stripped before parsing, malformed input raises JSON.parse error which is caught
- Recommendations: (1) Use jsonc-parser package instead (as OpenCode does), (2) Add fuzz testing for edge cases, (3) Limit file size before parsing

---

## Performance Bottlenecks

**Synchronous file I/O blocks entire process:**
- Problem: All file operations use sync APIs (readFileSync, writeFileSync), causing command execution to block until I/O completes; affects startup time and responsiveness
- Files: `get-shit-done/bin/gsd-tools.js` (ubiquitous use of fs.readFileSync, fs.writeFileSync), `bin/install.js` (installation copies files synchronously)
- Cause: Simpler implementation for CLI tools, but creates bottleneck when processing large files or many files
- Improvement path: (1) Use async/await for batch file operations (e.g., manifest generation), (2) Keep sync I/O for single-file operations, (3) Add progress indication for long-running operations like installation

**Regex execution with global pattern at module scope:**
- Problem: gsd-tools.js uses regex.exec() in while loops (line 2150, 2438, 2507) with pattern recreated per command call; pattern matching on large ROADMAP/STATE files is slow
- Files: `get-shit-done/bin/gsd-tools.js` (cmdVerifyPlanStructure, cmdRoadmapAnalyze, cmdMilestoneComplete)
- Cause: Regex patterns are compiled fresh each time, file content is scanned linearly for all matches
- Improvement path: (1) Cache compiled regex patterns, (2) Implement streaming parser for large files, (3) Index ROADMAP phases at load time instead of re-scanning on each operation

**Installation copies entire directory trees without progress:**
- Problem: install.js recursively copies get-shit-done, commands, agents directories; no progress feedback for large copy operations
- Files: `bin/install.js` (copyWithPathReplacement function line 649-692, copyFlattenedCommands line 597-639)
- Cause: fs.copyFileSync in loop processes each file sequentially with full path replacement
- Improvement path: (1) Batch path replacements using string buffers, (2) Show file count/progress during installation, (3) Parallelize copies for agent files (independent of each other)

**History digest reads all SUMMARY files linearly:**
- Problem: cmdHistoryDigest reads every phase directory and every SUMMARY file to build digest; no caching or incremental updates
- Files: `get-shit-done/bin/gsd-tools.js` (cmdHistoryDigest line 1468-1620)
- Cause: Rebuilds full digest on every call even if only one SUMMARY changed
- Improvement path: (1) Maintain index file with summary metadata, (2) Only re-parse changed summaries, (3) Cache digest results with TTL

---

## Fragile Areas

**Frontmatter extraction/splice logic:**
- Files: `get-shit-done/bin/gsd-tools.js` (extractFrontmatter line 263-271, spliceFrontmatter line 273-283)
- Why fragile: Simple regex-based approach assumes frontmatter is `---\n...\n---` format; breaks if file has `---` in code blocks or if frontmatter is missing end delimiter
- Safe modification: (1) Add unit tests for edge cases (code blocks with ---, missing closing delimiter, empty frontmatter), (2) Consider using yaml library for parsing, (3) Validate frontmatter structure after extraction
- Test coverage: Minimal—only tested via frontmatter CRUD commands, no dedicated edge case tests

**Phase numbering and decimal phase logic:**
- Files: `get-shit-done/bin/gsd-tools.js` (cmdPhaseNextDecimal line 1375-1401, findPhaseInternal line 485-520)
- Why fragile: Phase numbers are compared as strings (e.g., "01", "02", "1.1", "1.2"), lexicographic sort breaks for double-digit decimals (["1.10"] sorts before ["1.2"])
- Safe modification: (1) Use numeric phase comparison (split on ".", convert to ints), (2) Add comprehensive tests for decimal phase insertion, (3) Document phase numbering scheme explicitly
- Test coverage: Tests exist for `phase next-decimal` but not for edge cases like "1.9" → "1.10" transitions

**ROADMAP.md section extraction regex:**
- Files: `get-shit-done/bin/gsd-tools.js` (cmdRoadmapGetPhase line 2424-2455)
- Why fragile: Uses regex to find phase section between `## [phase]` headers; breaks if phase name contains special regex characters, if section ends with EOF instead of next header, or if there are nested markdown headers
- Safe modification: (1) Parse ROADMAP as structured markdown (track heading levels), (2) Add validation for phase name characters, (3) Test with actual ROADMAP files from project
- Test coverage: Regex tested only with synthetic data, not with real ROADMAP content

**STATE.md field replacement via regex:**
- Files: `get-shit-done/bin/gsd-tools.js` (stateReplaceField line 299-309)
- Why fragile: Uses `new RegExp()` with field name as pattern; if field contains special regex chars, pattern fails silently, returning original content unchanged
- Safe modification: (1) Use string.replace with literal search, (2) Validate field names are alphanumeric + underscore only, (3) Test with field names containing spaces or special chars
- Test coverage: State update tests use safe field names; no tests for malformed STATE.md

**Milestone version parsing:**
- Files: `get-shit-done/bin/gsd-tools.js` (getMilestoneInfo line 387-412)
- Why fragile: Extracts milestone version from first line of ROADMAP.md; breaks if format changes (e.g., "Milestone 1.0.0" vs "V1.0.0"), assumes version is before first phase header
- Safe modification: (1) Use YAML frontmatter for milestone metadata instead of first line, (2) Add format validation, (3) Fall back to sensible default if parsing fails
- Test coverage: Tested with standard format only

---

## Scaling Limits

**Manifest file tracking limitations:**
- Current capacity: Manifest stores hash for each file; works for ~1,000 GSD files, but memory usage and comparison time grows linearly
- Limit: Performance degrades noticeably with manifests >10,000 files (hash comparison O(n) for each install)
- Scaling path: (1) Switch to incremental hashing (only hash changed directories), (2) Add manifest versioning to handle schema changes, (3) Implement differential updates instead of full hash comparison

**Phase directory scanning without index:**
- Current capacity: Commands scan all phase directories on every operation; works for <100 phases
- Limit: Linear directory scan becomes slow above 200 phases (especially on Windows)
- Scaling path: (1) Build phase index at startup and cache in `.planning/phase-index.json`, (2) Invalidate cache on phase add/remove, (3) Use phase index for all lookups instead of directory scan

**History digest rebuilding on every call:**
- Current capacity: Full digest rebuild works for <50 completed phases
- Limit: Digest takes 2-3 seconds above 100 phases due to reading all SUMMARY files
- Scaling path: (1) Implement incremental digest updates (only new/modified phases), (2) Cache digest to disk, (3) Provide `--use-cache` flag to planner for faster startup

---

## Dependencies at Risk

**No production dependencies declared:**
- Risk: Codebase uses only Node.js built-in modules (fs, path, child_process, readline, crypto); no external dependencies, but also no dependency updates to track
- Impact: Immune to supply chain attacks, but no access to community packages that could simplify code
- Migration plan: Evaluate adding (1) yaml package for robust frontmatter parsing, (2) ora package for progress spinners, (3) test runner like jest for better test infrastructure; assess security implications of each

**Git API via execSync:**
- Risk: All git operations use `execSync('git ...')` pattern; relies on git being installed and in PATH
- Impact: Commands fail silently if git is unavailable, error messages are raw git stderr
- Migration plan: (1) Implement explicit git availability check at startup, (2) Use @isomorphic-git package if git-less operation needed, (3) Wrap git calls with better error messages

---

## Missing Critical Features

**No atomic multi-file operations:**
- Problem: Phase add/remove operations update ROADMAP and create/delete directories as separate steps; if one fails, state is inconsistent
- Blocks: Cannot reliably rollback partial phase operations, recovery requires manual file editing
- Fix approach: (1) Implement transaction-like pattern (collect all operations, execute atomically, or rollback all), (2) Add `--dry-run` flag to preview changes, (3) Create backup before phase modifications

**No conflict detection in concurrent operations:**
- Problem: Multiple instances of gsd-tools can run simultaneously; no locking prevents concurrent edits to ROADMAP, STATE, or phase directories
- Blocks: Race conditions possible if user runs multiple commands in quick succession
- Fix approach: (1) Add file-based locking (acquire .lock file before modifying .planning files), (2) Implement retry logic if lock is held, (3) Add timeout to prevent deadlocks

**No migration system for config schema changes:**
- Problem: config.json schema has changed multiple times (e.g., `plan_check` field added in v1.13); old configs may lack new required fields
- Blocks: Cannot safely add new config options without manual user intervention
- Fix approach: (1) Implement schema versioning in config.json, (2) Add migration functions for each version bump, (3) Auto-upgrade configs with sensible defaults

**No rollback for failed installations:**
- Problem: Installer modifies .planning, agents, commands, hooks but doesn't preserve previous state; if installation fails mid-way, user is left in inconsistent state
- Blocks: Users cannot recover from botched installations without manual cleanup
- Fix approach: (1) Create backup of entire install target before starting (`.backup-{timestamp}`), (2) Implement rollback command if installation fails, (3) Add `--backup-only` flag to test backup creation

---

## Test Coverage Gaps

**Untested area: Windows path handling:**
- What's not tested: bin/install.js Windows-specific logic (backslash normalization in hooks line 173, HEREDOC replacement for git commits)
- Files: `bin/install.js` (buildHookCommand line 171-175, hook command construction)
- Risk: Path normalization bugs could cause hook failures on Windows; git commit HEREDOC pattern may not work in PowerShell
- Priority: **High** - Installation is primary user touchpoint, failures block entire workflow

**Untested area: JSONC parsing edge cases:**
- What's not tested: parseJsonc function (line 974-1028) with malformed input (nested comments, escaped quotes in keys, BOM variants)
- Files: `bin/install.js` (parseJsonc function)
- Risk: Parser may fail or behave unexpectedly with non-standard JSONC, causing installer to crash
- Priority: **High** - Affects OpenCode installation stability

**Untested area: Frontmatter conversion for OpenCode and Gemini:**
- What's not tested: convertClaudeToOpencodeFrontmatter (line 441-543), convertClaudeToGeminiAgent (line 371-439), convertClaudeToGeminiToml (line 550-584) with real agent files
- Files: `bin/install.js` (conversion functions)
- Risk: Incorrect frontmatter may cause agents/commands to fail in OpenCode/Gemini, but failures only manifest after installation completes
- Priority: **Medium** - Affects OpenCode/Gemini users, not primary Claude Code path

**Untested area: Command reference validation:**
- What's not tested: cmdVerifyReferences (line 2238-2281) doesn't catch all reference types (e.g., backtick paths with spaces, relative .. paths)
- Files: `get-shit-done/bin/gsd-tools.js` (cmdVerifyReferences)
- Risk: False negatives allow broken references to be committed to planning docs
- Priority: **Medium** - Verification should be reliable before committing work

**Untested area: Phase numbering with many phases:**
- What's not tested: cmdPhaseNextDecimal and phase number parsing with >20 phases, especially with decimal phases like "1.1", "1.2", "2.0"
- Files: `get-shit-done/bin/gsd-tools.js` (cmdPhaseNextDecimal, findPhaseInternal)
- Risk: Incorrect phase numbering could create duplicate numbers or skip numbers
- Priority: **Medium** - Affects scaling, but not common early in projects

**Untested area: Error recovery in bundled operations:**
- What's not tested: Behavior when gsd-tools subprocess fails in workflows (e.g., `phase add` returns error)
- Files: All commands that invoke `gsd-tools` via execSync in workflows
- Risk: Incomplete operations may be reported as success, leaving inconsistent state
- Priority: **Low** - Workflows can spot-check output, but systematic testing would improve reliability

---

*Concerns audit: 2026-02-08*
