# OpenClaw Root Workspace Integration

Date: 2026-04-09

## Goal

Wire OpenClaw into the PPV root workspace on `avado` so it can act as a useful cross-project assistant without collapsing repo boundaries or drifting into live runtime folders.

## Decision

Set the default OpenClaw workspace to:

- `/home/eao168/PPV-Dev-Root`

Reasons:

- the root repo is already the governance and session-loader host
- it exposes the clean sibling repos through stable paths and symlinks
- it is the right place for cross-project planning, operator notes, and repo routing

## Local Workspace Files

OpenClaw workspace bootstrap files live at the root repo level:

- `SOUL.md`
- `TOOLS.md`
- `IDENTITY.md`
- `USER.md`

These give OpenClaw the PPV-specific operating stance, repo map, and operator context.

Volatile memory files are repo-ignored so the root repo does not churn during normal use.

## Safety Posture

- Keep the gateway on loopback by default and access it through VS Code forwarded port `18889`
- Treat `PPV-Dev-Root` as the cross-project control desk, not the implementation target for every task
- Route implementation into the correct clean repo and then follow that repo's local governance
- Avoid casual edits in live runtime folders such as `/home/eao168/lead-crawler` and `/home/eao168/ads-ops-job`

## Expected Use

From the dashboard, OpenClaw should now wake up with:

- root governance context
- the PPV repo map
- a clear understanding that `PPV-Operator-OS` owns operator/control-plane work
- the default `avado` safety convention of clean clones for development and runtime separation for production
