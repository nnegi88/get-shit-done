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

// ─────────────────────────────────────────────────────────────────────────────
// convertClaudeToOpencodeFrontmatter (TEST-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('convertClaudeToOpencodeFrontmatter', () => {
  test('converts allowed-tools array to tools object with true values', () => {
    const input = `---
description: Test command
allowed-tools:
  - Read
  - Write
  - Bash
---

Body content here.`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('tools:'), 'should have tools section');
    assert.ok(result.includes('  read: true'), 'Read -> read');
    assert.ok(result.includes('  write: true'), 'Write -> write');
    assert.ok(result.includes('  bash: true'), 'Bash -> bash');
  });

  test('maps special tool names correctly', () => {
    const input = `---
allowed-tools:
  - AskUserQuestion
  - SlashCommand
  - TodoWrite
---

Body.`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('  question: true'), 'AskUserQuestion -> question');
    assert.ok(result.includes('  skill: true'), 'SlashCommand -> skill');
    assert.ok(result.includes('  todowrite: true'), 'TodoWrite -> todowrite');
  });

  test('strips name: field', () => {
    const input = `---
name: My Command
description: A test command
---

Body.`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(!result.includes('name:'), 'name field should be removed');
    assert.ok(result.includes('description: A test command'), 'description kept');
  });

  test('converts color names to hex', () => {
    const input = `---
description: test
color: cyan
---

Body.`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('color: "#00FFFF"'), 'cyan -> #00FFFF');
  });

  test('preserves body content after frontmatter', () => {
    const input = `---
description: test
---

This is the body content.
It has multiple lines.`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('This is the body content.'), 'body preserved');
    assert.ok(result.includes('It has multiple lines.'), 'multi-line body preserved');
  });

  test('handles inline tools: comma-separated format', () => {
    const input = `---
description: test
tools: Read, Write, Bash
---

Body.`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('  read: true'), 'Read parsed from inline');
    assert.ok(result.includes('  write: true'), 'Write parsed from inline');
    assert.ok(result.includes('  bash: true'), 'Bash parsed from inline');
  });

  test('includes MCP tools correctly', () => {
    const input = `---
allowed-tools:
  - Read
  - mcp__my_server__my_tool
---

Body.`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('  mcp__my_server__my_tool: true'), 'MCP tool kept as-is');
  });

  test('replaces tool name references in body content', () => {
    const input = `---
description: test
---

Use AskUserQuestion to ask the user. Use SlashCommand for commands.
TodoWrite stores todos. Path is ~/.claude/foo.`;
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('Use question to ask'), 'AskUserQuestion replaced in body');
    assert.ok(result.includes('Use skill for commands'), 'SlashCommand replaced in body');
    assert.ok(result.includes('todowrite stores'), 'TodoWrite replaced in body');
    assert.ok(result.includes('~/.config/opencode/foo'), '~/.claude replaced in body');
  });

  test('content without frontmatter still gets tool name replacements', () => {
    const input = 'Use AskUserQuestion and /gsd:help for more info.';
    const result = convertClaudeToOpencodeFrontmatter(input);
    assert.ok(result.includes('question'), 'AskUserQuestion replaced');
    assert.ok(result.includes('/gsd-help'), '/gsd: replaced with /gsd-');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// convertClaudeToGeminiAgent (TEST-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('convertClaudeToGeminiAgent', () => {
  test('converts tools to YAML array with Gemini names', () => {
    const input = `---
description: Test agent
allowed-tools:
  - Read
  - Write
  - Bash
---

Agent body.`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(result.includes('tools:'), 'should have tools section');
    assert.ok(result.includes('  - read_file'), 'Read -> read_file');
    assert.ok(result.includes('  - write_file'), 'Write -> write_file');
    assert.ok(result.includes('  - run_shell_command'), 'Bash -> run_shell_command');
  });

  test('excludes MCP tools from Gemini output', () => {
    const input = `---
allowed-tools:
  - Read
  - mcp__zen__get_context
  - Write
---

Body.`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(!result.includes('mcp__'), 'MCP tools should be excluded');
    assert.ok(result.includes('  - read_file'), 'Read still included');
    assert.ok(result.includes('  - write_file'), 'Write still included');
  });

  test('excludes Task tool from Gemini output', () => {
    const input = `---
allowed-tools:
  - Read
  - Task
  - Bash
---

Body.`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(!result.includes('task'), 'Task should be excluded');
    assert.ok(result.includes('  - read_file'), 'Read still included');
    assert.ok(result.includes('  - run_shell_command'), 'Bash still included');
  });

  test('strips color: field', () => {
    const input = `---
description: Agent
color: cyan
allowed-tools:
  - Read
---

Body.`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(!result.includes('color:'), 'color field should be stripped');
    assert.ok(result.includes('description: Agent'), 'description kept');
  });

  test('preserves body content and strips sub tags', () => {
    const input = `---
description: test
---

Body with <sub>subscript</sub> text.`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(result.includes('*(subscript)*'), 'sub tags converted to italic');
    assert.ok(!result.includes('<sub>'), 'raw sub tags removed');
  });

  test('handles empty tools list', () => {
    const input = `---
description: Agent with no tools
---

Body.`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(!result.includes('tools:'), 'no tools section when empty');
    assert.ok(result.includes('description: Agent with no tools'), 'description kept');
  });

  test('handles inline tools: comma-separated', () => {
    const input = `---
description: test
tools: Read, Bash, Grep
---

Body.`;
    const result = convertClaudeToGeminiAgent(input);
    assert.ok(result.includes('  - read_file'), 'Read -> read_file');
    assert.ok(result.includes('  - run_shell_command'), 'Bash -> run_shell_command');
    assert.ok(result.includes('  - search_file_content'), 'Grep -> search_file_content');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// convertClaudeToGeminiToml (TEST-04)
// ─────────────────────────────────────────────────────────────────────────────

describe('convertClaudeToGeminiToml', () => {
  test('extracts description and body as TOML format', () => {
    const input = `---
description: Run all tests
---

Execute the test suite with coverage.`;
    const result = convertClaudeToGeminiToml(input);
    assert.ok(result.includes('description = "Run all tests"'), 'description in TOML');
    assert.ok(result.includes('prompt = "Execute the test suite with coverage."'), 'body as prompt');
  });

  test('handles multi-line body content', () => {
    const input = `---
description: Multi-line test
---

Line one.
Line two.
Line three.`;
    const result = convertClaudeToGeminiToml(input);
    assert.ok(result.includes('description = "Multi-line test"'), 'description extracted');
    // The body should be JSON-stringified (so newlines become \n)
    assert.ok(result.includes('prompt ='), 'has prompt field');
    assert.ok(result.includes('Line one.'), 'body content present');
  });

  test('handles description with special characters (quotes)', () => {
    const input = `---
description: Run "quoted" tests
---

Body.`;
    const result = convertClaudeToGeminiToml(input);
    // JSON.stringify escapes internal quotes
    assert.ok(result.includes('description = "Run \\"quoted\\" tests"'), 'quotes escaped in description');
  });

  test('content without frontmatter becomes prompt only', () => {
    const input = 'Just raw content, no frontmatter.';
    const result = convertClaudeToGeminiToml(input);
    assert.ok(result.startsWith('prompt = '), 'starts with prompt');
    assert.ok(result.includes('Just raw content'), 'content preserved');
    assert.ok(!result.includes('description ='), 'no description');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// convertToolName (Claude -> OpenCode)
// ─────────────────────────────────────────────────────────────────────────────

describe('convertToolName', () => {
  test('maps Claude tool names to OpenCode equivalents', () => {
    assert.strictEqual(convertToolName('AskUserQuestion'), 'question');
    assert.strictEqual(convertToolName('SlashCommand'), 'skill');
    assert.strictEqual(convertToolName('TodoWrite'), 'todowrite');
    assert.strictEqual(convertToolName('WebFetch'), 'webfetch');
    assert.strictEqual(convertToolName('WebSearch'), 'websearch');
  });

  test('returns lowercase for unmapped tools', () => {
    assert.strictEqual(convertToolName('Read'), 'read');
    assert.strictEqual(convertToolName('Write'), 'write');
    assert.strictEqual(convertToolName('Bash'), 'bash');
    assert.strictEqual(convertToolName('Grep'), 'grep');
  });

  test('preserves MCP tool prefix format', () => {
    assert.strictEqual(convertToolName('mcp__server__tool'), 'mcp__server__tool');
    assert.strictEqual(convertToolName('mcp__zen__get'), 'mcp__zen__get');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// convertGeminiToolName (Claude -> Gemini)
// ─────────────────────────────────────────────────────────────────────────────

describe('convertGeminiToolName', () => {
  test('maps Claude tool names to Gemini equivalents', () => {
    assert.strictEqual(convertGeminiToolName('Read'), 'read_file');
    assert.strictEqual(convertGeminiToolName('Write'), 'write_file');
    assert.strictEqual(convertGeminiToolName('Edit'), 'replace');
    assert.strictEqual(convertGeminiToolName('Bash'), 'run_shell_command');
    assert.strictEqual(convertGeminiToolName('Glob'), 'glob');
    assert.strictEqual(convertGeminiToolName('Grep'), 'search_file_content');
    assert.strictEqual(convertGeminiToolName('WebSearch'), 'google_web_search');
    assert.strictEqual(convertGeminiToolName('WebFetch'), 'web_fetch');
    assert.strictEqual(convertGeminiToolName('TodoWrite'), 'write_todos');
    assert.strictEqual(convertGeminiToolName('AskUserQuestion'), 'ask_user');
  });

  test('returns null for MCP tools (excluded)', () => {
    assert.strictEqual(convertGeminiToolName('mcp__server__tool'), null);
    assert.strictEqual(convertGeminiToolName('mcp__zen__get'), null);
  });

  test('returns null for Task tool (excluded)', () => {
    assert.strictEqual(convertGeminiToolName('Task'), null);
  });

  test('returns lowercase for unmapped tools', () => {
    assert.strictEqual(convertGeminiToolName('CustomTool'), 'customtool');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions: stripSubTags, expandTilde, getDirName, buildHookCommand,
//                    processAttribution, getGlobalDir
// ─────────────────────────────────────────────────────────────────────────────

describe('stripSubTags', () => {
  test('converts <sub>text</sub> to *(text)*', () => {
    assert.strictEqual(stripSubTags('Hello <sub>world</sub>!'), 'Hello *(world)*!');
  });

  test('handles multiple sub tags', () => {
    assert.strictEqual(
      stripSubTags('<sub>a</sub> and <sub>b</sub>'),
      '*(a)* and *(b)*'
    );
  });

  test('preserves content without sub tags', () => {
    assert.strictEqual(stripSubTags('No tags here.'), 'No tags here.');
  });
});

describe('expandTilde', () => {
  test('replaces ~ with home directory', () => {
    const result = expandTilde('~/Documents/foo');
    assert.strictEqual(result, path.join(os.homedir(), 'Documents/foo'));
  });

  test('returns non-tilde paths unchanged', () => {
    assert.strictEqual(expandTilde('/absolute/path'), '/absolute/path');
    assert.strictEqual(expandTilde('relative/path'), 'relative/path');
  });

  test('handles null/undefined input', () => {
    assert.strictEqual(expandTilde(null), null);
    assert.strictEqual(expandTilde(undefined), undefined);
  });
});

describe('getDirName', () => {
  test('returns .claude for claude runtime', () => {
    assert.strictEqual(getDirName('claude'), '.claude');
  });

  test('returns .opencode for opencode runtime', () => {
    assert.strictEqual(getDirName('opencode'), '.opencode');
  });

  test('returns .gemini for gemini runtime', () => {
    assert.strictEqual(getDirName('gemini'), '.gemini');
  });

  test('defaults to .claude for unknown runtime', () => {
    assert.strictEqual(getDirName('unknown'), '.claude');
  });
});

describe('buildHookCommand', () => {
  test('constructs correct hook command path', () => {
    const result = buildHookCommand('/home/user/.claude', 'gsd-statusline.js');
    assert.strictEqual(result, 'node "/home/user/.claude/hooks/gsd-statusline.js"');
  });

  test('normalizes backslashes to forward slashes', () => {
    const result = buildHookCommand('C:\\Users\\user\\.claude', 'gsd-statusline.js');
    assert.strictEqual(result, 'node "C:/Users/user/.claude/hooks/gsd-statusline.js"');
  });
});

describe('processAttribution', () => {
  test('removes Co-Authored-By line when attribution is null', () => {
    const content = 'Commit message\n\nCo-Authored-By: user@example.com';
    const result = processAttribution(content, null);
    assert.strictEqual(result, 'Commit message');
  });

  test('keeps content unchanged when attribution is undefined', () => {
    const content = 'Commit message\n\nCo-Authored-By: user@example.com';
    const result = processAttribution(content, undefined);
    assert.strictEqual(result, content);
  });

  test('replaces Co-Authored-By with custom attribution string', () => {
    const content = 'Commit message\n\nCo-Authored-By: original@example.com';
    const result = processAttribution(content, 'custom@example.com');
    assert.ok(result.includes('Co-Authored-By: custom@example.com'), 'attribution replaced');
    assert.ok(!result.includes('original@example.com'), 'original removed');
  });
});

describe('getGlobalDir', () => {
  test('returns ~/.claude for claude without explicit dir', () => {
    // Save and clear env vars
    const saved = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;

    const result = getGlobalDir('claude');
    assert.strictEqual(result, path.join(os.homedir(), '.claude'));

    // Restore
    if (saved !== undefined) process.env.CLAUDE_CONFIG_DIR = saved;
  });

  test('returns ~/.gemini for gemini without explicit dir', () => {
    const saved = process.env.GEMINI_CONFIG_DIR;
    delete process.env.GEMINI_CONFIG_DIR;

    const result = getGlobalDir('gemini');
    assert.strictEqual(result, path.join(os.homedir(), '.gemini'));

    if (saved !== undefined) process.env.GEMINI_CONFIG_DIR = saved;
  });

  test('uses explicit dir when provided for any runtime', () => {
    const result = getGlobalDir('claude', '/custom/path');
    assert.strictEqual(result, '/custom/path');
  });

  test('uses explicit dir for opencode when provided', () => {
    const result = getGlobalDir('opencode', '/custom/opencode');
    assert.strictEqual(result, '/custom/opencode');
  });
});
