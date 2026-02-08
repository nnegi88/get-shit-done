# Stack Research

**Domain:** Node.js CLI codebase hardening (security, testing, reliability, code quality)
**Researched:** 2026-02-08
**Confidence:** HIGH

## Context & Constraints

This stack is for **hardening an existing Node.js CLI tool**, not building from scratch.

**Hard constraints:**
- Zero production dependencies (must stay zero)
- Node.js >= 16.7.0 minimum support (per `engines` field in package.json)
- Node.js built-in test runner (`node:test`) already in use
- Only dev dependency currently: `esbuild ^0.24.0`
- Must maintain backward compatibility
- ~6,300 lines of JavaScript across two main files (gsd-tools.js + install.js)

**Implication:** Node.js 16 went EOL September 2023. This constraint limits which modern tooling versions we can use. The stack below accounts for this, but a strong recommendation is to bump the minimum to Node.js 18.18.0 in a future milestone, which unlocks ESLint 9+, stable `node:test`, and the Permission Model.

---

## Recommended Stack

### Testing (Expand existing `node:test` usage)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `node:test` (built-in) | Node.js 18+ stable, 20+ fully mature | Unit & integration testing | Already in use. Zero-dependency. Stable in Node 20+. Includes `describe`, `test`, `beforeEach`, `afterEach`, `mock.fn()`, `mock.method()`, `mock.timers`, snapshot testing. No reason to add Jest/Vitest. | HIGH |
| `node:assert` (built-in) | All Node.js versions | Assertions | Already in use via `require('node:assert')`. `assert.strictEqual`, `assert.deepStrictEqual`, `assert.throws`, `assert.rejects` cover all needs. | HIGH |
| `--experimental-test-coverage` flag | Node.js 18+ (experimental), improved in 22+ | Code coverage | Built into Node.js. Outputs lcov for CI integration. Supports coverage thresholds since Node 22.8.0. Zero-dependency alternative to c8/nyc/istanbul. | HIGH |

**Testing strategy notes:**
- The project uses `node --test` which requires Node.js 18+. On Node.js 16.7 the `node:test` module does not exist. The test script in package.json already assumes Node 18+ for development. This is fine -- developers run tests on modern Node, but the tool itself runs on Node 16.7+.
- Coverage thresholds (`--test-coverage-lines`, `--test-coverage-branches`, `--test-coverage-functions`) available from Node 22.8.0. Use conditionally in CI.
- Snapshot testing available in Node 22.3.0+ via `t.assert.snapshot()`.

### Linting & Static Analysis

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| ESLint | 8.57.1 (pinned) | JavaScript linting | The last v8 release. Supports Node.js >= 12.22.0, so it works with our constraint. ESLint 9+ requires Node 18.18+, ESLint 10 requires Node 20.19+. We pin to 8.57.1 until the minimum Node version is bumped. EOL but stable -- no new bugs expected in a pinned version. | HIGH |
| eslint-plugin-security | 3.0.1 | Security-specific lint rules | Detects `eval()`, insecure regex, non-literal require, unsafe object access. 13 rules, low-maintenance but useful. Under eslint-community governance. Supports flat config. Despite criticism of being "unmaintained," the rules it has are correct and catch real issues. | MEDIUM |
| eslint-plugin-n | 17.x | Node.js-specific lint rules | Successor to eslint-plugin-node. Detects unsupported Node.js features per `engines` field, deprecated APIs, missing imports. Critical for a project supporting Node 16.7+. | MEDIUM |
| Semgrep CE | 1.150.0+ | Deep static analysis (SAST) | Free open-source. 2,000+ community rules. Installs via `brew install semgrep` or `pip install semgrep` (not an npm dependency). Finds security patterns ESLint misses: command injection, path traversal, prototype pollution. Run in CI, not as a dev dependency. The `p/javascript` and `p/nodejs` rulesets are directly relevant. | HIGH |

**Why ESLint 8 and not newer tools:**
- ESLint 8.57.1 is EOL (Oct 2024) but perfectly stable for a pinned version. No new vulnerabilities will be introduced since we're not updating it.
- ESLint 9.x requires Node 18.18+, ESLint 10.x requires Node 20.19+ -- incompatible with our Node 16.7 floor.
- When the Node minimum is bumped to 18+, migrate to ESLint 9 with flat config.

### Code Formatting

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Prettier | 3.8.1 | Opinionated code formatter | Zero-config formatting. Eliminates style debates. Requires Node.js >= 14. Works with our constraint. Run as dev dependency. | HIGH |

### Supply Chain Security

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `npm audit` (built-in) | npm 6+ | Dependency vulnerability scanning | Built into npm. Zero install needed. Uses GitHub Advisory Database. Run `npm audit --audit-level=high` in CI. With zero production deps, this mainly protects the dev toolchain. | HIGH |
| lockfile-lint | 4.x | Lockfile integrity checking | Detects malicious registry substitution in lockfiles. Relevant because `npm install` from untrusted forks could inject compromised registries. Lightweight, focused tool by Liran Tal. | MEDIUM |

### Dead Code & Project Hygiene

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Knip | 5.83.x | Unused code & dependency detection | Finds dead exports, unused files, unused dependencies. Critical for a 6,300-line codebase with no prior static analysis. Requires Node.js >= 18.6.0, so run in CI only (same as tests). | MEDIUM |

### CI/CD Pipeline

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| GitHub Actions | N/A | CI pipeline | Repo is on GitHub. Use matrix testing across Node 18, 20, 22. Run lint, test, coverage, security scan on every PR. No existing CI workflow -- adding one is a critical hardening step. | HIGH |

---

## Installation

```bash
# Dev dependencies (all hardening tools)
npm install -D eslint@8.57.1 eslint-plugin-security@3.0.1 eslint-plugin-n@17 prettier@3.8.1 lockfile-lint@4

# Optional: Knip for dead code (requires Node 18+, CI only)
npm install -D knip@5

# Semgrep: install via system package manager, NOT npm
# macOS:
brew install semgrep
# Linux/CI:
pip install semgrep
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| ESLint 8.57.1 | ESLint 9.x / 10.x | Requires Node 18.18+ / 20.19+. Incompatible with Node 16.7 floor. Migrate when floor is bumped. |
| ESLint 8.57.1 | Oxlint 1.x | Oxlint is 50-100x faster but has limited rule set compared to ESLint+plugins. No security plugin ecosystem. Better as a complementary speed layer, not a replacement for security linting. Consider adding alongside ESLint later. |
| ESLint 8.57.1 | Biome 2.x | Biome combines linting+formatting but has fewer security-focused rules than ESLint+plugins. Good for greenfield; for hardening, ESLint's plugin ecosystem is more valuable. |
| Prettier | Biome formatter | Biome is faster but Prettier has wider adoption, more stable edge cases, and works independently. For a hardening pass, stability > speed. |
| `node:test` (built-in) | Jest / Vitest | Adding Jest/Vitest would add production-adjacent dependencies. `node:test` already works and is expanding. Zero-dependency testing aligns with project philosophy. |
| `--experimental-test-coverage` | c8 / nyc | c8 wraps the same V8 coverage Node uses internally. Built-in coverage avoids the dependency. c8 produces cleaner output but isn't worth the dep for this project. |
| Semgrep CE | Snyk Code / SonarQube | Snyk requires account/API key. SonarQube is heavy infrastructure. Semgrep CE is free, open-source, runs locally, no account needed for community rules. Right fit for a CLI tool. |
| npm audit | Socket.dev / Snyk | npm audit is free, built-in, sufficient for zero-dep project. Socket adds supply chain analysis but is overkill when there are zero production deps. |
| lockfile-lint | Manual review | Lockfile attacks are real (2025-2026 npm supply chain incidents). Automated detection is worth the tiny dep. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Jest | Adds ~65 transitive dependencies. `node:test` is already in use and covers all needs. | `node:test` (built-in) |
| Mocha + Chai | Legacy. Separate assertion lib. `node:test` has built-in assertions. | `node:test` (built-in) |
| nyc / istanbul | Superseded by V8's built-in coverage. Adds instrumentation complexity. | `--experimental-test-coverage` |
| TSLint | Deprecated since 2019. | ESLint |
| ESLint 9+ / 10+ | Requires Node 18.18+ / 20.19+. Breaks Node 16.7 compatibility. | ESLint 8.57.1 (pinned) |
| Husky + lint-staged | Adds dependencies for git hooks. For a meta-prompting tool, pre-commit hooks add friction for contributors. Run checks in CI instead. Reconsider once contributor base grows. | GitHub Actions CI |
| TypeScript | Rewriting ~6,300 lines of working JS to TS is a project, not a hardening step. Use JSDoc + `tsc --noEmit` if type checking is desired later. | JSDoc annotations (future) |
| SonarQube / SonarCloud | Heavy infrastructure. Overkill for a CLI tool with zero production deps. | Semgrep CE + ESLint |

---

## Stack Patterns by Variant

**If minimum Node version is bumped to 18.18+:**
- Migrate from ESLint 8.57.1 to ESLint 9.x with flat config (`eslint.config.js`)
- Use stable `node:test` features (not experimental)
- Enable coverage thresholds in CI
- This is the recommended near-term move

**If minimum Node version is bumped to 20+:**
- Migrate to ESLint 9.x or 10.x
- Use snapshot testing (`t.assert.snapshot()`)
- Use Node.js Permission Model (`--permission`) for runtime security testing
- Coverage thresholds with `--test-coverage-lines=N`

**If the project stays at Node 16.7+:**
- Stay on ESLint 8.57.1 (pinned, EOL but stable)
- Development/CI tooling runs on Node 18+ (already the case for `node --test`)
- Accept that some modern tooling is unavailable
- Knip and ESLint plugins run in CI on Node 18+ only

---

## Version Compatibility Matrix

| Tool | Min Node.js | Compatible with Node 16.7? | Notes |
|------|-------------|---------------------------|-------|
| ESLint 8.57.1 | >= 12.22.0 | YES | Last v8 release. Pin this version. |
| ESLint 9.x | >= 18.18.0 | NO | Requires Node 18+ |
| ESLint 10.x | >= 20.19.0 | NO | Requires Node 20+ |
| eslint-plugin-security 3.x | Per ESLint version | YES (with ESLint 8) | Supports flat config |
| eslint-plugin-n 17.x | >= 18.18.0 | NO (CI only) | Runs in CI on Node 18+ |
| Prettier 3.8.x | >= 14.0.0 | YES | No Node 16 issues |
| Knip 5.x | >= 18.6.0 | NO (CI only) | Runs in CI on Node 18+ |
| Semgrep 1.150+ | N/A (Rust/Python binary) | YES | Not a Node.js package |
| lockfile-lint 4.x | >= 10.0.0 | YES | Lightweight |
| node:test | >= 18.0.0 (experimental) | NO (CI only) | Already used in dev/CI |
| npm audit | npm 6+ | YES | Built into npm |

**Key insight:** Development/CI environment runs Node 18+ (tests already require it). The Node 16.7 floor is a runtime compatibility constraint for end users, not a development constraint. Most hardening tools run in development and CI, so Node 18+ compatibility is sufficient.

---

## Recommended CI Workflow Structure

```yaml
# .github/workflows/ci.yml
# Matrix: Node 18, 20, 22
# Steps per job:
#   1. npm ci
#   2. npm run lint (ESLint 8.57.1 + plugins)
#   3. npm run format:check (Prettier --check)
#   4. npm test (node --test)
#   5. npm run test:coverage (node --test --experimental-test-coverage)
#   6. npm audit --audit-level=high
#   7. npx lockfile-lint --path package-lock.json --type npm --allowed-hosts npm --validate-https
#   8. npx knip (dead code detection, Node 18+ only)
#
# Separate security job (scheduled weekly):
#   1. Semgrep scan with p/javascript + p/nodejs rulesets
```

---

## Sources

- [Node.js v22 Test Runner Documentation](https://nodejs.org/docs/latest-v22.x/api/test.html) -- HIGH confidence: official docs for test runner features, coverage, mocking
- [Node.js v25 Test Runner Documentation](https://nodejs.org/api/test.html) -- HIGH confidence: latest test runner features including snapshots
- [Node.js Collecting Code Coverage](https://nodejs.org/en/learn/test-runner/collecting-code-coverage) -- HIGH confidence: official guide for built-in coverage
- [ESLint v8 EOL Announcement](https://eslint.org/blog/2024/09/eslint-v8-eol-version-support/) -- HIGH confidence: official ESLint blog
- [ESLint v9 Migration Guide](https://eslint.org/docs/latest/use/migrate-to-9.0.0) -- HIGH confidence: official docs, confirms Node 18.18+ requirement
- [ESLint v10 rc.0 Announcement](https://eslint.org/blog/2026/01/eslint-v10.0.0-rc.0-released/) -- HIGH confidence: official blog, confirms Node 20.19+ requirement
- [eslint-plugin-security GitHub](https://github.com/eslint-community/eslint-plugin-security) -- MEDIUM confidence: community-maintained, flat config support confirmed
- [eslint-plugin-security Maintenance Analysis](https://dev.to/ofri-peretz/eslint-plugin-security-is-unmaintained-heres-what-nobody-tells-you-96h) -- MEDIUM confidence: third-party analysis, highlights 13 rules / no updates since 2020
- [eslint-plugin-n npm](https://www.npmjs.com/package/eslint-plugin-n) -- HIGH confidence: npm registry
- [Semgrep Quickstart](https://semgrep.dev/docs/getting-started/quickstart) -- HIGH confidence: official docs
- [Semgrep JavaScript Rulesets](https://semgrep.dev/p/javascript) -- HIGH confidence: official registry
- [Knip Documentation](https://knip.dev/) -- HIGH confidence: official site
- [Knip npm](https://www.npmjs.com/package/knip) -- HIGH confidence: v5.83.1 confirmed
- [lockfile-lint GitHub](https://github.com/lirantal/lockfile-lint) -- HIGH confidence: official repo
- [Prettier npm](https://www.npmjs.com/package/prettier) -- HIGH confidence: v3.8.1 confirmed
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices) -- HIGH confidence: official Node.js docs
- [Node.js Permission Model](https://nodejs.org/api/permissions.html) -- HIGH confidence: official docs, `--permission` stable in Node 23.5+
- [Node.js Releases / EOL Dates](https://nodejs.org/en/about/previous-releases) -- HIGH confidence: official release schedule
- [Oxlint v1.0 Release](https://www.infoq.com/news/2025/08/oxlint-v1-released/) -- MEDIUM confidence: InfoQ report
- [Awesome Node.js Security](https://github.com/lirantal/awesome-nodejs-security) -- MEDIUM confidence: curated community resource

---
*Stack research for: GSD Hardening -- Node.js CLI codebase hardening*
*Researched: 2026-02-08*
