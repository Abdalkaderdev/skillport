import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { stringify } from "yaml";
import type { Skill } from "./skills.ts";

export const SPEC_KEYS = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];

export type Action = "new" | "same" | "conflict" | "linked" | "overwrite";

export function render(skill: Skill, target: string): { text: string; dropped: string[] } {
  if (target === "claude" || skill.error) return { text: skill.raw, dropped: [] };
  const meta: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(skill.meta)) {
    if (SPEC_KEYS.includes(k)) meta[k] = v;
    else dropped.push(k);
  }
  if (!dropped.length) return { text: skill.raw, dropped };
  return { text: `---\n${stringify(meta).trimEnd()}\n---\n${skill.body}`, dropped };
}

export function plan(skill: Skill, destDir: string, target: string, force: boolean): Action {
  if (!existsSync(destDir)) return "new";
  if (lstatSync(destDir).isSymbolicLink()) return "linked";
  const file = join(destDir, "SKILL.md");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const lf = (s: string) => s.replace(/\r\n/g, "\n");
  if ([skill.raw, render(skill, target).text].some((t) => lf(t) === lf(current))) return "same";
  return force ? "overwrite" : "conflict";
}

export function copySkill(skill: Skill, destDir: string, target: string): string[] {
  const tmp = `${destDir}.skillport-tmp`;
  const src = realpathSync(skill.dir);
  mkdirSync(dirname(destDir), { recursive: true });
  const dest = join(realpathSync(dirname(destDir)), basename(destDir));
  if (dest === src || dest.startsWith(src + sep)) throw new Error(`cannot copy ${skill.slug} into its own folder: ${destDir}`);
  rmSync(tmp, { recursive: true, force: true });
  try {
    cpSync(src, tmp, { recursive: true, dereference: true });
    const { text, dropped } = render(skill, target);
    writeFileSync(join(tmp, "SKILL.md"), text);
    rmSync(destDir, { recursive: true, force: true });
    renameSync(tmp, destDir);
    return dropped;
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}
