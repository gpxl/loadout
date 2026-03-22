# loadout Agent Workflow

## Agents

loadout has three agents for automated workflows:

| Agent | Trigger | What it does |
|-------|---------|-------------|
| `code-quality` | After logic changes | Runs tests, checks coverage, lints, builds |
| `commit` | "commit", "push", "open a PR" | Commits, pushes branch, opens PR |
| `release` | "release", "cut a release", or after merging a PR | Evaluates if release needed, merges PR, tags, publishes |

## Post-Merge Release Check (CRITICAL)

After merging any PR to main, **always invoke the release agent** to evaluate
whether a release should be cut. Do not ask the user — just run it.

The release agent will:
- Check if there are `feat:` or `fix:` commits since the last tag
- If yes → cut a release automatically
- If no → report `RELEASE RESULT: SKIP` (no action needed)

This ensures releases happen promptly after meaningful changes land on main.

## Workflow Summary

```
code change → code-quality agent → commit agent (push + PR) → merge → release agent (auto-evaluate)
```

## Key Files

| File | Purpose |
|------|---------|
| src/index.ts | CLI entry point (Commander) |
| src/core/detect.ts | Project type and signal detection |
| src/core/recommend.ts | AI-powered recommendation pipeline |
| src/core/skills.ts | Skill install/remove/discover lifecycle |
| src/core/ai.ts | Claude AI integration (API + CLI backends) |
| src/core/registry.ts | skills.sh search API client |
| src/core/audit.ts | Security audit fetching |
| src/core/official.ts | Official org detection |
| src/commands/ | CLI command implementations |
| install.sh | One-time install + global linking |
