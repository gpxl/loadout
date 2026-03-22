# Contributing to loadout

Thanks for your interest in contributing! This guide covers the development workflow and conventions.

## Prerequisites

- **Node.js** 20+
- **pnpm** — `npm install -g pnpm`
- **git**

## Getting Started

```bash
git clone https://github.com/gpxl/loadout.git
cd loadout
pnpm install
pnpm dev       # Watch mode (rebuilds on change)
```

To test the CLI locally:

```bash
pnpm build && pnpm link --global
loadout --help
```

## Development Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Watch mode (rebuilds on change) |
| `pnpm build` | Production build (tsup) |
| `pnpm lint` | Type-check (tsc --noEmit) |
| `pnpm test` | Run unit tests (vitest) |
| `pnpm test:watch` | Watch mode for tests |

## Branch Naming

Use a prefix that matches the change type:

| Prefix | Use |
|--------|-----|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Maintenance, deps, tooling |
| `docs/` | Documentation |
| `refactor/` | Code restructuring |
| `test/` | Test-only changes |

Example: `feat/search-filters`, `fix/scan-empty-project`

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

<optional body — explain why, not what>
```

Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `security`

Rules:
- Subject line: imperative mood, lowercase, no period, max 72 chars
- Body: wrap at 80 chars

## Testing

- Write tests before implementing (TDD)
- Tests live alongside source: `tests/core/`, `tests/commands/`
- Run `pnpm test` before submitting

## Pull Request Checklist

- [ ] `pnpm lint` passes (no type errors)
- [ ] `pnpm test` passes (all tests green)
- [ ] `pnpm build` succeeds
- [ ] Commit messages follow Conventional Commits
- [ ] New features include tests
- [ ] CHANGELOG.md updated under `[Unreleased]`

## Code Style

- TypeScript strict mode
- Named exports
- Explicit types, no `any`
- ESM format
