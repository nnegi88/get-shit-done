# Testing Patterns

**Analysis Date:** 2026-02-08

## Test Framework

**Runner:**
- Node.js built-in `test` module (`node:test`)
- No external test framework (Jest, Vitest, Mocha, etc.)
- Version: Node.js 16.7.0+ (per package.json `engines`)

**Assertion Library:**
- Node.js built-in `assert` module
- Methods: `assert.ok()`, `assert.strictEqual()`, `assert.deepStrictEqual()`

**Run Commands:**
```bash
npm test                    # Run all tests
node --test gsd-tools.test.js  # Run test file directly
```

**Test Output:**
- TAP (Test Anything Protocol) format by default
- Structured JSON output when tests use `JSON.parse()` on command output

## Test File Organization

**Location:**
- Co-located: `/Users/naveennegi/Documents/codebase/poc/get-shit-done/get-shit-done/bin/gsd-tools.test.js`
- Tests alongside implementation in `get-shit-done/bin/`

**Naming:**
- Pattern: `{module}.test.js`
- Example: `gsd-tools.test.js` tests `gsd-tools.js`

**Structure:**
```
get-shit-done/
├── bin/
│   ├── gsd-tools.js           # Implementation (4597 lines)
│   └── gsd-tools.test.js      # Tests (2033 lines)
```

## Test Suite Organization

**Organization Pattern:**
```javascript
describe('feature-name command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('specific behavior', () => {
    // test body
  });
});
```

**Multiple Describe Blocks:**
One per command or feature area:
- `describe('history-digest command', ...)`
- `describe('phases list command', ...)`
- `describe('roadmap get-phase command', ...)`
- `describe('phase next-decimal command', ...)`
- And 15+ more describe blocks

**Test Count:**
- 2033 lines of test code
- 100+ individual test cases
- Organized into 17 describe blocks (see file lines 42, 296, 409, 529, 605, 768, 914, 1060, 1199, 1289, 1352, 1433, 1575, 1665, 1753, 1823, 1892, 1946)

## Test Structure Pattern

**Setup/Teardown:**
```javascript
beforeEach(() => {
  tmpDir = createTempProject();
  // tmpDir has structure:
  // .planning/
  // ├── phases/
  // └── config files
});

afterEach(() => {
  cleanup(tmpDir);  // fs.rmSync(tmpDir, { recursive: true, force: true })
});
```

**Helper Functions:**
- `createTempProject()`: Creates temp dir at `os.tmpdir()/gsd-test-{random}` with `.planning/phases` subdirectory
- `cleanup(tmpDir)`: Recursively removes temp directory
- `runGsdTools(args, cwd)`: Executes CLI command via `execSync()`, captures stdout/stderr

**Typical Test Pattern:**
```javascript
test('feature behavior description', () => {
  // 1. Setup: Create files in tmpDir
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-test'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'phases', '01-test', '01-01-PLAN.md'),
    `---\nwave: 1\n---\n## Task 1`
  );

  // 2. Execute: Run command
  const result = runGsdTools('phase-plan-index 01', tmpDir);

  // 3. Assert: Verify output
  assert.ok(result.success, `Command failed: ${result.error}`);
  const output = JSON.parse(result.output);
  assert.strictEqual(output.phase, '01');
  assert.strictEqual(output.plans.length, 1);
});
```

## Mocking Strategy

**Framework:** No mocking library (no `sinon`, `jest.mock()`, etc.)

**Patterns:**
- **File system mocking:** Use temporary directories (`os.mkdtemp()`)
- **Command mocking:** Direct execution of CLI via `execSync()`
- **Process mocking:** None; tests run in subprocess
- **Network mocking:** Brave Search API tested via actual HTTP calls when configured (untested in normal suite)

**What to Mock:**
- File system paths: Use `tmpDir` from `createTempProject()`
- Git operations: Skipped in unit tests, not mocked
- HTTP calls: Not mocked, actual Brave API would be called

**What NOT to Mock:**
- File system operations: Use real temp directories
- JSON parsing: Native, no mocking needed
- YAML/frontmatter parsing: Real parsing logic tested
- Command dispatch: Real CLI invoked via `execSync()`

## Test Data Factories

**Pattern:** Manual file creation, no factory libraries

```javascript
// Create phase directory with valid PLAN.md
const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
fs.mkdirSync(phaseDir, { recursive: true });
fs.writeFileSync(
  path.join(phaseDir, '01-01-PLAN.md'),
  `---
wave: 1
autonomous: true
objective: Database setup
files-modified: [prisma/schema.prisma, src/lib/db.ts]
---

## Task 1: Create schema
## Task 2: Generate client
`
);
```

**Test Data Location:**
- Inline in test files, no separate fixtures
- Minimal: only necessary fields included
- Realistic: valid YAML frontmatter and markdown structure

## Coverage

**Requirements:** Not enforced

**Current State:**
- No coverage reporting configured
- No threshold enforcement
- No `.nyc_outputrc` or similar

**Test Distribution:**
- Heavy coverage of: phase operations, frontmatter parsing, state management, validation
- Light coverage: install.js (no tests in test file), hooks/ (not tested)
- Terminal/display output: Tested via `--raw` flag returning raw output

## Test Types

**Unit Tests:**
- Scope: Individual CLI commands
- Approach: Direct function testing via `execSync()`
- Example: `test('empty phases directory returns valid schema')`
- File: `gsd-tools.test.js` (1100+ lines)

**Integration Tests:**
- Scope: Command chains, file state changes
- Approach: Execute command, verify file system state
- Examples:
  - "removes phase directory and renumbers subsequent" (line 1444)
  - "appends to existing MILESTONES.md" (line 1726)
  - "updates STATE.md phase count" (line 1552)
- File: Same test file, mixed with unit tests

**E2E Tests:**
- Framework: Not used
- Could add: Real project workflow testing (not present)

## Error Testing

**Pattern:**
```javascript
test('fails for nonexistent todo', () => {
  const result = runGsdTools('todo complete nonexistent.md', tmpDir);
  assert.ok(!result.success, 'should fail');
  assert.ok(result.error.includes('not found'), 'error message');
});

test('returns not found for missing phase', () => {
  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'ROADMAP.md'),
    `# Roadmap v1.0\n### Phase 1: Foundation\n**Goal:** Setup\n`
  );
  const result = runGsdTools('roadmap get-phase 5', tmpDir);
  assert.ok(result.success, 'Command should succeed');
  const output = JSON.parse(result.output);
  assert.strictEqual(output.found, false);
});
```

**Error Cases Tested:**
- Missing files/directories (graceful handling)
- Malformed YAML (skipped, valid content extracted)
- Invalid phase numbers (returns found: false, not error)
- Broken reference links (validation catches but doesn't throw)
- Concurrent operations (not tested)

## Async Testing

**Pattern:** Not used

**Approach:** All operations synchronous
- `execSync()` for command execution (blocks until complete)
- `fs.readFileSync()`, `fs.writeFileSync()` for file ops
- No Promises, async/await, or callback tests

**When Needed:** N/A (all CLI operations are synchronous)

## Test Execution Examples

**Running specific test:**
```bash
node --test get-shit-done/bin/gsd-tools.test.js
# Runs all describe blocks and tests in that file
```

**Test output format:**
```
✓ history-digest command (500ms)
  ✓ empty phases directory returns valid schema (5ms)
  ✓ nested frontmatter fields extracted correctly (8ms)
  ✓ multiple phases merged into single digest (6ms)
  ...
✓ phases list command (250ms)
  ✓ empty phases directory returns empty array (3ms)
  ✓ lists phase directories sorted numerically (4ms)
  ...
```

## Test Maintenance

**Common Updates:**
- Add test for new CLI command: Create describe block + 3-5 test cases
- Add test for edge case: Add test to existing describe block
- Update frontmatter schema: Update test data creation patterns

**Patterns for New Tests:**
1. Create describe block for command
2. Set up tmpDir in beforeEach
3. Write 5-10 tests covering:
   - Happy path
   - Empty/missing data
   - Invalid input
   - Backward compatibility
   - Integration with other files

## Debugging Tests

**Techniques:**
- Add `console.log()` to see intermediate values (output to stderr, tests show stdout)
- Isolate test: Change `test()` to `test.only()` to run single test
- Use `--reporter=tap` for detailed TAP output (Node.js 16.17+)
- Inspect tmpDir: Add `console.log(tmpDir)` and don't call cleanup to examine files

**Print Test Output:**
```javascript
test('debug this', () => {
  const result = runGsdTools('some-command', tmpDir);
  console.log('Raw result:', result);  // Outputs to stderr
  console.log('Parsed:', JSON.parse(result.output));
  assert.ok(result.success);
});
```

---

*Testing analysis: 2026-02-08*
