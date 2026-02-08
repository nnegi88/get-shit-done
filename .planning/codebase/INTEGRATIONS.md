# External Integrations

**Analysis Date:** 2026-02-08

## APIs & External Services

**Search:**
- Brave Search API - Web search capability for researchers
  - SDK/Client: Built-in fetch (native Node.js)
  - Auth: `BRAVE_API_KEY` environment variable
  - Endpoint: `https://api.search.brave.com/res/v1/web/search`
  - Configuration: Endpoint in `get-shit-done/bin/gsd-tools.js` cmdWebsearch (line 2029)
  - Fallback: If no API key set, agents fall back to built-in WebSearch tool

**Package Registry:**
- npm registry - Version checking and package distribution
  - Used in: `hooks/gsd-check-update.js` (line 45)
  - Command: `npm view get-shit-done-cc version`
  - Purpose: Background update availability check

## Data Storage

**Databases:**
- Not used - GSD is a CLI orchestration system, not a data application

**File Storage:**
- Local filesystem only - All files written to user's configuration directories and project `.planning/`
- Locations managed per runtime:
  - Claude Code: `~/.claude/`
  - OpenCode: `~/.config/opencode/`
  - Gemini: `~/.gemini/`

**Caching:**
- Local filesystem cache only
  - Update check cache: `~/.claude/cache/gsd-update-check.json`
  - File manifests: `.claude/gsd-file-manifest.json`, `.opencode/gsd-file-manifest.json`, `.gemini/gsd-file-manifest.json`
  - Patch backups: `gsd-local-patches/` directory within config dir

## Authentication & Identity

**Auth Provider:**
- None for GSD itself - GSD relies on underlying runtime authentication (Claude Code, OpenCode, Gemini)
- External API auth: Brave Search uses API key authentication
  - Implementation: Header-based token in X-Subscription-Token header (line 2034, gsd-tools.js)

## Monitoring & Observability

**Error Tracking:**
- None - GSD logs to console and STATE.md files within project

**Logs:**
- Markdown files in `.planning/` directory
  - `STATE.md` - Execution state and decision tracking
  - `SUMMARY.md` files - Plan execution summaries
  - `CHANGELOG.md` - GSD version history

**Update Notifications:**
- Hook-based check via `gsd-check-update.js`
  - Runs in background at SessionStart
  - Writes result to cache file
  - Shown in status line if update available

## CI/CD & Deployment

**Hosting:**
- npm registry (npmjs.com) - Package distribution
  - Published as `get-shit-done-cc` package

**CI Pipeline:**
- GitHub Actions (referenced in `.github/` directory)
- Pre-publish hook: `npm run build:hooks` runs before publication

**Installation Method:**
- `npx get-shit-done-cc` - Direct npm package execution
- Supports flag-based configuration (`--global`, `--local`, `--claude`, `--opencode`, `--gemini`, etc.)

## Environment Configuration

**Required env vars:**
- None - All optional for base functionality

**Optional env vars:**
- `BRAVE_API_KEY` - Enable Brave Search integration (silent fallback if not set)
- `CLAUDE_CONFIG_DIR` - Override Claude Code config location
- `GEMINI_CONFIG_DIR` - Override Gemini CLI config location
- `OPENCODE_CONFIG_DIR` - Override OpenCode config location
- `OPENCODE_CONFIG` - Path to OpenCode config file
- `XDG_CONFIG_HOME` - Linux XDG Base Directory (for OpenCode)

**Secrets location:**
- Brave API key can be stored as:
  1. Environment variable: `BRAVE_API_KEY`
  2. File: `~/.brave-search-api-key` (checked as fallback)
  3. Never committed - checked in `bin/gsd-tools.js` line 591-595

## Webhooks & Callbacks

**Incoming:**
- None - GSD is not a server

**Outgoing:**
- Hook commands to Claude Code/OpenCode/Gemini
  - SessionStart hook: Calls `gsd-check-update.js` for background update checks
  - Statusline hook: Calls `gsd-statusline.js` for display in editor
  - Commands: Invokes agent definitions (gsd-executor, gsd-planner, etc.)

## Runtime Interop

**Claude Code:**
- Installation path: `~/.claude/` (or `CLAUDE_CONFIG_DIR`)
- Agents installed to: `~/.claude/agents/`
- Commands installed to: `~/.claude/commands/gsd/`
- Hooks registered in: `~/.claude/settings.json` (SessionStart, statusLine)
- Reference docs: `~/.claude/get-shit-done/`

**OpenCode:**
- Installation path: `~/.config/opencode/` (or `OPENCODE_CONFIG_DIR`)
- Commands installed to: `~/.config/opencode/command/` (flattened)
- Agents installed to: `~/.config/opencode/agents/`
- Permissions configured in: `~/.config/opencode/opencode.json`
- Frontmatter converted: `tools:` object format instead of array

**Gemini CLI:**
- Installation path: `~/.gemini/` (or `GEMINI_CONFIG_DIR`)
- Agents installed to: `~/.gemini/agents/`
- Commands converted to TOML format and installed to: `~/.gemini/commands/gsd/`
- Experimental agents enabled in: `~/.gemini/settings.json`
- Tool names converted to snake_case (e.g., `Read` → `read_file`)

## Context System (MCP)

**Context7 MCP:**
- Tool references in agents: `mcp__context7__*` (library documentation querying)
- Used in: `gsd-project-researcher.md` for authoritative library info
- Usage: Resolve library IDs, query official documentation
- Never filtered out or excluded by conversion (unlike WebSearch/Task tools)

---

*Integration audit: 2026-02-08*
