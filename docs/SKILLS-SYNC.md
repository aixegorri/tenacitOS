# Skills Sync

TenacitOS displays OpenClaw skills in the **Skills Manager** (`/skills`).
This document explains how skill data flows from OpenClaw into TenacitOS.

## Architecture

```
OpenClaw CLI
  └─ openclaw skills list --json
        │
        ▼
scripts/sync-skills.mjs    ← run periodically or on demand
        │
        ▼
data/configured-skills.json   ← gitignored, runtime data
        │
        ▼
src/lib/skill-parser.ts    ← reads at request time, no CLI calls in prod
        │
        ▼
GET /api/skills            ← consumed by the UI
```

**Why this two-step approach?**

Calling `openclaw skills list --json` at runtime (on every `/api/skills` request)
creates latency and a hard dependency on the OpenClaw CLI being on PATH inside
the Next.js process. The sync-script pattern is the same used by `sync-activities.mjs`:
decouple data collection from serving.

## Setup

Run once after installing TenacitOS:

```bash
# Run an initial sync and register the OpenClaw cron
bash scripts/setup-skills-sync.sh

# Optional: change interval (default: every 6h) or agent
bash scripts/setup-skills-sync.sh --interval-hours 2 --agent agent-azpi
```

This will:
1. Run `sync-skills.mjs` immediately to populate `data/configured-skills.json`
2. Register an OpenClaw cron job visible in the TenacitOS `/cron` panel

## Manual sync

```bash
node scripts/sync-skills.mjs
```

Run this any time after installing or updating skills via `clawhub`.

## Schema: `data/configured-skills.json`

Auto-generated — do not edit manually.

| Field | Type | Description |
|---|---|---|
| `lastUpdated` | ISO timestamp | When the file was last written |
| `systemSkillsPath` | string | Absolute path to bundled skills |
| `managedSkillsDir` | string | Absolute path to managed skills |
| `skills[].name` | string | Skill identifier (from SKILL.md `name:`) |
| `skills[].location` | string | `"system"` for bundled, full path for managed |
| `skills[].source` | string | `"openclaw-bundled"` or `"openclaw-managed"` |
| `skills[].eligible` | boolean | Whether all requirements are met |
| `skills[].emoji` | string? | Optional display emoji |
| `skills[].homepage` | string? | Optional documentation URL |
| `skills[].missing.bins` | string[] | Binaries that need to be installed |
| `skills[].missing.env` | string[] | Env vars that need to be set |
| `skills[].missing.config` | string[] | Config keys that need to be set |

See `data/configured-skills.example.json` for an annotated example.

## Folder name vs skill name

OpenClaw skills can have an internal `name` (declared in `SKILL.md` front matter)
that differs from the folder name on disk. For example:

```
/root/.openclaw/skills/self-improving-agent/SKILL.md
  name: self-improvement   ← OpenClaw uses this name
```

`sync-skills.mjs` resolves this automatically by reading `SKILL.md` in each
managed-skills folder and storing the full resolved path in `location`.
`skill-parser.ts` does not need to perform any folder-name resolution.

## Gitignore

`data/configured-skills.json` is gitignored (runtime data).
`data/configured-skills.example.json` is committed (schema documentation).
