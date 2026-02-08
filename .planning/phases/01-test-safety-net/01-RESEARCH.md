# Phase 1: Test Safety Net - Research

**Researched:** 2026-02-08
**Domain:** Characterization testing for Node.js CLI tools (zero-dependency, node:test)
**Confidence:** HIGH

## Summary

Phase 1 captures the current behavior of the entire GSD codebase in characterization tests before any production code changes begin. The codebase has two main testable units: `gsd-tools.js` (4,597 lines, 70 unique command paths across 24 top-level commands) and `install.js` (1,739 lines, 3 runtime targets with frontmatter conversion, JSONC parsing, and file manifest logic). There are also 2 hook scripts that need basic behavioral coverage.

The existing test suite (`gsd-tools.test.js`, 2,033 lines, 75 passing tests across 18 describe blocks) covers approximately 27 of the 70 command paths. The test pattern is well-established: `createTempProject()` sets up a temp directory, `runGsdTools()` invokes the CLI via `execSync`, and assertions verify stdout JSON or stderr. This pattern is sound and should be extended, not replaced. The install.js file has zero test coverage and its pure functions (JSONC parser, frontmatter converters, tool name mappers) are the highest-value targets for isolated unit testing.

**Primary recommendation:** Extend the existing `node:test` infrastructure with co-located test files (one per major testable unit), use `node:test` built-in snapshot assertions for stable CLI output, and extract install.js pure functions behind a conditional `module.exports` for direct unit testing without subprocess overhead.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Claude's discretion on per-command granularity -- simple commands get one test, complex commands get multiple scenarios based on risk
- "Behavior captured" definition is flexible per command -- observable contract (stdout, stderr, exit code) as baseline, with side-effect verification where commands modify files or state
- Fixture strategy is Claude's choice -- realistic fixtures where useful, minimal where sufficient
- Edge-case-heavy modules (JSONC parser, frontmatter converter, phase numbering) get depth based on their risk profile
- Comparison approach is Claude's choice -- exact snapshots vs pattern assertions decided per test based on output stability
- Non-deterministic output handling (timestamps, paths) determined per case
- Snapshot update workflow designed by Claude
- Snapshot file location determined by what fits the project structure
- Testing approach for 3 runtimes (Claude Code, OpenCode, Gemini CLI) is Claude's choice -- mock vs real installs based on what's practical
- Install vs upgrade path coverage determined by risk analysis
- Content verification depth for generated config files chosen based on correctness needs
- Cross-platform coverage strategy (current platform only vs mocked) at Claude's discretion
- Test runner choice evaluated against zero-dependency constraint (existing node:test is the starting point)
- File organization fits existing project layout
- Subset running support determined by expected test count and speed
- Coverage metrics included only if useful for Phase 1's behavior-capture goal

### Claude's Discretion
All four areas (test granularity, snapshot strategy, runtime coverage, test infrastructure) were explicitly delegated. Full flexibility within the constraint that every existing behavior must be captured in tests so subsequent phases can refactor with confidence.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:test | Node.js 25.6.0 built-in | Test runner, describe/it/beforeEach/afterEach, snapshot assertions | Already used in project; zero-dependency constraint; full-featured in Node 25.x |
| node:assert | Node.js 25.6.0 built-in | Assertion library (strictEqual, deepStrictEqual, ok) | Already used in project; pairs with node:test |
| node:child_process | Node.js 25.6.0 built-in | execSync for CLI subprocess testing | Already used pattern in existing tests |
| node:fs | Node.js 25.6.0 built-in | Temp directory creation, fixture setup, file-based assertions | Already used for test infrastructure |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| t.assert.snapshot | Node.js 25.6.0 built-in | Snapshot testing for stable CLI output | Commands with deterministic JSON output (70%+ of commands) |
| node:test mock | Node.js 25.6.0 built-in | Function mocking for isolated unit tests | Testing install.js pure functions without file system side effects |
| --test-name-pattern | Node.js 25.6.0 CLI flag | Filter tests by regex pattern | Running subsets during development |
| --test-update-snapshots | Node.js 25.6.0 CLI flag | Regenerate snapshot files | When behavior intentionally changes in later phases |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node:test | Jest/Vitest | Richer API but adds dependency, violates zero-dep constraint |
| t.assert.snapshot | Manual JSON comparison | More work, but avoids snapshot file management; use for non-deterministic output |
| execSync subprocess testing | Direct function import | Better isolation and speed, but requires refactoring install.js module boundaries first |

**Installation:** None required -- all tools are Node.js built-ins.

## Architecture Patterns

### Recommended Test File Organization
```
get-shit-done/
├── bin/
│   ├── gsd-tools.js              # Existing implementation (4,597 lines)
│   └── gsd-tools.test.js         # Existing tests (2,033 lines) - EXTEND
bin/
├── install.js                     # Existing installer (1,739 lines)
└── install.test.js                # NEW: installer tests
hooks/
├── gsd-check-update.js           # Existing hook
├── gsd-statusline.js             # Existing hook
└── hooks.test.js                 # NEW: hook tests (lightweight)
```

**Rationale:** Co-located test files match existing project convention (`gsd-tools.test.js` next to `gsd-tools.js`). Adding `install.test.js` next to `install.js` and `hooks.test.js` in the hooks directory follows the same pattern.

### Pattern 1: CLI Command Characterization Test (Existing Pattern)
**What:** Test CLI commands via subprocess, verify stdout/stderr/exit code
**When to use:** All gsd-tools.js commands (70 command paths)
**Example:**
```javascript
// Source: existing gsd-tools.test.js pattern
describe('command-name command', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('happy path returns expected output', () => {
    // Setup: create necessary files in tmpDir
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '...');

    // Execute
    const result = runGsdTools('command-name arg1', tmpDir);

    // Assert
    assert.ok(result.success, `Command failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.field, 'expected');
  });

  test('error path returns failure', () => {
    const result = runGsdTools('command-name invalid-arg', tmpDir);
    assert.ok(!result.success, 'should fail');
    assert.ok(result.error.includes('expected error text'));
  });
});
```

### Pattern 2: Pure Function Unit Test (for install.js)
**What:** Extract pure functions (parseJsonc, convertClaudeToOpencodeFrontmatter, etc.) and test directly without subprocess
**When to use:** install.js functions that take input and return output without file system side effects
**Example:**
```javascript
// install.js exports pure functions when loaded as module
// (conditional export at bottom of install.js)
const { parseJsonc, convertClaudeToOpencodeFrontmatter, convertClaudeToGeminiAgent,
        convertClaudeToGeminiToml, convertToolName, convertGeminiToolName,
        stripSubTags, expandTilde } = require('./install.js');

describe('parseJsonc', () => {
  test('strips single-line comments', () => {
    const result = parseJsonc('{ "key": "val" // comment\n}');
    assert.deepStrictEqual(result, { key: 'val' });
  });

  test('strips block comments', () => {
    const result = parseJsonc('{ /* comment */ "key": "val" }');
    assert.deepStrictEqual(result, { key: 'val' });
  });

  test('handles BOM prefix', () => {
    const result = parseJsonc('\uFEFF{"key": "val"}');
    assert.deepStrictEqual(result, { key: 'val' });
  });
});
```

### Pattern 3: Snapshot Test for Stable Output
**What:** Use node:test built-in snapshot assertions for commands with deterministic JSON output
**When to use:** Commands returning stable JSON structure where exact field values are predictable
**Example:**
```javascript
// Source: Node.js v25.x node:test docs
test('history-digest empty project snapshot', (t) => {
  const result = runGsdTools('history-digest', tmpDir);
  assert.ok(result.success);
  t.assert.snapshot(JSON.parse(result.output));
});
// Run with: node --test --test-update-snapshots gsd-tools.test.js  (first time)
// Run with: node --test gsd-tools.test.js                          (verify)
```

### Pattern 4: Installer Runtime Test (Mock-Based)
**What:** Test install() function behavior for each runtime by pointing it at a temp directory
**When to use:** Testing that install produces correct file structure for Claude/OpenCode/Gemini
**Example:**
```javascript
describe('install for claude runtime', () => {
  let tmpDir, srcDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-install-test-'));
    // Create minimal source structure that install() expects
    srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-src-'));
    // ... setup source files
  });

  test('creates commands/gsd directory', () => {
    // Execute install targeting tmpDir
    // Verify expected directory structure exists
    assert.ok(fs.existsSync(path.join(tmpDir, 'commands', 'gsd')));
  });
});
```

### Anti-Patterns to Avoid
- **Testing implementation details:** Tests should capture observable behavior (stdout, stderr, exit code, file side effects), not internal function call order. This is a characterization test suite, not a unit test suite.
- **Fragile snapshot on non-deterministic output:** Commands that include timestamps, absolute paths, or process IDs must use pattern assertions, not snapshots.
- **Over-mocking file system:** The existing pattern of using real temp directories is correct for characterization tests. It captures actual behavior including edge cases in fs operations.
- **Testing markdown/workflow files:** Agent definitions (`agents/*.md`) and workflow files (`get-shit-done/workflows/*.md`) are prompt text, not executable code. They are tested implicitly through the CLI commands they invoke.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test runner | Custom test framework | node:test (built-in) | Already used, zero-dep, full-featured in Node 25.x |
| Snapshot comparison | Custom file diff logic | t.assert.snapshot() | Built-in, handles serialization, update workflow via CLI flag |
| Temp directory management | Custom cleanup logic | Existing createTempProject()/cleanup() helpers | Already proven in 75 tests |
| Subprocess execution | Custom process management | Existing runGsdTools() helper | Already handles stdout/stderr/exit code capture |
| Test filtering | Custom test discovery | --test-name-pattern CLI flag | Built into node:test runner |

**Key insight:** The existing test infrastructure is well-designed. The gap is coverage breadth (27/70 commands tested, 0% installer coverage), not infrastructure quality.

## Common Pitfalls

### Pitfall 1: Testing install.js as a Subprocess
**What goes wrong:** install.js runs top-level code on require (parses CLI args, prints banner, calls process.exit). Invoking it as a subprocess in tests triggers the interactive installer.
**Why it happens:** install.js is a CLI script, not a module. It has no `module.exports` and executes immediately.
**How to avoid:** Add a conditional export guard at the bottom of install.js:
```javascript
// At bottom of install.js
if (require.main === module) {
  // existing CLI logic (banner, arg parsing, interactive prompts)
} else {
  // Export pure functions for testing
  module.exports = { parseJsonc, convertClaudeToOpencodeFrontmatter, ... };
}
```
This is the ONE production code change needed in Phase 1 -- it adds testability without changing any behavior. The `require.main === module` guard is a standard Node.js pattern.
**Warning signs:** Tests hanging waiting for stdin, process.exit crashing the test runner.

### Pitfall 2: Non-Deterministic Command Output
**What goes wrong:** Snapshot tests break on every run because output includes timestamps, absolute paths, or varying field order.
**Why it happens:** Commands like `current-timestamp`, `init *`, and `state load` include environment-specific values.
**How to avoid:** Classify each command's output stability:
- **Stable (use snapshots):** history-digest, phases list, roadmap get-phase, generate-slug, validate consistency, frontmatter get/validate, verify plan-structure
- **Semi-stable (use snapshots with normalization):** state-snapshot, phase-plan-index, summary-extract -- normalize known variable fields before snapshot
- **Unstable (use pattern assertions):** current-timestamp, init commands (contain absolute paths), state load (contains paths), websearch (network-dependent)
**Warning signs:** Tests passing locally but failing in CI or on another developer's machine.

### Pitfall 3: Git-Dependent Commands
**What goes wrong:** Commands like `commit`, `verify commits`, and `init *` that invoke git fail in test environments without git init.
**Why it happens:** Tests run in fresh temp directories that aren't git repositories.
**How to avoid:** For git-dependent commands:
1. Initialize a git repo in tmpDir: `execSync('git init && git config user.email "test@test" && git config user.name "Test"', { cwd: tmpDir })`
2. Create initial commit so git operations have baseline
3. Test the command's behavior, not git's behavior
**Warning signs:** `fatal: not a git repository` errors in test output.

### Pitfall 4: Test Suite Speed
**What goes wrong:** 200+ subprocess-spawning tests take 60+ seconds, making development feedback slow.
**Why it happens:** Each `runGsdTools()` call spawns a new Node.js process (execSync), which has ~100-200ms overhead.
**How to avoid:**
1. Group related assertions in single tests where possible (characterization tests care about output, not isolation)
2. Use `--test-name-pattern` for focused development: `node --test --test-name-pattern "jsonc" install.test.js`
3. Keep pure function tests (parseJsonc, frontmatter converters) as direct imports -- no subprocess overhead
4. Target: <30 seconds for full suite (currently 12s for 75 tests)
**Warning signs:** Suite exceeding 45 seconds on a standard machine.

### Pitfall 5: install.js Function Coupling
**What goes wrong:** Even after adding module.exports, functions like `install()` and `uninstall()` depend on module-scoped state (selectedRuntimes, explicitConfigDir, attributionCache).
**Why it happens:** install.js was designed as a script, not a module. Globals are initialized at parse time.
**How to avoid:** Test install.js in two tiers:
1. **Pure functions** (parseJsonc, convertClaudeToOpencodeFrontmatter, convertToolName, etc.): Import directly, no state dependencies
2. **Stateful functions** (install, uninstall): Test via subprocess with specific CLI args, similar to gsd-tools pattern
**Warning signs:** Tests affecting each other due to shared module state, especially attributionCache.

## Code Examples

### Example 1: Extending gsd-tools.test.js with Missing Commands
```javascript
// Source: Extending existing test pattern
describe('state load command', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('returns config and state when both exist', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'balanced' }));
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Phase:** 01\n**Current Plan:** 01\n`);

    const result = runGsdTools('state load', tmpDir);
    assert.ok(result.success, `Failed: ${result.error}`);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.config.model_profile, 'balanced');
  });

  test('returns defaults when config missing', () => {
    const result = runGsdTools('state load', tmpDir);
    assert.ok(result.success);
    const output = JSON.parse(result.output);
    assert.ok(output.config, 'should have config with defaults');
  });
});
```

### Example 2: JSONC Parser Edge Case Tests
```javascript
// Source: Derived from install.js parseJsonc implementation (line 974-1028)
describe('parseJsonc', () => {
  test('handles nested block comments', () => {
    const input = '{ "a": /* outer /* not nested */ "val" }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { a: 'val' });
  });

  test('preserves strings containing comment-like sequences', () => {
    const input = '{ "url": "https://example.com" }';
    const result = parseJsonc(input);
    assert.strictEqual(result.url, 'https://example.com');
  });

  test('handles escaped quotes inside strings', () => {
    const input = '{ "key": "value with \\"quotes\\"" }';
    const result = parseJsonc(input);
    assert.strictEqual(result.key, 'value with "quotes"');
  });

  test('strips UTF-8 BOM', () => {
    const input = '\uFEFF{ "key": "val" }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { key: 'val' });
  });

  test('removes trailing commas before closing braces', () => {
    const input = '{ "a": 1, "b": 2, }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });

  test('removes trailing commas before closing brackets', () => {
    const input = '{ "arr": [1, 2, 3, ] }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { arr: [1, 2, 3] });
  });

  test('throws on truly malformed JSON after comment stripping', () => {
    assert.throws(() => parseJsonc('{ broken }'), { name: 'SyntaxError' });
  });
});
```

### Example 3: Frontmatter Conversion Tests
```javascript
// Source: Derived from install.js conversion functions (lines 264-584)
describe('convertClaudeToOpencodeFrontmatter', () => {
  test('converts allowed-tools array to tools object', () => {
    const input = `---
name: test-agent
description: Test
allowed-tools:
  - Read
  - Write
  - Bash
color: cyan
---
Body content`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('tools:'));
    assert.ok(result.includes('read: true'));
    assert.ok(result.includes('write: true'));
    assert.ok(result.includes('bash: true'));
    assert.ok(!result.includes('name:'));  // name stripped for opencode
    assert.ok(result.includes('"#00FFFF"'));  // cyan -> hex
  });

  test('maps special tool names correctly', () => {
    const input = `---
tools: AskUserQuestion, SlashCommand, TodoWrite
---
Body`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('question: true'));
    assert.ok(result.includes('skill: true'));
    assert.ok(result.includes('todowrite: true'));
  });
});

describe('convertClaudeToGeminiAgent', () => {
  test('converts tools to YAML array with Gemini names', () => {
    const input = `---
name: test-agent
tools: Read, Write, Bash
color: cyan
---
Body content`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(result.includes('- read_file'));
    assert.ok(result.includes('- write_file'));
    assert.ok(result.includes('- run_shell_command'));
    assert.ok(!result.includes('color:'));  // color stripped for gemini
  });

  test('excludes MCP tools and Task', () => {
    const input = `---
tools: Read, mcp__context7__query, Task
---
Body`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(result.includes('- read_file'));
    assert.ok(!result.includes('mcp__'));
    assert.ok(!result.includes('task'));
  });
});

describe('convertClaudeToGeminiToml', () => {
  test('extracts description and body as TOML', () => {
    const input = `---
description: My command
name: test
---
Command body here`;
    const result = convertClaudeToGeminiToml(input);
    assert.ok(result.includes('description = "My command"'));
    assert.ok(result.includes('prompt = "Command body here"'));
  });
});
```

### Example 4: Phase Numbering Edge Case Tests
```javascript
// Source: gsd-tools.js cmdPhaseNextDecimal (line 882-949)
describe('phase next-decimal edge cases', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('double-digit base phases work correctly', () => {
    const phasesDir = path.join(tmpDir, '.planning', 'phases');
    fs.mkdirSync(path.join(phasesDir, '10-large-phase'), { recursive: true });

    const result = runGsdTools('phase next-decimal 10', tmpDir);
    assert.ok(result.success);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '10.1');
  });

  test('decimal transition from 1.9 to 1.10', () => {
    const phasesDir = path.join(tmpDir, '.planning', 'phases');
    for (let i = 1; i <= 9; i++) {
      fs.mkdirSync(path.join(phasesDir, `01.${i}-sub`), { recursive: true });
    }

    const result = runGsdTools('phase next-decimal 1', tmpDir);
    assert.ok(result.success);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '01.10');
    assert.strictEqual(output.existing.length, 9);
  });

  test('many decimal phases sort numerically not lexicographically', () => {
    const phasesDir = path.join(tmpDir, '.planning', 'phases');
    // Create phases 1.1, 1.2, 1.9, 1.10, 1.11
    for (const n of [1, 2, 9, 10, 11]) {
      fs.mkdirSync(path.join(phasesDir, `01.${n}-sub`), { recursive: true });
    }

    const result = runGsdTools('phase next-decimal 1', tmpDir);
    assert.ok(result.success);
    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '01.12');
  });
});
```

### Example 5: npm test Script Update
```json
{
  "scripts": {
    "test": "node --test get-shit-done/bin/gsd-tools.test.js bin/install.test.js",
    "test:tools": "node --test get-shit-done/bin/gsd-tools.test.js",
    "test:install": "node --test bin/install.test.js",
    "test:hooks": "node --test hooks/hooks.test.js",
    "test:snapshots": "node --test --test-update-snapshots get-shit-done/bin/gsd-tools.test.js bin/install.test.js",
    "test:filter": "node --test --test-name-pattern"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node:test without snapshots | t.assert.snapshot() built-in | Node.js 22.3.0+ | No need for external snapshot library |
| --test flag only | --test-name-pattern, --test-only, --test-skip-pattern | Node.js 20+ | Full test filtering without external runner |
| No coverage built-in | --experimental-test-coverage | Node.js 20+ | Coverage without nyc/c8, but still experimental |
| Manual snapshot files | Auto-generated .snapshot files | Node.js 22.3.0+ | Snapshot update via --test-update-snapshots CLI flag |

**Deprecated/outdated:**
- `test.only()` without `--test-only` flag: In Node 25.x, `only` option still requires `--test-only` to be set at CLI level
- `node:test/reporters`: TAP is default; spec reporter available for human-readable output

## Inventory of Work

### gsd-tools.js: Commands Needing Tests (43 untested of 70)

**Tier 1 -- Standalone commands (no subcommands, simple I/O):**
| Command | Complexity | Test Strategy |
|---------|-----------|---------------|
| resolve-model | Low | 1-2 tests: valid agent, unknown agent |
| find-phase | Low | 2-3 tests: found, not found, decimal phase |
| generate-slug | Low | 2-3 tests: basic text, special chars, empty |
| current-timestamp | Low | 1-2 tests: each format variant |
| list-todos | Low | 2-3 tests: empty, with todos, filtered |
| verify-path-exists | Low | 2 tests: exists, not exists |
| config-ensure-section | Medium | 2-3 tests: create new, idempotent, malformed |
| config-set | Medium | 2-3 tests: set value, nested key, invalid path |
| phase-plan-index (partial) | Medium | Already partially tested; add edge cases |
| summary-extract (partial) | Medium | Already partially tested; add --fields variations |

**Tier 2 -- State subcommands (11 subcommands):**
| Command | Complexity | Test Strategy |
|---------|-----------|---------------|
| state load | Medium | 2-3 tests: with config, without, empty state |
| state update | Medium | 2-3 tests: valid field, missing file |
| state get | Low | 2 tests: full state, section |
| state patch | Medium | 2-3 tests: single patch, multiple |
| state advance-plan | Medium | 2 tests: normal advance, from scratch |
| state record-metric | Medium | 2-3 tests: full options, partial |
| state update-progress | Medium | 2 tests: with phases, empty |
| state add-decision | Medium | 2 tests: with phase, without |
| state add-blocker | Low | 2 tests: add, duplicate |
| state resolve-blocker | Low | 2 tests: resolve existing, missing |
| state record-session | Medium | 2 tests: full options, minimal |

**Tier 3 -- Frontmatter, template, verify subcommands:**
| Command | Complexity | Test Strategy |
|---------|-----------|---------------|
| frontmatter get | Low | 2-3 tests: with field, without, missing file |
| frontmatter set | Medium | 2-3 tests: set field, create if missing |
| frontmatter merge | Medium | 2-3 tests: merge into existing, empty |
| frontmatter validate | Medium | 3 tests: valid plan, valid summary, invalid |
| template select | Medium | 2 tests: simple plan, complex plan |
| template fill summary | Medium | 2-3 tests: with fields, without |
| template fill plan | Medium | 2-3 tests: execute type, tdd type |
| template fill verification | Medium | 2 tests: with fields, without |
| verify plan-structure | Medium | 3 tests: valid, missing sections, no tasks |
| verify phase-completeness | Medium | 3 tests: complete, incomplete, empty |
| verify references | Medium | 3 tests: valid refs, broken, none |
| verify commits | Low-Medium | 2 tests: valid hash, invalid |
| verify artifacts | Medium | 2-3 tests: all exist, some missing |
| verify key-links | Medium | 2-3 tests: all valid, broken links |

**Tier 4 -- Init compound commands (12 subcommands):**
| Command | Complexity | Test Strategy |
|---------|-----------|---------------|
| init execute-phase (partial) | High | Already partially tested; add error paths |
| init plan-phase (partial) | High | Already partially tested; add error paths |
| init new-project | Medium | 1-2 tests: fresh project, existing |
| init new-milestone | Medium | 1-2 tests: with milestones, without |
| init quick | Medium | 1-2 tests: with description |
| init resume | Medium | 1-2 tests: with session data, without |
| init verify-work | Medium | 1-2 tests: valid phase, invalid |
| init phase-op | Medium | 1-2 tests: existing phase, new |
| init todos | Medium | 1-2 tests: with todos, empty |
| init milestone-op | Medium | 1-2 tests: standard scenario |
| init map-codebase | Medium | 1 test: standard scenario |
| init progress (partial) | Medium | Already partially tested; add --include variants |

**Tier 5 -- Error paths for ALL commands (TEST-05):**
Every tested command needs at least one error recovery test: invalid input, missing files, corrupt state. This adds approximately 1 additional test per command.

### install.js: Functions Needing Tests

**Pure functions (direct import, high value):**
| Function | Lines | Test Count | Priority |
|----------|-------|-----------|----------|
| parseJsonc | 974-1028 | 8-10 tests | HIGH (TEST-03) |
| convertClaudeToOpencodeFrontmatter | 441-543 | 5-7 tests | HIGH (TEST-04) |
| convertClaudeToGeminiAgent | 371-439 | 5-7 tests | HIGH (TEST-04) |
| convertClaudeToGeminiToml | 550-584 | 3-4 tests | HIGH (TEST-04) |
| convertToolName | 316-327 | 3-4 tests | MEDIUM |
| convertGeminiToolName | 336-351 | 3-4 tests | MEDIUM |
| stripSubTags | 358-360 | 2 tests | LOW |
| expandTilde | 160-165 | 2-3 tests | MEDIUM |
| processAttribution | 250-260 | 3 tests | MEDIUM |
| getDirName | 43-47 | 3 tests | LOW |
| getGlobalDir | 79-107 | 4-5 tests | MEDIUM |
| buildHookCommand | 171-175 | 2 tests | LOW |

**Integration functions (subprocess, medium value):**
| Function | Test Strategy | Priority |
|----------|--------------|----------|
| install() | Test via subprocess with --claude/--opencode/--gemini --global targeting temp dir | HIGH (TEST-01) |
| uninstall() | Test via subprocess with temp dir pre-populated | MEDIUM |
| cleanupOrphanedHooks | Unit test with mock settings object | LOW |
| saveLocalPatches / writeManifest | Integration test with temp dir | LOW |

### Estimated Test Count

| Area | New Tests | Extending Existing |
|------|-----------|-------------------|
| gsd-tools.js untested commands | ~90-110 | ~20-30 additional edge cases |
| install.js pure functions | ~45-55 | N/A (new file) |
| install.js runtime integration | ~12-18 | N/A (new file) |
| Hook tests | ~5-8 | N/A (new file) |
| Error recovery paths (TEST-05) | ~40-50 | Distributed across all files |
| Phase numbering edge cases (TEST-06) | ~8-10 | Extending existing describe block |
| **Total** | **~200-280** | |

Combined with existing 75 tests: **~275-355 total tests**.

## Open Questions

1. **install.js module.exports guard -- is this acceptable as Phase 1 work?**
   - What we know: install.js has no exports, runs top-level code immediately. Adding `require.main === module` guard is the standard Node.js pattern to make it testable.
   - What's unclear: The phase scope says "no production code changes -- only test code is written." This is a one-line structural change that enables testability without changing any behavior.
   - Recommendation: Accept this as infrastructure enablement, not a behavior change. The alternative is testing all install.js functions via subprocess which is fragile and slow. Document as a single exception to the "no production changes" rule.

2. **websearch command testing**
   - What we know: Requires BRAVE_API_KEY env var, makes real HTTP calls to Brave Search API.
   - What's unclear: Should we mock the HTTP call or just test the "no API key" path?
   - Recommendation: Test only the "no API key" path (returns `{ available: false }`) and the "no query" path. Skip actual API testing -- characterization tests should not depend on external services.

3. **commit command testing**
   - What we know: The `commit` command invokes `git add` and `git commit` via execSync.
   - What's unclear: How much git setup is needed in temp directories for meaningful tests?
   - Recommendation: Initialize git repos in tmpDir for commit tests. Test that commit succeeds with valid files and fails gracefully with no files. Do not test git behavior itself.

4. **Snapshot file management in CI/CD**
   - What we know: Snapshot files (.snapshot) are generated alongside test files. They need to be committed to the repo.
   - What's unclear: Will snapshot files be stable across platforms (macOS vs Linux)?
   - Recommendation: Use snapshots only for JSON output (platform-independent). Avoid snapshotting output that contains paths or platform-specific formatting. Commit snapshot files to git.

## Sources

### Primary (HIGH confidence)
- Node.js v25.x documentation - node:test module, snapshot testing, CLI flags (verified via `node -e` introspection on Node 25.6.0)
- Project source code direct analysis: `gsd-tools.js` (4,597 lines), `install.js` (1,739 lines), `gsd-tools.test.js` (2,033 lines)
- Existing test execution: 75 tests, 18 describe blocks, all passing (verified via `node --test`)

### Secondary (MEDIUM confidence)
- Context7 Node.js documentation - node:test runner API, snapshot assertion API
- Project codebase analysis documents: `.planning/codebase/TESTING.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`

### Tertiary (LOW confidence)
- None -- all findings verified against source code and runtime behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - node:test is already used, all features verified on Node 25.6.0
- Architecture: HIGH - extending existing proven patterns, no new abstractions
- Pitfalls: HIGH - derived from direct source code analysis and existing test behavior
- Test inventory: HIGH - every command path enumerated from source code dispatcher

**Research date:** 2026-02-08
**Valid until:** 2026-03-10 (stable -- node:test API is not changing rapidly)
