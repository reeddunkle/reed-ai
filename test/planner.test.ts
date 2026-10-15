import { describe, expect, it } from "vitest";
import { NodeServices } from "@effect/platform-node";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";

import type { DesiredFile, Manifest } from "../src/domain.js";
import { classifyFile, hashContents } from "../src/planner.js";
import { joinPath } from "../src/paths.js";
import { renderForTarget } from "../src/render.js";
import { buildDesiredFiles } from "../src/workspace.js";
import * as Path from "effect/Path";
import * as E from "effect/Effect";

const desired: DesiredFile = {
  source: "skills/example/SKILL.md",
  destination: "home/.codex/skills/example/SKILL.md",
  target: "codex",
  contents: "next",
};

describe("classifyFile", () => {
  it("classifies missing destinations as creates", () => {
    expect(classifyFile(desired, undefined, undefined).kind).toBe("create");
  });

  it("classifies matching destinations as unchanged", () => {
    expect(classifyFile(desired, "next", undefined).kind).toBe("unchanged");
  });

  it("classifies recorded old content as an update", () => {
    expect(classifyFile(desired, "old", hashContents("old")).kind).toBe("update");
  });

  it("refuses unrecorded local content as a conflict", () => {
    expect(classifyFile(desired, "local", hashContents("old")).kind).toBe("conflict");
  });

  it("ignores changes outside a structured managed projection", () => {
    const structured: DesiredFile = {
      ...desired,
      contents: "merged unmanaged content",
      currentState: '{"enabled":false}',
      desiredState: '{"enabled":false}',
    };

    expect(classifyFile(structured, "different full file", undefined).kind).toBe("unchanged");
  });
});

describe("renderForTarget", () => {
  it("renders Codex platform tokens", () => {
    expect(renderForTarget("{{AGENT_NAME}} {{PROJECT_SKILLS_DIR}} {{USER_SKILLS_DIR}}", "codex"))
      .toBe("Codex .codex/skills ~/.codex/skills");
  });

  it("renders Claude platform tokens", () => {
    expect(renderForTarget("{{AGENT_NAME}} {{PROJECT_SKILLS_DIR}} {{USER_SKILLS_DIR}}", "claude"))
      .toBe("Claude .claude/skills ~/.claude/skills");
  });
});

describe("joinPath", () => {
  it("preserves Windows UNC roots", () => {
    const result = E.runSync(
      E.gen(function* () {
        const path = yield* Path.Path;
        return joinPath(path, "\\\\wsl.localhost\\Ubuntu\\home\\example", ".claude", "skills");
      }).pipe(E.provide(Path.layer)),
    );

    expect(result).toBe("\\\\wsl.localhost\\Ubuntu\\home\\example\\.claude\\skills");
  });
});

describe("buildDesiredFiles", () => {
  it("deploys skills only to their declared targets", async () => {
    const projectRoot = mkdtempSync(nodePath.join(tmpdir(), "reed-ai-project-"));
    const homeDirectory = mkdtempSync(nodePath.join(tmpdir(), "reed-ai-home-"));
    const manifest: Manifest = {
      version: 1,
      conversationRetention: {
        codex: { enabled: true, archiveAfterDays: 14 },
        claude: { enabled: false, archiveAfterDays: 14 },
      },
      marketplace: { name: "example", source: ".agents/plugins/marketplace.json" },
      skills: [
        { id: "claude-only", targets: ["claude"] },
        { id: "shared", targets: ["claude", "codex"] },
      ],
      plugins: [],
      instructions: [],
      settings: [],
      thirdParty: [],
    };

    try {
      for (const skill of manifest.skills) {
        const skillDirectory = nodePath.join(projectRoot, "skills", skill.id);
        mkdirSync(skillDirectory, { recursive: true });
        writeFileSync(nodePath.join(skillDirectory, "SKILL.md"), skill.id);
      }

      const desiredFiles = await E.runPromise(
        buildDesiredFiles(projectRoot, homeDirectory, manifest).pipe(E.provide(NodeServices.layer)),
      );

      expect(desiredFiles.map((file) => `${file.target}:${nodePath.basename(nodePath.dirname(file.destination))}`))
        .toEqual(["claude:claude-only", "claude:shared", "codex:shared"]);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(homeDirectory, { recursive: true, force: true });
    }
  });
});
