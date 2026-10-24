import * as E from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import type { Manifest } from "./domain.js";
import { InvalidManifestError } from "./errors.js";

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isTarget = (value: unknown) => value === "claude" || value === "codex";

const isSkill = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  "targets" in value &&
  Array.isArray(value.targets) &&
  value.targets.length > 0 &&
  value.targets.every(isTarget) &&
  new Set(value.targets).size === value.targets.length;

const isEnvironment = (value: unknown) =>
  isSkill(value) &&
  typeof value === "object" &&
  value !== null &&
  (!("homeVariable" in value) ||
    (typeof value.homeVariable === "string" && /^[A-Z_][A-Z0-9_]*$/.test(value.homeVariable)));

const isEnvironmentArray = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(isEnvironment) &&
  new Set(value.map((environment: { readonly id: string }) => environment.id)).size === value.length;

const isSkillArray = (value: unknown) => Array.isArray(value) && value.every(isSkill);

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
      !("environments" in value) ||
      !isEnvironmentArray(value.environments) ||
      !("conversationRetention" in value) ||
      typeof value.conversationRetention !== "object" ||
      value.conversationRetention === null ||
      !("codex" in value.conversationRetention) ||
      !isRetentionTarget(value.conversationRetention.codex) ||
      !("claude" in value.conversationRetention) ||
      !isRetentionTarget(value.conversationRetention.claude) ||
      !("skills" in value) ||
      !isSkillArray(value.skills) ||
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
