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
