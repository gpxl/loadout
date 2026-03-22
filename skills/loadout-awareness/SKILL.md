---
name: loadout-awareness
description: >
  Proactively detects when project changes may warrant new Claude Code skills.
  Suggests loadout scan when new dependencies, frameworks, or infrastructure are added.
user-invocable: false
allowed-tools: Bash, Read, Glob
---

# Loadout Awareness

## When to Suggest Scanning

Suggest `loadout scan` when you observe:

| Trigger | Example |
|---------|---------|
| New deps in manifest | Added `prisma`, `drizzle`, `stripe` to package.json |
| New framework config | Created `next.config.ts`, `tailwind.config.ts`, `docker-compose.yml` |
| Major stack addition | Added testing framework, ORM, auth library |
| First session in project | No `.claude/rules/skills.md` exists yet |
| User asks about capabilities | "Can you help with X?" where X might have a skill |

## When NOT to Trigger

- Minor version bumps of existing deps
- File changes unrelated to tech stack (README, docs, assets)
- Mid-implementation focus (don't interrupt flow)
- Already ran scan this session

## Commands

| Command | Use When |
|---------|----------|
| `loadout status` | Check what's already installed (run first) |
| `loadout scan` | Detect project type and recommend new skills |
| `loadout scan --json` | Programmatic assessment (no prompts) |
| `loadout search <query>` | Targeted skill search |

## Decision Flow

1. Notice a trigger condition (new dep, new config, etc.)
2. Run `loadout status` to check current skills
3. If gaps likely exist, automatically run `loadout scan --json` to assess recommendations
4. Present the scan results to the user with a summary of what was found
5. Wait for user approval before installing any recommended skills
6. Only install skills the user explicitly accepts

**Key principle**: Scanning is automatic. Installation requires user acceptance.

## Relationship to find-skills

- **find-skills**: Reactive — user explicitly asks to find a skill
- **loadout-awareness**: Proactive — agent notices project changes and suggests scanning
