# Technology Stack

**Analysis Date:** 2026-02-08

## Languages

**Primary:**
- JavaScript - Node.js runtime, used for CLI, installer, hooks, build scripts
- Markdown - Agent/command definitions, documentation, templates, workflows

**Secondary:**
- YAML - Frontmatter in markdown files for metadata/configuration
- JSON - Configuration files, package manifests, state management

## Runtime

**Environment:**
- Node.js >= 16.7.0

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- None - Pure Node.js, no framework dependencies

**Build/Dev:**
- esbuild ^0.24.0 - Build hook files bundling (hooks/dist generation)

**Specialized Tools:**
- URLSearchParams (built-in) - Query parameter building for Brave Search API
- child_process - Process spawning for background hooks and shell commands
- fs/path - File system and path operations (core to all operations)
- os - OS-level operations (home directory detection, platform detection)

## Key Dependencies

**Critical:**
- None listed in package.json dependencies

**DevDependencies:**
- esbuild ^0.24.0 - Hook bundling during build phase

## Configuration

**Environment:**
- `BRAVE_API_KEY` - Optional env var for Brave Search API integration (fallback check: `~/.brave-search-api-key`)
- `CLAUDE_CONFIG_DIR` - Override Claude Code config directory (fallback: `~/.claude`)
- `GEMINI_CONFIG_DIR` - Override Gemini CLI config directory (fallback: `~/.gemini`)
- `OPENCODE_CONFIG_DIR` - Override OpenCode config directory (fallback: XDG/`~/.config/opencode`)
- `OPENCODE_CONFIG` - Path to specific OpenCode config file
- `XDG_CONFIG_HOME` - Linux XDG Base Directory for OpenCode

**Build:**
- `scripts/build-hooks.js` - Copies hooks to `hooks/dist/` during `npm run build:hooks`
- Executed during `prepublishOnly` npm lifecycle

## Configuration Files

**Installation/Setup:**
- `bin/install.js` - Main installer (1,740 lines), handles global/local installation for Claude Code, OpenCode, and Gemini CLI
- `get-shit-done/templates/config.json` - Default GSD configuration template

**Hooks:**
- `hooks/gsd-check-update.js` - Background update checker, spawns detached process
- `hooks/gsd-statusline.js` - Status line display hook

## Platform Requirements

**Development:**
- Node.js >= 16.7.0
- npm (comes with Node.js)
- Supports Mac, Windows, and Linux

**Production:**
- Installation to user config directories:
  - Claude Code: `~/.claude/` (or `CLAUDE_CONFIG_DIR`)
  - OpenCode: `~/.config/opencode/` (or `OPENCODE_CONFIG_DIR`)
  - Gemini CLI: `~/.gemini/` (or `GEMINI_CONFIG_DIR`)
- Requires git for commit operations
- Windows: Special handling for process detachment and path normalization

## Special Installation Features

**Multi-Runtime Support:**
- Single installer supports Claude Code, OpenCode, and Gemini CLI
- Converts agent/command frontmatter between runtime formats:
  - `allowed-tools:` (Claude) → `tools:` (OpenCode/Gemini)
  - Color names → Hex codes (for OpenCode compatibility)
  - Markdown (Claude/Gemini) → TOML (Gemini commands)

**Path Management:**
- Automatic tilde (`~`) expansion in config paths
- Cross-platform path handling (Windows backslash normalization)
- Forward-slash paths for Node.js compatibility

**JSONC Support:**
- Lightweight JSONC parser in installer for OpenCode's comment-supporting config
- Handles BOM, single/block comments, trailing commas

**Local Patch Preservation:**
- File manifest generation with SHA256 hashes post-install
- Backs up user-modified GSD files to `gsd-local-patches/` before updates
- Supports `/gsd:reapply-patches` workflow for restoration

---

*Stack analysis: 2026-02-08*
