/**
 * Hook Scripts Behavioral Tests
 *
 * Lightweight characterization tests for GSD hook scripts:
 * - gsd-check-update.js: Checks for GSD updates in background
 * - gsd-statusline.js: Renders statusline with model, task, context
 *
 * These hooks run as subprocess scripts invoked by the IDE.
 * Tests verify graceful behavior and output format.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const hooksDir = path.join(__dirname);

// ─────────────────────────────────────────────────────────────────────────────
// gsd-check-update hook
// ─────────────────────────────────────────────────────────────────────────────

describe('gsd-check-update hook', () => {
  test('script loads without error', () => {
    // The check-update hook spawns a background process and unrefs it.
    // Running it should exit cleanly without errors.
    const result = execSync(
      `node "${path.join(hooksDir, 'gsd-check-update.js')}"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    // Script produces no stdout (it writes to cache file in background)
    assert.strictEqual(typeof result, 'string', 'script runs and returns string output');
  });

  test('handles missing VERSION file gracefully', () => {
    // Run in a temp dir where no VERSION file exists
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-hook-test-'));
    try {
      // The hook looks for VERSION in cwd/.claude/get-shit-done/VERSION
      // and ~/.../.claude/get-shit-done/VERSION. In temp dir, project VERSION won't exist.
      // Hook should still exit cleanly (graceful degradation).
      const result = execSync(
        `node "${path.join(hooksDir, 'gsd-check-update.js')}"`,
        { encoding: 'utf8', timeout: 10000, cwd: tmpDir }
      );
      assert.strictEqual(typeof result, 'string', 'exits cleanly in dir without VERSION');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('creates cache directory if it does not exist', () => {
    // The hook ensures ~/.claude/cache/ exists
    const cacheDir = path.join(os.homedir(), '.claude', 'cache');
    // Note: We don't delete the cache dir (could affect other processes).
    // We just verify the hook doesn't crash and the cache dir exists after.
    execSync(
      `node "${path.join(hooksDir, 'gsd-check-update.js')}"`,
      { encoding: 'utf8', timeout: 10000 }
    );
    assert.ok(fs.existsSync(cacheDir), 'cache directory exists after hook run');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gsd-statusline hook
// ─────────────────────────────────────────────────────────────────────────────

describe('gsd-statusline hook', () => {
  test('script loads without error when given valid JSON input', () => {
    // Statusline reads JSON from stdin and writes formatted output to stdout
    const input = JSON.stringify({
      model: { display_name: 'TestModel' },
      workspace: { current_dir: '/tmp/test-project' },
      session_id: 'test-session-123',
      context_window: { remaining_percentage: 70 },
    });

    const result = execSync(
      `echo '${input}' | node "${path.join(hooksDir, 'gsd-statusline.js')}"`,
      { encoding: 'utf8', timeout: 5000, shell: true }
    );

    // Output should contain model name and directory
    assert.ok(result.includes('TestModel'), 'output includes model name');
    assert.ok(result.includes('test-project'), 'output includes directory basename');
  });

  test('handles missing .planning directory gracefully (no crash)', () => {
    // Run with minimal input -- no session_id means no todo lookup
    const input = JSON.stringify({
      model: { display_name: 'TestModel' },
      workspace: { current_dir: '/tmp/nonexistent-project' },
    });

    const result = execSync(
      `echo '${input}' | node "${path.join(hooksDir, 'gsd-statusline.js')}"`,
      { encoding: 'utf8', timeout: 5000, shell: true }
    );

    assert.ok(result.includes('TestModel'), 'output includes model name');
    assert.ok(result.includes('nonexistent-project'), 'output includes directory name');
  });

  test('displays context window usage when remaining_percentage provided', () => {
    const input = JSON.stringify({
      model: { display_name: 'Opus' },
      workspace: { current_dir: '/tmp/test' },
      context_window: { remaining_percentage: 50 },
    });

    const result = execSync(
      `echo '${input}' | node "${path.join(hooksDir, 'gsd-statusline.js')}"`,
      { encoding: 'utf8', timeout: 5000, shell: true }
    );

    // Should contain a percentage in the output
    assert.ok(result.includes('%'), 'output includes percentage for context window');
  });

  test('produces output without context when remaining_percentage absent', () => {
    const input = JSON.stringify({
      model: { display_name: 'Sonnet' },
      workspace: { current_dir: '/tmp/mydir' },
    });

    const result = execSync(
      `echo '${input}' | node "${path.join(hooksDir, 'gsd-statusline.js')}"`,
      { encoding: 'utf8', timeout: 5000, shell: true }
    );

    assert.ok(result.includes('Sonnet'), 'output includes model name');
    assert.ok(result.includes('mydir'), 'output includes dir basename');
  });

  test('handles invalid JSON input gracefully (silent fail)', () => {
    const result = execSync(
      `echo 'not-json' | node "${path.join(hooksDir, 'gsd-statusline.js')}"`,
      { encoding: 'utf8', timeout: 5000, shell: true }
    );

    // Should produce empty output (silent catch block)
    assert.strictEqual(result, '', 'no output on invalid JSON (silent fail)');
  });

  test('handles empty stdin gracefully', () => {
    const result = execSync(
      `echo '' | node "${path.join(hooksDir, 'gsd-statusline.js')}"`,
      { encoding: 'utf8', timeout: 5000, shell: true }
    );

    // Empty string is not valid JSON, so should silently fail
    assert.strictEqual(result, '', 'no output on empty stdin');
  });
});
