import * as E from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";

import { joinPath } from "./paths.js";

export const legacyProjectSnapshotDirectories = [".claude", ".codex"] as const;

export const findLegacyProjectSnapshots: (
  projectRoot: string,
) => E.Effect<ReadonlyArray<string>, PlatformError, FileSystem.FileSystem | Path.Path> = E.fn(
  "findLegacyProjectSnapshots",
)(function* (projectRoot) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const candidates = legacyProjectSnapshotDirectories.map((directory) =>
    joinPath(path, projectRoot, directory),
  );
  return yield* E.filter(candidates, (candidate) => fileSystem.exists(candidate));
});

export const removeLegacyProjectSnapshots: (
  projectRoot: string,
) => E.Effect<ReadonlyArray<string>, PlatformError, FileSystem.FileSystem | Path.Path> = E.fn(
  "removeLegacyProjectSnapshots",
)(function* (projectRoot) {
  const fileSystem = yield* FileSystem.FileSystem;
  const targets = yield* findLegacyProjectSnapshots(projectRoot);
  yield* E.forEach(targets, (target) => fileSystem.remove(target, { recursive: true }), {
    discard: true,
  });
  return targets;
});
