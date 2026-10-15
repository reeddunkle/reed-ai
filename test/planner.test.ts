import { describe, expect, it } from "vitest";

import type { DesiredFile } from "../src/domain.js";
import { classifyFile, hashContents } from "../src/planner.js";
import { joinPath } from "../src/paths.js";
import { renderForTarget } from "../src/render.js";
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
