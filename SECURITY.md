# Security Policy

## Reporting a Vulnerability

If you discover a security issue in this project, please report it responsibly:

- **Report to:** [GitHub Issues](https://github.com/mcp-tool-shop-org/brand/issues) (for non-sensitive issues)
- **Response time:** We aim to acknowledge reports within 48 hours

## Scope

This is a brand asset management tool. Its threat model covers:

- **Integrity verification** — SHA-256 manifest detects tampered or corrupted logos
- **Supply chain** — CI verifies manifest on every push; drift fails the build
- **README migration safety** — dry-run mode, multi-gate regex filtering, badge collision guards

## What This Project Does NOT Do

- No network requests (all operations are local filesystem)
- No data collection or telemetry
- No code execution from logo files
- No secrets or credentials in the codebase

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |
