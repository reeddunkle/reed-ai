import { NodeServices } from "@effect/platform-node";
import * as E from "effect/Effect";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findLegacyProjectSnapshots, removeLegacyProjectSnapshots } from "../src/cleanup.js";

describe("project snapshot cleanup", () => {
  it("removes legacy snapshots without touching the canonical marketplace", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "reed-ai-cleanup-"));
    const marketplace = join(projectRoot, ".agents", "plugins", "marketplace.json");
    const claudeSnapshot = join(projectRoot, ".claude");
    const codexSnapshot = join(projectRoot, ".codex");

    try {
      await Promise.all([
        mkdir(join(projectRoot, ".agents", "plugins"), { recursive: true }),
        mkdir(claudeSnapshot),
        mkdir(codexSnapshot),
      ]);
      await writeFile(marketplace, "canonical\n");

      const planned = await E.runPromise(
        findLegacyProjectSnapshots(projectRoot).pipe(E.provide(NodeServices.layer)),
      );
      expect(planned).toEqual([claudeSnapshot, codexSnapshot]);

      const removed = await E.runPromise(
        removeLegacyProjectSnapshots(projectRoot).pipe(E.provide(NodeServices.layer)),
      );
      expect(removed).toEqual([claudeSnapshot, codexSnapshot]);
      await expect(access(claudeSnapshot)).rejects.toThrow();
      await expect(access(codexSnapshot)).rejects.toThrow();
      await expect(readFile(marketplace, "utf8")).resolves.toBe("canonical\n");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
