import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";

import type { Environment } from "../src/domain.js";
import { selectEnvironments } from "../src/environments.js";

const environments: ReadonlyArray<Environment> = [
  { id: "windows", targets: ["claude", "codex"] },
  { id: "wsl", homeVariable: "REED_AI_WSL_HOME", targets: ["claude"] },
];

const request = {
  defaultHome: "C:\\home",
  environmentId: Option.none<string>(),
  environments,
  home: Option.none<string>(),
  targetSelection: "all" as const,
  variables: { REED_AI_WSL_HOME: "\\\\wsl.localhost\\Ubuntu\\home\\example" },
};

describe("selectEnvironments", () => {
  it("resolves every configured environment by default", () => {
    expect(selectEnvironments(request)).toEqual({
      environments: [
        { id: "windows", homeDirectory: "C:\\home", targets: ["claude", "codex"] },
        { id: "wsl", homeDirectory: "\\\\wsl.localhost\\Ubuntu\\home\\example", targets: ["claude"] },
      ],
      problems: [],
    });
  });

  it("narrows to one environment and target", () => {
    const selection = selectEnvironments({
      ...request,
      environmentId: Option.some("windows"),
      targetSelection: "codex",
    });

    expect(selection.environments).toEqual([
      { id: "windows", homeDirectory: "C:\\home", targets: ["codex"] },
    ]);
  });

  it("reports a missing home variable", () => {
    const selection = selectEnvironments({ ...request, variables: {} });

    expect(selection.problems).toEqual([
      "environment wsl needs REED_AI_WSL_HOME in .env (see .env.example)",
    ]);
  });

  it("reports an unknown environment", () => {
    const selection = selectEnvironments({ ...request, environmentId: Option.some("mac") });

    expect(selection.problems).toEqual(["unknown environment mac; configured: windows, wsl"]);
  });

  it("treats an explicit home as a single ad hoc environment", () => {
    const selection = selectEnvironments({ ...request, home: Option.some("D:\\other") });

    expect(selection.environments).toEqual([
      { id: "home", homeDirectory: "D:\\other", targets: ["claude", "codex"] },
    ]);
  });
});
