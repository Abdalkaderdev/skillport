# skillport

[![CI](https://github.com/Abdalkaderdev/skillport/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdalkaderdev/skillport/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@abdalkaderdev/skillport)](https://www.npmjs.com/package/@abdalkaderdev/skillport)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

See, lint, sync and convert agent skills across Claude Code, Codex, Gemini CLI and Cursor.

```sh
npx @abdalkaderdev/skillport lint
```

## Why

All four agents read the same `SKILL.md` folder format, but each keeps its own directory. After a few installs you have hundreds of skills spread across `~/.claude`, `~/.agents`, `~/.gemini` and `~/.cursor`, and problems you can't see:

- copies of the same skill that drifted apart
- frontmatter that fails to parse, so the agent silently ignores the skill
- two skills with near-identical descriptions competing for the same request
- more skill descriptions than the agent can fit in its prompt; Codex caps its skill list at about 8000 characters and drops the rest

skillport reads every agent's skills in one pass, reports these, and copies skills between agents without clobbering anything.

## Features

- One view of every skill across five locations, with symlinks and drift marked
- Spec checks against the [Agent Skills specification](https://agentskills.io/specification)
- Trigger-overlap detection and per-skill token cost
- Safe sync: dry run by default, conflicts skipped, symlinks untouched
- Format conversion that strips Claude-only frontmatter for other agents
- JSON output and CI-friendly exit codes
- One runtime dependency, no config file

## Quick start

```sh
npx @abdalkaderdev/skillport list
npx @abdalkaderdev/skillport lint
npx @abdalkaderdev/skillport sync claude cursor
npx @abdalkaderdev/skillport sync claude cursor --apply
```

## Commands

### `list`

Every skill, which agents have it, and whether copies drifted.

```
$ npx @abdalkaderdev/skillport list
name                   claude agents gemini cursor notes
3d-web-experience      link   yes    -      -
cloudflare             yes    -      yes    yes
writing-plans          -      -      yes    -
...

405 skills. claude: 385, agents: 218, gemini: 46, cursor: 32
```

`link` means the folder is a symlink. Filter with `--agent <id>`, get machine output with `--json`.

### `lint`

```
$ npx @abdalkaderdev/skillport lint
error  claude/directing-stickman-videos  invalid YAML: Nested mappings are not allowed in compact mappings
warn   claude/ckm-brand  name "ckm:brand" does not match folder "ckm-brand"
warn   claude/sentry-react-sdk  description overlaps "sentry-svelte-sdk" (54%), they may trigger on the same requests
warn   agents/*  218 skills use 77259 chars of name+description; Codex lists at most ~8000 and will shorten or drop some

Heaviest skills (approx tokens when loaded):
   22083  claude/design-taste-frontend
   16340  claude/talking-head-recut
```

Checks:

- frontmatter parses and has `name` and `description`
- `name` follows the [Agent Skills spec](https://agentskills.io/specification): lowercase, digits, single hyphens, max 64 chars, matches the folder
- `description` is at most 1024 chars
- no two skills in one agent share a name
- descriptions that overlap enough to fire on the same request
- total listing size against Codex's skill list budget

Exits 1 when there are errors, so it works in CI and pre-commit hooks.

### `sync <from> <to>`

Copy skills one agent has and another doesn't.

```
$ npx @abdalkaderdev/skillport sync claude cursor
new        3d-web-experience
new        academic-researcher
...
new        web-design-guidelines

353 new, 0 overwrite, 0 conflicts (use --force), 0 symlinked (left alone), 32 already in sync
Dry run. Re-run with --apply to copy.
```

- dry run unless `--apply`
- a skill that exists in the target with different content is a conflict and is skipped unless `--force`
- symlinked targets are never touched
- symlinked sources are copied as real files

### `convert <skill>`

Copy one skill into another agent, or export it anywhere.

```sh
npx @abdalkaderdev/skillport convert frontend-design --to cursor
npx @abdalkaderdev/skillport convert frontend-design --out ./my-repo/.agents/skills
```

Claude Code supports extra frontmatter keys (`disable-model-invocation`, `argument-hint`, `model`, ...) the other agents don't. When converting to anything but `claude`, skillport keeps only spec keys (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`) and prints what it dropped.

## Agents

| id       | reads                                                   | writes to          |
|----------|---------------------------------------------------------|--------------------|
| `claude` | `~/.claude/skills`                                      | same               |
| `agents` | `~/.agents/skills` (used by Codex and Gemini CLI)       | same               |
| `codex`  | `~/.codex/skills` (older Codex versions)                | same               |
| `gemini` | `~/.gemini/skills`, `~/.gemini/extensions/*/skills`     | `~/.gemini/skills` |
| `cursor` | `~/.cursor/skills`                                      | same               |

Only user-level skills for now. Plugin-bundled skills are not scanned.

## Install

Requires Node 22+.

```sh
npx @abdalkaderdev/skillport <command>
npm i -g @abdalkaderdev/skillport
skillport <command>
```

## How it works

Each agent is a row in a table of directories (`src/skills.ts`). skillport scans those directories for folders containing `SKILL.md`, parses the YAML frontmatter, and runs every command against that one list. Adding an agent means adding a row.

## FAQ

**Does it modify anything without asking?**
No. `list`, `lint` and `sync` without `--apply` are read-only. `convert` writes one folder and refuses to overwrite a different copy without `--force`.

**My `~/.claude/skills` entries are symlinks into `~/.agents/skills`. Will sync break them?**
No. Symlinked targets are reported as `linked` and skipped, even with `--force`.

**Why does lint warn about Codex when I mostly use Claude Code?**
The warning is on `~/.agents/skills`, which Codex and Gemini CLI read. If you don't use them, ignore it or run `lint --agent claude`.

**Is the overlap check accurate?**
It compares description word sets (Jaccard similarity, threshold 0.5). It catches near-duplicates like per-framework variants of the same skill. Treat it as a hint.

**Where are project-level skills (`.claude/skills` in a repo)?**
Not scanned yet. See roadmap.

## Roadmap

- project-level skill directories
- skills bundled inside Claude Code plugins
- `lint --fix` for name and frontmatter issues
- `diff <skill>` between two agents' copies
- install skills from a GitHub repo

## Contributing

Issues and PRs are welcome. For a new agent or directory, include where the agent documents it.

```sh
git clone https://github.com/Abdalkaderdev/skillport
cd skillport
npm install
npm test
node src/bin.ts list
```

Tests run against a temporary home directory and never touch your real skills.

## License

[MIT](LICENSE)

## Author

Abdalkader Alhamoud · [abdalkader.dev](https://abdalkader.dev) · [@Abdalkaderdev](https://github.com/Abdalkaderdev)
