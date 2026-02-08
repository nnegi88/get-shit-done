# Phase 1: Test Safety Net - Context

**Gathered:** 2026-02-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture current behavior across all 90+ CLI commands and 3 installer runtimes in characterization tests before any code changes begin. This is the safety net that enables all subsequent refactoring phases. No production code changes — only test code is written.

</domain>

<decisions>
## Implementation Decisions

### Test Granularity
- Claude's discretion on per-command granularity — simple commands get one test, complex commands get multiple scenarios based on risk
- "Behavior captured" definition is flexible per command — observable contract (stdout, stderr, exit code) as baseline, with side-effect verification where commands modify files or state
- Fixture strategy is Claude's choice — realistic fixtures where useful, minimal where sufficient
- Edge-case-heavy modules (JSONC parser, frontmatter converter, phase numbering) get depth based on their risk profile

### Snapshot Strategy
- Comparison approach is Claude's choice — exact snapshots vs pattern assertions decided per test based on output stability
- Non-deterministic output handling (timestamps, paths) determined per case
- Snapshot update workflow designed by Claude
- Snapshot file location determined by what fits the project structure

### Runtime Coverage
- Testing approach for 3 runtimes (Claude Code, OpenCode, Gemini CLI) is Claude's choice — mock vs real installs based on what's practical
- Install vs upgrade path coverage determined by risk analysis
- Content verification depth for generated config files chosen based on correctness needs
- Cross-platform coverage strategy (current platform only vs mocked) at Claude's discretion

### Test Infrastructure
- Test runner choice evaluated against zero-dependency constraint (existing node:test is the starting point)
- File organization fits existing project layout
- Subset running support determined by expected test count and speed
- Coverage metrics included only if useful for Phase 1's behavior-capture goal

### Claude's Discretion
All four areas were discussed and the user explicitly delegated implementation decisions to Claude across the board. Claude has full flexibility on:
- Test granularity and depth per command/module
- Snapshot comparison strategy and file layout
- Runtime testing approach and platform coverage
- Test infrastructure choices and organization

The constraint is the phase goal: every existing behavior must be captured in tests so subsequent phases can refactor with confidence.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The user trusts Claude to make the right technical decisions within the phase boundary.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-test-safety-net*
*Context gathered: 2026-02-08*
