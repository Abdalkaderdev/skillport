import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { copySkill, plan, render, type Action } from "./copy.ts";
import { heaviest, lint } from "./lint.ts";
import { AGENTS, getAgent, scanAgent, scanAll, skillName, type Skill } from "./skills.ts";

const HELP = `skillport - see, check, sync and convert agent skills

Usage:
  skillport list [--agent <id>] [--json]
  skillport lint [--agent <id>] [--json]
  skillport sync <from> <to> [--apply] [--force]
  skillport convert <skill> (--to <id> | --out <dir>) [--from <id>] [--force]

Agents: ${AGENTS.map((a) => `${a.id} (${a.label})`).join(", ")}
`;

export function run(argv: string[], home = homedir(), out = console.log): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      agent: { type: "string" },
      json: { type: "boolean" },
      apply: { type: "boolean" },
      force: { type: "boolean" },
      to: { type: "string" },
      from: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const [cmd, ...args] = positionals;
  const agents = values.agent ? [getAgent(values.agent)] : AGENTS;

  if (values.version) {
    out(createRequire(import.meta.url)("../package.json").version);
    return 0;
  }

  switch (cmd) {
    case "list": {
      const skills = scanAll(home, agents);
      if (values.json) {
        out(JSON.stringify(skills.map(({ agent, slug, dir, link, error }) => ({ agent, name: slug, dir, link, error })), null, 2));
        return 0;
      }
      const present = agents.filter((a) => skills.some((s) => s.agent === a.id));
      const byName = Map.groupBy(skills, (s) => s.slug);
      const width = Math.max(4, ...[...byName.keys()].map((n) => n.length));
      out(`${"name".padEnd(width)}  ${present.map((a) => a.id.padEnd(7)).join("")}notes`);
      for (const name of [...byName.keys()].sort()) {
        const copies = byName.get(name)!;
        const cells = present.map((a) => {
          const s = copies.find((c) => c.agent === a.id);
          return (s ? (s.link ? "link" : "yes") : "-").padEnd(7);
        });
        const real = copies.filter((c) => !c.link);
        const differs = new Set(real.map((c) => render(c, "agents").text.replace(/\r\n/g, "\n"))).size > 1;
        out(`${name.padEnd(width)}  ${cells.join("")}${differs ? "copies differ" : ""}`);
      }
      out(`\n${byName.size} skills. ${present.map((a) => `${a.id}: ${skills.filter((s) => s.agent === a.id).length}`).join(", ")}`);
      return 0;
    }

    case "lint": {
      const skills = scanAll(home, agents);
      const issues = lint(skills);
      if (values.json) {
        out(JSON.stringify({ issues, heaviest: heaviest(skills).map((h) => ({ agent: h.skill.agent, name: h.skill.slug, tokens: h.tokens })) }, null, 2));
      } else {
        for (const i of issues) out(`${i.level.padEnd(5)}  ${i.agent}/${i.skill}  ${i.message}`);
        out(`\nHeaviest skills (approx tokens when loaded):`);
        for (const h of heaviest(skills)) out(`  ${String(h.tokens).padStart(6)}  ${h.skill.agent}/${h.skill.slug}`);
        const errors = issues.filter((i) => i.level === "error").length;
        out(`\n${skills.length} skills checked: ${errors} errors, ${issues.length - errors} warnings`);
      }
      return issues.some((i) => i.level === "error") ? 1 : 0;
    }

    case "sync": {
      const [from, to] = args;
      if (!from || !to) throw new Error("usage: skillport sync <from> <to> [--apply] [--force]");
      const target = getAgent(to);
      const destRoot = join(home, target.dirs[0]);
      const counts: Record<Action, number> = { new: 0, same: 0, conflict: 0, linked: 0, overwrite: 0 };
      for (const s of scanAgent(home, getAgent(from))) {
        const dest = join(destRoot, s.slug);
        const action = plan(s, dest, to, !!values.force);
        counts[action]++;
        if (action === "same") continue;
        out(`${action.padEnd(9)}  ${s.slug}`);
        if (values.apply && (action === "new" || action === "overwrite")) {
          const dropped = copySkill(s, dest, to);
          if (dropped.length) out(`           dropped frontmatter keys: ${dropped.join(", ")}`);
        }
      }
      out(`\n${counts.new} new, ${counts.overwrite} overwrite, ${counts.conflict} conflicts (use --force), ${counts.linked} symlinked (left alone), ${counts.same} already in sync`);
      if (!values.apply && counts.new + counts.overwrite > 0) out("Dry run. Re-run with --apply to copy.");
      return 0;
    }

    case "convert": {
      const [name] = args;
      if (!name || (!values.to && !values.out)) throw new Error("usage: skillport convert <skill> (--to <id> | --out <dir>) [--from <id>] [--force]");
      const sources = scanAll(home, values.from ? [getAgent(values.from)] : AGENTS);
      const skill: Skill | undefined = sources.find((s) => s.slug === name || skillName(s) === name);
      if (!skill) throw new Error(`skill "${name}" not found`);
      const target = values.to ? getAgent(values.to).id : "agents";
      const dest = values.out ? join(values.out, skill.slug) : join(home, getAgent(target).dirs[0], skill.slug);
      const action = plan(skill, dest, target, !!values.force);
      if (action === "linked") {
        out(`${dest} is a symlink, leaving it alone.`);
        return 1;
      }
      if (action === "conflict") {
        out(`${dest} already exists and differs. Use --force to overwrite.`);
        return 1;
      }
      const dropped = action === "same" ? [] : copySkill(skill, dest, target);
      out(`${action === "same" ? "already up to date" : "wrote"} ${dest}`);
      if (dropped.length) out(`dropped frontmatter keys: ${dropped.join(", ")}`);
      return 0;
    }

    default:
      out(HELP);
      return cmd ? 1 : 0;
  }
}
