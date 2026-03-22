# loadout Commands Reference

Quick reference for all development commands.

## Development

```bash
# Watch mode (rebuilds on change)
pnpm dev

# Production build (tsup)
pnpm build

# Type-check without emitting (tsc --noEmit)
pnpm lint
```

## Testing

```bash
# Run full test suite
pnpm test

# Watch mode (re-runs on change)
pnpm test:watch

# Single file
pnpm test tests/core/profile.test.ts

# Pattern match
pnpm test -- --reporter=verbose profile

# Coverage
pnpm test -- --coverage
```

## Running from Source

```bash
# After build
node dist/index.js <command>

# Global link for development
pnpm link --global
loadout <command>
```

## Build Verification

```bash
# Full check (run before completing any change)
pnpm lint && pnpm test && pnpm build
```
