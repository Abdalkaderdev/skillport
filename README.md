# skillport

[![CI](https://github.com/Abdalkaderdev/skillport/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdalkaderdev/skillport/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/skillport)](https://www.npmjs.com/package/skillport)

See, lint, sync and convert agent skills across Claude Code, Codex, Gemini CLI and Cursor.

All four agents read the same `SKILL.md` folder format, but each keeps its own directory. After a few installs you end up with hundreds of skills, copies that drifted apart, broken frontmatter nobody noticed, and more descriptions than the agent can fit in its prompt. skillport shows you what you have and fixes it.

```sh
npx skillport lint
```

## Commands

### `list`

Every skill, which agents have it, and whether copies drifted.

```
$ npx skillport list
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
$ npx skillport lint
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
$ npx skillport sync claude cursor
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
npx skillport convert frontend-design --to cursor
npx skillport convert frontend-design --out ./my-repo/.agents/skills
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
npx skillport <command>
npm i -g skillport
```

## Development

```sh
npm install
npm test
npm run build
node src/bin.ts list
```

## License

MIT
