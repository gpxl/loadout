import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getInstalledSkills,
  getProjectSkills,
  removeSkill,
  installSkillDirect,
  installSkillBatch,
  discoverSkillsInRepo,
  generateSkillRules,
  nameSimilarity,
} from "../../src/core/skills.js";

describe("getInstalledSkills", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-skills-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no skills directory", async () => {
    const skills = await getInstalledSkills(tmpDir);
    // Only project skills will be empty; global depends on the machine
    const projectSkills = skills.filter((s) => s.scope === "project");
    expect(projectSkills).toEqual([]);
  });

  it("lists project-level skills with description", async () => {
    const skillDir = join(tmpDir, ".claude", "skills", "react-best-practices");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: react-best-practices
description: 'React and Next.js performance optimization guidelines'
---

# React Best Practices
`,
    );

    const skills = await getProjectSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("react-best-practices");
    expect(skills[0].description).toBe(
      "React and Next.js performance optimization guidelines",
    );
    expect(skills[0].scope).toBe("project");
  });

  it("handles skill without SKILL.md", async () => {
    const skillDir = join(tmpDir, ".claude", "skills", "orphan-skill");
    await mkdir(skillDir, { recursive: true });

    const skills = await getProjectSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("orphan-skill");
    expect(skills[0].description).toBeNull();
  });

  it("handles SKILL.md without description", async () => {
    const skillDir = join(tmpDir, ".claude", "skills", "no-desc");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: no-desc
---

# No Description Skill
`,
    );

    const skills = await getProjectSkills(tmpDir);
    expect(skills[0].description).toBeNull();
  });

  it("skips hidden directories", async () => {
    await mkdir(join(tmpDir, ".claude", "skills", ".hidden"), {
      recursive: true,
    });
    await mkdir(join(tmpDir, ".claude", "skills", "visible"), {
      recursive: true,
    });

    const skills = await getProjectSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("visible");
  });
});

describe("removeSkill", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-skills-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("removes a skill directory", async () => {
    const skillDir = join(tmpDir, ".claude", "skills", "test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# Test");

    await removeSkill("test-skill", { projectPath: tmpDir });

    const skills = await getProjectSkills(tmpDir);
    expect(skills).toHaveLength(0);
  });

  it("does not throw when skill does not exist", async () => {
    await expect(
      removeSkill("nonexistent", { projectPath: tmpDir }),
    ).resolves.toBeUndefined();
  });
});

describe("installSkillDirect", () => {
  let tmpDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-skills-"));
    repoDir = await mkdtemp(join(tmpdir(), "loadout-fake-repo-"));

    // Create a fake repo with two skills at root level
    const skill1 = join(repoDir, "my-skill");
    const skill2 = join(repoDir, "other-skill");
    await mkdir(skill1, { recursive: true });
    await mkdir(skill2, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: my-skill\ndescription: 'A test skill'\n---\n# My Skill\n");
    await writeFile(join(skill1, "agent.md"), "Agent instructions");
    await writeFile(join(skill2, "SKILL.md"), "---\nname: other-skill\n---\n# Other\n");

    // Initialize as a git repo so git clone works
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["commit", "--quiet", "-m", "init", "--allow-empty"], { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(repoDir, { recursive: true, force: true });
  });

  it("installs a specific skill from a local repo", async () => {
    await installSkillDirect(repoDir, "my-skill", { projectPath: tmpDir });

    const skills = await getProjectSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("my-skill");
    expect(skills[0].description).toBe("A test skill");
  });

  it("does not install other skills from the same repo", async () => {
    await installSkillDirect(repoDir, "my-skill", { projectPath: tmpDir });

    const skills = await getProjectSkills(tmpDir);
    const names = skills.map((s) => s.name);
    expect(names).not.toContain("other-skill");
  });

  it("throws when skill name is not found in repo", async () => {
    // Use a name with zero token overlap to avoid fuzzy matching
    await expect(
      installSkillDirect(repoDir, "banana-mango-papaya", { projectPath: tmpDir }),
    ).rejects.toThrow('Skill "banana-mango-papaya" not found');
  });

  it("copies all files in the skill directory", async () => {
    await installSkillDirect(repoDir, "my-skill", { projectPath: tmpDir });

    const skillDir = join(tmpDir, ".claude", "skills", "my-skill");
    const files = await readdir(skillDir);
    expect(files).toContain("SKILL.md");
    expect(files).toContain("agent.md");
  });
});

describe("installSkillBatch", () => {
  let tmpDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-skills-"));
    repoDir = await mkdtemp(join(tmpdir(), "loadout-fake-repo-"));

    const skill1 = join(repoDir, "skill-a");
    const skill2 = join(repoDir, "skill-b");
    const skill3 = join(repoDir, "skill-c");
    await mkdir(skill1, { recursive: true });
    await mkdir(skill2, { recursive: true });
    await mkdir(skill3, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: skill-a\ndescription: 'Skill A'\n---\n# A\n");
    await writeFile(join(skill2, "SKILL.md"), "---\nname: skill-b\ndescription: 'Skill B'\n---\n# B\n");
    await writeFile(join(skill3, "SKILL.md"), "---\nname: skill-c\ndescription: 'Skill C'\n---\n# C\n");

    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["commit", "--quiet", "-m", "init", "--allow-empty"], { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(repoDir, { recursive: true, force: true });
  });

  it("installs multiple skills from one clone", async () => {
    const results = await installSkillBatch(repoDir, ["skill-a", "skill-b", "skill-c"], {
      projectPath: tmpDir,
    });

    expect(results.get("skill-a")).toBeNull();
    expect(results.get("skill-b")).toBeNull();
    expect(results.get("skill-c")).toBeNull();

    const skills = await getProjectSkills(tmpDir);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["skill-a", "skill-b", "skill-c"]);
  });

  it("one missing skill does not block others", async () => {
    const results = await installSkillBatch(repoDir, ["skill-a", "nonexistent", "skill-c"], {
      projectPath: tmpDir,
    });

    expect(results.get("skill-a")).toBeNull();
    expect(results.get("nonexistent")).toBeInstanceOf(Error);
    expect(results.get("skill-c")).toBeNull();

    const skills = await getProjectSkills(tmpDir);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["skill-a", "skill-c"]);
  });

  it("returns correct error map", async () => {
    const results = await installSkillBatch(repoDir, ["nonexistent-1", "nonexistent-2"], {
      projectPath: tmpDir,
    });

    expect(results.size).toBe(2);
    for (const [, err] of results) {
      expect(err).toBeInstanceOf(Error);
      expect(err!.message).toContain("not found");
    }
  });
});

describe("generateSkillRules", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-rules-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates .claude/rules/skills.md with correct content", async () => {
    await generateSkillRules(
      [
        { name: "next-best-practices", description: "Next.js App Router patterns" },
        { name: "supabase-postgres", description: "Database queries and RLS" },
      ],
      tmpDir,
    );

    const content = await readFile(join(tmpDir, ".claude", "rules", "skills.md"), "utf-8");
    expect(content).toContain("# Installed Skills");
    expect(content).toContain("| next-best-practices | Next.js App Router patterns |");
    expect(content).toContain("| supabase-postgres | Database queries and RLS |");
    expect(content).toContain("Invoke each skill via the Skill tool");
    expect(content).toContain("proactively");
  });

  it("overwrites existing rules file", async () => {
    // Write initial rules
    await generateSkillRules(
      [{ name: "old-skill", description: "Old description" }],
      tmpDir,
    );

    // Overwrite with new rules
    await generateSkillRules(
      [{ name: "new-skill", description: "New description" }],
      tmpDir,
    );

    const content = await readFile(join(tmpDir, ".claude", "rules", "skills.md"), "utf-8");
    expect(content).not.toContain("old-skill");
    expect(content).toContain("| new-skill | New description |");
  });

  it("creates rules directory if it does not exist", async () => {
    await generateSkillRules(
      [{ name: "test-skill", description: "Test" }],
      tmpDir,
    );

    const entries = await readdir(join(tmpDir, ".claude", "rules"));
    expect(entries).toContain("skills.md");
  });
});

describe("nameSimilarity", () => {
  it("returns 1 for exact match", () => {
    expect(nameSimilarity("foo-bar", "foo-bar")).toBe(1);
  });

  it("is case-insensitive", () => {
    expect(nameSimilarity("Foo-Bar", "foo-bar")).toBe(1);
  });

  it("returns 0.8 for substring match", () => {
    expect(nameSimilarity("ai-sdk", "vercel-ai-sdk")).toBe(0.8);
    expect(nameSimilarity("vercel-ai-sdk", "ai-sdk")).toBe(0.8);
  });

  it("scores token overlap for non-substring names", () => {
    // [react, hooks] vs [react, patterns] → 1/2 = 0.5
    const score = nameSimilarity("react-hooks", "react-patterns");
    expect(score).toBe(0.5);
  });

  it("returns 0.8 when one name is substring of the other", () => {
    // "nextjs-app-router" is a substring of "nextjs-app-router-patterns"
    expect(nameSimilarity("nextjs-app-router-patterns", "nextjs-app-router")).toBe(0.8);
    // "next-best-practice" is a substring of "next-best-practices"
    expect(nameSimilarity("next-best-practices", "next-best-practice")).toBe(0.8);
  });

  it("returns 0 for completely different names", () => {
    expect(nameSimilarity("foo", "bar")).toBe(0);
  });

  it("returns 0 for empty strings", () => {
    expect(nameSimilarity("", "")).toBe(0);
  });

  it("handles camelCase splitting", () => {
    // camelCase → [camel, case], camel-case → [camel, case]
    expect(nameSimilarity("camelCase", "camel-case")).toBe(1);
  });
});

describe("fuzzy matching in installSkillBatch", () => {
  let tmpDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-skills-"));
    repoDir = await mkdtemp(join(tmpdir(), "loadout-fake-repo-"));

    // Create skills with specific names
    const skill1 = join(repoDir, "next-best-practices");
    const skill2 = join(repoDir, "typescript-expert");
    await mkdir(skill1, { recursive: true });
    await mkdir(skill2, { recursive: true });
    await writeFile(join(skill1, "SKILL.md"), "---\nname: next-best-practices\ndescription: 'Next.js patterns'\n---\n# Next\n");
    await writeFile(join(skill2, "SKILL.md"), "---\nname: typescript-expert\ndescription: 'TS expert'\n---\n# TS\n");

    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["commit", "--quiet", "-m", "init", "--allow-empty"], { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(repoDir, { recursive: true, force: true });
  });

  it("installs via fuzzy match when name is close but not exact", async () => {
    // Request "nextjs-best-practices" but repo has "next-best-practices"
    // Tokens: [nextjs, best, practices] vs [next, best, practices] → 2/3 > 0.5
    const results = await installSkillBatch(repoDir, ["nextjs-best-practices"], {
      projectPath: tmpDir,
    });

    expect(results.get("nextjs-best-practices")).toBeNull();
    const skills = await getProjectSkills(tmpDir);
    expect(skills).toHaveLength(1);
  });

  it("fails when name is too different for fuzzy match", async () => {
    const results = await installSkillBatch(repoDir, ["completely-unrelated-name"], {
      projectPath: tmpDir,
    });

    expect(results.get("completely-unrelated-name")).toBeInstanceOf(Error);
  });

  it("prefers exact match over fuzzy match", async () => {
    const results = await installSkillBatch(repoDir, ["next-best-practices"], {
      projectPath: tmpDir,
    });

    expect(results.get("next-best-practices")).toBeNull();
    const skills = await getProjectSkills(tmpDir);
    expect(skills[0].name).toBe("next-best-practices");
  });
});

describe("deep nested skill discovery", () => {
  let tmpDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-skills-"));
    repoDir = await mkdtemp(join(tmpdir(), "loadout-fake-repo-"));

    // Depth 1: root-level skill
    const d1 = join(repoDir, "root-skill");
    await mkdir(d1, { recursive: true });
    await writeFile(join(d1, "SKILL.md"), "---\nname: root-skill\ndescription: 'Root level'\n---\n# Root\n");

    // Depth 2: one level deep
    const d2 = join(repoDir, "category", "nested-skill");
    await mkdir(d2, { recursive: true });
    await writeFile(join(d2, "SKILL.md"), "---\nname: nested-skill\ndescription: 'One level deep'\n---\n# Nested\n");

    // Depth 3: two levels deep
    const d3 = join(repoDir, "plugins", "frontend", "deep-skill");
    await mkdir(d3, { recursive: true });
    await writeFile(join(d3, "SKILL.md"), "---\nname: deep-skill\ndescription: 'Two levels deep'\n---\n# Deep\n");

    // Depth 4: three levels deep (matches wshobson/agents pattern)
    const d4 = join(repoDir, "plugins", "frontend-mobile", "skills", "very-deep-skill");
    await mkdir(d4, { recursive: true });
    await writeFile(join(d4, "SKILL.md"), "---\nname: very-deep-skill\ndescription: 'Three levels deep'\n---\n# Very Deep\n");

    // Should be excluded: skill inside node_modules
    const excluded = join(repoDir, "node_modules", "some-pkg", "banana-mango-papaya");
    await mkdir(excluded, { recursive: true });
    await writeFile(join(excluded, "SKILL.md"), "---\nname: banana-mango-papaya\ndescription: 'Should not appear'\n---\n# Excluded\n");

    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["add", "-f", "node_modules"], { cwd: repoDir });
    execFileSync("git", ["commit", "--quiet", "-m", "init", "--allow-empty"], { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(repoDir, { recursive: true, force: true });
  });

  it("installs skill nested 3 levels deep", async () => {
    const results = await installSkillBatch(repoDir, ["deep-skill"], {
      projectPath: tmpDir,
    });

    expect(results.get("deep-skill")).toBeNull();
    const skills = await getProjectSkills(tmpDir);
    expect(skills.map((s) => s.name)).toContain("deep-skill");
  });

  it("installs skill nested 4 levels deep", async () => {
    const results = await installSkillBatch(repoDir, ["very-deep-skill"], {
      projectPath: tmpDir,
    });

    expect(results.get("very-deep-skill")).toBeNull();
    const skills = await getProjectSkills(tmpDir);
    expect(skills.map((s) => s.name)).toContain("very-deep-skill");
  });

  it("finds skills at all depths in one batch", async () => {
    const results = await installSkillBatch(
      repoDir,
      ["root-skill", "nested-skill", "deep-skill", "very-deep-skill"],
      { projectPath: tmpDir },
    );

    expect(results.get("root-skill")).toBeNull();
    expect(results.get("nested-skill")).toBeNull();
    expect(results.get("deep-skill")).toBeNull();
    expect(results.get("very-deep-skill")).toBeNull();

    const skills = await getProjectSkills(tmpDir);
    expect(skills.map((s) => s.name).sort()).toEqual([
      "deep-skill", "nested-skill", "root-skill", "very-deep-skill",
    ]);
  });

  it("excludes skills inside node_modules", async () => {
    const results = await installSkillBatch(repoDir, ["banana-mango-papaya"], {
      projectPath: tmpDir,
    });

    expect(results.get("banana-mango-papaya")).toBeInstanceOf(Error);
  });

  it("discoverSkillsInRepo finds all non-excluded skills across depths", async () => {
    const names = await discoverSkillsInRepo(repoDir);
    const sorted = [...names].sort();

    expect(sorted).toEqual(["deep-skill", "nested-skill", "root-skill", "very-deep-skill"]);
    expect(sorted).not.toContain("banana-mango-papaya");
  });
});
