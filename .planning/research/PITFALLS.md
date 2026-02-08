# Pitfalls Research

**Domain:** Node.js CLI tool hardening (monolith refactoring, test retrofitting, security hardening, error handling)
**Researched:** 2026-02-08
**Confidence:** HIGH (codebase-specific analysis combined with verified domain patterns)

## Critical Pitfalls

### Pitfall 1: Breaking the Installer While Refactoring Other Code

**What goes wrong:**
The installer (`install.js`) is the first-run entry point via `npx get-shit-done-cc`. Refactoring touches to shared patterns (path resolution, JSONC parsing, frontmatter conversion) break the install flow. Users get a broken first experience and the tool appears dead. Because install.js has zero test coverage, regressions go undetected until a real user reports them.

**Why it happens:**
Developers treat install.js as "just another file" during refactoring, but it has unique constraints: it runs via npx (not from a local checkout), it operates on three different runtime targets (Claude, OpenCode, Gemini) with different path conventions, and it mutates the user's home directory config. The 1,739 lines contain interleaved concerns (arg parsing, JSONC parsing, frontmatter conversion for 3 runtimes, hook configuration, orphan cleanup, manifest generation) that create hidden coupling. Extracting a shared utility (e.g., frontmatter conversion) that both gsd-tools.js and install.js use can introduce a module resolution failure in the npx context where the package structure differs from local development.

**How to avoid:**
- Write install.js integration tests BEFORE refactoring it. At minimum: test global install for each runtime, test local install, test uninstall, test upgrade (overwriting existing install).
- Test the actual npx flow in CI by publishing a canary version to a local registry (verdaccio) or by simulating the npx-installed directory structure.
- Refactor install.js LAST, after gsd-tools.js is stable. The installer changes less frequently and has the highest blast radius.
- Any shared extraction (e.g., a `lib/frontmatter.js` used by both files) must be verified in the npx-resolved `node_modules` directory structure, not just local dev.

**Warning signs:**
- PRs that modify both install.js and gsd-tools.js simultaneously
- New `require()` statements in install.js pointing to paths outside `bin/`
- Refactored install code that has not been tested via `npx` against a real home directory
- CI passing but no install-specific test suite

**Phase to address:**
Early phase (Phase 1-2). Write install.js tests before touching it. Defer install.js refactoring to a later phase after gsd-tools.js decomposition is proven stable.

---

### Pitfall 2: Refactoring the Monolith Without Characterization Tests

**What goes wrong:**
The 4,597-line gsd-tools.js gets decomposed into modules (e.g., `commands/state.js`, `commands/phase.js`, `commands/frontmatter.js`) without first capturing the exact current behavior. After decomposition, subtle behavioral changes appear: different error messages break orchestrator parsing, changed exit codes break workflow conditionals, missing edge case handling in the new module boundaries. The existing 2,033 lines of tests cover happy paths but not the specific behaviors that orchestrators and agents depend on.

**Why it happens:**
Existing tests (100+ cases across 17 describe blocks) give false confidence. They test gsd-tools.js via `execSync()` and check JSON output, but they do not cover: error output format on stderr, exit codes for failure cases, behavior when `.planning/` is missing vs. empty, what happens with malformed frontmatter that the current code silently tolerates. Orchestrator `.md` files parse gsd-tools.js output with specific expectations that are undocumented. Refactoring changes internal structure, and without characterization tests that capture ALL observable behaviors (including error paths), breakage is invisible until an orchestrator workflow fails mid-execution.

**How to avoid:**
- Before any extraction: write "approval tests" / characterization tests that capture exact stdout, stderr, and exit code for every command. Use the approval testing pattern: run the command, record output, future runs compare against recorded output.
- For each command being extracted: enumerate all callers (grep orchestrator/agent .md files for that command name), document what output format they expect.
- Extract one command module at a time, run full test suite after each extraction. Do not batch extractions.
- Keep the dispatch layer in gsd-tools.js thin (just routing to modules) so the external interface is unchanged.

**Warning signs:**
- Test suite passes but a real `/gsd:execute-phase` workflow fails
- New module has different `require()` resolution behavior than the monolith
- Edge cases that "used to work" now return different JSON structure
- Empty catch blocks in new modules handle errors differently than old monolith code

**Phase to address:**
Phase 1. Characterization tests must be written before ANY refactoring begins. This is the prerequisite gate for all subsequent work.

---

### Pitfall 3: Fixing Silent Error Handling by Making It Too Loud

**What goes wrong:**
The codebase has 45+ empty `catch {}` blocks. The instinct is to add `console.error()` or `throw` to all of them. But many of these silent catches are load-bearing: `loadConfig()` returns defaults on error (line 205), `isGitIgnored()` returns false when git is unavailable (line 217), `safeReadFile()` returns null for missing files. Converting these to thrown errors or logged warnings breaks the graceful degradation that orchestrators depend on. Worse: adding `console.error()` to catches in commands that return JSON pollutes stdout/stderr, breaking orchestrator JSON parsing.

**Why it happens:**
Developers apply a blanket "all empty catches are bad" rule without classifying which catches are intentional fallbacks vs. genuinely swallowed errors. In this codebase, roughly 60% of empty catches are intentional (file-not-found fallbacks, optional feature detection, graceful degradation) and 40% are genuinely hiding bugs (JSON parse failures in phase operations, silent failures in state updates). Treating them identically either breaks working code or leaves real bugs unfixed.

**How to avoid:**
- Classify every empty catch into categories BEFORE changing any:
  - **Intentional fallback**: returns a default value, expected behavior. Add a comment `// Expected: graceful fallback when X` but do NOT add logging.
  - **Optional operation**: feature detection or best-effort operation. Add minimal context `// Best-effort: Y` but do NOT throw.
  - **Genuine bug**: error that should surface. Add proper error handling with context.
- For the ~40% that are genuine bugs: add structured error reporting through the existing `error()` function, not raw `console.error()`.
- Never add `console.error()` inside command handlers that output JSON. Use the established `output()` / `error()` pattern.
- Write a test for each catch being modified: verify the pre-change behavior, then verify the post-change behavior matches intent.

**Warning signs:**
- "Fix all empty catches" commit that changes 45 catches in one PR
- New `console.error()` calls inside `cmd*()` functions
- Orchestrator workflows failing with "unexpected token" errors (JSON parse failures from mixed stdout)
- Config loading that used to return defaults now throws errors

**Phase to address:**
Phase 2-3. After characterization tests are in place (Phase 1), classify catches in Phase 2, fix genuine bugs in Phase 3. Never batch-fix all catches in one phase.

---

### Pitfall 4: Regex Hardening That Changes Matching Behavior

**What goes wrong:**
The codebase uses 25+ `new RegExp()` constructions with user-derived field names (line 1010, 1018, 1039, 1068, 1084, 1091). Hardening these by escaping special characters or switching to literal string matching changes what previously matched. For example, STATE.md field replacement via regex (line 299-309) silently fails if the field contains regex metacharacters. Fixing this to use escaped regex changes the match boundaries, potentially matching different content. The ROADMAP.md section extraction (line 2424-2455) uses regex to find phase sections between headers; changing the regex pattern can split or merge sections differently.

**Why it happens:**
Regex-based markdown parsing is inherently fragile because markdown is not a regular language. The current regex patterns have been "evolved" to handle the specific markdown formats that exist in real `.planning/` directories. Each pattern has implicit assumptions about markdown structure (e.g., `## Phase N:` headers, `**Field:** value` patterns, `---` frontmatter delimiters). Changing a regex to be "more correct" can break against real-world files that relied on the old pattern's quirks.

**How to avoid:**
- Collect a corpus of REAL `.planning/` files from existing projects before changing any regex. Use these as golden test fixtures.
- For each regex change: test against the corpus, diff the outputs, review every difference.
- Escape field names injected into `new RegExp()` using a utility function: `function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }` -- but verify this doesn't break existing field name patterns.
- For frontmatter: consider replacing the regex parser with a line-by-line state machine (the `extractFrontmatter` function at line 263 already partially does this). State machines are deterministic and testable.
- For ROADMAP parsing: switch from regex section extraction to a heading-level-aware markdown splitter. Parse heading hierarchy, then extract sections by heading level.

**Warning signs:**
- Regex change that passes unit tests but fails when run against a real project's `.planning/` directory
- Phase numbering commands producing different results for decimal phases (e.g., "1.10" vs "1.2" sorting)
- State field updates that silently fail (content unchanged after `state update`)
- ROADMAP section extraction returning empty or truncated content

**Phase to address:**
Phase 2-3. Build regex test corpus in Phase 2 (from real files). Harden regexes in Phase 3 with corpus-validated changes.

---

### Pitfall 5: Adding Atomic Operations That Create New Failure Modes

**What goes wrong:**
The codebase lacks atomic multi-file operations (CONCERNS.md documents this). The fix seems clear: implement write-to-temp-then-rename, add file locking, add rollback. But naive implementations of atomicity create new failure modes: stale lock files from crashed processes cause deadlocks, temp files left behind by failed renames accumulate, rollback logic itself has bugs that corrupt the original files, and the complexity of transaction management outweighs the original risk of non-atomic writes.

**Why it happens:**
Atomic file operations are deceptively complex on Node.js. `fs.renameSync()` is not atomic across filesystems (temp dir vs. project dir may be different mounts). File locking via `.lock` files has no automatic cleanup on `SIGKILL`. The write-to-temp pattern requires `fsync` for durability, which `fs.writeFileSync()` does not guarantee. On Windows, files cannot be renamed while another process holds a handle. The zero-dependency constraint means implementing all of this from scratch instead of using battle-tested libraries like `write-file-atomic` or `proper-lockfile`.

**How to avoid:**
- Implement atomicity incrementally, starting with the highest-risk operations only: STATE.md writes and ROADMAP.md modifications. Do not try to make everything atomic at once.
- Use the simplest pattern that works: write to `file.tmp` in the SAME directory (avoids cross-filesystem rename issues), then `fs.renameSync()`. This is atomic on POSIX for same-filesystem renames.
- For file locking: use `fs.openSync(lockFile, 'wx')` (exclusive create) with a stale lock timeout (check lock file mtime, break if older than 30 seconds). Add `process.on('exit')` cleanup.
- Do NOT implement full transaction rollback for Phase operations. Instead: implement `--dry-run` first so users can preview changes, then make the destructive operation as small as possible.
- Test failure modes explicitly: kill process mid-write, verify temp files are cleaned up, verify lock files are cleaned up.

**Warning signs:**
- Lock files appearing in `.planning/` that are never cleaned up
- "ENOENT" errors from temp file operations
- Windows CI failures from file handle conflicts
- Phase operations that half-complete (directory created but ROADMAP not updated, or vice versa)

**Phase to address:**
Phase 4-5. After the monolith is decomposed and tested (Phase 1-3), add atomicity to the extracted modules. Attempting atomicity in the monolith is too risky.

---

### Pitfall 6: Security Fixes That Break the Zero-Dependency Constraint

**What goes wrong:**
Security hardening for path traversal, command injection, and JSONC parsing leads to importing security-focused packages (e.g., `jsonc-parser`, `safe-regex`, `path-scoped`). Each dependency: (a) violates the zero-production-dependency design constraint, (b) adds supply chain attack surface to a tool that runs in CI/CD pipelines and modifies user config directories, (c) requires ongoing maintenance for security patches in the dependency itself.

**Why it happens:**
Security best practices recommend "don't roll your own" for parsing and validation. This advice is correct for most projects but conflicts with this project's explicit zero-dependency philosophy. The CONCERNS.md even suggests "Use jsonc-parser package instead" (line 85) which directly contradicts the PROJECT.md constraint "No new entries in `dependencies`." This contradiction creates pressure to add dependencies "just for security."

**How to avoid:**
- All security fixes MUST be implemented with zero production dependencies. This is a hard constraint, not a suggestion.
- For path traversal: implement `isPathWithinScope(targetPath, scopeRoot)` using only `path.resolve()` and `path.relative()` -- check that resolved path starts with scope root.
- For command injection: the codebase already uses `execSync('git ' + escaped)` with character-class sanitization. Improve the escaping but do not add a shell-escaping library. Use `execFileSync` (array args, no shell) where possible.
- For JSONC parsing: the existing `parseJsonc()` function (install.js line 974-1028) works. Harden it with fuzz-like test cases instead of replacing it.
- For regex safety: add a manual review checklist for regex patterns (no nested quantifiers, no unbounded groups on user input) instead of importing safe-regex.
- Allowed in devDependencies: linters, test helpers, build tools. These do not ship to users.

**Warning signs:**
- PR that adds a new entry to `dependencies` (not `devDependencies`)
- Security fix that imports from `node_modules` at runtime
- "Quick fix" that uses a package for one function
- JSONC parsing rewrite that requires `jsonc-parser`

**Phase to address:**
Phase 2-3. Security fixes are high priority but must respect the constraint. Address in the same phases as error handling hardening.

---

### Pitfall 7: Test Retrofitting That Tests Implementation Instead of Behavior

**What goes wrong:**
Adding tests to the 4,597-line monolith creates tightly-coupled tests that assert internal implementation details (specific error message strings, exact JSON field ordering, internal function call patterns). When refactoring begins, these tests break on every change, even when external behavior is preserved. The team spends more time updating tests than writing code. Eventually, failing tests get deleted or `skip()`-ed rather than fixed.

**Why it happens:**
The existing test pattern uses `execSync()` to run the CLI and parses stdout JSON. This is good for behavior testing. But when adding new tests, developers start testing internal functions directly (requiring the module, calling helpers), asserting on exact error message text, or testing intermediate state (file contents mid-operation) instead of final output. The monolithic structure makes it tempting to test "inside" the module because testing from outside requires constructing complex file system fixtures.

**How to avoid:**
- All new tests MUST test through the CLI interface (via `runGsdTools()` helper), not by importing internal functions. This ensures tests survive refactoring.
- Assert on JSON structure and semantics, not exact strings. Use `assert.ok(output.error.includes('not found'))` not `assert.strictEqual(output.error, 'Phase 03 not found in phases directory')`.
- Create reusable test fixture factories: `createPhaseFixture(phaseNum, planCount)`, `createStateFixture(currentPhase)`, `createRoadmapFixture(phases[])`. These survive refactoring because they create standard file structures.
- Never test that a specific internal function was called. Test that the observable output (stdout JSON, file system state, exit code) matches expectations.
- When a test breaks during refactoring: if the behavior is unchanged, fix the test. If the test was asserting implementation details, delete it and write a behavior test.

**Warning signs:**
- Tests that `require('./gsd-tools.js')` and call internal functions directly
- Tests that assert exact error message strings
- Tests that break when files are moved but behavior is unchanged
- Increasing `test.skip()` count after refactoring phases

**Phase to address:**
Phase 1. Establish test patterns and fixture factories before writing characterization tests. This prevents accumulating bad tests that slow down later phases.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keeping the single-file monolith with just better tests | Avoids risky refactoring | Startup time stays slow (loads all 4,597 lines for any command), testing remains coarse-grained | Never -- decomposition is the core goal |
| Adding `// TODO` comments instead of fixing catches | Fast to ship, documents intent | TODOs accumulate and are never resolved; intent without action is just noise | Only during Phase 1 characterization when you need to mark catches for later classification |
| Copying the existing regex patterns into new modules unchanged | Preserves behavior exactly | Propagates fragile patterns to new code that will live longer | During Phase 2 extraction only; must be hardened in Phase 3 |
| Using `execSync` for all git operations | Simple, synchronous, no callback complexity | Blocks event loop, no progress indication for large repos, error messages are raw git stderr | Acceptable for single-command operations; replace with `execFileSync` (array args) for security |
| Skipping Windows tests in CI | Faster CI, no Windows runner cost | Windows path bugs (backslash normalization, HEREDOC in PowerShell) ship to users | During Phase 1-2 only; add Windows CI by Phase 3 |
| Hardcoding the `node --test` runner | Zero-dep, works on Node 16.7+ | No coverage reporting, no watch mode, limited assertion library, no parallel test execution | Acceptable permanently -- aligns with zero-dep philosophy; add coverage via `node --test --experimental-test-coverage` (Node 19.7+) |

## Integration Gotchas

Common mistakes when connecting to external systems this CLI depends on.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Git via `execSync` | Building command string with string concatenation: `'git commit -m "' + msg + '"'` allows injection if `msg` contains quotes | Use `execFileSync('git', ['commit', '-m', msg])` which passes args as array, no shell interpretation. The existing `execGit()` function partially mitigates with character-class escaping but still uses shell via `execSync`. |
| File system (home directory) | Using `os.homedir()` without checking it returns a valid writable directory. On some CI systems, `HOME` is unset or points to `/`. | Validate `os.homedir()` result: check it exists, is a directory, is writable. Fall back to a temp directory with a warning if invalid. |
| npx package resolution | Assuming `require('../package.json')` resolves relative to the source file. In npx, the installed path may differ from the development path, especially with npm workspaces or pnpm. | Use `path.resolve(__dirname, '..', 'package.json')` and add a fallback with error message if the file is not found. |
| Brave Search API | No timeout on HTTP requests. If the API is slow or unreachable, the CLI hangs indefinitely. | Add `AbortController` with a 10-second timeout to all fetch calls. Return a structured error if the request times out. |
| OpenCode JSONC config | Assuming JSONC files are "JSON with comments." Real JSONC also allows trailing commas, BOM markers, and single-line `//` comments inside strings. The custom `parseJsonc` function may not handle all variants. | Fuzz-test `parseJsonc` with real-world opencode.json files. Add explicit handling for BOM, nested comments in strings (reject, don't parse), and trailing commas after last array element. |
| Config directory detection | Hardcoding `~/.claude` without checking `CLAUDE_CONFIG_DIR` environment variable override. The installer handles this correctly, but gsd-tools.js path resolution may not. | Always resolve config directory through the existing `getGlobalDir()` function, never hardcode `~/.claude`. Add a test that sets `CLAUDE_CONFIG_DIR` and verifies path resolution. |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full ROADMAP.md regex scan on every phase operation | Imperceptible at 5 phases | Parse ROADMAP once at command start, cache the AST; re-parse only on write | 20+ phases: noticeable 200-500ms delay per command |
| History digest rebuilding all SUMMARY files | Fast at 10 summaries | Implement incremental digest: hash each summary, only re-parse if hash changed, cache digest to `.planning/.digest-cache.json` | 50+ summaries: 2-3 second delay |
| Synchronous directory tree copy during install | Fine for 100 files | Add progress indicator (file count) but keep sync (install runs once). Batch file reads using readdir then map. | 500+ files: multi-second install with no feedback |
| Compiled regex per function call | Unmeasurable at single invocation | Move `new RegExp()` patterns to module scope as constants (one-time compilation). Note: only do this for patterns that do NOT include user-derived content. | 100+ sequential tool invocations in a workflow: cumulative 50-100ms wasted |

## Security Mistakes

Domain-specific security issues for a CLI tool that modifies user config directories.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Path traversal via `--file` argument accepting `../../etc/passwd` | Read/write files outside `.planning/` scope. Not exploitable by end users (they control their own filesystem), but exploitable if an AI agent is prompted to run a malicious gsd-tools command. | Implement `assertPathWithinScope(filePath, cwd)` that resolves symlinks and verifies the resolved path starts with the expected root. Apply to all `cmd*` functions that accept file paths. |
| Shell injection via `execSync('git ' + userInput)` | If commit message or branch name contains shell metacharacters (`$(cmd)`, backticks), arbitrary commands execute. The existing `execGit()` has character-class escaping but it strips characters rather than escaping them, potentially changing the user's intended content. | Replace `execSync('git ' + args)` with `execFileSync('git', argsArray)` which never invokes a shell. This is a drop-in replacement for all git operations. |
| JSONC parser regex backtracking | Maliciously crafted opencode.json with deeply nested comments or long strings could cause catastrophic backtracking in the regex-based parser, hanging the install process. | Add a file size limit (reject JSONC files > 1MB), add a parsing timeout, and test with adversarial inputs. The current implementation (line 974-1028) does not have nested quantifiers, but any future regex changes must be reviewed for ReDoS. |
| Environment variable leaking via hook commands | SessionStart hooks run shell commands that inherit the parent process environment. If a hook logs its environment or passes it to a subprocess, API keys (BRAVE_SEARCH_API_KEY, CLAUDE_API_KEY) could be exposed. | Whitelist environment variables passed to hook subprocesses. Use `spawn()` with explicit `env` option containing only necessary variables (PATH, HOME, NODE_PATH). |
| Manifest SHA256 not verified on read | The manifest file (`.gsd-manifest.json`) stores SHA256 hashes but doesn't verify its own integrity. An attacker who can modify the manifest can make the installer skip backup of modified files. | Sign the manifest with a hash of its own content stored in a separate `.gsd-manifest.sig` file, or at minimum verify manifest structure before trusting it. This is low priority since the threat model requires write access to the user's config directory. |

## UX Pitfalls

Common user experience mistakes when hardening a CLI tool.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Adding verbose error logging that clutters normal output | Users see warnings for every optional file that doesn't exist, creating alarm for normal conditions | Use log levels: errors to stderr with exit code 1, warnings only with `--verbose` flag, normal operation is silent except for structured JSON output |
| Changing exit codes during hardening | Orchestrator `.md` files check exit codes to determine success/failure. Changing exit code semantics breaks all workflows. | Document current exit code semantics first. Any exit code change requires updating all callers. Treat exit codes as a public API contract. |
| Adding input validation that rejects previously-accepted input | Users with existing `.planning/` directories that contain "invalid" data (e.g., phase names with special characters, frontmatter with non-standard fields) get errors on upgrade | All new validation must be warn-only for existing data. Only reject on NEW input. Provide a `--strict` flag for opt-in strict validation. |
| Breaking `--raw` output format | Agents parse `--raw` output as raw text (not JSON). Changing the raw format breaks agent workflows. | Add `--format json|raw|table` flag to explicitly control output format. Keep `--raw` behavior exactly as-is for backward compatibility. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Monolith decomposition:** Modules extracted and tests pass -- but orchestrator .md files still reference old command names or expect old output format. Verify ALL callers by grepping `agents/*.md`, `commands/gsd/*.md`, and `get-shit-done/workflows/*.md` for each modified command.
- [ ] **Error handling hardened:** All empty catches replaced -- but `loadConfig()` now throws instead of returning defaults, breaking every workflow that starts with config loading. Verify graceful degradation paths still work.
- [ ] **Security hardening done:** Path validation added -- but relative paths that orchestrators legitimately use (e.g., `@plan-file` references in verification) are now rejected. Verify all `@`-reference patterns and relative path usage in orchestrator files.
- [ ] **Tests added:** Coverage is up -- but all tests run against synthetic data. No tests use real `.planning/` directory structures from actual projects. Create a `test/fixtures/` directory with representative real-world data.
- [ ] **Atomic writes implemented:** Write-to-temp-then-rename works -- but temp files from interrupted operations accumulate in `.planning/`. Add startup cleanup that removes `.tmp` files older than 1 hour.
- [ ] **Config migration system added:** Schema versioning works for new installs -- but existing users with old configs get a migration error because their config.json lacks the `version` field. Migration must handle the "no version field" case as version 0.
- [ ] **Windows compatibility fixed:** Path normalization works on Windows -- but hook commands still use Unix-style heredocs for git commits. Test hook execution specifically on Windows/PowerShell.
- [ ] **Regex patterns hardened:** All `new RegExp()` calls escape user input -- but escaping changed the matching behavior for phase names containing dots (e.g., "1.1" now needs `\.` instead of `.`). Test all decimal phase operations after regex changes.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Installer broken after refactoring | HIGH | Revert to last known good version immediately. Publish a patch release. Do not attempt to fix forward -- the install path is too critical. |
| Behavioral regression after monolith decomposition | MEDIUM | Git bisect to find the breaking extraction. Inline the extracted module back temporarily. Write the missing characterization test. Re-extract with the test in place. |
| Error handling change breaks orchestrator | LOW | Revert the specific catch change. Add a characterization test for the expected behavior. Re-apply the fix with the correct classification (intentional fallback vs. bug). |
| Regex change breaks real-world data | MEDIUM | Revert regex. Add the breaking real-world data as a test fixture. Fix regex with fixture-validated behavior. Diff old and new outputs across entire fixture corpus. |
| Atomic operation leaves temp files | LOW | Add cleanup utility: `gsd-tools cleanup-temp`. Run on startup if `.planning/` contains `.tmp` files. Document in troubleshooting guide. |
| Security fix breaks legitimate usage | MEDIUM | Add allowlist for the legitimate case. Security restrictions should have escape hatches for known-good patterns (e.g., `@`-references in verification commands). Log when an allowlisted path is used. |
| Test suite becomes unmaintainable | HIGH | Stop adding tests. Audit existing tests for implementation-coupling. Delete or rewrite tests that assert on implementation details. Establish test review criteria: "does this test survive a refactoring that preserves behavior?" |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Breaking the installer | Phase 1: Write install tests BEFORE any refactoring | All 3 runtime install paths tested in CI; canary npx test passes |
| Refactoring without characterization tests | Phase 1: Write characterization tests for all 90+ commands | Every `cmd*()` function has at least one approval test capturing stdout, stderr, exit code |
| Making silent errors too loud | Phase 2: Classify all 45 empty catches | Classification spreadsheet reviewed; each catch labeled as intentional/optional/bug |
| Regex behavior changes | Phase 2-3: Build test corpus from real files, then harden | Regex changes diffed against corpus; zero unexpected output differences |
| Atomic operations creating new failures | Phase 4-5: After decomposition is stable | Temp file cleanup tested; lock file stale detection tested; interrupted-write recovery tested |
| Security fixes breaking zero-dep constraint | Phase 2-3: Alongside error handling | No new production dependencies in package.json; security changes pass with `dependencies: {}` |
| Tests that test implementation | Phase 1: Establish patterns before writing bulk tests | Test review checklist enforced; no tests that `require()` internal functions |

## Sources

- Codebase analysis: `/Users/naveennegi/Documents/codebase/poc/get-shit-done/.planning/codebase/CONCERNS.md` (HIGH confidence -- direct codebase inspection)
- Codebase analysis: `/Users/naveennegi/Documents/codebase/poc/get-shit-done/.planning/codebase/TESTING.md` (HIGH confidence -- direct codebase inspection)
- Codebase analysis: `/Users/naveennegi/Documents/codebase/poc/get-shit-done/.planning/codebase/ARCHITECTURE.md` (HIGH confidence -- direct codebase inspection)
- Codebase analysis: `/Users/naveennegi/Documents/codebase/poc/get-shit-done/.planning/codebase/CONVENTIONS.md` (HIGH confidence -- direct codebase inspection)
- [Understand Legacy Code: Best way to start testing untested code](https://understandlegacycode.com/blog/best-way-to-start-testing-untested-code/) (MEDIUM confidence -- general legacy testing patterns applied to this codebase)
- [Writing Automated Tests on a Legacy Node.js Back-End](https://www.infoq.com/articles/testing-legacy-nodejs-app/) (MEDIUM confidence -- Node.js-specific legacy testing patterns)
- [Node.js Secure Coding: Path Traversal Vulnerabilities](https://www.nodejs-security.com/book/path-traversal) (MEDIUM confidence -- security patterns verified against this codebase's specific usage)
- [CVE-2025-27210: Node.js Path Traversal on Windows](https://zeropath.com/blog/cve-2025-27210-nodejs-path-traversal-windows) (HIGH confidence -- specific CVE affecting this codebase's Windows support target)
- [Preventing Command Injection in Node.js](https://auth0.com/blog/preventing-command-injection-attacks-in-node-js-apps/) (MEDIUM confidence -- confirms execSync vs execFileSync recommendation)
- [Node.js regex dangers](https://www.sonarsource.com/blog/vulnerable-regular-expressions-javascript/) (MEDIUM confidence -- regex patterns verified against this codebase's specific regex usage)
- [How a RegEx can bring your Node.js service down](https://lirantal.medium.com/node-js-pitfalls-how-a-regex-can-bring-your-system-down-cbf1dc6c4e02) (MEDIUM confidence -- ReDoS risk verified against parseJsonc patterns)
- [write-file-atomic: Atomic file writes for Node.js](https://github.com/npm/write-file-atomic) (HIGH confidence -- pattern reference; NOT to be used as dependency, only as implementation reference)
- [Silent Errors in Nested Try-Catch Blocks](https://medium.com/@t69772041/silent-errors-in-nested-try-catch-blocks-the-hidden-danger-in-javascript-62811622d058) (MEDIUM confidence -- general pattern applied to this codebase's specific empty catch usage)
- [Node.js Testing Best Practices (goldbergyoni)](https://github.com/goldbergyoni/nodejs-testing-best-practices) (MEDIUM confidence -- testing philosophy applied to this codebase's test patterns)

---
*Pitfalls research for: Node.js CLI tool hardening (GSD codebase)*
*Researched: 2026-02-08*
