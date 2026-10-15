import { describe, expect, it } from "vitest";

import { reconcileJsonSettings, reconcileTomlBooleans } from "../src/structured-settings.js";

describe("reconcileJsonSettings", () => {
  it("updates managed leaves and preserves unmanaged siblings", () => {
    const result = reconcileJsonSettings(
      JSON.stringify({ env: { KEEP: "yes", MEMORY: "0" }, local: true }),
      { env: { MEMORY: "1" }, enabled: false },
    );

    expect(JSON.parse(result.contents)).toEqual({
      env: { KEEP: "yes", MEMORY: "1" },
      local: true,
      enabled: false,
    });
    expect(JSON.parse(result.currentState)).toEqual({
      values: { env: { MEMORY: "0" } },
      removals: {},
    });
  });

  it("removes explicitly managed obsolete paths", () => {
    const result = reconcileJsonSettings(
      JSON.stringify({ obsolete: true, keep: true }),
      { replacement: false },
      ["obsolete"],
    );

    expect(JSON.parse(result.contents)).toEqual({ keep: true, replacement: false });
    expect(result.changedPaths).toContain("obsolete");
  });
});

describe("reconcileTomlBooleans", () => {
  it("updates booleans while preserving unrelated TOML", () => {
    const result = reconcileTomlBooleans(
      'model = "gpt"\n\n[features]\nmemories = true # local\nother = true\n',
      { features: { memories: false }, analytics: { enabled: false } },
    );

    expect(result.contents).toContain('model = "gpt"');
    expect(result.contents).toContain("memories = false # local");
    expect(result.contents).toContain("other = true");
    expect(result.contents).toContain("[analytics]\nenabled = false");
  });

  it("rejects duplicate managed tables", () => {
    expect(() =>
      reconcileTomlBooleans("[features]\nmemories = true\n[features]\nmemories = false\n", {
        features: { memories: false },
      }),
    ).toThrow("duplicate TOML table");
  });

  it("rejects unsupported managed values", () => {
    expect(() =>
      reconcileTomlBooleans('[features]\nmemories = "sometimes"\n', {
        features: { memories: false },
      }),
    ).toThrow("unsupported TOML value");
  });
});
