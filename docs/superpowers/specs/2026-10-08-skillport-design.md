# skillport — design

One CLI to see, check, sync and convert agent skills (`SKILL.md` folders) across
Claude Code, Codex, Gemini CLI and Cursor.

## Agents (user scope)

| id      | dirs                                                      | notes                          |
|---------|-----------------------------------------------------------|--------------------------------|
| claude  | `~/.claude/skills`                                        |                                |
| agents  | `~/.agents/skills`                                        | read by Codex and Gemini CLI   |
| codex   | `~/.codex/skills`                                         | legacy Codex location          |
| gemini  | `~/.gemini/skills`, `~/.gemini/extensions/*/skills` (ro)  | writes go to `~/.gemini/skills`|
| cursor  | `~/.cursor/skills`                                        |                                |

All of them use the same format: a folder holding `SKILL.md` with YAML
frontmatter (`name`, `description`). One parser covers every agent; an "adapter"
is just a row in the table above.

## Commands

- `list [--agent a] [--json]` — every skill, which agents have it, whether each
  copy is a symlink, and whether copies differ.
- `sync <from> <to> [--apply] [--force]` — copies skills missing from `<to>`.
  Dry run unless `--apply`. Differing copies are conflicts, skipped unless
  `--force`. A symlinked target is never touched.
- `convert <skill> --to <agent> | --out <dir> [--from a] [--force]` — copies one skill,
  normalizing frontmatter for the target.
- `lint [--agent a] [--json]` — frontmatter errors, name rules (Agent Skills
  spec: lowercase/digits/hyphens, ≤64, matches folder; description ≤1024),
  duplicate names, overlapping descriptions (likely trigger collisions), and
  the per-agent listing budget (Codex: 8000 chars of name+description).
  Exits 1 on errors.

## Conversion

Targets other than `claude` keep only Agent Skills spec keys (`name`,
`description`, `license`, `compatibility`, `metadata`, `allowed-tools`); dropped
keys are reported. Source symlinks are copied as real files.

## Stack

TypeScript, Node ≥20, one runtime dependency (`yaml`), `node:util` parseArgs,
`node:test`. Every function takes `home` so tests run against a temp dir.
