# Security

## What loadout accesses

### Network

| Endpoint | Purpose |
|----------|---------|
| `skills.sh` API | Search and discover skills |
| `github.com` | Clone skill repositories via `git clone --depth 1` |

### File System

| Path | Access | Purpose |
|------|--------|---------|
| `.claude/skills/` (project) | Read/Write | Install and remove skills |
| `~/.claude/skills/` (global) | Read/Write | Global skill installation |
| `.claude/rules/skills.md` | Write | Auto-generated skill index |
| Project root | Read | Detect tech stack (package.json, config files) |

### AI Integration

The `scan` command sends project metadata to Claude for skill ranking:
- Project type, detected frameworks, and configuration file names
- Installed skill names
- **No source code is sent**

### Permissions

- loadout does **not** require `sudo` or elevated permissions
- Git clones use `--depth 1` to minimize downloaded data
- Temporary clone directories are cleaned up after installation

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Email the maintainer directly or use [GitHub Security Advisories](https://github.com/gpxl/loadout/security/advisories/new)
3. Include steps to reproduce and potential impact
4. Allow reasonable time for a fix before public disclosure
