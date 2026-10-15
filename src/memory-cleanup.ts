import * as E from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { Target } from "./domain.js";
import { joinPath } from "./paths.js";

const timestamp = () => new Date().toISOString().replaceAll(":", "-");

export const planMemoryCleanup = E.fn("planMemoryCleanup")(function* (
  homeDirectory: string,
  target: Target,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (target === "codex") {
    const directory = joinPath(path, homeDirectory, ".codex", "memories");
    const exists = yield* fileSystem.exists(directory);
    return { directories: exists ? [directory] : [], target } as const;
  }
  const projectsDirectory = joinPath(path, homeDirectory, ".claude", "projects");
  const projectsExist = yield* fileSystem.exists(projectsDirectory);
  if (!projectsExist) return { directories: [], target } as const;
  const projectNames = yield* fileSystem.readDirectory(projectsDirectory);
  const candidates = projectNames.map((name) => joinPath(path, projectsDirectory, name, "memory"));
  const existing = yield* E.all(
    candidates.map((directory) =>
      fileSystem.exists(directory).pipe(E.map((exists) => ({ directory, exists }))),
    ),
    { concurrency: "unbounded" },
  );
  return {
    directories: existing.filter(({ exists }) => exists).map(({ directory }) => directory),
    target,
  } as const;
});

export const applyMemoryCleanup = E.fn("applyMemoryCleanup")(function* (
  homeDirectory: string,
  target: Target,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const plan = yield* planMemoryCleanup(homeDirectory, target);
  if (plan.directories.length === 0) return { ...plan, backupDirectory: undefined } as const;
  const backupDirectory = joinPath(
    path,
    homeDirectory,
    ".reed-ai",
    "backups",
    timestamp(),
    "memories",
    target,
  );
  yield* fileSystem.makeDirectory(backupDirectory, { recursive: true });
  yield* E.all(
    plan.directories.map((directory) => {
      const projectName = target === "claude" ? path.basename(path.dirname(directory)) : "memories";
      return fileSystem.copy(directory, joinPath(path, backupDirectory, projectName), {
        preserveTimestamps: true,
      });
    }),
    { concurrency: "unbounded" },
  );
  yield* E.all(
    plan.directories.map((directory) => fileSystem.remove(directory, { recursive: true })),
    { concurrency: "unbounded" },
  );
  return { ...plan, backupDirectory } as const;
});
