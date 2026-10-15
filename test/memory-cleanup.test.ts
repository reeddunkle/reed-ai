import { NodeServices } from "@effect/platform-node";
import * as E from "effect/Effect";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { applyMemoryCleanup, planMemoryCleanup } from "../src/memory-cleanup.js";

describe("Claude memory cleanup", () => {
  it("backs up memory directories without removing other project state", async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), "reed-ai-memory-"));
    const projectDirectory = join(homeDirectory, ".claude", "projects", "example");
    const memoryDirectory = join(projectDirectory, "memory");
    const historyPath = join(projectDirectory, "history.jsonl");

    try {
      await mkdir(memoryDirectory, { recursive: true });
      await writeFile(join(memoryDirectory, "MEMORY.md"), "remembered\n");
      await writeFile(historyPath, "history\n");

      const plan = await E.runPromise(
        planMemoryCleanup(homeDirectory, "claude").pipe(E.provide(NodeServices.layer)),
      );
      expect(plan.directories).toEqual([memoryDirectory]);

      const result = await E.runPromise(
        applyMemoryCleanup(homeDirectory, "claude").pipe(E.provide(NodeServices.layer)),
      );
      expect(result.backupDirectory).toBeDefined();
      await expect(access(memoryDirectory)).rejects.toThrow();
      await expect(readFile(historyPath, "utf8")).resolves.toBe("history\n");
      await expect(
        readFile(join(result.backupDirectory ?? "", "example", "MEMORY.md"), "utf8"),
      ).resolves.toBe("remembered\n");
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
