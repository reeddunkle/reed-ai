import * as E from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { ConflictDetectedError } from "./errors.js";
import { dirnamePath, joinPath, relativePath } from "./paths.js";
import { hashContents } from "./planner.js";
import type { WorkspacePlan } from "./workspace.js";

const timestamp = () => new Date().toISOString().replaceAll(":", "-");

export const backupPlan = (plan: WorkspacePlan) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const backupRoot = joinPath(path, plan.homeDirectory, ".reed-ai", "backups", timestamp());
    const existing = plan.actions.filter((action) => action.currentContents !== undefined);
    yield* E.forEach(existing, (action) => {
      const relative = relativePath(path, plan.homeDirectory, action.destination);
      const destination = joinPath(path, backupRoot, "files", relative);
      return fileSystem.makeDirectory(dirnamePath(path, destination), { recursive: true }).pipe(
        E.andThen(fileSystem.writeFileString(destination, action.currentContents ?? "")),
      );
    });
    const manifest = existing.map((action) => ({
      destination: action.destination,
      hash: hashContents(action.currentContents ?? ""),
    }));
    yield* fileSystem.makeDirectory(backupRoot, { recursive: true });
    yield* fileSystem.writeFileString(
      joinPath(path, backupRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return backupRoot;
  });

export const deployPlan = (plan: WorkspacePlan, force: boolean) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const conflicts = plan.actions.filter((action) => action.kind === "conflict");
    if (conflicts.length > 0 && !force) {
      return yield* new ConflictDetectedError({ count: conflicts.length });
    }
    const writable = plan.actions.filter((action) => action.kind !== "unchanged");
    yield* E.forEach(writable, (action) =>
      fileSystem.makeDirectory(dirnamePath(path, action.destination), { recursive: true }).pipe(
        E.andThen(fileSystem.writeFileString(action.destination, action.contents)),
      ),
    );
    const state = Object.fromEntries(
      plan.actions.map((action) => [action.destination, hashContents(action.contents)]),
    );
    yield* fileSystem.makeDirectory(dirnamePath(path, plan.statePath), { recursive: true });
    yield* fileSystem.writeFileString(plan.statePath, `${JSON.stringify(state, null, 2)}\n`);
    return writable.length;
  });
