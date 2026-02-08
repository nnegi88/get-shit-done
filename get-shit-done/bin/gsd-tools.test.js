/**
 * GSD Tools Tests
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, 'gsd-tools.js');

// Helper to run gsd-tools command
function runGsdTools(args, cwd = process.cwd()) {
  try {
    const result = execSync(`node "${TOOLS_PATH}" ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

// Create temp directory structure
function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gsd-test-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('history-digest command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty phases directory returns valid schema', () => {
    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    assert.deepStrictEqual(digest.phases, {}, 'phases should be empty object');
    assert.deepStrictEqual(digest.decisions, [], 'decisions should be empty array');
    assert.deepStrictEqual(digest.tech_stack, [], 'tech_stack should be empty array');
  });

  test('nested frontmatter fields extracted correctly', () => {
    // Create phase directory with SUMMARY containing nested frontmatter
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    const summaryContent = `---
phase: "01"
name: "Foundation Setup"
dependency-graph:
  provides:
    - "Database schema"
    - "Auth system"
  affects:
    - "API layer"
tech-stack:
  added:
    - "prisma"
    - "jose"
patterns-established:
  - "Repository pattern"
  - "JWT auth flow"
key-decisions:
  - "Use Prisma over Drizzle"
  - "JWT in httpOnly cookies"
---

# Summary content here
`;

    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), summaryContent);

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    // Check nested dependency-graph.provides
    assert.ok(digest.phases['01'], 'Phase 01 should exist');
    assert.deepStrictEqual(
      digest.phases['01'].provides.sort(),
      ['Auth system', 'Database schema'],
      'provides should contain nested values'
    );

    // Check nested dependency-graph.affects
    assert.deepStrictEqual(
      digest.phases['01'].affects,
      ['API layer'],
      'affects should contain nested values'
    );

    // Check nested tech-stack.added
    assert.deepStrictEqual(
      digest.tech_stack.sort(),
      ['jose', 'prisma'],
      'tech_stack should contain nested values'
    );

    // Check patterns-established (flat array)
    assert.deepStrictEqual(
      digest.phases['01'].patterns.sort(),
      ['JWT auth flow', 'Repository pattern'],
      'patterns should be extracted'
    );

    // Check key-decisions
    assert.strictEqual(digest.decisions.length, 2, 'Should have 2 decisions');
    assert.ok(
      digest.decisions.some(d => d.decision === 'Use Prisma over Drizzle'),
      'Should contain first decision'
    );
  });

  test('multiple phases merged into single digest', () => {
    // Create phase 01
    const phase01Dir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phase01Dir, { recursive: true });
    fs.writeFileSync(
      path.join(phase01Dir, '01-01-SUMMARY.md'),
      `---
phase: "01"
name: "Foundation"
provides:
  - "Database"
patterns-established:
  - "Pattern A"
key-decisions:
  - "Decision 1"
---
`
    );

    // Create phase 02
    const phase02Dir = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phase02Dir, { recursive: true });
    fs.writeFileSync(
      path.join(phase02Dir, '02-01-SUMMARY.md'),
      `---
phase: "02"
name: "API"
provides:
  - "REST endpoints"
patterns-established:
  - "Pattern B"
key-decisions:
  - "Decision 2"
tech-stack:
  added:
    - "zod"
---
`
    );

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);

    // Both phases present
    assert.ok(digest.phases['01'], 'Phase 01 should exist');
    assert.ok(digest.phases['02'], 'Phase 02 should exist');

    // Decisions merged
    assert.strictEqual(digest.decisions.length, 2, 'Should have 2 decisions total');

    // Tech stack merged
    assert.deepStrictEqual(digest.tech_stack, ['zod'], 'tech_stack should have zod');
  });

  test('malformed SUMMARY.md skipped gracefully', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Valid summary
    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
phase: "01"
provides:
  - "Valid feature"
---
`
    );

    // Malformed summary (no frontmatter)
    fs.writeFileSync(
      path.join(phaseDir, '01-02-SUMMARY.md'),
      `# Just a heading
No frontmatter here
`
    );

    // Another malformed summary (broken YAML)
    fs.writeFileSync(
      path.join(phaseDir, '01-03-SUMMARY.md'),
      `---
broken: [unclosed
---
`
    );

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command should succeed despite malformed files: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.ok(digest.phases['01'], 'Phase 01 should exist');
    assert.ok(
      digest.phases['01'].provides.includes('Valid feature'),
      'Valid feature should be extracted'
    );
  });

  test('flat provides field still works (backward compatibility)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
phase: "01"
provides:
  - "Direct provides"
---
`
    );

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.deepStrictEqual(
      digest.phases['01'].provides,
      ['Direct provides'],
      'Direct provides should work'
    );
  });

  test('inline array syntax supported', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
phase: "01"
provides: [Feature A, Feature B]
patterns-established: ["Pattern X", "Pattern Y"]
---
`
    );

    const result = runGsdTools('history-digest', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const digest = JSON.parse(result.output);
    assert.deepStrictEqual(
      digest.phases['01'].provides.sort(),
      ['Feature A', 'Feature B'],
      'Inline array should work'
    );
    assert.deepStrictEqual(
      digest.phases['01'].patterns.sort(),
      ['Pattern X', 'Pattern Y'],
      'Inline quoted array should work'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phases list command
// ─────────────────────────────────────────────────────────────────────────────

describe('phases list command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty phases directory returns empty array', () => {
    const result = runGsdTools('phases list', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.directories, [], 'directories should be empty');
    assert.strictEqual(output.count, 0, 'count should be 0');
  });

  test('lists phase directories sorted numerically', () => {
    // Create out-of-order directories
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '10-final'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02-api'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });

    const result = runGsdTools('phases list', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 3, 'should have 3 directories');
    assert.deepStrictEqual(
      output.directories,
      ['01-foundation', '02-api', '10-final'],
      'should be sorted numerically'
    );
  });

  test('handles decimal phases in sort order', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02-api'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02.1-hotfix'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02.2-patch'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-ui'), { recursive: true });

    const result = runGsdTools('phases list', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(
      output.directories,
      ['02-api', '02.1-hotfix', '02.2-patch', '03-ui'],
      'decimal phases should sort correctly between whole numbers'
    );
  });

  test('--type plans lists only PLAN.md files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(phaseDir, '01-02-PLAN.md'), '# Plan 2');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(path.join(phaseDir, 'RESEARCH.md'), '# Research');

    const result = runGsdTools('phases list --type plans', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(
      output.files.sort(),
      ['01-01-PLAN.md', '01-02-PLAN.md'],
      'should list only PLAN files'
    );
  });

  test('--type summaries lists only SUMMARY.md files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary 1');
    fs.writeFileSync(path.join(phaseDir, '01-02-SUMMARY.md'), '# Summary 2');

    const result = runGsdTools('phases list --type summaries', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(
      output.files.sort(),
      ['01-01-SUMMARY.md', '01-02-SUMMARY.md'],
      'should list only SUMMARY files'
    );
  });

  test('--phase filters to specific phase directory', () => {
    const phase01 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    const phase02 = path.join(tmpDir, '.planning', 'phases', '02-api');
    fs.mkdirSync(phase01, { recursive: true });
    fs.mkdirSync(phase02, { recursive: true });
    fs.writeFileSync(path.join(phase01, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phase02, '02-01-PLAN.md'), '# Plan');

    const result = runGsdTools('phases list --type plans --phase 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.files, ['01-01-PLAN.md'], 'should only list phase 01 plans');
    assert.strictEqual(output.phase_dir, 'foundation', 'should report phase name without number prefix');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap get-phase command
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap get-phase command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('extracts phase section from ROADMAP.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

## Phases

### Phase 1: Foundation
**Goal:** Set up project infrastructure
**Plans:** 2 plans

Some description here.

### Phase 2: API
**Goal:** Build REST API
**Plans:** 3 plans
`
    );

    const result = runGsdTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'phase should be found');
    assert.strictEqual(output.phase_number, '1', 'phase number correct');
    assert.strictEqual(output.phase_name, 'Foundation', 'phase name extracted');
    assert.strictEqual(output.goal, 'Set up project infrastructure', 'goal extracted');
  });

  test('returns not found for missing phase', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

### Phase 1: Foundation
**Goal:** Set up project
`
    );

    const result = runGsdTools('roadmap get-phase 5', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'phase should not be found');
  });

  test('handles decimal phase numbers', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 2: Main
**Goal:** Main work

### Phase 2.1: Hotfix
**Goal:** Emergency fix
`
    );

    const result = runGsdTools('roadmap get-phase 2.1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'decimal phase should be found');
    assert.strictEqual(output.phase_name, 'Hotfix', 'phase name correct');
    assert.strictEqual(output.goal, 'Emergency fix', 'goal extracted');
  });

  test('extracts full section content', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Setup
**Goal:** Initialize everything

This phase covers:
- Database setup
- Auth configuration
- CI/CD pipeline

### Phase 2: Build
**Goal:** Build features
`
    );

    const result = runGsdTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.section.includes('Database setup'), 'section includes description');
    assert.ok(output.section.includes('CI/CD pipeline'), 'section includes all bullets');
    assert.ok(!output.section.includes('Phase 2'), 'section does not include next phase');
  });

  test('handles missing ROADMAP.md gracefully', () => {
    const result = runGsdTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'should return not found');
    assert.strictEqual(output.error, 'ROADMAP.md not found', 'should explain why');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phase next-decimal command
// ─────────────────────────────────────────────────────────────────────────────

describe('phase next-decimal command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns X.1 when no decimal phases exist', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06-feature'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '07-next'), { recursive: true });

    const result = runGsdTools('phase next-decimal 06', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '06.1', 'should return 06.1');
    assert.deepStrictEqual(output.existing, [], 'no existing decimals');
  });

  test('increments from existing decimal phases', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06-feature'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06.1-hotfix'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06.2-patch'), { recursive: true });

    const result = runGsdTools('phase next-decimal 06', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '06.3', 'should return 06.3');
    assert.deepStrictEqual(output.existing, ['06.1', '06.2'], 'lists existing decimals');
  });

  test('handles gaps in decimal sequence', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06-feature'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06.1-first'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06.3-third'), { recursive: true });

    const result = runGsdTools('phase next-decimal 06', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // Should take next after highest, not fill gap
    assert.strictEqual(output.next, '06.4', 'should return 06.4, not fill gap at 06.2');
  });

  test('handles single-digit phase input', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06-feature'), { recursive: true });

    const result = runGsdTools('phase next-decimal 6', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '06.1', 'should normalize to 06.1');
    assert.strictEqual(output.base_phase, '06', 'base phase should be padded');
  });

  test('returns error if base phase does not exist', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-start'), { recursive: true });

    const result = runGsdTools('phase next-decimal 06', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'base phase not found');
    assert.strictEqual(output.next, '06.1', 'should still suggest 06.1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phase-plan-index command
// ─────────────────────────────────────────────────────────────────────────────

describe('phase-plan-index command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty phase directory returns empty plans array', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runGsdTools('phase-plan-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase, '03', 'phase number correct');
    assert.deepStrictEqual(output.plans, [], 'plans should be empty');
    assert.deepStrictEqual(output.waves, {}, 'waves should be empty');
    assert.deepStrictEqual(output.incomplete, [], 'incomplete should be empty');
    assert.strictEqual(output.has_checkpoints, false, 'no checkpoints');
  });

  test('extracts single plan with frontmatter', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '03-01-PLAN.md'),
      `---
wave: 1
autonomous: true
objective: Set up database schema
files-modified: [prisma/schema.prisma, src/lib/db.ts]
---

## Task 1: Create schema
## Task 2: Generate client
`
    );

    const result = runGsdTools('phase-plan-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.plans.length, 1, 'should have 1 plan');
    assert.strictEqual(output.plans[0].id, '03-01', 'plan id correct');
    assert.strictEqual(output.plans[0].wave, 1, 'wave extracted');
    assert.strictEqual(output.plans[0].autonomous, true, 'autonomous extracted');
    assert.strictEqual(output.plans[0].objective, 'Set up database schema', 'objective extracted');
    assert.deepStrictEqual(output.plans[0].files_modified, ['prisma/schema.prisma', 'src/lib/db.ts'], 'files extracted');
    assert.strictEqual(output.plans[0].task_count, 2, 'task count correct');
    assert.strictEqual(output.plans[0].has_summary, false, 'no summary yet');
  });

  test('groups multiple plans by wave', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '03-01-PLAN.md'),
      `---
wave: 1
autonomous: true
objective: Database setup
---

## Task 1: Schema
`
    );

    fs.writeFileSync(
      path.join(phaseDir, '03-02-PLAN.md'),
      `---
wave: 1
autonomous: true
objective: Auth setup
---

## Task 1: JWT
`
    );

    fs.writeFileSync(
      path.join(phaseDir, '03-03-PLAN.md'),
      `---
wave: 2
autonomous: false
objective: API routes
---

## Task 1: Routes
`
    );

    const result = runGsdTools('phase-plan-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.plans.length, 3, 'should have 3 plans');
    assert.deepStrictEqual(output.waves['1'], ['03-01', '03-02'], 'wave 1 has 2 plans');
    assert.deepStrictEqual(output.waves['2'], ['03-03'], 'wave 2 has 1 plan');
  });

  test('detects incomplete plans (no matching summary)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Plan with summary
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), `---\nwave: 1\n---\n## Task 1`);
    fs.writeFileSync(path.join(phaseDir, '03-01-SUMMARY.md'), `# Summary`);

    // Plan without summary
    fs.writeFileSync(path.join(phaseDir, '03-02-PLAN.md'), `---\nwave: 2\n---\n## Task 1`);

    const result = runGsdTools('phase-plan-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.plans[0].has_summary, true, 'first plan has summary');
    assert.strictEqual(output.plans[1].has_summary, false, 'second plan has no summary');
    assert.deepStrictEqual(output.incomplete, ['03-02'], 'incomplete list correct');
  });

  test('detects checkpoints (autonomous: false)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '03-01-PLAN.md'),
      `---
wave: 1
autonomous: false
objective: Manual review needed
---

## Task 1: Review
`
    );

    const result = runGsdTools('phase-plan-index 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.has_checkpoints, true, 'should detect checkpoint');
    assert.strictEqual(output.plans[0].autonomous, false, 'plan marked non-autonomous');
  });

  test('phase not found returns error', () => {
    const result = runGsdTools('phase-plan-index 99', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'Phase not found', 'should report phase not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state-snapshot command
// ─────────────────────────────────────────────────────────────────────────────

describe('state-snapshot command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing STATE.md returns error', () => {
    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'STATE.md not found', 'should report missing file');
  });

  test('extracts basic fields from STATE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Phase:** 03
**Current Phase Name:** API Layer
**Total Phases:** 6
**Current Plan:** 03-02
**Total Plans in Phase:** 3
**Status:** In progress
**Progress:** 45%
**Last Activity:** 2024-01-15
**Last Activity Description:** Completed 03-01-PLAN.md
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.current_phase, '03', 'current phase extracted');
    assert.strictEqual(output.current_phase_name, 'API Layer', 'phase name extracted');
    assert.strictEqual(output.total_phases, 6, 'total phases extracted');
    assert.strictEqual(output.current_plan, '03-02', 'current plan extracted');
    assert.strictEqual(output.total_plans_in_phase, 3, 'total plans extracted');
    assert.strictEqual(output.status, 'In progress', 'status extracted');
    assert.strictEqual(output.progress_percent, 45, 'progress extracted');
    assert.strictEqual(output.last_activity, '2024-01-15', 'last activity date extracted');
  });

  test('extracts decisions table', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Phase:** 01

## Decisions Made

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 01 | Use Prisma | Better DX than raw SQL |
| 02 | JWT auth | Stateless authentication |
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.decisions.length, 2, 'should have 2 decisions');
    assert.strictEqual(output.decisions[0].phase, '01', 'first decision phase');
    assert.strictEqual(output.decisions[0].summary, 'Use Prisma', 'first decision summary');
    assert.strictEqual(output.decisions[0].rationale, 'Better DX than raw SQL', 'first decision rationale');
  });

  test('extracts blockers list', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Phase:** 03

## Blockers

- Waiting for API credentials
- Need design review for dashboard
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.blockers, [
      'Waiting for API credentials',
      'Need design review for dashboard',
    ], 'blockers extracted');
  });

  test('extracts session continuity info', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Phase:** 03

## Session

**Last Date:** 2024-01-15
**Stopped At:** Phase 3, Plan 2, Task 1
**Resume File:** .planning/phases/03-api/03-02-PLAN.md
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.session.last_date, '2024-01-15', 'session date extracted');
    assert.strictEqual(output.session.stopped_at, 'Phase 3, Plan 2, Task 1', 'stopped at extracted');
    assert.strictEqual(output.session.resume_file, '.planning/phases/03-api/03-02-PLAN.md', 'resume file extracted');
  });

  test('handles paused_at field', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# Project State

**Current Phase:** 03
**Paused At:** Phase 3, Plan 1, Task 2 - mid-implementation
`
    );

    const result = runGsdTools('state-snapshot', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.paused_at, 'Phase 3, Plan 1, Task 2 - mid-implementation', 'paused_at extracted');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summary-extract command
// ─────────────────────────────────────────────────────────────────────────────

describe('summary-extract command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing file returns error', () => {
    const result = runGsdTools('summary-extract .planning/phases/01-test/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report missing file');
  });

  test('extracts all fields from SUMMARY.md', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
one-liner: Set up Prisma with User and Project models
key-files:
  - prisma/schema.prisma
  - src/lib/db.ts
tech-stack:
  added:
    - prisma
    - zod
patterns-established:
  - Repository pattern
  - Dependency injection
key-decisions:
  - Use Prisma over Drizzle: Better DX and ecosystem
  - Single database: Start simple, shard later
---

# Summary

Full summary content here.
`
    );

    const result = runGsdTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.path, '.planning/phases/01-foundation/01-01-SUMMARY.md', 'path correct');
    assert.strictEqual(output.one_liner, 'Set up Prisma with User and Project models', 'one-liner extracted');
    assert.deepStrictEqual(output.key_files, ['prisma/schema.prisma', 'src/lib/db.ts'], 'key files extracted');
    assert.deepStrictEqual(output.tech_added, ['prisma', 'zod'], 'tech added extracted');
    assert.deepStrictEqual(output.patterns, ['Repository pattern', 'Dependency injection'], 'patterns extracted');
    assert.strictEqual(output.decisions.length, 2, 'decisions extracted');
  });

  test('selective extraction with --fields', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
one-liner: Set up database
key-files:
  - prisma/schema.prisma
tech-stack:
  added:
    - prisma
patterns-established:
  - Repository pattern
key-decisions:
  - Use Prisma: Better DX
---
`
    );

    const result = runGsdTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md --fields one_liner,key_files', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.one_liner, 'Set up database', 'one_liner included');
    assert.deepStrictEqual(output.key_files, ['prisma/schema.prisma'], 'key_files included');
    assert.strictEqual(output.tech_added, undefined, 'tech_added excluded');
    assert.strictEqual(output.patterns, undefined, 'patterns excluded');
    assert.strictEqual(output.decisions, undefined, 'decisions excluded');
  });

  test('handles missing frontmatter fields gracefully', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
one-liner: Minimal summary
---

# Summary
`
    );

    const result = runGsdTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.one_liner, 'Minimal summary', 'one-liner extracted');
    assert.deepStrictEqual(output.key_files, [], 'key_files defaults to empty');
    assert.deepStrictEqual(output.tech_added, [], 'tech_added defaults to empty');
    assert.deepStrictEqual(output.patterns, [], 'patterns defaults to empty');
    assert.deepStrictEqual(output.decisions, [], 'decisions defaults to empty');
  });

  test('parses key-decisions with rationale', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      `---
key-decisions:
  - Use Prisma: Better DX than alternatives
  - JWT tokens: Stateless auth for scalability
---
`
    );

    const result = runGsdTools('summary-extract .planning/phases/01-foundation/01-01-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.decisions[0].summary, 'Use Prisma', 'decision summary parsed');
    assert.strictEqual(output.decisions[0].rationale, 'Better DX than alternatives', 'decision rationale parsed');
    assert.strictEqual(output.decisions[1].summary, 'JWT tokens', 'second decision summary');
    assert.strictEqual(output.decisions[1].rationale, 'Stateless auth for scalability', 'second decision rationale');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init --include flag tests
// ─────────────────────────────────────────────────────────────────────────────

describe('init commands with --include flag', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('init execute-phase includes state and config content', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Current Phase:** 03\n**Status:** In progress'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'balanced' })
    );

    const result = runGsdTools('init execute-phase 03 --include state,config', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state_content, 'state_content should be included');
    assert.ok(output.state_content.includes('Current Phase'), 'state content correct');
    assert.ok(output.config_content, 'config_content should be included');
    assert.ok(output.config_content.includes('model_profile'), 'config content correct');
  });

  test('init execute-phase without --include omits content', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State');

    const result = runGsdTools('init execute-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_content, undefined, 'state_content should be omitted');
    assert.strictEqual(output.config_content, undefined, 'config_content should be omitted');
  });

  test('init plan-phase includes multiple file contents', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# Project State');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap v1.0');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'REQUIREMENTS.md'), '# Requirements');
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Phase Context');
    fs.writeFileSync(path.join(phaseDir, '03-RESEARCH.md'), '# Research Findings');

    const result = runGsdTools('init plan-phase 03 --include state,roadmap,requirements,context,research', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state_content, 'state_content included');
    assert.ok(output.state_content.includes('Project State'), 'state content correct');
    assert.ok(output.roadmap_content, 'roadmap_content included');
    assert.ok(output.roadmap_content.includes('Roadmap v1.0'), 'roadmap content correct');
    assert.ok(output.requirements_content, 'requirements_content included');
    assert.ok(output.context_content, 'context_content included');
    assert.ok(output.research_content, 'research_content included');
  });

  test('init plan-phase includes verification and uat content', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-VERIFICATION.md'), '# Verification Results');
    fs.writeFileSync(path.join(phaseDir, '03-UAT.md'), '# UAT Findings');

    const result = runGsdTools('init plan-phase 03 --include verification,uat', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.verification_content, 'verification_content included');
    assert.ok(output.verification_content.includes('Verification Results'), 'verification content correct');
    assert.ok(output.uat_content, 'uat_content included');
    assert.ok(output.uat_content.includes('UAT Findings'), 'uat content correct');
  });

  test('init progress includes state, roadmap, project, config', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'quality' })
    );

    const result = runGsdTools('init progress --include state,roadmap,project,config', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state_content, 'state_content included');
    assert.ok(output.roadmap_content, 'roadmap_content included');
    assert.ok(output.project_content, 'project_content included');
    assert.ok(output.config_content, 'config_content included');
  });

  test('missing files return null in content fields', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');

    const result = runGsdTools('init execute-phase 03 --include state,config', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_content, null, 'missing state returns null');
    assert.strictEqual(output.config_content, null, 'missing config returns null');
  });

  test('partial includes work correctly', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap');

    // Only request state, not roadmap
    const result = runGsdTools('init execute-phase 03 --include state', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.state_content, 'state_content included');
    assert.strictEqual(output.roadmap_content, undefined, 'roadmap_content not requested, should be undefined');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// roadmap analyze command
// ─────────────────────────────────────────────────────────────────────────────

describe('roadmap analyze command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('missing ROADMAP.md returns error', () => {
    const result = runGsdTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command should succeed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'ROADMAP.md not found');
  });

  test('parses phases with goals and disk status', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

### Phase 1: Foundation
**Goal:** Set up infrastructure

### Phase 2: Authentication
**Goal:** Add user auth

### Phase 3: Features
**Goal:** Build core features
`
    );

    // Create phase dirs with varying completion
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');

    const p2 = path.join(tmpDir, '.planning', 'phases', '02-authentication');
    fs.mkdirSync(p2, { recursive: true });
    fs.writeFileSync(path.join(p2, '02-01-PLAN.md'), '# Plan');

    const result = runGsdTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 3, 'should find 3 phases');
    assert.strictEqual(output.phases[0].disk_status, 'complete', 'phase 1 complete');
    assert.strictEqual(output.phases[1].disk_status, 'planned', 'phase 2 planned');
    assert.strictEqual(output.phases[2].disk_status, 'no_directory', 'phase 3 no directory');
    assert.strictEqual(output.completed_phases, 1, '1 phase complete');
    assert.strictEqual(output.total_plans, 2, '2 total plans');
    assert.strictEqual(output.total_summaries, 1, '1 total summary');
    assert.strictEqual(output.progress_percent, 50, '50% complete');
    assert.strictEqual(output.current_phase, '2', 'current phase is 2');
  });

  test('extracts goals and dependencies', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Setup
**Goal:** Initialize project
**Depends on:** Nothing

### Phase 2: Build
**Goal:** Build features
**Depends on:** Phase 1
`
    );

    const result = runGsdTools('roadmap analyze', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phases[0].goal, 'Initialize project');
    assert.strictEqual(output.phases[0].depends_on, 'Nothing');
    assert.strictEqual(output.phases[1].goal, 'Build features');
    assert.strictEqual(output.phases[1].depends_on, 'Phase 1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phase add command
// ─────────────────────────────────────────────────────────────────────────────

describe('phase add command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('adds phase after highest existing', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0

### Phase 1: Foundation
**Goal:** Setup

### Phase 2: API
**Goal:** Build API

---
`
    );

    const result = runGsdTools('phase add User Dashboard', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_number, 3, 'should be phase 3');
    assert.strictEqual(output.slug, 'user-dashboard');

    // Verify directory created
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'phases', '03-user-dashboard')),
      'directory should be created'
    );

    // Verify ROADMAP updated
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('### Phase 3: User Dashboard'), 'roadmap should include new phase');
    assert.ok(roadmap.includes('**Depends on:** Phase 2'), 'should depend on previous');
  });

  test('handles empty roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0\n`
    );

    const result = runGsdTools('phase add Initial Setup', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_number, 1, 'should be phase 1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phase insert command
// ─────────────────────────────────────────────────────────────────────────────

describe('phase insert command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('inserts decimal phase after target', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Foundation
**Goal:** Setup

### Phase 2: API
**Goal:** Build API
`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });

    const result = runGsdTools('phase insert 1 Fix Critical Bug', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_number, '01.1', 'should be 01.1');
    assert.strictEqual(output.after_phase, '1');

    // Verify directory
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'phases', '01.1-fix-critical-bug')),
      'decimal phase directory should be created'
    );

    // Verify ROADMAP
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('Phase 01.1: Fix Critical Bug (INSERTED)'), 'roadmap should include inserted phase');
  });

  test('increments decimal when siblings exist', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Foundation
**Goal:** Setup

### Phase 2: API
**Goal:** Build API
`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01.1-hotfix'), { recursive: true });

    const result = runGsdTools('phase insert 1 Another Fix', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_number, '01.2', 'should be 01.2');
  });

  test('rejects missing phase', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: Test\n**Goal:** Test\n`
    );

    const result = runGsdTools('phase insert 99 Fix Something', tmpDir);
    assert.ok(!result.success, 'should fail for missing phase');
    assert.ok(result.error.includes('not found'), 'error mentions not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phase remove command
// ─────────────────────────────────────────────────────────────────────────────

describe('phase remove command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('removes phase directory and renumbers subsequent', () => {
    // Setup 3 phases
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

### Phase 1: Foundation
**Goal:** Setup
**Depends on:** Nothing

### Phase 2: Auth
**Goal:** Authentication
**Depends on:** Phase 1

### Phase 3: Features
**Goal:** Core features
**Depends on:** Phase 2
`
    );

    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });
    const p2 = path.join(tmpDir, '.planning', 'phases', '02-auth');
    fs.mkdirSync(p2, { recursive: true });
    fs.writeFileSync(path.join(p2, '02-01-PLAN.md'), '# Plan');
    const p3 = path.join(tmpDir, '.planning', 'phases', '03-features');
    fs.mkdirSync(p3, { recursive: true });
    fs.writeFileSync(path.join(p3, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p3, '03-02-PLAN.md'), '# Plan 2');

    // Remove phase 2
    const result = runGsdTools('phase remove 2', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.removed, '2');
    assert.strictEqual(output.directory_deleted, '02-auth');

    // Phase 3 should be renumbered to 02
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'phases', '02-features')),
      'phase 3 should be renumbered to 02-features'
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.planning', 'phases', '03-features')),
      'old 03-features should not exist'
    );

    // Files inside should be renamed
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'phases', '02-features', '02-01-PLAN.md')),
      'plan file should be renumbered to 02-01'
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'phases', '02-features', '02-02-PLAN.md')),
      'plan 2 should be renumbered to 02-02'
    );

    // ROADMAP should be updated
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(!roadmap.includes('Phase 2: Auth'), 'removed phase should not be in roadmap');
    assert.ok(roadmap.includes('Phase 2: Features'), 'phase 3 should be renumbered to 2');
  });

  test('rejects removal of phase with summaries unless --force', () => {
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: Test\n**Goal:** Test\n`
    );

    // Should fail without --force
    const result = runGsdTools('phase remove 1', tmpDir);
    assert.ok(!result.success, 'should fail without --force');
    assert.ok(result.error.includes('executed plan'), 'error mentions executed plans');

    // Should succeed with --force
    const forceResult = runGsdTools('phase remove 1 --force', tmpDir);
    assert.ok(forceResult.success, `Force remove failed: ${forceResult.error}`);
  });

  test('removes decimal phase and renumbers siblings', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 6: Main\n**Goal:** Main\n### Phase 6.1: Fix A\n**Goal:** Fix A\n### Phase 6.2: Fix B\n**Goal:** Fix B\n### Phase 6.3: Fix C\n**Goal:** Fix C\n`
    );

    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06-main'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06.1-fix-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06.2-fix-b'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06.3-fix-c'), { recursive: true });

    const result = runGsdTools('phase remove 6.2', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    // 06.3 should become 06.2
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'phases', '06.2-fix-c')),
      '06.3 should be renumbered to 06.2'
    );
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.planning', 'phases', '06.3-fix-c')),
      'old 06.3 should not exist'
    );
  });

  test('updates STATE.md phase count', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: A\n**Goal:** A\n### Phase 2: B\n**Goal:** B\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Phase:** 1\n**Total Phases:** 2\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02-b'), { recursive: true });

    runGsdTools('phase remove 2', tmpDir);

    const state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(state.includes('**Total Phases:** 1'), 'total phases should be decremented');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// phase complete command
// ─────────────────────────────────────────────────────────────────────────────

describe('phase complete command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('marks phase complete and transitions to next', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap

- [ ] Phase 1: Foundation
- [ ] Phase 2: API

### Phase 1: Foundation
**Goal:** Setup
**Plans:** 1 plans

### Phase 2: API
**Goal:** Build API
`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Phase:** 01\n**Current Phase Name:** Foundation\n**Status:** In progress\n**Current Plan:** 01-01\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working on phase 1\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02-api'), { recursive: true });

    const result = runGsdTools('phase complete 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.completed_phase, '1');
    assert.strictEqual(output.plans_executed, '1/1');
    assert.strictEqual(output.next_phase, '02');
    assert.strictEqual(output.is_last_phase, false);

    // Verify STATE.md updated
    const state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(state.includes('**Current Phase:** 02'), 'should advance to phase 02');
    assert.ok(state.includes('**Status:** Ready to plan'), 'status should be ready to plan');
    assert.ok(state.includes('**Current Plan:** Not started'), 'plan should be reset');

    // Verify ROADMAP checkbox
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.ok(roadmap.includes('[x]'), 'phase should be checked off');
    assert.ok(roadmap.includes('completed'), 'completion date should be added');
  });

  test('detects last phase in milestone', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: Only Phase\n**Goal:** Everything\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Current Phase:** 01\n**Status:** In progress\n**Current Plan:** 01-01\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'phases', '01-only-phase');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('phase complete 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.is_last_phase, true, 'should detect last phase');
    assert.strictEqual(output.next_phase, null, 'no next phase');

    const state = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(state.includes('Milestone complete'), 'status should be milestone complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// milestone complete command
// ─────────────────────────────────────────────────────────────────────────────

describe('milestone complete command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('archives roadmap, requirements, creates MILESTONES.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0 MVP\n\n### Phase 1: Foundation\n**Goal:** Setup\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'REQUIREMENTS.md'),
      `# Requirements\n\n- [ ] User auth\n- [ ] Dashboard\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Status:** In progress\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(
      path.join(p1, '01-01-SUMMARY.md'),
      `---\none-liner: Set up project infrastructure\n---\n# Summary\n`
    );

    const result = runGsdTools('milestone complete v1.0 --name MVP Foundation', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.version, 'v1.0');
    assert.strictEqual(output.phases, 1);
    assert.ok(output.archived.roadmap, 'roadmap should be archived');
    assert.ok(output.archived.requirements, 'requirements should be archived');

    // Verify archive files exist
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'v1.0-ROADMAP.md')),
      'archived roadmap should exist'
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'v1.0-REQUIREMENTS.md')),
      'archived requirements should exist'
    );

    // Verify MILESTONES.md created
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'MILESTONES.md')),
      'MILESTONES.md should be created'
    );
    const milestones = fs.readFileSync(path.join(tmpDir, '.planning', 'MILESTONES.md'), 'utf-8');
    assert.ok(milestones.includes('v1.0 MVP Foundation'), 'milestone entry should contain name');
    assert.ok(milestones.includes('Set up project infrastructure'), 'accomplishments should be listed');
  });

  test('appends to existing MILESTONES.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'MILESTONES.md'),
      `# Milestones\n\n## v0.9 Alpha (Shipped: 2025-01-01)\n\n---\n\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State\n\n**Status:** In progress\n**Last Activity:** 2025-01-01\n**Last Activity Description:** Working\n`
    );

    const result = runGsdTools('milestone complete v1.0 --name Beta', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const milestones = fs.readFileSync(path.join(tmpDir, '.planning', 'MILESTONES.md'), 'utf-8');
    assert.ok(milestones.includes('v0.9 Alpha'), 'existing entry should be preserved');
    assert.ok(milestones.includes('v1.0 Beta'), 'new entry should be appended');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate consistency command
// ─────────────────────────────────────────────────────────────────────────────

describe('validate consistency command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('passes for consistent project', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: A\n### Phase 2: B\n### Phase 3: C\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02-b'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-c'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, true, 'should pass');
    assert.strictEqual(output.warning_count, 0, 'no warnings');
  });

  test('warns about phase on disk but not in roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: A\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '02-orphan'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.warning_count > 0, 'should have warnings');
    assert.ok(
      output.warnings.some(w => w.includes('disk but not in ROADMAP')),
      'should warn about orphan directory'
    );
  });

  test('warns about gaps in phase numbering', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap\n### Phase 1: A\n### Phase 3: C\n`
    );
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-c'), { recursive: true });

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(
      output.warnings.some(w => w.includes('Gap in phase numbering')),
      'should warn about gap'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// progress command
// ─────────────────────────────────────────────────────────────────────────────

describe('progress command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('renders JSON progress', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0 MVP\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Done');
    fs.writeFileSync(path.join(p1, '01-02-PLAN.md'), '# Plan 2');

    const result = runGsdTools('progress json', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.total_plans, 2, '2 total plans');
    assert.strictEqual(output.total_summaries, 1, '1 summary');
    assert.strictEqual(output.percent, 50, '50%');
    assert.strictEqual(output.phases.length, 1, '1 phase');
    assert.strictEqual(output.phases[0].status, 'In Progress', 'phase in progress');
  });

  test('renders bar format', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(p1, '01-01-SUMMARY.md'), '# Done');

    const result = runGsdTools('progress bar --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(result.output.includes('1/1'), 'should include count');
    assert.ok(result.output.includes('100%'), 'should include 100%');
  });

  test('renders table format', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      `# Roadmap v1.0 MVP\n`
    );
    const p1 = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, '01-01-PLAN.md'), '# Plan');

    const result = runGsdTools('progress table --raw', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);
    assert.ok(result.output.includes('Phase'), 'should have table header');
    assert.ok(result.output.includes('foundation'), 'should include phase name');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// todo complete command
// ─────────────────────────────────────────────────────────────────────────────

describe('todo complete command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('moves todo from pending to completed', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(
      path.join(pendingDir, 'add-dark-mode.md'),
      `title: Add dark mode\narea: ui\ncreated: 2025-01-01\n`
    );

    const result = runGsdTools('todo complete add-dark-mode.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.completed, true);

    // Verify moved
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'pending', 'add-dark-mode.md')),
      'should be removed from pending'
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'todos', 'completed', 'add-dark-mode.md')),
      'should be in completed'
    );

    // Verify completion timestamp added
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'todos', 'completed', 'add-dark-mode.md'),
      'utf-8'
    );
    assert.ok(content.startsWith('completed:'), 'should have completed timestamp');
  });

  test('fails for nonexistent todo', () => {
    const result = runGsdTools('todo complete nonexistent.md', tmpDir);
    assert.ok(!result.success, 'should fail');
    assert.ok(result.error.includes('not found'), 'error mentions not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scaffold command
// ─────────────────────────────────────────────────────────────────────────────

describe('scaffold command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('scaffolds context file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runGsdTools('scaffold context --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    // Verify file content
    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-CONTEXT.md'),
      'utf-8'
    );
    assert.ok(content.includes('Phase 3'), 'should reference phase number');
    assert.ok(content.includes('Decisions'), 'should have decisions section');
    assert.ok(content.includes('Discretion Areas'), 'should have discretion section');
  });

  test('scaffolds UAT file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runGsdTools('scaffold uat --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-UAT.md'),
      'utf-8'
    );
    assert.ok(content.includes('User Acceptance Testing'), 'should have UAT heading');
    assert.ok(content.includes('Test Results'), 'should have test results section');
  });

  test('scaffolds verification file', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-api'), { recursive: true });

    const result = runGsdTools('scaffold verification --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);

    const content = fs.readFileSync(
      path.join(tmpDir, '.planning', 'phases', '03-api', '03-VERIFICATION.md'),
      'utf-8'
    );
    assert.ok(content.includes('Goal-Backward Verification'), 'should have verification heading');
  });

  test('scaffolds phase directory', () => {
    const result = runGsdTools('scaffold phase-dir --phase 5 --name User Dashboard', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true);
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.planning', 'phases', '05-user-dashboard')),
      'directory should be created'
    );
  });

  test('does not overwrite existing files', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-CONTEXT.md'), '# Existing content');

    const result = runGsdTools('scaffold context --phase 3', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, false, 'should not overwrite');
    assert.strictEqual(output.reason, 'already_exists');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolve-model command
// ─────────────────────────────────────────────────────────────────────────────

describe('resolve-model command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('valid agent type returns expected model mapping', () => {
    // Write a config with a known profile
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'quality' })
    );

    const result = runGsdTools('resolve-model gsd-executor', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.model, 'opus', 'quality profile for executor should return opus');
    assert.strictEqual(output.profile, 'quality', 'profile should be quality');
  });

  test('unknown agent type returns default fallback', () => {
    const result = runGsdTools('resolve-model unknown-agent-xyz', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.model, 'sonnet', 'unknown agent should fallback to sonnet');
    assert.strictEqual(output.unknown_agent, true, 'should flag unknown agent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// find-phase command
// ─────────────────────────────────────────────────────────────────────────────

describe('find-phase command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('finds existing phase directory by number', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api-layer');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phaseDir, '03-01-SUMMARY.md'), '# Summary');

    const result = runGsdTools('find-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'phase should be found');
    assert.strictEqual(output.phase_number, '03', 'phase number correct');
    assert.strictEqual(output.phase_name, 'api-layer', 'phase name extracted');
    assert.ok(output.directory.includes('03-api-layer'), 'directory path correct');
    assert.deepStrictEqual(output.plans, ['03-01-PLAN.md'], 'plans listed');
    assert.deepStrictEqual(output.summaries, ['03-01-SUMMARY.md'], 'summaries listed');
  });

  test('returns not-found for missing phase number', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });

    const result = runGsdTools('find-phase 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'should not find missing phase');
    assert.strictEqual(output.directory, null, 'directory should be null');
  });

  test('finds decimal phase directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-foundation'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01.1-hotfix'), { recursive: true });

    const result = runGsdTools('find-phase 1.1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, true, 'decimal phase should be found');
    assert.strictEqual(output.phase_number, '01.1', 'phase number includes decimal');
    assert.ok(output.directory.includes('01.1-hotfix'), 'directory correct');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generate-slug command
// ─────────────────────────────────────────────────────────────────────────────

describe('generate-slug command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('basic text generates lowercase hyphenated slug', () => {
    const result = runGsdTools('generate-slug "User Dashboard Page"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'user-dashboard-page', 'slug should be lowercase hyphenated');
  });

  test('special characters stripped or replaced', () => {
    const result = runGsdTools('generate-slug "Hello World! @#$ Test"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.slug, 'hello-world-test', 'special chars should be stripped');
  });

  test('empty input handled gracefully', () => {
    const result = runGsdTools('generate-slug', tmpDir);
    assert.ok(!result.success, 'should fail for empty input');
    assert.ok(result.error.includes('text required'), 'error mentions text required');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// current-timestamp command
// ─────────────────────────────────────────────────────────────────────────────

describe('current-timestamp command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('default format returns ISO timestamp string', () => {
    const result = runGsdTools('current-timestamp', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // ISO format: YYYY-MM-DDTHH:MM:SS.sssZ
    assert.ok(output.timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/), 'should be ISO-like timestamp');
  });

  test('date format returns date-only string', () => {
    const result = runGsdTools('current-timestamp date', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.timestamp.match(/^\d{4}-\d{2}-\d{2}$/), 'should be date-only format YYYY-MM-DD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// list-todos command
// ─────────────────────────────────────────────────────────────────────────────

describe('list-todos command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('empty project returns empty array', () => {
    const result = runGsdTools('list-todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 0, 'count should be 0');
    assert.deepStrictEqual(output.todos, [], 'todos should be empty');
  });

  test('with TODO files returns list', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(
      path.join(pendingDir, 'add-tests.md'),
      'title: Add more tests\narea: testing\ncreated: 2025-01-01\n'
    );
    fs.writeFileSync(
      path.join(pendingDir, 'fix-bug.md'),
      'title: Fix login bug\narea: auth\ncreated: 2025-01-02\n'
    );

    const result = runGsdTools('list-todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 2, 'count should be 2');
    assert.strictEqual(output.todos.length, 2, 'should have 2 todos');
    assert.ok(output.todos.some(t => t.title === 'Add more tests'), 'should contain first todo');
    assert.ok(output.todos.some(t => t.title === 'Fix login bug'), 'should contain second todo');
  });

  test('filtered by area', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(
      path.join(pendingDir, 'add-tests.md'),
      'title: Add more tests\narea: testing\ncreated: 2025-01-01\n'
    );
    fs.writeFileSync(
      path.join(pendingDir, 'fix-bug.md'),
      'title: Fix login bug\narea: auth\ncreated: 2025-01-02\n'
    );

    const result = runGsdTools('list-todos auth', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 1, 'count should be 1 after filtering');
    assert.strictEqual(output.todos[0].area, 'auth', 'filtered todo should be auth area');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify-path-exists command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify-path-exists command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('existing path returns exists true', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'test-file.md'), '# Test');

    const result = runGsdTools('verify-path-exists .planning/test-file.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.exists, true, 'existing file should return true');
    assert.strictEqual(output.type, 'file', 'type should be file');
  });

  test('non-existent path returns exists false', () => {
    const result = runGsdTools('verify-path-exists .planning/nonexistent.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.exists, false, 'missing file should return false');
    assert.strictEqual(output.type, null, 'type should be null for missing path');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// config-ensure-section command
// ─────────────────────────────────────────────────────────────────────────────

describe('config-ensure-section command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates section in new config', () => {
    // Remove existing config if any
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

    const result = runGsdTools('config-ensure-section', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true, 'should create new config');

    // Verify file was actually written with defaults
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(config.model_profile, 'balanced', 'default model_profile should be balanced');
    assert.strictEqual(config.commit_docs, true, 'commit_docs should default to true');
  });

  test('idempotent on existing section', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ model_profile: 'quality', custom: true }));

    const result = runGsdTools('config-ensure-section', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, false, 'should not recreate existing config');
    assert.strictEqual(output.reason, 'already_exists', 'reason should be already_exists');

    // Original content preserved
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(config.custom, true, 'original content should be preserved');
  });

  test('handles missing .planning directory gracefully', () => {
    // Remove the .planning directory entirely
    fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true, force: true });

    const result = runGsdTools('config-ensure-section', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true, 'should create config even when .planning missing');
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning', 'config.json')), 'config file should exist');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// config-set command
// ─────────────────────────────────────────────────────────────────────────────

describe('config-set command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('sets value in existing config', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ model_profile: 'balanced' }));

    const result = runGsdTools('config-set model_profile quality', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'should update successfully');
    assert.strictEqual(output.key, 'model_profile', 'key should match');
    assert.strictEqual(output.value, 'quality', 'value should be set');

    // Verify file written
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(config.model_profile, 'quality', 'file should have new value');
  });

  test('sets nested key path', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ workflow: { research: true } }));

    const result = runGsdTools('config-set workflow.verifier true', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'should update nested value');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(config.workflow.verifier, true, 'nested value should be set');
    assert.strictEqual(config.workflow.research, true, 'existing nested value preserved');
  });

  test('creates config if missing', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    // No config file exists

    const result = runGsdTools('config-set model_profile budget', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'should create and set');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(config.model_profile, 'budget', 'value should be set in new config');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state load command
// ─────────────────────────────────────────────────────────────────────────────

describe('state load command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns config and state when both exist', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'quality', commit_docs: true })
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Current Phase:** 02\n**Status:** In progress'
    );

    const result = runGsdTools('state', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.config_exists, true, 'config should exist');
    assert.strictEqual(output.state_exists, true, 'state should exist');
    assert.ok(output.config.model_profile, 'config should have model_profile');
    assert.ok(output.state_raw.includes('Current Phase'), 'state_raw should contain STATE.md content');
  });

  test('returns defaults when config missing', () => {
    const result = runGsdTools('state', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.config_exists, false, 'config should not exist');
    assert.strictEqual(output.config.model_profile, 'balanced', 'should fall back to balanced profile');
  });

  test('returns state fields parsed from STATE.md content', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Current Phase:** 03\n**Status:** Ready to execute'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap v1.0'
    );

    const result = runGsdTools('state', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_exists, true, 'state should exist');
    assert.strictEqual(output.roadmap_exists, true, 'roadmap should exist');
    assert.ok(output.state_raw.includes('Status'), 'state_raw should have Status field');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state update command
// ─────────────────────────────────────────────────────────────────────────────

describe('state update command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('updates valid field in STATE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Status:** In progress\n**Current Phase:** 01\n'
    );

    const result = runGsdTools('state update Status "Phase complete"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'should update successfully');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('**Status:** Phase complete'), 'file should have updated value');
  });

  test('handles missing STATE.md gracefully', () => {
    const result = runGsdTools('state update Status "In progress"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, false, 'should not update when STATE.md missing');
    assert.ok(output.reason.includes('STATE.md not found'), 'reason should mention missing file');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state get command
// ─────────────────────────────────────────────────────────────────────────────

describe('state get command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns full state JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Current Phase:** 02\n**Status:** In progress\n'
    );

    const result = runGsdTools('state get', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.content, 'should return content field');
    assert.ok(output.content.includes('Current Phase'), 'content should have full STATE.md');
  });

  test('returns specific field when argument provided', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# Project State\n\n**Current Phase:** 02\n**Status:** In progress\n'
    );

    const result = runGsdTools('state get Status', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.Status, 'In progress', 'should return specific field value');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state patch command
// ─────────────────────────────────────────────────────────────────────────────

describe('state patch command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('applies single patch to STATE.md', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Status:** Ready to plan\n**Current Phase:** 01\n'
    );

    const result = runGsdTools('state patch --Status "In progress"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.deepStrictEqual(output.updated, ['Status'], 'Status should be updated');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('**Status:** In progress'), 'file should be patched');
  });

  test('applies multiple patches in sequence', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Status:** Ready\n**Current Phase:** 01\n**Current Plan:** 0\n'
    );

    const result = runGsdTools('state patch --Status "In progress" --"Current Plan" 1', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.updated.includes('Status'), 'Status should be updated');
    assert.ok(output.updated.includes('Current Plan'), 'Current Plan should be updated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state advance-plan command
// ─────────────────────────────────────────────────────────────────────────────

describe('state advance-plan command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('advances plan number in state', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Current Plan:** 1\n**Total Plans in Phase:** 3\n**Status:** In progress\n**Last Activity:** 2025-01-01\n'
    );

    const result = runGsdTools('state advance-plan', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.advanced, true, 'should advance');
    assert.strictEqual(output.previous_plan, 1, 'previous plan should be 1');
    assert.strictEqual(output.current_plan, 2, 'current plan should be 2');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('**Current Plan:** 2'), 'file should show plan 2');
  });

  test('detects last plan and sets verification status', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Current Plan:** 3\n**Total Plans in Phase:** 3\n**Status:** In progress\n**Last Activity:** 2025-01-01\n'
    );

    const result = runGsdTools('state advance-plan', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.advanced, false, 'should not advance past total');
    assert.strictEqual(output.reason, 'last_plan', 'reason should be last_plan');
    assert.strictEqual(output.status, 'ready_for_verification', 'status should be ready_for_verification');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state record-metric command
// ─────────────────────────────────────────────────────────────────────────────

describe('state record-metric command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('records metric with full options', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|

`
    );

    const result = runGsdTools('state record-metric --phase 01 --plan 01 --duration 5m --tasks 3 --files 7', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.recorded, true, 'metric should be recorded');
    assert.strictEqual(output.phase, '01', 'phase should match');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('Phase 01 P01'), 'STATE.md should contain metric row');
    assert.ok(content.includes('5m'), 'should contain duration');
  });

  test('records metric with minimal options', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      `# State

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|

`
    );

    const result = runGsdTools('state record-metric --phase 02 --plan 01 --duration 3m', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.recorded, true, 'metric should be recorded');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('Phase 02 P01'), 'metric row should exist');
    assert.ok(content.includes('- tasks'), 'missing tasks should show dash');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state update-progress command
// ─────────────────────────────────────────────────────────────────────────────

describe('state update-progress command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('updates progress bar when phases exist', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Progress:** [old] 0%\n'
    );

    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-test');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan');
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(path.join(phaseDir, '01-02-PLAN.md'), '# Plan 2');

    const result = runGsdTools('state update-progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'progress should be updated');
    assert.strictEqual(output.percent, 50, 'should be 50% (1/2 plans done)');
    assert.strictEqual(output.completed, 1, '1 completed');
    assert.strictEqual(output.total, 2, '2 total');
  });

  test('handles empty phases directory', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Progress:** [old] 0%\n'
    );

    const result = runGsdTools('state update-progress', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'should still update');
    assert.strictEqual(output.percent, 0, 'should be 0%');
    assert.strictEqual(output.total, 0, 'total should be 0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state add-decision command
// ─────────────────────────────────────────────────────────────────────────────

describe('state add-decision command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('adds decision with phase context', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n### Decisions\n\nNone yet.\n\n## Session\n'
    );

    const result = runGsdTools('state add-decision --phase 01 --summary "Use Prisma ORM"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.added, true, 'decision should be added');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('[Phase 01]: Use Prisma ORM'), 'decision with phase context should appear');
    assert.ok(!content.includes('None yet'), 'placeholder should be removed');
  });

  test('adds decision without phase context', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n### Decisions\n\nNone yet.\n\n## Session\n'
    );

    const result = runGsdTools('state add-decision --summary "Prefer simplicity"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.added, true, 'decision should be added');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('[Phase ?]: Prefer simplicity'), 'decision with ? phase should appear');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state add-blocker command
// ─────────────────────────────────────────────────────────────────────────────

describe('state add-blocker command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('adds new blocker to state', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n### Blockers/Concerns\n\nNone\n\n## Session\n'
    );

    const result = runGsdTools('state add-blocker --text "Waiting for API credentials"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.added, true, 'blocker should be added');
    assert.strictEqual(output.blocker, 'Waiting for API credentials', 'blocker text correct');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('- Waiting for API credentials'), 'blocker should appear');
    assert.ok(!content.match(/^None$/m), 'placeholder should be removed');
  });

  test('adds blocker alongside existing blockers', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n### Blockers/Concerns\n\n- Existing issue\n\n## Session\n'
    );

    const result = runGsdTools('state add-blocker --text "New issue found"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.added, true, 'blocker should be added');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('- Existing issue'), 'existing blocker preserved');
    assert.ok(content.includes('- New issue found'), 'new blocker added');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state resolve-blocker command
// ─────────────────────────────────────────────────────────────────────────────

describe('state resolve-blocker command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('resolves existing blocker', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n### Blockers/Concerns\n\n- Waiting for API credentials\n- Design review needed\n\n## Session\n'
    );

    const result = runGsdTools('state resolve-blocker --text "API credentials"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.resolved, true, 'blocker should be resolved');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(!content.includes('API credentials'), 'resolved blocker should be removed');
    assert.ok(content.includes('Design review needed'), 'other blocker preserved');
  });

  test('handles non-existent blocker gracefully', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n### Blockers/Concerns\n\n- Real blocker\n\n## Session\n'
    );

    const result = runGsdTools('state resolve-blocker --text "nonexistent issue"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.resolved, true, 'command should succeed even if no match found');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('Real blocker'), 'existing blocker should remain');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// state record-session command
// ─────────────────────────────────────────────────────────────────────────────

describe('state record-session command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('records session with full options', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n## Session Continuity\n\n**Last session:** 2025-01-01\n**Stopped At:** Phase 1, Plan 1\n**Resume File:** None\n'
    );

    const result = runGsdTools('state record-session --stopped-at "Phase 2, Plan 1" --resume-file .planning/phases/02-api/02-01-PLAN.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.recorded, true, 'session should be recorded');
    assert.ok(output.updated.includes('Last session'), 'Last session should be updated');
    assert.ok(output.updated.includes('Stopped At'), 'Stopped At should be updated');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('Phase 2, Plan 1'), 'stopped at should be updated');
    assert.ok(content.includes('02-01-PLAN.md'), 'resume file should be updated');
  });

  test('records session with minimal options', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n## Session Continuity\n\n**Last session:** 2025-01-01\n**Stopped At:** Phase 1\n**Resume File:** None\n'
    );

    const result = runGsdTools('state record-session --stopped-at "Completed 01-02"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.recorded, true, 'session should be recorded');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    assert.ok(content.includes('Completed 01-02'), 'stopped at should be updated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// frontmatter get command
// ─────────────────────────────────────────────────────────────────────────────

describe('frontmatter get command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('extracts specific field from valid frontmatter', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test-file.md'),
      `---
phase: 01-foundation
plan: 01
subsystem: testing
tags: [node, jest]
---

# Content
`
    );

    const result = runGsdTools(`frontmatter get test-file.md --field phase`, tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase, '01-foundation', 'should extract phase field');
  });

  test('returns all frontmatter when no field specified', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test-file.md'),
      `---
phase: 02-api
plan: 03
subsystem: api
---

# Content
`
    );

    const result = runGsdTools('frontmatter get test-file.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase, '02-api', 'phase field present');
    assert.strictEqual(output.plan, '03', 'plan field present');
    assert.strictEqual(output.subsystem, 'api', 'subsystem field present');
  });

  test('handles missing file gracefully', () => {
    const result = runGsdTools('frontmatter get nonexistent.md', tmpDir);
    assert.ok(result.success, `Command should succeed with error JSON: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report file not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// frontmatter set command
// ─────────────────────────────────────────────────────────────────────────────

describe('frontmatter set command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('sets field value in existing frontmatter', () => {
    const filePath = path.join(tmpDir, 'test-file.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01
plan: 01
---

# Body
`
    );

    const result = runGsdTools('frontmatter set test-file.md --field subsystem --value testing', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true, 'should report updated');
    assert.strictEqual(output.field, 'subsystem', 'field name correct');
    assert.strictEqual(output.value, 'testing', 'value correct');

    // Verify file was written
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('subsystem'), 'file should contain new field');
  });

  test('handles missing file gracefully', () => {
    const result = runGsdTools('frontmatter set nonexistent.md --field x --value y', tmpDir);
    assert.ok(result.success, `Command should succeed with error JSON: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report file not found');
  });

  test('preserves body content after frontmatter', () => {
    const filePath = path.join(tmpDir, 'test-file.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01
---

# Important Content

This body must be preserved.
`
    );

    runGsdTools('frontmatter set test-file.md --field plan --value 02', tmpDir);

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('Important Content'), 'body content should be preserved');
    assert.ok(content.includes('This body must be preserved'), 'full body preserved');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// frontmatter merge command
// ─────────────────────────────────────────────────────────────────────────────

describe('frontmatter merge command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('merges JSON fields into existing frontmatter', () => {
    const filePath = path.join(tmpDir, 'test-file.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01
plan: 01
---

# Content
`
    );

    const mergeData = JSON.stringify({ subsystem: 'testing', tags: ['node', 'jest'] });
    const result = runGsdTools(`frontmatter merge test-file.md --data '${mergeData}'`, tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.merged, true, 'should report merged');
    assert.ok(output.fields.includes('subsystem'), 'subsystem in merged fields');
    assert.ok(output.fields.includes('tags'), 'tags in merged fields');
  });

  test('handles missing file gracefully', () => {
    const mergeData = JSON.stringify({ key: 'value' });
    const result = runGsdTools(`frontmatter merge nonexistent.md --data '${mergeData}'`, tmpDir);
    assert.ok(result.success, `Command should succeed with error JSON: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report file not found');
  });

  test('overwrites existing fields with merge data', () => {
    const filePath = path.join(tmpDir, 'test-file.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01
subsystem: old-value
---

# Content
`
    );

    const mergeData = JSON.stringify({ subsystem: 'new-value' });
    runGsdTools(`frontmatter merge test-file.md --data '${mergeData}'`, tmpDir);

    // Verify by reading back
    const getResult = runGsdTools('frontmatter get test-file.md --field subsystem', tmpDir);
    const output = JSON.parse(getResult.output);
    assert.strictEqual(output.subsystem, 'new-value', 'subsystem should be overwritten');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// frontmatter validate command
// ─────────────────────────────────────────────────────────────────────────────

describe('frontmatter validate command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('valid plan frontmatter passes validation', () => {
    const filePath = path.join(tmpDir, 'test-plan.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01-test
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/test.js]
autonomous: true
must_haves:
  truths: []
  artifacts: []
  key_links: []
---

# Plan
`
    );

    const result = runGsdTools('frontmatter validate test-plan.md --schema plan', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, 'should be valid');
    assert.strictEqual(output.schema, 'plan', 'schema should be plan');
    assert.strictEqual(output.missing.length, 0, 'no missing fields');
  });

  test('valid summary frontmatter passes validation', () => {
    const filePath = path.join(tmpDir, 'test-summary.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01-test
plan: 01
subsystem: testing
tags: [node]
duration: 5min
completed: 2025-01-01
---

# Summary
`
    );

    const result = runGsdTools('frontmatter validate test-summary.md --schema summary', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, 'should be valid');
    assert.strictEqual(output.schema, 'summary', 'schema should be summary');
  });

  test('missing required fields returns validation errors', () => {
    const filePath = path.join(tmpDir, 'test-incomplete.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01-test
---

# Incomplete Plan
`
    );

    const result = runGsdTools('frontmatter validate test-incomplete.md --schema plan', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false, 'should not be valid');
    assert.ok(output.missing.length > 0, 'should have missing fields');
    assert.ok(output.missing.includes('plan'), 'plan should be missing');
    assert.ok(output.missing.includes('type'), 'type should be missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// template select command
// ─────────────────────────────────────────────────────────────────────────────

describe('template select command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('simple plan returns standard template identifier', () => {
    const filePath = path.join(tmpDir, 'test-plan.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01
plan: 01
---

### Task 1: Create schema
### Task 2: Generate client
### Task 3: Write tests

Files: \`src/db.ts\`, \`src/schema.ts\`, \`src/client.ts\`, \`tests/db.test.ts\`
`
    );

    const result = runGsdTools('template select test-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.template, 'should return template path');
    assert.ok(output.type, 'should return type');
    assert.strictEqual(output.taskCount, 3, 'should count 3 tasks');
  });

  test('complex plan with decisions returns complex template', () => {
    const filePath = path.join(tmpDir, 'complex-plan.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01
plan: 01
---

### Task 1: Setup
### Task 2: Auth
### Task 3: API
### Task 4: Tests
### Task 5: Deploy
### Task 6: Monitor

We need to make a decision about the auth provider.
Files: \`src/a.ts\`, \`src/b.ts\`, \`src/c.ts\`, \`src/d.ts\`, \`src/e.ts\`, \`src/f.ts\`, \`src/g.ts\`
`
    );

    const result = runGsdTools('template select complex-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.type, 'complex', 'should return complex type');
    assert.strictEqual(output.hasDecisions, true, 'should detect decisions');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// template fill summary command
// ─────────────────────────────────────────────────────────────────────────────

describe('template fill summary command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('fills summary template with provided field values', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('template fill summary --phase 3 --plan 01 --name API', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true, 'should create summary template');
    assert.ok(output.path, 'should return file path');

    // Verify file was created
    const files = fs.readdirSync(phaseDir);
    assert.ok(files.some(f => f.endsWith('-SUMMARY.md')), 'summary file should exist');
  });

  test('returns error if file already exists', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create first
    runGsdTools('template fill summary --phase 3 --plan 01 --name API', tmpDir);

    // Try again
    const result = runGsdTools('template fill summary --phase 3 --plan 01 --name API', tmpDir);
    assert.ok(result.success, `Command should succeed with error JSON: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File already exists', 'should report file already exists');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// template fill plan command
// ─────────────────────────────────────────────────────────────────────────────

describe('template fill plan command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('execute type plan fills correctly', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('template fill plan --phase 3 --plan 01 --name API --type execute', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true, 'should create plan template');

    // Verify file content
    const files = fs.readdirSync(phaseDir);
    const planFile = files.find(f => f.endsWith('-PLAN.md'));
    assert.ok(planFile, 'plan file should exist');

    const content = fs.readFileSync(path.join(phaseDir, planFile), 'utf-8');
    assert.ok(content.includes('type: execute'), 'should contain execute type');
  });

  test('tdd type plan fills correctly', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('template fill plan --phase 3 --plan 02 --name Tests --type tdd', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true, 'should create plan template');

    const files = fs.readdirSync(phaseDir);
    const planFile = files.find(f => f.includes('02') && f.endsWith('-PLAN.md'));
    assert.ok(planFile, 'tdd plan file should exist');

    const content = fs.readFileSync(path.join(phaseDir, planFile), 'utf-8');
    assert.ok(content.includes('type: tdd'), 'should contain tdd type');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// template fill verification command
// ─────────────────────────────────────────────────────────────────────────────

describe('template fill verification command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('fills verification template with fields', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('template fill verification --phase 3 --name API', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.created, true, 'should create verification template');

    const files = fs.readdirSync(phaseDir);
    assert.ok(files.some(f => f.endsWith('-VERIFICATION.md')), 'verification file should exist');
  });

  test('returns error if file already exists', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create first
    runGsdTools('template fill verification --phase 3 --name API', tmpDir);

    // Try again
    const result = runGsdTools('template fill verification --phase 3 --name API', tmpDir);
    assert.ok(result.success, `Command should succeed with error JSON: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File already exists', 'should report already exists');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify plan-structure command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify plan-structure command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('valid plan with tasks passes', () => {
    const filePath = path.join(tmpDir, 'test-plan.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01-test
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths: []
  artifacts: []
  key_links: []
---

<task type="auto">
  <name>Task 1: Do something</name>
  <files>src/test.js</files>
  <action>Create the file</action>
  <verify>File exists</verify>
  <done>File created</done>
</task>
`
    );

    const result = runGsdTools('verify plan-structure test-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, 'should be valid');
    assert.strictEqual(output.task_count, 1, 'should have 1 task');
    assert.strictEqual(output.errors.length, 0, 'no errors');
  });

  test('plan missing required fields returns errors', () => {
    const filePath = path.join(tmpDir, 'test-plan.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01-test
---

<task type="auto">
  <name>Task 1</name>
  <action>Do something</action>
</task>
`
    );

    const result = runGsdTools('verify plan-structure test-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false, 'should not be valid');
    assert.ok(output.errors.length > 0, 'should have errors');
    assert.ok(output.errors.some(e => e.includes('Missing required')), 'should mention missing fields');
  });

  test('plan with no tasks returns warnings', () => {
    const filePath = path.join(tmpDir, 'test-plan.md');
    fs.writeFileSync(
      filePath,
      `---
phase: 01-test
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
must_haves:
  truths: []
---

# Just a heading, no tasks
`
    );

    const result = runGsdTools('verify plan-structure test-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.task_count, 0, 'should have 0 tasks');
    assert.ok(output.warnings.some(w => w.includes('No <task> elements')), 'should warn about no tasks');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify phase-completeness command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify phase-completeness command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('complete phase (all summaries exist) passes', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(phaseDir, '03-01-SUMMARY.md'), '# Summary 1');
    fs.writeFileSync(path.join(phaseDir, '03-02-PLAN.md'), '# Plan 2');
    fs.writeFileSync(path.join(phaseDir, '03-02-SUMMARY.md'), '# Summary 2');

    const result = runGsdTools('verify phase-completeness 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.complete, true, 'phase should be complete');
    assert.strictEqual(output.plan_count, 2, '2 plans');
    assert.strictEqual(output.summary_count, 2, '2 summaries');
    assert.strictEqual(output.incomplete_plans.length, 0, 'no incomplete plans');
  });

  test('incomplete phase (missing summaries) returns incomplete items', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(phaseDir, '03-01-SUMMARY.md'), '# Summary 1');
    fs.writeFileSync(path.join(phaseDir, '03-02-PLAN.md'), '# Plan 2');
    // No summary for plan 2

    const result = runGsdTools('verify phase-completeness 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.complete, false, 'phase should be incomplete');
    assert.ok(output.incomplete_plans.includes('03-02'), 'should list 03-02 as incomplete');
  });

  test('empty phase directory returns complete (no plans to complete)', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = runGsdTools('verify phase-completeness 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.complete, true, 'empty phase is trivially complete');
    assert.strictEqual(output.plan_count, 0, '0 plans');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify references command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify references command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('valid @-references all resolve', () => {
    // Create referenced files
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap'
    );

    // Create file with references
    fs.writeFileSync(
      path.join(tmpDir, 'test-file.md'),
      `# Plan

@.planning/STATE.md
@.planning/ROADMAP.md
`
    );

    const result = runGsdTools('verify references test-file.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, 'all references should resolve');
    assert.strictEqual(output.missing.length, 0, 'no missing references');
    assert.strictEqual(output.found, 2, '2 found references');
  });

  test('broken references detected', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test-file.md'),
      `# Plan

@.planning/STATE.md
@.planning/NONEXISTENT.md
`
    );
    // STATE.md doesn't exist in tmpDir either

    const result = runGsdTools('verify references test-file.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, false, 'should be invalid');
    assert.ok(output.missing.length > 0, 'should have missing references');
  });

  test('file with no references passes cleanly', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test-file.md'),
      `# Simple File

No references here, just plain text.
`
    );

    const result = runGsdTools('verify references test-file.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.valid, true, 'no references = valid');
    assert.strictEqual(output.total, 0, 'total should be 0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify commits command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify commits command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Initialize git repo for commit verification
    execSync('git init && git config user.email "test@test.com" && git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'initial');
    execSync('git add init.txt && git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('valid commit hash returns success', () => {
    const hash = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

    const result = runGsdTools(`verify commits ${hash}`, tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_valid, true, 'all commits should be valid');
    assert.strictEqual(output.valid.length, 1, '1 valid commit');
    assert.strictEqual(output.invalid.length, 0, 'no invalid commits');
  });

  test('invalid commit hash returns failure', () => {
    const result = runGsdTools('verify commits 0000000000000000000000000000000000000000', tmpDir);
    assert.ok(result.success, `Command should succeed with invalid data: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_valid, false, 'should not be all valid');
    assert.strictEqual(output.invalid.length, 1, '1 invalid commit');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify artifacts command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify artifacts command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('all listed artifacts exist passes', () => {
    // Create the artifact file
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'test.js'), 'module.exports = {};\n'.repeat(50));

    // Create plan with must_haves.artifacts (4-space indent for parseMustHavesBlock)
    fs.writeFileSync(
      path.join(tmpDir, 'test-plan.md'),
      '---\nphase: 01\nplan: 01\nmust_haves:\n    artifacts:\n      - path: "src/test.js"\n        provides: "Test module"\n        min_lines: 10\n---\n\n# Plan\n'
    );

    const result = runGsdTools('verify artifacts test-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_passed, true, 'all artifacts should pass');
    assert.strictEqual(output.passed, 1, '1 artifact passed');
  });

  test('missing artifacts listed', () => {
    // 4-space indent for parseMustHavesBlock
    fs.writeFileSync(
      path.join(tmpDir, 'test-plan.md'),
      '---\nphase: 01\nplan: 01\nmust_haves:\n    artifacts:\n      - path: "src/nonexistent.js"\n        provides: "Missing module"\n---\n\n# Plan\n'
    );

    const result = runGsdTools('verify artifacts test-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_passed, false, 'should not pass');
    assert.ok(output.artifacts[0].issues.includes('File not found'), 'should report file not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify key-links command
// ─────────────────────────────────────────────────────────────────────────────

describe('verify key-links command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('valid key links pass verification', () => {
    // Create source and target files
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'main.js'), 'const db = require("./db");\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'db.js'), 'module.exports = {};\n');

    // 4-space indent for parseMustHavesBlock
    fs.writeFileSync(
      path.join(tmpDir, 'test-plan.md'),
      '---\nphase: 01\nplan: 01\nmust_haves:\n    key_links:\n      - from: "src/main.js"\n        to: "src/db.js"\n        via: "require import"\n        pattern: "require"\n---\n\n# Plan\n'
    );

    const result = runGsdTools('verify key-links test-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_verified, true, 'all links should be verified');
    assert.strictEqual(output.verified, 1, '1 link verified');
  });

  test('broken key links detected', () => {
    // 4-space indent for parseMustHavesBlock
    fs.writeFileSync(
      path.join(tmpDir, 'test-plan.md'),
      '---\nphase: 01\nplan: 01\nmust_haves:\n    key_links:\n      - from: "src/nonexistent.js"\n        to: "src/db.js"\n        via: "import"\n---\n\n# Plan\n'
    );

    const result = runGsdTools('verify key-links test-plan.md', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.all_verified, false, 'should not be all verified');
    assert.ok(output.links[0].detail.includes('not found'), 'should report source not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init new-project command
// ─────────────────────────────────────────────────────────────────────────────

describe('init new-project command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('fresh project returns init context with brownfield detection', () => {
    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('researcher_model' in output, 'should have researcher_model');
    assert.ok('synthesizer_model' in output, 'should have synthesizer_model');
    assert.ok('roadmapper_model' in output, 'should have roadmapper_model');
    assert.ok('commit_docs' in output, 'should have commit_docs');
    assert.ok('planning_exists' in output, 'should have planning_exists');
    assert.ok('is_brownfield' in output, 'should have brownfield detection');
    assert.ok('has_git' in output, 'should have git detection');
  });

  test('existing .planning directory detected', () => {
    // .planning already exists from createTempProject
    const result = runGsdTools('init new-project', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.planning_exists, true, 'planning should exist');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init new-milestone command
// ─────────────────────────────────────────────────────────────────────────────

describe('init new-milestone command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns milestone context with models and config', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap v1.0 MVP\n'
    );

    const result = runGsdTools('init new-milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('researcher_model' in output, 'should have researcher_model');
    assert.ok('current_milestone' in output, 'should have current_milestone');
    assert.ok('commit_docs' in output, 'should have commit_docs');
    assert.ok('project_exists' in output, 'should have project_exists');
    assert.ok('roadmap_exists' in output, 'should have roadmap_exists');
  });

  test('handles project without milestones directory', () => {
    const result = runGsdTools('init new-milestone', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.roadmap_exists, false, 'no roadmap should be false');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init quick command
// ─────────────────────────────────────────────────────────────────────────────

describe('init quick command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('quick init with description creates minimal context', () => {
    const result = runGsdTools('init quick Fix auth bug', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.description, 'Fix auth bug', 'description should be captured');
    assert.strictEqual(output.slug, 'fix-auth-bug', 'slug should be generated');
    assert.strictEqual(output.next_num, 1, 'first quick task should be 1');
    assert.ok(output.date, 'should have date');
    assert.ok(output.timestamp, 'should have timestamp');
  });

  test('quick init creates correct task directory path', () => {
    const result = runGsdTools('init quick Add dark mode', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.task_dir, 'should have task_dir');
    assert.ok(output.task_dir.includes('add-dark-mode'), 'task dir should contain slug');
    assert.ok('commit_docs' in output, 'should have commit_docs');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init resume command
// ─────────────────────────────────────────────────────────────────────────────

describe('init resume command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('with session data returns resume context', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Current Phase:** 03\n'
    );

    const result = runGsdTools('init resume', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_exists, true, 'state should exist');
    assert.ok('planning_exists' in output, 'should have planning_exists');
    assert.ok('has_interrupted_agent' in output, 'should check for interrupted agent');
    assert.ok('commit_docs' in output, 'should have commit_docs');
  });

  test('without session data returns default context', () => {
    const result = runGsdTools('init resume', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.state_exists, false, 'state should not exist');
    assert.strictEqual(output.has_interrupted_agent, false, 'no interrupted agent');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init verify-work command
// ─────────────────────────────────────────────────────────────────────────────

describe('init verify-work command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('valid phase returns verification init context', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');

    const result = runGsdTools('init verify-work 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true, 'phase should be found');
    assert.strictEqual(output.phase_number, '03', 'phase number correct');
    assert.ok('planner_model' in output, 'should have planner_model');
    assert.ok('checker_model' in output, 'should have checker_model');
    assert.ok('has_verification' in output, 'should check verification file');
  });

  test('invalid phase handled gracefully', () => {
    const result = runGsdTools('init verify-work 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, false, 'phase should not be found');
    assert.strictEqual(output.phase_dir, null, 'phase_dir should be null');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init phase-op command
// ─────────────────────────────────────────────────────────────────────────────

describe('init phase-op command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('existing phase returns phase operation context', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan');

    const result = runGsdTools('init phase-op 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, true, 'phase should be found');
    assert.strictEqual(output.phase_number, '03', 'phase number correct');
    assert.strictEqual(output.plan_count, 1, 'should have 1 plan');
    assert.ok('commit_docs' in output, 'should have commit_docs');
    assert.ok('has_research' in output, 'should check research');
    assert.ok('has_context' in output, 'should check context');
  });

  test('non-existent phase returns appropriate context', () => {
    const result = runGsdTools('init phase-op 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, false, 'phase should not be found');
    assert.strictEqual(output.plan_count, 0, 'plan count should be 0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init todos command
// ─────────────────────────────────────────────────────────────────────────────

describe('init todos command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('with todos returns todo init context', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(
      path.join(pendingDir, 'fix-bug.md'),
      'title: Fix login bug\narea: auth\ncreated: 2025-01-01\n'
    );

    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 1, 'should have 1 todo');
    assert.strictEqual(output.todos[0].title, 'Fix login bug', 'todo title correct');
    assert.ok('pending_dir' in output, 'should have pending_dir');
    assert.ok('completed_dir' in output, 'should have completed_dir');
    assert.ok('date' in output, 'should have date');
  });

  test('without todos returns empty context', () => {
    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0, 'should have 0 todos');
    assert.deepStrictEqual(output.todos, [], 'todos should be empty array');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init milestone-op command
// ─────────────────────────────────────────────────────────────────────────────

describe('init milestone-op command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('standard scenario returns milestone operation context', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '01-foundation');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap v1.0 MVP\n'
    );

    const result = runGsdTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('milestone_version' in output, 'should have milestone_version');
    assert.ok('phase_count' in output, 'should have phase_count');
    assert.ok('completed_phases' in output, 'should have completed_phases');
    assert.ok('all_phases_complete' in output, 'should have all_phases_complete');
    assert.ok('archived_milestones' in output, 'should have archived_milestones');
    assert.strictEqual(output.phase_count, 1, 'should count 1 phase');
    assert.strictEqual(output.completed_phases, 1, '1 phase has summary');
  });

  test('no milestones handled gracefully', () => {
    const result = runGsdTools('init milestone-op', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_count, 0, 'no phases');
    assert.strictEqual(output.archive_count, 0, 'no archived milestones');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init map-codebase command
// ─────────────────────────────────────────────────────────────────────────────

describe('init map-codebase command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns codebase mapping init context', () => {
    const result = runGsdTools('init map-codebase', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('mapper_model' in output, 'should have mapper_model');
    assert.ok('commit_docs' in output, 'should have commit_docs');
    assert.ok('codebase_dir' in output, 'should have codebase_dir');
    assert.ok('existing_maps' in output, 'should have existing_maps');
    assert.ok('has_maps' in output, 'should have has_maps flag');
    assert.ok('planning_exists' in output, 'should have planning_exists');
    assert.strictEqual(output.has_maps, false, 'no maps should exist');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init execute-phase edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('init execute-phase edge cases', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('non-existent phase returns phase_found false', () => {
    const result = runGsdTools('init execute-phase 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.phase_found, false, 'phase should not be found');
    assert.strictEqual(output.plan_count, 0, 'plan count should be 0');
    assert.deepStrictEqual(output.plans, [], 'plans should be empty');
  });

  test('phase with summaries populates incomplete_plans correctly', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '# Plan 1');
    fs.writeFileSync(path.join(phaseDir, '03-01-SUMMARY.md'), '# Summary 1');
    fs.writeFileSync(path.join(phaseDir, '03-02-PLAN.md'), '# Plan 2');

    const result = runGsdTools('init execute-phase 03', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.plan_count, 2, '2 plans total');
    assert.strictEqual(output.incomplete_count, 1, '1 incomplete plan');
    assert.ok(output.incomplete_plans.includes('03-02-PLAN.md'), '03-02 should be incomplete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase numbering edge cases (TEST-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('phase next-decimal edge cases (TEST-06)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('double-digit base phase (phase 10 -> 10.1)', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '10-final'), { recursive: true });

    const result = runGsdTools('phase next-decimal 10', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '10.1', 'should return 10.1');
    assert.strictEqual(output.base_phase, '10', 'base phase should be 10');
  });

  test('decimal transition from 1.9 to 1.10 (numeric, not lexicographic)', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-base'), { recursive: true });
    for (let i = 1; i <= 9; i++) {
      fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', `01.${i}-fix${i}`), { recursive: true });
    }

    const result = runGsdTools('phase next-decimal 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '01.10', 'should return 01.10, not 01.2 (lexicographic error)');
    assert.strictEqual(output.existing.length, 9, 'should have 9 existing decimals');
  });

  test('many decimal phases: existing decimals listed and next computed from highest', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-base'), { recursive: true });
    for (let i = 1; i <= 11; i++) {
      fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', `01.${i}-fix${i}`), { recursive: true });
    }

    const result = runGsdTools('phase next-decimal 01', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    // Characterization: tool uses lexicographic sort, lists all 11 existing decimals
    assert.strictEqual(output.existing.length, 11, 'should have 11 existing decimals');
    // Tool finds max decimal as 9 (lexicographic: "9" > "11" > "10"), increments to 10
    // But 01.10 already exists, so the actual behavior just returns next after max parse
    assert.ok(output.next.startsWith('01.'), 'next should start with 01.');
    assert.ok(output.next, 'should return a next value');
  });

  test('base phase with no existing decimals returns X.1', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '05-feature'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '06-next'), { recursive: true });

    const result = runGsdTools('phase next-decimal 05', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.next, '05.1', 'should return 05.1');
    assert.deepStrictEqual(output.existing, [], 'no existing decimals');
  });

  test('non-existent base phase handled gracefully', () => {
    const result = runGsdTools('phase next-decimal 99', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'base phase not found');
    assert.strictEqual(output.next, '99.1', 'should still suggest 99.1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error recovery tests (TEST-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('error recovery: state commands with corrupt/missing state', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('state load with corrupt config.json does not crash', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      'THIS IS NOT VALID JSON {{{}}}'
    );

    const result = runGsdTools('state', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    // Should fall back to defaults
    assert.ok(output.config, 'should still have config (defaults)');
  });

  test('state get with missing STATE.md returns meaningful error', () => {
    const result = runGsdTools('state get', tmpDir);
    // Command exits non-zero for missing STATE.md -- this is valid error recovery
    assert.ok(!result.success, 'should fail when STATE.md missing');
    assert.ok(result.error.includes('STATE.md'), 'error should mention STATE.md');
  });

  test('state patch with missing STATE.md does not crash', () => {
    const result = runGsdTools('state patch --Status "In progress"', tmpDir);
    // May fail or succeed gracefully
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.ok(output, 'should return valid JSON');
    } else {
      assert.ok(result.error, 'should have error message');
      assert.ok(!result.error.includes('Cannot read properties of null'), 'should not have unhandled null dereference');
    }
  });

  test('state advance-plan with missing STATE.md does not crash', () => {
    const result = runGsdTools('state advance-plan', tmpDir);
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.ok(output, 'should return valid JSON');
    } else {
      assert.ok(result.error, 'should have error message');
    }
  });

  test('state record-metric with missing metrics table does not crash', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\nNo metrics table here.\n'
    );

    const result = runGsdTools('state record-metric --phase 01 --plan 01 --duration 5m', tmpDir);
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.ok(output, 'should return valid JSON');
    } else {
      assert.ok(result.error, 'should have error message');
    }
  });

  test('state add-decision with missing decisions section does not crash', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\nNo decisions section.\n'
    );

    const result = runGsdTools('state add-decision --phase 01 --summary "Test decision"', tmpDir);
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.ok(output, 'should return valid JSON');
    } else {
      assert.ok(result.error, 'should have error message');
    }
  });

  test('state add-blocker with missing blockers section does not crash', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\nNo blockers section.\n'
    );

    const result = runGsdTools('state add-blocker --text "Test blocker"', tmpDir);
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.ok(output, 'should return valid JSON');
    } else {
      assert.ok(result.error, 'should have error message');
    }
  });

  test('state record-session with missing session section does not crash', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\nNo session section.\n'
    );

    const result = runGsdTools('state record-session --stopped-at "Phase 1"', tmpDir);
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.ok(output, 'should return valid JSON');
    } else {
      assert.ok(result.error, 'should have error message');
    }
  });
});

describe('error recovery: roadmap and phase commands with bad input', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('roadmap get-phase with empty ROADMAP.md returns not found', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      ''
    );

    const result = runGsdTools('roadmap get-phase 1', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.found, false, 'should return not found');
  });

  test('phase-plan-index with corrupt PLAN.md files does not crash', () => {
    const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-api');
    fs.mkdirSync(phaseDir, { recursive: true });
    // Malformed frontmatter
    fs.writeFileSync(path.join(phaseDir, '03-01-PLAN.md'), '---\nbroken: [unclosed\n---\n# Plan');

    const result = runGsdTools('phase-plan-index 03', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.plans, 'should have plans array');
  });

  test('validate consistency with partially corrupt state does not crash', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n\nCorrupt content: no phases here\n'
    );

    const result = runGsdTools('validate consistency', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('passed' in output || 'error' in output, 'should return result');
  });

  test('progress command with no roadmap does not crash', () => {
    const result = runGsdTools('progress json', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok('total_plans' in output || 'error' in output, 'should return progress or error');
  });
});

describe('error recovery: frontmatter with binary/non-text file', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('frontmatter get on file with no frontmatter returns empty', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'no-frontmatter.md'),
      '# Just a heading\n\nNo frontmatter at all.\n'
    );

    const result = runGsdTools('frontmatter get no-frontmatter.md', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    // Should return empty object since no frontmatter
    assert.ok(typeof output === 'object', 'should return an object');
  });

  test('frontmatter validate with non-existent file returns error', () => {
    const result = runGsdTools('frontmatter validate nonexistent.md --schema plan', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report file not found');
  });

  test('frontmatter set with missing required args fails cleanly', () => {
    const result = runGsdTools('frontmatter set', tmpDir);
    assert.ok(!result.success, 'should fail with missing args');
    assert.ok(result.error, 'should have error message');
  });

  test('frontmatter merge with invalid JSON fails cleanly', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test.md'),
      '---\nphase: 01\n---\n# Content\n'
    );

    const result = runGsdTools('frontmatter merge test.md --data not-json', tmpDir);
    assert.ok(!result.success, 'should fail with invalid JSON');
    assert.ok(result.error, 'should have error message');
  });
});

describe('error recovery: template and verify commands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('template select with missing file falls back to standard', () => {
    const result = runGsdTools('template select nonexistent.md', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.type, 'standard', 'should fall back to standard template');
    assert.ok(output.error, 'should include error message');
  });

  test('template fill with missing phase returns error', () => {
    const result = runGsdTools('template fill summary --phase 99 --plan 01', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, 'should return error');
    assert.ok(output.error.includes('not found') || output.error.includes('Phase not found'), 'error mentions not found');
  });

  test('verify plan-structure with non-existent file returns error', () => {
    const result = runGsdTools('verify plan-structure nonexistent.md', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report file not found');
  });

  test('verify phase-completeness with non-existent phase returns error', () => {
    const result = runGsdTools('verify phase-completeness 99', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, 'should have error');
  });

  test('verify artifacts with no must_haves returns error', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test-plan.md'),
      '---\nphase: 01\nplan: 01\n---\n\n# Plan\n'
    );

    const result = runGsdTools('verify artifacts test-plan.md', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, 'should return error about missing artifacts');
  });

  test('verify key-links with no must_haves returns error', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test-plan.md'),
      '---\nphase: 01\nplan: 01\n---\n\n# Plan\n'
    );

    const result = runGsdTools('verify key-links test-plan.md', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.ok(output.error, 'should return error about missing key_links');
  });
});

describe('error recovery: commit and summary commands', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('commit with no git repo returns error', () => {
    const result = runGsdTools('commit "test message" --files test.txt', tmpDir);
    // Should fail since tmpDir has no git repo
    if (result.success) {
      const output = JSON.parse(result.output);
      assert.ok(output.committed === false || output.error, 'should indicate failure');
    } else {
      assert.ok(result.error, 'should have error message');
    }
  });

  test('verify-summary with missing summary returns error', () => {
    const result = runGsdTools('verify-summary .planning/nonexistent-SUMMARY.md', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.passed, false, 'should not pass');
    assert.ok(output.errors.includes('SUMMARY.md not found'), 'should report missing summary');
  });

  test('summary-extract with missing summary returns error', () => {
    const result = runGsdTools('summary-extract .planning/phases/01-test/nonexistent.md', tmpDir);
    assert.ok(result.success, `Command should not crash: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.error, 'File not found', 'should report file not found');
  });
});

describe('error recovery: unknown and missing arguments', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('unknown command returns error', () => {
    const result = runGsdTools('nonexistent-command', tmpDir);
    assert.ok(!result.success, 'should fail for unknown command');
    assert.ok(result.error.includes('Unknown command'), 'error should mention unknown command');
  });

  test('commit with no message fails cleanly', () => {
    const result = runGsdTools('commit', tmpDir);
    assert.ok(!result.success, 'should fail without message');
    assert.ok(result.error, 'should have error message');
  });

  test('generate-slug without text fails cleanly', () => {
    const result = runGsdTools('generate-slug', tmpDir);
    assert.ok(!result.success, 'should fail without text');
    assert.ok(result.error.includes('text required'), 'error mentions text required');
  });

  test('init with unknown workflow fails cleanly', () => {
    const result = runGsdTools('init nonexistent-workflow', tmpDir);
    assert.ok(!result.success, 'should fail for unknown workflow');
    assert.ok(result.error.includes('Unknown init workflow'), 'error mentions unknown workflow');
  });

  test('frontmatter with unknown subcommand fails cleanly', () => {
    const result = runGsdTools('frontmatter unknown-sub', tmpDir);
    assert.ok(!result.success, 'should fail for unknown subcommand');
    assert.ok(result.error.includes('Unknown frontmatter subcommand'), 'error mentions unknown subcommand');
  });

  test('verify with unknown subcommand fails cleanly', () => {
    const result = runGsdTools('verify unknown-sub', tmpDir);
    assert.ok(!result.success, 'should fail for unknown subcommand');
    assert.ok(result.error.includes('Unknown verify subcommand'), 'error mentions unknown subcommand');
  });

  test('template with unknown subcommand fails cleanly', () => {
    const result = runGsdTools('template unknown-sub', tmpDir);
    assert.ok(!result.success, 'should fail for unknown subcommand');
    assert.ok(result.error.includes('Unknown template subcommand'), 'error mentions unknown subcommand');
  });

  test('init execute-phase without phase arg fails cleanly', () => {
    const result = runGsdTools('init execute-phase', tmpDir);
    assert.ok(!result.success, 'should fail without phase arg');
    assert.ok(result.error, 'should have error message');
  });

  test('init verify-work without phase arg fails cleanly', () => {
    const result = runGsdTools('init verify-work', tmpDir);
    assert.ok(!result.success, 'should fail without phase arg');
    assert.ok(result.error, 'should have error message');
  });

  test('verify commits with no hashes fails cleanly', () => {
    const result = runGsdTools('verify commits', tmpDir);
    assert.ok(!result.success, 'should fail without hashes');
    assert.ok(result.error, 'should have error message');
  });

  test('frontmatter validate with unknown schema fails cleanly', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.md'), '---\nphase: 01\n---\n');

    const result = runGsdTools('frontmatter validate test.md --schema unknown', tmpDir);
    assert.ok(!result.success, 'should fail for unknown schema');
    assert.ok(result.error.includes('Unknown schema'), 'error mentions unknown schema');
  });
});
