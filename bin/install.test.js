/**
 * install.js Pure Function Unit Tests
 *
 * Tests for the pure functions exported from install.js:
 * JSONC parser, frontmatter converters, tool name mappers, and utilities.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

// Import pure functions from install.js
// This require() must NOT trigger the installer banner or prompts.
const {
  parseJsonc,
  convertClaudeToOpencodeFrontmatter,
  convertClaudeToGeminiAgent,
  convertClaudeToGeminiToml,
  convertToolName,
  convertGeminiToolName,
  stripSubTags,
  expandTilde,
  processAttribution,
  getDirName,
  getGlobalDir,
  buildHookCommand,
} = require('./install.js');

// Verify the import worked and we got real functions
describe('module import guard', () => {
  test('install.js exports pure functions without triggering installer', () => {
    assert.strictEqual(typeof parseJsonc, 'function', 'parseJsonc should be a function');
    assert.strictEqual(typeof convertClaudeToOpencodeFrontmatter, 'function', 'convertClaudeToOpencodeFrontmatter should be a function');
    assert.strictEqual(typeof convertClaudeToGeminiAgent, 'function', 'convertClaudeToGeminiAgent should be a function');
    assert.strictEqual(typeof convertClaudeToGeminiToml, 'function', 'convertClaudeToGeminiToml should be a function');
    assert.strictEqual(typeof convertToolName, 'function', 'convertToolName should be a function');
    assert.strictEqual(typeof convertGeminiToolName, 'function', 'convertGeminiToolName should be a function');
    assert.strictEqual(typeof stripSubTags, 'function', 'stripSubTags should be a function');
    assert.strictEqual(typeof expandTilde, 'function', 'expandTilde should be a function');
    assert.strictEqual(typeof processAttribution, 'function', 'processAttribution should be a function');
    assert.strictEqual(typeof getDirName, 'function', 'getDirName should be a function');
    assert.strictEqual(typeof getGlobalDir, 'function', 'getGlobalDir should be a function');
    assert.strictEqual(typeof buildHookCommand, 'function', 'buildHookCommand should be a function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseJsonc - JSONC parser edge case tests (TEST-03)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseJsonc', () => {
  test('parses plain JSON without comments', () => {
    const result = parseJsonc('{ "key": "value", "num": 42 }');
    assert.deepStrictEqual(result, { key: 'value', num: 42 });
  });

  test('strips single-line comments', () => {
    const input = '{ "key": "val" // this is a comment\n}';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { key: 'val' });
  });

  test('strips block comments', () => {
    const input = '{ /* comment */ "key": "val" }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { key: 'val' });
  });

  test('handles nested block comments (stops at first */)', () => {
    // JSONC block comments do not nest. The parser stops at the first */
    // Input: { "a": /* outer /* not nested */ "val" }
    // The comment starts at /* outer and ends at the first */
    const input = '{ "a": /* outer /* not nested */ "val" }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { a: 'val' });
  });

  test('preserves // inside strings (URL-like values)', () => {
    const input = '{ "url": "https://example.com" }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { url: 'https://example.com' });
  });

  test('handles escaped quotes inside strings', () => {
    const input = '{ "key": "value with \\"quotes\\"" }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { key: 'value with "quotes"' });
  });

  test('strips UTF-8 BOM prefix and parses', () => {
    const input = '\uFEFF{"key": "val"}';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { key: 'val' });
  });

  test('removes trailing comma before closing brace', () => {
    const input = '{ "a": 1, "b": 2, }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });

  test('removes trailing comma before closing bracket', () => {
    const input = '{ "arr": [1, 2, 3, ] }';
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { arr: [1, 2, 3] });
  });

  test('throws SyntaxError for malformed JSON after stripping', () => {
    assert.throws(
      () => parseJsonc('{ broken }'),
      SyntaxError,
      'should throw SyntaxError for malformed input'
    );
  });

  test('handles empty object string', () => {
    const result = parseJsonc('{}');
    assert.deepStrictEqual(result, {});
  });

  test('handles multi-line comments spanning lines', () => {
    const input = `{
  "a": 1,
  /* this comment
     spans multiple
     lines */
  "b": 2
}`;
    const result = parseJsonc(input);
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });
});
