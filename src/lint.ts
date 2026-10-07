import { description, skillName, type Skill } from "./skills.ts";

export interface Issue {
  level: "error" | "warn";
  agent: string;
  skill: string;
  message: string;
}

export const CODEX_LIST_BUDGET = 8000;
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

export function lint(skills: Skill[], overlapThreshold = 0.5): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], s: Skill, message: string) =>
    issues.push({ level, agent: s.agent, skill: s.slug, message });

  for (const s of skills) {
    if (s.error) {
      add("error", s, s.error);
      continue;
    }
    const name = s.meta.name;
    const desc = s.meta.description;
    if (typeof name !== "string" || !name) add("error", s, "missing name");
    else {
      if (!NAME_RE.test(name) || name.length > 64) add("warn", s, `name "${name}" breaks the spec (lowercase, digits, single hyphens, max 64)`);
      if (name !== s.slug) add("warn", s, `name "${name}" does not match folder "${s.slug}"`);
    }
    if (typeof desc !== "string" || !desc.trim()) add("error", s, "missing description");
    else if (desc.length > 1024) add("warn", s, `description is ${desc.length} chars (spec max 1024)`);
  }

  const byAgent = Map.groupBy(skills, (s) => s.agent);
  for (const [agent, list] of byAgent) {
    for (const [name, dupes] of Map.groupBy(list, skillName)) {
      if (dupes.length > 1) add("error", dupes[0], `name "${name}" used ${dupes.length} times: ${dupes.map((d) => d.dir).join(", ")}`);
    }

    const sets = list.map((s) => words(description(s)));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const score = similarity(sets[i], sets[j]);
        if (score >= overlapThreshold) {
          add("warn", list[i], `description overlaps "${list[j].slug}" (${Math.round(score * 100)}%), they may trigger on the same requests`);
        }
      }
    }

    const listChars = list.reduce((n, s) => n + skillName(s).length + description(s).length, 0);
    if (listChars > CODEX_LIST_BUDGET && agent === "agents") {
      issues.push({
        level: "warn",
        agent,
        skill: "*",
        message: `${list.length} skills use ${listChars} chars of name+description; Codex lists at most ~${CODEX_LIST_BUDGET} and will shorten or drop some`,
      });
    }
  }
  return issues;
}

export function heaviest(skills: Skill[], n = 10): { skill: Skill; tokens: number }[] {
  const unique = [...new Map(skills.map((s) => [s.slug, s])).values()];
  return unique
    .map((skill) => ({ skill, tokens: Math.ceil(skill.raw.length / 4) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, n);
}
