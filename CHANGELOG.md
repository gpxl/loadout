# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-03-22

### Added
- `update` command — self-update by re-running install.sh from the repo root
- Persist scan metadata and add staleness detection to status command

### Fixed
- Configure git identity in CI for test suite

## [0.1.0] - 2026-03-21

### Added
- `scan` command — detect project tech stack and recommend skills from skills.sh
- `search` command — search the skills.sh registry by keyword
- `install` command — install skills from GitHub repositories with batch support
- `status` command — show installed skills (project + global scope)
- `remove` command — remove installed skills with confirmation
- AI-powered recommendation ranking with relevance tiers (essential/recommended/optional)
- Official skill detection via skills.sh organization registry
- Audit risk integration for installed skills
- Interactive skill selection with tiered grouping and double-ESC exit
- `--json` output mode for `scan` command
- `--global` flag for installing/removing skills at `~/.claude/skills/`
- Auto-generated `.claude/rules/skills.md` after installation
- Fuzzy skill name matching during installation
- Deep nested skill discovery (up to 5 levels)
- Project detection for Next.js, React, Vue, Svelte, TypeScript, Tailwind, Prisma, Drizzle, Supabase, Turborepo, Docker, Go, Rust, Python
