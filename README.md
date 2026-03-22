# loadout

[![CI](https://github.com/gpxl/loadout/actions/workflows/ci.yml/badge.svg)](https://github.com/gpxl/loadout/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Discover and install skills from [skills.sh](https://skills.sh) for your projects. Analyzes your project type, recommends relevant skills, and installs them with one command.

**Resources:** [Changelog](CHANGELOG.md) | [Contributing](CONTRIBUTING.md) | [Security](SECURITY.md)

## Why loadout?

Claude Code becomes more effective with skills — specialized knowledge about
your frameworks and tools. But finding the right skills from the registry,
evaluating them, and installing them is manual work.

loadout automates the whole process: scan your project, identify your stack,
search the registry, rank by relevance, and install — one command.

**Before:** Search skills.sh → read descriptions → clone repos → copy directories → repeat.
**After:** `loadout scan` → select → done.

## Who it's for

- **Developers using Claude Code** who want to quickly set up project-specific skills
- **Teams** standardizing on a set of best-practice skills across projects
- **Anyone** who wants Claude Code to have deeper knowledge of their tech stack without manually searching for and installing skills

## What it does

1. **Scans** your project to detect the tech stack (Next.js, React, Python, Rust, Go, etc.)
2. **Recommends** skills from the skills.sh registry based on what it finds
3. **Installs** selected skills so Claude Code discovers them automatically

Skills are markdown-based instruction files that give Claude Code specialized knowledge about frameworks, tools, and best practices.

## Prerequisites

- **Node.js** 20+
- **pnpm** — `npm install -g pnpm`

## Installation

One-liner (clones to `~/.loadout/src`, builds, and links globally):

```bash
curl -fsSL https://raw.githubusercontent.com/gpxl/loadout/main/install.sh | bash
```

Or clone to a custom location:

```bash
git clone https://github.com/gpxl/loadout.git && cd loadout && bash install.sh
```

### What gets installed

| Item | Location | Purpose |
|------|----------|---------|
| `loadout` CLI | pnpm global bin | Main command-line tool |
| `loadout-awareness` skill | `~/.claude/skills/loadout-awareness/` | Auto-suggests `loadout scan` when project config changes |

### Verifying installation

```bash
loadout --version       # Should print the version
install.sh --check      # Verify dependencies only
```

## Commands

### `loadout scan [path]`

Analyze a project and get skill recommendations from skills.sh.

```bash
loadout scan                    # Scan current directory
loadout scan ~/projects/my-app  # Scan a specific project
loadout scan --json             # Output as JSON (no prompts, no install)
loadout scan --yes              # Auto-select all recommendations
```

Detects your tech stack, searches skills.sh for matching skills, and presents an interactive selection. Selected skills are installed automatically.

### `loadout search <query>`

Search the skills.sh registry.

```bash
loadout search react
loadout search "next.js" --limit 10
```

### `loadout install <source>`

Install skills from a GitHub repository.

```bash
loadout install vercel-labs/agent-skills              # Browse and select skills
loadout install vercel-labs/agent-skills --skill react # Install specific skill
loadout install vercel-labs/agent-skills --global      # Install to ~/.claude/skills/
loadout install vercel-labs/agent-skills -y            # Skip confirmation
```

### `loadout status [path]`

Show installed skills for a project.

```bash
loadout status                    # Current directory
loadout status ~/projects/my-app  # Specific project
```

### `loadout remove <skill>`

Remove an installed skill.

```bash
loadout remove react-best-practices
loadout remove react-best-practices --global  # Remove from global scope
```

## Detection

loadout detects the following project signals:

| Category | Detected |
|----------|----------|
| JS/TS Frameworks | Next.js, React, Vue, Svelte, Vite, Express, Fastify, Hono, tRPC |
| Data/State | TanStack Query, React Hook Form, Framer Motion, Prisma, Drizzle, Supabase |
| Styling | Tailwind, styled-components, Emotion |
| Testing | Vitest, Jest, Pytest |
| Infrastructure | TypeScript, Docker, Turborepo, Nx, pnpm workspaces, Lerna |
| Languages | Go, Rust, Python, Ruby, PHP, Java, Scala, Elixir, Swift, Zig, Deno |

For projects without explicit signals, loadout performs exploratory analysis — file extensions, import patterns, README content — to infer the stack.

## How it works

```
detect project  →  build context  →  AI analyze  →  search skills.sh (parallel)
    ↓                                                       ↓
identify type,        ←←←←←←←←←←←←←←←←←←←←←←←     deduplicate + filter
signals, deps                                              ↓
                                                    AI rank by relevance
                                                           ↓
                                                  interactive selection
                                                           ↓
                                              batch install + generate rules
```

1. **Detection** reads `package.json`, config files, and project structure to identify the tech stack
2. **AI analysis** (via Claude CLI or API) identifies technologies and generates targeted search queries
3. **Search** queries skills.sh in parallel and deduplicates results
4. **Ranking** uses Claude to tier skills as essential/recommended/optional with explanations
5. **Installation** clones repos with `--depth 1`, copies skill directories, and generates a `.claude/rules/skills.md` index

If AI is unavailable, falls back to static detection — no features are blocked.

## Updating

```bash
loadout update
```

## Uninstalling

```bash
# Remove global link
cd /path/to/loadout && pnpm unlink --global

# Remove the loadout-awareness skill
rm -rf ~/.claude/skills/loadout-awareness

# Remove the source (if installed via curl)
rm -rf ~/.loadout
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `loadout: command not found` | Add pnpm's global bin to PATH: `export PATH="$(pnpm -g bin):$PATH"` |
| `Node.js version too old` | Upgrade to 20+: `nvm install 20 && nvm use 20` |
| `pnpm not found` | Install: `npm install -g pnpm` |
| `AI analysis failed` | Install the Claude CLI or set `ANTHROPIC_API_KEY`. loadout falls back to static detection without AI. |
| `skills.sh search failed` | Check network connectivity. skills.sh API may be temporarily unavailable. |
| Skills not showing in Claude Code | Start a new Claude Code session. Skills are loaded at session start. |

## Development

```bash
pnpm install
pnpm dev       # Watch mode
pnpm build     # Production build
pnpm lint      # Type-check
pnpm test      # Run tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and conventions.

## Security

See [SECURITY.md](SECURITY.md) for details on network access, file system writes, and vulnerability reporting.

## License

[MIT](LICENSE)
