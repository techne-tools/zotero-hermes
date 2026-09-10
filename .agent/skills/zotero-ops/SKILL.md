---
name: zotero-ops
description: Operations, build workflows, syncing, versioning, and release management for Zotero projects. Load when running builds, preparing releases, or troubleshooting deployment.
---

# Zotero Operations Skill

This skill provides operational guidance for the Zotero Hermes plugin project.

## Purpose

To ensure smooth build processes, proper versioning, and reliable releases.

## Scope

This skill covers:

- Build and deployment workflows
- Performance optimization
- Quick command reference
- Release checklist
- Security and privacy practices
- Testing strategies
- Troubleshooting

## Build Workflow

### Development

```bash
# Start development server with hot reload
npm start

# Build for testing
npm run build

# Run tests
npm test
```

### Release

```bash
# Update version
npm version [major|minor|patch]

# Build production
npm run build

# Create release
npm run release
```

## Quick Reference

### Common Commands

| Command            | Purpose                    |
| ------------------ | -------------------------- |
| `npm start`        | Dev server with hot reload |
| `npm run build`    | Production build           |
| `npm test`         | Run test suite             |
| `npm run lint:fix` | Fix linting issues         |
| `npm run release`  | Create GitHub release      |

### File Locations

| File                  | Purpose             |
| --------------------- | ------------------- |
| `addon/manifest.json` | Plugin manifest     |
| `addon/content/`      | UI assets           |
| `src/modules/hermes/` | Core Hermes modules |
| `src/hooks.ts`        | Lifecycle hooks     |
| `.scaffold/build/`    | Build output        |

## Release Checklist

- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] All tests passing
- [ ] Linting clean
- [ ] README updated
- [ ] Manifest version updated
- [ ] Git tag created
- [ ] GitHub release drafted
- [ ] XPI file attached
- [ ] Update URL configured

## Testing Strategy

### Unit Tests

- Test individual modules in isolation
- Mock Zotero API calls
- Use vitest for test runner

### Integration Tests

- Test full chat flow
- Test note operations
- Test item context attachment

### Manual Testing

- Test in Zotero 9.0.0+ (current: 10.x, Mozilla 140 ESR)
- Test on Windows/macOS/Linux
- Test with large libraries (10,000+ items)

## Troubleshooting

### Common Issues

**Build fails with TypeScript errors**

- Check zotero-types version compatibility
- Verify tsconfig.json settings
- Run `npm run lint:fix`

**Plugin not loading in Zotero**

- Check manifest.json version compatibility
- Verify addon ID is unique
- Check browser console for errors

**ACP connection fails**

- Verify Hermes binary path
- Check permissions on binary
- Test with `hermes acp` manually

## Performance Optimization

### Bundle Size

- Use tree shaking
- Lazy load heavy components
- Minimize dependencies

### Runtime Performance

- Virtualize long lists
- Debounce input handlers
- Use requestAnimationFrame for animations

## Security Practices

- Never commit API keys
- Use Zotero's secure preference storage
- Validate all user inputs
- Sanitize AI-generated content before rendering
