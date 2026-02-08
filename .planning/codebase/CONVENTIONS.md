# Coding Conventions

**Analysis Date:** 2026-02-08

## Naming Patterns

**Files:**
- Executable scripts: camelCase with `.js` extension (`gsd-tools.js`, `gsd-statusline.js`)
- Test files: suffixed with `.test.js` (e.g., `gsd-tools.test.js`)
- Helper files: descriptive names with hyphens for multi-word names (`build-hooks.js`, `gsd-check-update.js`)

**Functions:**
- camelCase with verb prefix: `parseIncludeFlag()`, `safeReadFile()`, `loadConfig()`, `execGit()`
- Command handlers prefixed with `cmd`: `cmdGenerateSlug()`, `cmdListTodos()`, `cmdStateLoad()`
- Utility functions descriptive and action-oriented: `extractFrontmatter()`, `reconstructFrontmatter()`, `normalizePhaseName()`

**Variables:**
- camelCase: `selectedRuntimes`, `includeIndex`, `defaultConfig`, `phaseDir`
- Constants: UPPERCASE_SNAKE_CASE: `MODEL_PROFILES`, `OPENCODE_CONFIG_DIR`
- Private/internal: prefix with underscore not used; implicit scoping via function scope
- Descriptive names preferred: `expandedPath` over `p`, `currentPhase` over `cp`

**Types/Objects:**
- No TypeScript, pure JavaScript
- Plain objects for configuration: `{ model_profile, commit_docs, branching_strategy }`
- Arrays for lists: `selectedRuntimes = []`, `phaseDirectories = []`

## Code Style

**Formatting:**
- No explicit formatter configured (no `.eslintrc`, `.prettierrc`, or similar in repo root)
- Consistent indentation: 2 spaces (observed throughout codebase)
- Line length: varies, some lines exceed 100 characters (pragmatic)
- String quotes: single quotes for consistency in most files, some double quotes in JSON

**Linting:**
- No linter configuration detected
- No `eslint`, `biome`, or similar dev dependency
- Style consistency maintained through manual discipline

**Whitespace:**
- Blank lines between logical sections within functions
- Section headers as comments: `// ─── Model Profile Table ─────────────────────────────────────────────────────`
- Double blank lines between top-level functions

## Import Organization

**Order:**
1. Built-in Node modules: `require('fs')`, `require('path')`, `require('child_process')`
2. Third-party packages: None in main codebase (zero dependencies)
3. Local modules: N/A (monolithic files, no internal requires)

**Path Style:**
- Relative paths: `require('../package.json')`
- Absolute paths: `path.join(cwd, '.planning', 'config.json')`
- No path aliases or @ shortcuts used

**Module Exports:**
- No explicit exports (CLI scripts use `process.argv` and direct execution)
- Functions called directly within module scope

## Error Handling

**Patterns:**
- Try/catch for file operations: `try { fs.readFileSync(...) } catch { return null }`
- Safe file reading: `safeReadFile()` returns `null` on failure
- Git operations: wrapped in `execGit()` which catches errors
- Validation patterns: `if (!value) return error("Missing ...")`
- Graceful degradation: malformed files skipped with warnings, not hard failures (see test case: "malformed SUMMARY.md skipped gracefully")

**Error Messages:**
- Structured JSON when `--raw` flag absent
- Human-readable messages when errors occur
- Error field in JSON output: `{ error: "Phase not found" }`

**Recovery:**
- Missing files return `null` or `{ error: '...' }`
- Invalid YAML/frontmatter: skipped, valid sections extracted
- Phase not found: returns `{ found: false }` not thrown error

## Logging

**Framework:** No logging library; uses `console.log()` and `process.stdout.write()` directly

**Patterns:**
- Output function: `output(result, raw, rawValue)` sends JSON to stdout
- Error function: `error(message)` sends error JSON to stderr and exits with code 1
- Debug info: None in production code, test assertions used for verification
- Status messages: direct to stdout/stderr

**When to Log:**
- Command completion: always output result via `output()`
- Errors: always via `error()` function
- Status updates: sparse, only critical operations

## Comments

**When to Comment:**
- Section headers for major blocks: `// ─── Frontmatter CRUD ─────────────────────────────────────────`
- Complex logic: explain intent, not obvious steps
- Frontmatter validation patterns: clarified with inline notes
- Git operations: explain why escapeGitPath is needed

**JSDoc/TSDoc:**
- No JSDoc annotations used
- No TypeScript types
- Heavy use of descriptive function names instead
- Complex functions have inline explanation in code comments

**Style:**
```javascript
// Extract frontmatter from markdown
function extractFrontmatter(content) {
  // Pattern matches --- ... --- at start
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  // ...
}
```

## Function Design

**Size:**
- Most functions 5-50 lines
- Some command handlers 50-150 lines (acceptable for CLI argument parsing)
- Largest: `extractFrontmatter()`, `cmdHistoryDigest()`, `cmdRoadmapAnalyze()` due to complex parsing

**Parameters:**
- Prefer explicit over variadic: `cmdStateLoad(cwd, raw)` not `cmdStateLoad(...args)`
- Options objects for complex commands: `cmdTemplateFill(cwd, templateType, options, raw)`
- Max 4 parameters typical; more moved to options object

**Return Values:**
- JSON objects for structured output: `{ success: true, phase_number: 3 }`
- Null for file not found cases: `safeReadFile()` returns null
- Throw errors only for critical system failures

**Composition:**
- Helper functions extracted for reusable patterns: `parseIncludeFlag()`, `normalizePhaseName()`
- Command dispatch via simple if/else chains, not router/dispatcher pattern
- Direct function calls, no async/promise chains

## Module Design

**Entry Point:**
- `gsd-tools.js` is main CLI utility
- `install.js` is global installer
- `hooks/` directory has integration hooks

**Structure:**
- Top: model profiles table and configuration
- Middle: 100+ helper functions for operations
- Bottom: main CLI command dispatch
- Tests: separate `gsd-tools.test.js` file

**Error Boundaries:**
- Each command (`cmd*()`) is self-contained
- Errors from one command don't affect others
- Graceful failure on missing files/directories

**State Management:**
- No shared state between commands
- All operations pass `cwd` as context parameter
- File system is source of truth (no in-memory cache)

## Testing Patterns

**Framework:** Node.js built-in `test` module (no Jest, Vitest, Mocha)

**Test Helpers:**
- `createTempProject()`: sets up test directory structure
- `cleanup(tmpDir)`: removes temporary test files
- `runGsdTools(args, cwd)`: executes CLI command and captures output

**Assertions:**
- `assert.ok()`: boolean checks
- `assert.strictEqual()`: equality
- `assert.deepStrictEqual()`: deep object/array comparison
- No assertion library, pure Node.js `assert` module

**Patterns:**
```javascript
describe('history-digest command', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('empty phases directory returns valid schema', () => {
    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, 'Command failed');
    const digest = JSON.parse(result.output);
    assert.deepStrictEqual(digest.phases, {});
  });
});
```

## Backward Compatibility

**Patterns:**
- YAML frontmatter: flat `provides` array still works alongside nested `dependency-graph.provides`
- Phase numbering: supports both `01` and `1` formats, normalized internally
- Inline arrays: both `[Item 1, Item 2]` and `- Item 1` syntax supported
- Git operations: compatible with both safe and unsafe mode

## File Encoding

**Everywhere:** UTF-8
- Set via `encoding: 'utf-8'` in `readFileSync()` calls
- No binary file handling in core CLI

---

*Convention analysis: 2026-02-08*
