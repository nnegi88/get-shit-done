# Phase 2: Error Handling & Security - Research

**Researched:** 2026-02-09
**Domain:** Error handling, input validation, security hardening for Node.js CLI
**Confidence:** HIGH

## Summary

Phase 2 addresses two tightly coupled domains: making errors visible (ERRH-01 through ERRH-03) and hardening inputs against misuse (SECU-01 through SECU-04). The codebase is a zero-dependency Node.js CLI with ~6,500 lines of production code across 4 source files. All operations are synchronous. The existing test suite (5,910 lines) from Phase 1 provides the safety net for refactoring.

The codebase has **34 empty catch blocks** (30 in gsd-tools.js, 2 in gsd-statusline.js, 2 in gsd-check-update.js), currently uses only exit codes 0 and 1, has no input validation on CLI arguments, no path traversal protection, incomplete RegExp escaping, and no prototype pollution prevention. JSON.parse results flow directly into Object.assign without sanitization.

**Primary recommendation:** Implement changes in strict dependency order: error class hierarchy first (used by everything), then empty catch classification, then POSIX exit codes, then input validation, then security hardening. Tests before code changes per project decision.

## Standard Stack

### Core

This is a zero-dependency project. No external libraries should be added (per REQUIREMENTS.md "Out of Scope" section: "Adding production dependencies - Zero-dep philosophy is a strength").

| Component | Approach | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| Error classes | Native `class extends Error` | Structured error hierarchy | Zero-dep; Node.js standard pattern since ES6 |
| Exit codes | `process.exitCode` assignment | POSIX-compliant CLI exits | Avoids `process.exit()` race conditions |
| Input validation | Manual validation functions | Argument checking | Zero-dep; patterns already exist in codebase |
| RegExp escaping | Utility function | Sanitize user strings for RegExp | Already partially implemented at 5+ call sites |
| Path validation | `path.resolve` + `fs.realpathSync` | Traversal prevention | Node.js built-ins, no dependency needed |
| Prototype pollution | Key filter function | Sanitize JSON.parse results | 10-line utility, no library needed |

### Supporting

| Pattern | Purpose | When to Use |
|---------|---------|-------------|
| `node:test` | Testing framework | All new tests (project convention) |
| `node:assert` | Assertions | All test assertions (project convention) |
| `os.tmpdir()` temp dirs | Test isolation | Test helpers already use this pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom error classes | `@sindresorhus/is` or `ow` | Adds dependency; violates zero-dep policy |
| Manual RegExp escape | `escape-string-regexp` | Adds dependency; 1-line function suffices |
| Manual proto sanitization | `json-safe-parse` or `secure-json-parse` | Adds dependency; 5-line function suffices |
| Manual path validation | `sanitize-filename` | Adds dependency; `path.resolve` + comparison suffices |

## Architecture Patterns

### Error Class Hierarchy

```
GsdError (base)
  code: string       // e.g., 'ERR_VALIDATION'
  exitCode: number   // POSIX exit code
  ├── ValidationError    (exitCode: 2)  // Bad user input
  ├── ConfigError        (exitCode: 3)  // Config issues
  ├── FileSystemError    (exitCode: 4)  // File/path problems
  └── PhaseError         (exitCode: 1)  // Phase operation failures
```

**Pattern:**
```javascript
class GsdError extends Error {
  constructor(message, { code, exitCode = 1 } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.exitCode = exitCode;
    // Capture stack trace excluding constructor
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class ValidationError extends GsdError {
  constructor(message, { code = 'ERR_VALIDATION', field } = {}) {
    super(message, { code, exitCode: 2 });
    this.field = field;
  }
}
```

**Source:** [Custom errors, extending Error](https://javascript.info/custom-errors), [Node.js Error Handling Best Practices](https://www.toptal.com/nodejs/node-js-error-handling)

### Exit Code Convention

| Code | Meaning | When Used |
|------|---------|-----------|
| 0 | Success | Command completed normally |
| 1 | General error | Phase operation failed, unexpected error |
| 2 | Usage error | Invalid arguments, bad phase number, malformed JSON |
| 3 | Config error | config.json missing/corrupt, schema mismatch |
| 4 | Filesystem error | File not found, path traversal blocked, permission denied |

**Current state:** Only exit codes 0 and 1 are used (via `output()` and `error()` at lines 466-478 of gsd-tools.js).

**Migration path:** Modify `error()` function to accept exit code parameter. Use `process.exitCode = N` before `process.exit()` or pass through Error.exitCode from caught GsdError instances.

### Input Validation Pattern

```javascript
function validatePhaseNumber(input) {
  // Phase numbers: "1", "01", "1.1", "01.1"
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(input)) {
    throw new ValidationError(
      `Invalid phase number: "${input}". Expected format: N or N.N (e.g., 1, 01, 2.1)`,
      { code: 'ERR_INVALID_PHASE', field: 'phase' }
    );
  }
}

function validateFieldName(input) {
  // Field names: alphanumeric + hyphens + underscores
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input)) {
    throw new ValidationError(
      `Invalid field name: "${input}". Must start with letter, contain only alphanumeric, hyphens, underscores.`,
      { code: 'ERR_INVALID_FIELD', field: 'fieldName' }
    );
  }
}
```

### Path Traversal Prevention Pattern

```javascript
function validatePathWithinProject(cwd, userPath) {
  // Resolve to absolute path
  const resolved = path.resolve(cwd, userPath);

  // Check the resolved path is within project root
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new FileSystemError(
      `Path "${userPath}" resolves outside project root`,
      { code: 'ERR_PATH_TRAVERSAL' }
    );
  }

  // Check symlinks don't escape project root
  try {
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(cwd + path.sep) && real !== cwd) {
      throw new FileSystemError(
        `Path "${userPath}" follows symlink outside project root`,
        { code: 'ERR_SYMLINK_ESCAPE' }
      );
    }
  } catch (err) {
    if (err instanceof FileSystemError) throw err;
    // File doesn't exist yet — resolved path check is sufficient
  }

  return resolved;
}
```

**Source:** [Node.js Path Traversal Guide](https://www.stackhawk.com/blog/node-js-path-traversal-guide-examples-and-prevention/), [Secure Coding Practices](https://www.nodejs-security.com/blog/secure-coding-practices-nodejs-path-traversal-vulnerabilities)

### RegExp Escaping Pattern

```javascript
// Reusable utility — cache at module scope
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

**Current state:** This exact pattern already exists inline at 5+ call sites in gsd-tools.js (lines 1007, 1038, 1067, 1090). It needs to be extracted to a shared function and applied to ALL `new RegExp` call sites.

**Call sites needing fix (currently only escape `.`):**
- Line 836: `phaseNum.replace(/\./g, '\\.')` -- incomplete escaping
- Line 909: `new RegExp(\`^${normalized}\\.(\\d+)\`)` -- normalized could contain regex chars
- Line 2485: `phaseNum.replace('.', '\\.')` -- incomplete escaping
- Line 2611: `afterPhase.replace(/\./g, '\\.')` -- incomplete escaping
- Line 2625: `new RegExp(\`^${normalizedBase}\\.(\\d+)\`)` -- incomplete

### Prototype Pollution Prevention Pattern

```javascript
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeJsonResult(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeJsonResult);

  const clean = {};
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    clean[key] = sanitizeJsonResult(obj[key]);
  }
  return clean;
}

// Usage: wrap JSON.parse results before use
const parsed = sanitizeJsonResult(JSON.parse(raw));
```

**Source:** [JavaScript prototype pollution - MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution), [Prototype Pollution Attacks in Node.js](https://medium.com/node-js-cybersecurity/prototype-pollution-attacks-in-node-js-applications-23851b4e4b17)

**Affected call sites (non-test, production code):**
1. `gsd-tools.js:175` -- `loadConfig()`: `JSON.parse(raw)` for config.json
2. `gsd-tools.js:639` -- `cmdConfigSet()`: `JSON.parse(fs.readFileSync(configPath))`
3. `gsd-tools.js:2088` -- `cmdFrontmatterSet()`: `JSON.parse(value)` for field values
4. `gsd-tools.js:2102` -- `cmdFrontmatterMerge()`: `JSON.parse(data)` fed to `Object.assign(fm, mergeData)` -- **highest risk**
5. `gsd-tools.js:4335` -- template fill: `JSON.parse(args[fieldsIdx + 1])`
6. `install.js:185` -- `readSettings()`: `JSON.parse(fs.readFileSync(settingsPath))`
7. `install.js:925` -- uninstall: `JSON.parse(fs.readFileSync(configPath))`
8. `install.js:1029` -- `parseJsonc()`: returns `JSON.parse(result)`
9. `install.js:1213` -- manifest: `JSON.parse(fs.readFileSync(manifestPath))`
10. `install.js:1254` -- meta: `JSON.parse(fs.readFileSync(metaPath))`
11. `hooks/gsd-statusline.js:15,59,74` -- JSON.parse for stdin, todos, cache
12. `hooks/gsd-check-update.js:41-46` -- inside spawned child (stringified code)

### Anti-Patterns to Avoid

- **Wrapping everything in try/catch with empty catch:** This is the primary problem being solved. Classify first, then fix.
- **Over-validating internal paths:** Only validate user-provided paths, not internally constructed ones like `path.join(cwd, '.planning', 'STATE.md')`.
- **Throwing in hooks:** statusline and update-check hooks MUST fail silently (they run in user's terminal). Empty catches in hooks are intentional.
- **Breaking stdout contract:** The `output()` function sends JSON to stdout. Errors go to stderr. Never mix them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RegExp escaping | Custom regex sanitizer with ad-hoc patterns | Single `escapeRegExp()` utility | Already 5+ inline copies; need one source of truth |
| Error hierarchy | Ad-hoc error strings with `process.exit(1)` | `class GsdError extends Error` with code + exitCode | `instanceof` checks, consistent exit codes, structured output |
| JSON sanitization | Recursive deep-clone with manual key checks | `sanitizeJsonResult()` recursive filter | Handles nested objects, arrays, all depth levels |
| Path validation | Ad-hoc `startsWith` checks scattered everywhere | `validatePathWithinProject(cwd, userPath)` utility | Covers resolve, normalize, symlink, one entry point |
| Input validators | Inline regex checks at each command | Shared validation functions per input type | Reusable across 50+ command handlers |

**Key insight:** This phase creates shared utilities that Phase 3 (decomposition) will extract into `lib/` modules. Design them as standalone functions now, not as methods on classes or closures over state.

## Common Pitfalls

### Pitfall 1: Breaking Silent Fallback Behavior
**What goes wrong:** Converting intentional empty catches to error propagation breaks graceful degradation.
**Why it happens:** 34 empty catch blocks look identical but serve different purposes.
**How to avoid:** Classify EVERY empty catch before changing ANY of them. Use a comment convention: `// intentional: graceful fallback for missing optional file` vs actual bug fixes.
**Warning signs:** Tests from Phase 1 start failing after catch block changes.

### Pitfall 2: Exit Code Changes Breaking Callers
**What goes wrong:** Changing exit codes from 1 to 2/3/4 breaks scripts that check `$?` against specific values.
**Why it happens:** Users or GSD workflows may check for exit code 0 vs non-zero.
**How to avoid:** Ensure all GSD workflow files (commands/*.md, agents/*.md) only check for 0 vs non-zero, never for specific non-zero codes. The CLI is called by agents, not by user scripts.
**Warning signs:** Workflow integration tests fail after exit code changes.

### Pitfall 3: Over-Restricting Phase Number Input
**What goes wrong:** Validation rejects valid phase numbers like "1", "01", "1.1", "01.1", "1.10".
**Why it happens:** Regex too restrictive, doesn't account for all normalization paths.
**How to avoid:** Check `normalizePhaseName()` function (line 243) to understand all valid inputs. Write characterization tests for edge cases BEFORE adding validation.
**Warning signs:** Phase operations that previously worked now reject valid input.

### Pitfall 4: Path Validation on Internally-Constructed Paths
**What goes wrong:** Validation function applied to paths built by the tool itself, causing false rejections.
**Why it happens:** Failing to distinguish user-provided paths from internally-constructed ones.
**How to avoid:** Only validate at the boundary: CLI argument parsing in the main switch/case block. Internal functions like `path.join(cwd, '.planning', ...)` are trusted.
**Warning signs:** Internal operations fail path validation.

### Pitfall 5: Prototype Pollution Fix Breaking Config Loading
**What goes wrong:** Sanitizing JSON.parse removes `constructor` key which some legitimate configs might use.
**Why it happens:** `constructor` is both a dangerous prototype key and a valid JSON key in some contexts.
**How to avoid:** Only sanitize when the result is used with `Object.assign` or property spreading. Config objects read from JSON.parse are safe as long as they're accessed by known keys, not spread onto prototypes.
**Warning signs:** Config loading breaks for edge-case config files.

### Pitfall 6: RegExp Caching Causing Stale Patterns
**What goes wrong:** Module-scope cached RegExp patterns with `lastIndex` state produce wrong results.
**Why it happens:** RegExp objects with the `g` flag maintain state between calls.
**How to avoid:** Only cache patterns without the `g` flag at module scope. For `g`-flag patterns, create new instances per use or reset `lastIndex` before each use.
**Warning signs:** Intermittent regex match failures in repeated operations.

## Code Examples

### Empty Catch Classification (from actual codebase)

**Intentional fallback (keep as-is, add comment):**
```javascript
// gsd-tools.js:958 - STATE.md is optional, missing is normal
let stateRaw = '';
try {
  stateRaw = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf-8');
} catch { /* intentional: STATE.md may not exist yet */ }

// gsd-statusline.js:62 - Hook must never break user's terminal
try {
  const todos = JSON.parse(fs.readFileSync(...));
  // ...
} catch (e) { /* intentional: statusline must fail silently */ }
```

**Bug (should propagate or log):**
```javascript
// gsd-tools.js:545 - Individual todo file read failure silently loses data
// Should at minimum log which file failed
try {
  const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
  // ...
} catch {} // BUG: silently skips file, no indication of failure
```

### Modified error() Function

```javascript
function error(message, exitCode = 1) {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(exitCode);
}

// Usage for different error types:
error('phase identifier required', 2);          // usage error
error('config.json is corrupt', 3);             // config error
error('File not found: ' + filePath, 4);         // filesystem error
error('Phase operation failed: ' + msg, 1);      // general error
```

### Complete Validation Flow (entry point)

```javascript
// In main switch/case dispatch:
case 'find-phase': {
  const phase = args[1];
  if (!phase) error('Usage: gsd-tools find-phase <phase>', 2);
  validatePhaseNumber(phase); // throws ValidationError (exitCode 2)
  cmdFindPhase(cwd, phase, raw);
  break;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `throw new Error(msg)` | `class AppError extends Error` with code + exitCode | ES6 (2015), matured by 2020 | Structured error handling, instanceof checks |
| `process.exit(1)` for all errors | `process.exitCode = N` | Node.js 0.11+ (2014) | Cleaner exit, allows cleanup handlers |
| String concatenation in RegExp | Template literals + `escapeRegExp()` | Always available, formalized in proposals | Prevents regex injection |
| No proto pollution concern | `Object.create(null)` or key filtering | Awareness grew 2018-2020 (Lodash CVEs) | Prevents property injection attacks |

**Deprecated/outdated:**
- Relying on `Error.captureStackTrace` availability: Present in V8 (Node.js), but non-standard. Use `if (Error.captureStackTrace)` guard for portability.
- `process.exit()` without `process.exitCode`: Prefer `process.exitCode` for proper cleanup.

## Empty Catch Block Inventory

### gsd-tools.js (30 blocks)

| Line | Context | Classification | Recommended Action |
|------|---------|----------------|-------------------|
| 545 | Individual todo file read | **BUG** | Log warning, continue iteration |
| 547 | Todos directory read | Intentional | Add comment: dir may not exist |
| 958 | STATE.md optional read | Intentional | Add comment: state is optional |
| 2482 | Phase disk status check | Intentional | Add comment: dir scan failure is safe |
| 2630 | Decimal phase directory scan | Intentional | Add comment: dir may not exist |
| 2700 | Phase remove target scan | Intentional | Add comment: graceful if phases dir missing |
| 2768 | Roadmap phase renumber | **BUG** | Log + propagate: data corruption risk |
| 2826 | Roadmap checkbox update | **BUG** | Log + propagate: data corruption risk |
| 3008 | Milestone phase iteration | **BUG** | Log warning, continue iteration |
| 3117 | Plan task counting | **BUG** | Log warning, skip malformed file |
| 3120 | Progress render dir scan | Intentional | Add comment: phases dir optional |
| 3224 | Validate consistency dir scan | Intentional | Add comment: graceful on empty project |
| 3286 | Validate consistency analysis | **BUG** | Log warning, continue analysis |
| 3306 | Validate consistency roadmap | **BUG** | Log warning, report as validation issue |
| 3350 | Phase plan index iteration | Intentional | Add comment: graceful on read failure |
| 3694 | Init context file read | Intentional | Uses safeReadFile fallback already |
| 3705 | Init research file read | Intentional | Uses safeReadFile fallback already |
| 3716 | Init verification file read | Intentional | Uses safeReadFile fallback already |
| 3727 | Init UAT file read | Intentional | Uses safeReadFile fallback already |
| 3751 | Code detection via find | Intentional | Add comment: find may fail, default false |
| 3832 | Quick workflow numbering | Intentional | Add comment: empty dir is normal |
| 3870 | Agent ID file read | Intentional | Add comment: file is optional |
| 3980 | Init todos file read | **BUG** | Same as line 545, log warning |
| 3982 | Init todos dir read | Intentional | Same as line 547, dir optional |
| 4029 | Phase completion count | Intentional | Add comment: graceful on unreadable dir |
| 4031 | Phases dir scan | Intentional | Add comment: phases dir optional |
| 4040 | Archive dir scan | Intentional | Add comment: archive dir optional |
| 4079 | Codebase maps scan | Intentional | Add comment: codebase dir optional |
| 4155 | Verify-work phase iteration | **BUG** | Log warning, continue iteration |
| 4163 | STATE.md pause field read | Intentional | Add comment: state is optional |

### hooks (4 blocks)

| Line | File | Classification | Action |
|------|------|----------------|--------|
| 62 | gsd-statusline.js | Intentional | Add comment: hook must never fail |
| 78 | gsd-statusline.js | Intentional | Add comment: hook must never fail |
| 41 | gsd-check-update.js | Intentional | Add comment: version read optional |
| 46 | gsd-check-update.js | Intentional | Add comment: npm check may fail |

**Summary:** 34 total empty catch blocks. ~9 are bugs (should log/propagate), ~25 are intentional fallbacks (need comment documentation).

## RegExp Call Sites Requiring Escaping Fix

| Line | Current Escaping | Input Source | Risk |
|------|-----------------|--------------|------|
| 408 | None (`blockName` used directly) | Internal (plan parsing) | LOW (internal string) |
| 836 | Dot-only (`phaseNum.replace(/\./g, '\\.')`) | User CLI arg | MEDIUM |
| 909 | None (`normalized` used directly) | User CLI arg (normalized) | MEDIUM |
| 2382 | None (`link.pattern` from frontmatter) | Frontmatter YAML | LOW (controlled data) |
| 2485 | Dot-only | User CLI arg | MEDIUM |
| 2612 | Dot-only | User CLI arg | MEDIUM |
| 2625 | None | User CLI arg (normalized) | MEDIUM |
| 2644 | Dot-only | User CLI arg | MEDIUM |
| 2732 | None (`baseInt` from parsed phase) | Derived from user arg | LOW |
| 2834 | Dot-only | User CLI arg | MEDIUM |
| 2841 | Dot-only | User CLI arg | MEDIUM |
| 2845 | Dot-only | User CLI arg | MEDIUM |
| 2863-2887 | Various dot-only | User CLI arg | MEDIUM |
| 2955-2973 | Various | User CLI arg | MEDIUM |

**Fix:** Apply `escapeRegExp()` to all user-derived values before `new RegExp()`. Internal strings (blockName, link.pattern) are lower priority.

## JSON.parse Sites Requiring Sanitization

| Location | Source | Risk | Action |
|----------|--------|------|--------|
| `gsd-tools.js:175` | config.json file | LOW (controlled file) | Sanitize (defense in depth) |
| `gsd-tools.js:639` | config.json file | LOW | Sanitize |
| `gsd-tools.js:2088` | CLI --value arg | MEDIUM (user input) | Sanitize |
| `gsd-tools.js:2102` | CLI --data arg -> Object.assign | **HIGH** (user input + merge) | Sanitize before Object.assign |
| `gsd-tools.js:4335` | CLI --fields arg | MEDIUM (user input) | Sanitize |
| `install.js:185` | settings.json | LOW (controlled file) | Sanitize (defense in depth) |
| `install.js:925` | opencode.json | LOW | Sanitize |
| `install.js:1029` | JSONC after comment strip | MEDIUM (user-editable config) | Sanitize |
| Hooks | Various | LOW (controlled files/stdin) | Intentional: hooks must not break |

## Open Questions

1. **Should hooks be modified in this phase?**
   - What we know: 4 empty catches in hooks are all intentional (hooks must never break user's terminal)
   - What's unclear: Whether to add documentation comments in this phase or defer
   - Recommendation: Add `// intentional: ...` comments only. No behavior changes to hooks.

2. **Should install.js JSON.parse calls be sanitized?**
   - What we know: install.js reads user-editable config files (settings.json, opencode.json)
   - What's unclear: Whether prototype pollution in install is practically exploitable (install runs as npx, not repeatedly)
   - Recommendation: Sanitize for defense-in-depth. The cost is one function call per JSON.parse.

3. **Where exactly should validation run?**
   - What we know: CLI dispatch is in the main switch/case block (lines 4220-4597)
   - What's unclear: Whether to validate in dispatch or at the start of each `cmd*()` function
   - Recommendation: Validate at dispatch (entry point boundary). Internal functions trust their callers.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: direct file reads of all 4 source files + 3 test files
- `gsd-tools.js` lines 119-4597: Complete function inventory
- `install.js` lines 1-1750: Complete installer analysis
- Existing tests: `gsd-tools.test.js` (4801 lines), `install.test.js` (952 lines)
- `.planning/REQUIREMENTS.md`: Requirements ERRH-01 through SECU-04
- `.planning/ROADMAP.md`: Phase 2 success criteria
- `.planning/codebase/CONVENTIONS.md`: Coding conventions
- `.planning/codebase/TESTING.md`: Test patterns

### Secondary (MEDIUM confidence)
- [Custom errors, extending Error - javascript.info](https://javascript.info/custom-errors) -- Error class hierarchy pattern
- [Node.js Path Traversal Guide - StackHawk](https://www.stackhawk.com/blog/node-js-path-traversal-guide-examples-and-prevention/) -- Path traversal prevention
- [JavaScript prototype pollution - MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution) -- Prototype pollution patterns
- [Node.js Error Handling Best Practices - Toptal](https://www.toptal.com/nodejs/node-js-error-handling) -- Error handling conventions
- [Node.js v25.6.0 Process Documentation](https://nodejs.org/api/process.html) -- Exit codes and process.exitCode
- [Secure Coding Practices - nodejs-security.com](https://www.nodejs-security.com/blog/secure-coding-practices-nodejs-path-traversal-vulnerabilities) -- Path validation
- [Prototype Pollution Attacks in Node.js](https://medium.com/node-js-cybersecurity/prototype-pollution-attacks-in-node-js-applications-23851b4e4b17) -- JSON sanitization

### Tertiary (LOW confidence)
- None. All findings verified against source code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Zero-dep constraint well understood, all patterns use Node.js built-ins
- Architecture: HIGH -- Error class hierarchy and utility patterns verified against codebase conventions
- Empty catch inventory: HIGH -- Exact line numbers and context verified by reading surrounding code
- RegExp escaping: HIGH -- All `new RegExp` call sites enumerated from codebase grep
- Prototype pollution: HIGH -- All JSON.parse call sites enumerated, Object.assign risk at line 2103 confirmed
- Pitfalls: HIGH -- Based on actual codebase patterns and Phase 1 test coverage analysis

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain, no moving targets)
