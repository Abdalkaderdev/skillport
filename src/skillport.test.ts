import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { run } from "./cli.ts";
import { lint } from "./lint.ts";
import { AGENTS, parseSkillMd, scanAll } from "./skills.ts";

let home: string;

function skill(dir: string, name: string, frontmatter: string, extra: Record<string, string> = {}) {
  const path = join(home, dir, name);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "SKILL.md"), `---\n${frontmatter}\n---\n# ${name}\n`);
  for (const [file, text] of Object.entries(extra)) {
    mkdirSync(join(path, file, ".."), { recursive: true });
    writeFileSync(join(path, file), text);
  }
  return path;
}

function cli(...argv: string[]) {
  const lines: string[] = [];
  const code = run(argv, home, (l) => lines.push(l));
  return { code, text: lines.join("\n") };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "skillport-"));
});

test("parses folded multi-line descriptions and reports bad yaml", () => {
  const ok = parseSkillMd("---\nname: a\ndescription: one\n  two\n---\nbody");
  assert.equal(ok.meta.description, "one two");
  assert.equal(ok.body, "body");
  assert.match(parseSkillMd("---\ndescription: a: b: c\n---\n").error!, /invalid YAML/);
  assert.equal(parseSkillMd("no frontmatter").error, "missing YAML frontmatter");
});

test("scans every agent including gemini extensions", () => {
  skill(".claude/skills", "a", "name: a\ndescription: x");
  skill(".agents/skills", "b", "name: b\ndescription: x");
  skill(".gemini/extensions/ext/skills", "c", "name: c\ndescription: x");
  skill(".cursor/skills", "d", "name: d\ndescription: x");
  mkdirSync(join(home, ".claude/skills/not-a-skill"), { recursive: true });
  const found = scanAll(home).map((s) => `${s.agent}/${s.slug}`).sort();
  assert.deepEqual(found, ["agents/b", "claude/a", "cursor/d", "gemini/c"]);
});

test("lint flags spec violations, duplicates and overlaps", () => {
  skill(".claude/skills", "Bad_Name", "name: Bad_Name\ndescription: x");
  skill(".claude/skills", "nodesc", "name: nodesc");
  skill(".claude/skills", "react-a", "name: react-a\ndescription: Build React components with hooks and testing");
  skill(".claude/skills", "react-b", "name: react-b\ndescription: Build React components with hooks and testing library");
  skill(".gemini/skills", "dup", "name: dup\ndescription: x");
  skill(".gemini/extensions/e/skills", "dup", "name: dup\ndescription: x");
  const messages = lint(scanAll(home, AGENTS)).map((i) => `${i.level} ${i.skill} ${i.message}`);
  assert.ok(messages.some((m) => m.startsWith("warn Bad_Name name \"Bad_Name\" breaks the spec")));
  assert.ok(messages.includes("error nodesc missing description"));
  assert.ok(messages.some((m) => m.startsWith("warn react-a description overlaps \"react-b\"")));
  assert.ok(messages.some((m) => m.startsWith("error dup name \"dup\" used 2 times")));
  assert.equal(cli("lint").code, 1);
});

test("sync is a dry run by default, then copies, skips conflicts and symlinks", () => {
  skill(".claude/skills", "fresh", "name: fresh\ndescription: x", { "scripts/run.sh": "echo hi" });
  skill(".claude/skills", "clash", "name: clash\ndescription: new");
  skill(".agents/skills", "clash", "name: clash\ndescription: old");
  const linked = skill(".claude/skills", "linked", "name: linked\ndescription: x");
  mkdirSync(join(home, ".cursor/skills"), { recursive: true });
  symlinkSync(join(home, ".agents/skills/clash"), join(home, ".cursor/skills/linked"), "junction");

  let out = cli("sync", "claude", "agents");
  assert.match(out.text, /new\s+fresh/);
  assert.match(out.text, /Dry run/);
  assert.ok(!existsSync(join(home, ".agents/skills/fresh")));

  out = cli("sync", "claude", "agents", "--apply");
  assert.equal(readFileSync(join(home, ".agents/skills/fresh/scripts/run.sh"), "utf8"), "echo hi");
  assert.match(readFileSync(join(home, ".agents/skills/clash/SKILL.md"), "utf8"), /old/);
  assert.match(out.text, /conflict\s+clash/);

  out = cli("sync", "claude", "cursor", "--apply", "--force");
  assert.match(out.text, /linked\s+linked/);
  assert.match(readFileSync(join(home, ".agents/skills/clash/SKILL.md"), "utf8"), /old/);
  assert.ok(existsSync(linked));

  cli("sync", "claude", "agents", "--apply", "--force");
  assert.match(readFileSync(join(home, ".agents/skills/clash/SKILL.md"), "utf8"), /new/);
});

test("convert drops non-spec keys for other agents and keeps them for claude", () => {
  skill(".claude/skills", "tool", "name: tool\ndescription: x\ndisable-model-invocation: true\nlicense: MIT");
  const out = cli("convert", "tool", "--to", "cursor");
  assert.match(out.text, /dropped frontmatter keys: disable-model-invocation/);
  const written = readFileSync(join(home, ".cursor/skills/tool/SKILL.md"), "utf8");
  assert.equal(parseSkillMd(written).meta["disable-model-invocation"], undefined);
  assert.equal(parseSkillMd(written).meta.license, "MIT");
  assert.match(written, /# tool/);

  const dir = join(home, "export");
  cli("convert", "tool", "--to", "claude", "--out", dir);
  assert.equal(parseSkillMd(readFileSync(join(dir, "tool/SKILL.md"), "utf8")).meta["disable-model-invocation"], true);
  assert.throws(() => cli("convert", "missing", "--to", "cursor"), /not found/);
});

test("an untouched copy with claude-only keys is in sync, not a conflict", () => {
  const fm = "name: same\ndescription: x\nargument-hint: <file>";
  skill(".claude/skills", "same", fm);
  skill(".cursor/skills", "same", fm);
  assert.match(cli("sync", "claude", "cursor").text, /1 already in sync/);
});

test("sync and convert copy a symlinked source as real files", () => {
  const real = skill("elsewhere", "linked", "name: linked\ndescription: x", { "scripts/run.sh": "echo hi" });
  mkdirSync(join(home, ".claude/skills"), { recursive: true });
  symlinkSync(real, join(home, ".claude/skills/linked"), "junction");

  const out = cli("sync", "claude", "cursor", "--apply");
  assert.match(out.text, /new\s+linked/);
  assert.equal(readFileSync(join(home, ".cursor/skills/linked/scripts/run.sh"), "utf8"), "echo hi");
  assert.equal(lstatSync(join(home, ".cursor/skills/linked")).isSymbolicLink(), false);

  assert.equal(cli("convert", "linked", "--to", "agents").code, 0);
  assert.match(readFileSync(join(home, ".agents/skills/linked/SKILL.md"), "utf8"), /name: linked/);
});

test("a failed overwrite leaves the existing copy in place", () => {
  const src = skill(".claude/skills", "tool", "name: tool\ndescription: new");
  skill(".claude/skills/tool/nested", "tool", "name: tool\ndescription: old");
  const out = join(src, "nested");
  assert.throws(() => cli("convert", "tool", "--from", "claude", "--out", out, "--force"));
  assert.match(readFileSync(join(out, "tool/SKILL.md"), "utf8"), /old/);
});
