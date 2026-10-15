import * as E from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import type { Manifest } from "./domain.js";
import { InvalidManifestError } from "./errors.js";

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isRetentionTarget = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  "enabled" in value &&
  typeof value.enabled === "boolean" &&
  "archiveAfterDays" in value &&
  Number.isInteger(value.archiveAfterDays) &&
  typeof value.archiveAfterDays === "number" &&
  value.archiveAfterDays >= 1;

export const readManifest = (manifestPath: string) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const text = yield* fileSystem.readFileString(manifestPath);
    const value: unknown = JSON.parse(text);

    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("conversationRetention" in value) ||
      typeof value.conversationRetention !== "object" ||
      value.conversationRetention === null ||
      !("codex" in value.conversationRetention) ||
      !isRetentionTarget(value.conversationRetention.codex) ||
      !("claude" in value.conversationRetention) ||
      !isRetentionTarget(value.conversationRetention.claude) ||
      !("skills" in value) ||
      !isStringArray(value.skills) ||
      !("plugins" in value) ||
      !Array.isArray(value.plugins) ||
      !("instructions" in value) ||
      !Array.isArray(value.instructions) ||
      !("settings" in value) ||
      !Array.isArray(value.settings) ||
      !("thirdParty" in value) ||
      !Array.isArray(value.thirdParty)
    ) {
      return yield* new InvalidManifestError({ message: "config/manifest.json has an invalid shape" });
    }

    return value as Manifest;
  });
