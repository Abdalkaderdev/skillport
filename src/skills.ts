import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface Agent {
  id: string;
  label: string;
  dirs: string[];
}

export const AGENTS: Agent[] = [
  { id: "claude", label: "Claude Code", dirs: [".claude/skills"] },
  { id: "agents", label: "~/.agents (Codex, Gemini)", dirs: [".agents/skills"] },
  { id: "codex", label: "Codex (legacy)", dirs: [".codex/skills"] },
  { id: "gemini", label: "Gemini CLI", dirs: [".gemini/skills", ".gemini/extensions/*/skills"] },
  { id: "cursor", label: "Cursor", dirs: [".cursor/skills"] },
];

export function getAgent(id: string): Agent {
  const agent = AGENTS.find((a) => a.id === id);
  if (!agent) throw new Error(`unknown agent "${id}" (one of: ${AGENTS.map((a) => a.id).join(", ")})`);
  return agent;
}

export interface Skill {
  agent: string;
  slug: string;
  dir: string;
  link: boolean;
  meta: Record<string, unknown>;
  body: string;
  raw: string;
  error?: string;
}

export function parseSkillMd(raw: string): { meta: Record<string, unknown>; body: string; error?: string } {
  const m = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return { meta: {}, body: raw, error: "missing YAML frontmatter" };
  const body = raw.slice(m[0].length);
  try {
    const meta = parse(m[1]);
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
      return { meta: {}, body, error: "frontmatter is not a mapping" };
    }
    return { meta, body };
  } catch (e) {
    return { meta: {}, body, error: `invalid YAML: ${(e as Error).message.split("\n")[0]}` };
  }
}

function expand(home: string, pattern: string): string[] {
  let paths = [home];
  for (const seg of pattern.split("/")) {
    paths = paths.flatMap((p) => {
      if (seg !== "*") return [join(p, seg)];
      if (!existsSync(p)) return [];
      return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(p, d.name));
    });
  }
  return paths.filter((p) => existsSync(p));
}

export function scanAgent(home: string, agent: Agent): Skill[] {
  const skills: Skill[] = [];
  for (const root of agent.dirs.flatMap((d) => expand(home, d))) {
    for (const slug of readdirSync(root)) {
      const dir = join(root, slug);
      const file = join(dir, "SKILL.md");
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, "utf8");
      skills.push({ agent: agent.id, slug, dir, link: lstatSync(dir).isSymbolicLink(), raw, ...parseSkillMd(raw) });
    }
  }
  return skills;
}

export function scanAll(home: string, agents: Agent[] = AGENTS): Skill[] {
  return agents.flatMap((a) => scanAgent(home, a));
}

export function skillName(s: Skill): string {
  return typeof s.meta.name === "string" ? s.meta.name : s.slug;
}

export function description(s: Skill): string {
  return typeof s.meta.description === "string" ? s.meta.description : "";
}
