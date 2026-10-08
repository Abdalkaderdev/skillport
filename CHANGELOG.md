# Changelog

## 0.1.1

- `sync` and `convert` copy a symlinked or junctioned source instead of crashing on Windows
- a failed overwrite no longer deletes the existing copy
- `list` no longer marks a copy converted by skillport as drifted
- `lint` no longer warns that a duplicate overlaps itself
- Codex budget warning says 8000 chars is the default, not a hard cap

## 0.1.0

- `list`, `lint`, `sync`, `convert` for Claude Code, `~/.agents` (Codex, Gemini CLI), legacy Codex, Gemini CLI and Cursor
