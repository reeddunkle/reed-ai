import * as E from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type {
  DesiredFile,
  Manifest,
  PlanAction,
  Target,
} from "./domain.js";
import { readManifest } from "./manifest.js";
import { joinPath } from "./paths.js";
import { classifyFile } from "./planner.js";
import { renderForTarget } from "./render.js";
import {
  parseDesiredSettings,
  reconcileJsonSettings,
  reconcileTomlBooleans,
  selectDesiredSettingRemovals,
  selectDesiredSettings,
} from "./structured-settings.js";

type DeploymentState = Readonly<Record<string, string>>;
type JsonRecord = Readonly<Record<string, unknown>>;

export const targets: ReadonlyArray<Target> = ["claude", "codex"];

const readOptional = (filePath: string) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const exists = yield* fileSystem.exists(filePath);
    return exists ? yield* fileSystem.readFileString(filePath) : undefined;
  });

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRecord = (contents: string): JsonRecord => {
  const value: unknown = JSON.parse(contents);
  return isRecord(value) ? value : {};
};

const listFiles = (directory: string) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pending = [directory];
    const files: Array<string> = [];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      const names = yield* fileSystem.readDirectory(current);
      const entries = yield* E.all(
        names.map((name) => {
          const entry = path.join(current, name);
          return fileSystem.stat(entry).pipe(E.map((info) => ({ entry, info })));
        }),
        { concurrency: "unbounded" },
      );
      for (const { entry, info } of entries) {
        if (info.type === "Directory") pending.push(entry);
        else files.push(entry);
      }
    }
    return files;
  });

const expandDirectory = (
  sourceDirectory: string,
  destinationDirectory: string,
  target: Target,
) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceFiles = yield* listFiles(sourceDirectory);
    return yield* E.all(
      sourceFiles.map((source) =>
        E.gen(function* () {
          const contents = yield* fileSystem.readFileString(source);
          return {
            source,
            destination: joinPath(
              path,
              destinationDirectory,
              path.relative(sourceDirectory, source),
            ),
            target,
            contents: renderForTarget(contents, target),
          } satisfies DesiredFile;
        }),
      ),
      { concurrency: "unbounded" },
    );
  });

const readState = (statePath: string) =>
  readOptional(statePath).pipe(
    E.map((contents): DeploymentState =>
      contents === undefined ? {} : (JSON.parse(contents) as DeploymentState),
    ),
  );

export const loadWorkspace = (projectRoot: string, homeDirectory: string) =>
  E.gen(function* () {
    const path = yield* Path.Path;
    const manifestPath = path.join(projectRoot, "config", "manifest.json");
    const manifest = yield* readManifest(manifestPath);
    const statePath = joinPath(path, homeDirectory, ".reed-ai", "state.json");
    return { homeDirectory, manifest, projectRoot, statePath } as const;
  });

export const buildDesiredFiles = (
  projectRoot: string,
  homeDirectory: string,
  manifest: Manifest,
  selectedTargets: ReadonlyArray<Target> = targets,
) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const skillFiles = yield* E.all(
      manifest.skills.flatMap((skill) =>
        selectedTargets.filter((target) => skill.targets.includes(target)).map((target) => {
          const source = path.join(projectRoot, "skills", skill.id);
          const destination = joinPath(path, homeDirectory, `.${target}`, "skills", skill.id);
          return expandDirectory(source, destination, target);
        }),
      ),
      { concurrency: "unbounded" },
    );
    const pluginFiles = selectedTargets.includes("claude")
      ? yield* E.all(
          manifest.plugins.map((plugin) =>
            expandDirectory(
              path.join(projectRoot, plugin.source),
              joinPath(path, homeDirectory, plugin.claudeDestination),
              "claude",
            ),
          ),
          { concurrency: "unbounded" },
        )
      : [];
    const instructionFiles = yield* E.all(
      manifest.instructions.flatMap((instruction) =>
        instruction.destinations
          .filter((destination) => {
            const target: Target = destination.startsWith(".claude") ? "claude" : "codex";
            return selectedTargets.includes(target);
          })
          .map((destination) =>
            E.gen(function* () {
              const source = path.join(projectRoot, instruction.source);
              const contents = yield* fileSystem.readFileString(source);
              const target: Target = destination.startsWith(".claude") ? "claude" : "codex";
              return {
                source,
                destination: joinPath(path, homeDirectory, destination),
                target,
                contents: renderForTarget(contents, target),
              } satisfies DesiredFile;
            }),
          ),
      ),
      { concurrency: "unbounded" },
    );
    const settingsFiles = yield* E.all(
      manifest.settings
        .filter((setting) => selectedTargets.includes(setting.target))
        .map((setting) =>
          E.gen(function* () {
            const source = path.join(projectRoot, setting.source);
            const destination = joinPath(path, homeDirectory, setting.destination);
            const desiredContents = yield* fileSystem.readFileString(source);
            const currentContents = yield* readOptional(destination);
            const desiredSettings = parseDesiredSettings(desiredContents);
            const desired = selectDesiredSettings(
              desiredSettings,
              setting.selector,
            );
            const removals = selectDesiredSettingRemovals(
              desiredSettings,
              setting.selector,
            );
            const reconciled =
              setting.format === "json"
                ? reconcileJsonSettings(currentContents, desired, removals)
                : reconcileTomlBooleans(currentContents, desired);
            return {
              source,
              destination,
              target: setting.target,
              ...reconciled,
            } satisfies DesiredFile;
          }),
        ),
      { concurrency: "unbounded" },
    );
    return [...skillFiles.flat(), ...pluginFiles.flat(), ...instructionFiles, ...settingsFiles];
  });

export const buildPlan = (
  projectRoot: string,
  homeDirectory: string,
  selectedTargets: ReadonlyArray<Target> = targets,
) =>
  E.gen(function* () {
    const workspace = yield* loadWorkspace(projectRoot, homeDirectory);
    const desiredFiles = yield* buildDesiredFiles(
      projectRoot,
      homeDirectory,
      workspace.manifest,
      selectedTargets,
    );
    const state = yield* readState(workspace.statePath);
    const actions = yield* E.all(
      desiredFiles.map((desired) =>
        readOptional(desired.destination).pipe(
          E.map((current) => classifyFile(desired, current, state[desired.destination])),
        ),
      ),
      { concurrency: "unbounded" },
    );
    return { ...workspace, actions } as const;
  });

export const validateProject = (projectRoot: string, manifest: Manifest) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const desired = yield* buildDesiredFiles(projectRoot, projectRoot, manifest);
    const missingTokens = desired.filter((file) => file.contents.includes("{{"));
    const personalPaths = desired.filter((file) => /C:\\Users\\[^\\]+/i.test(file.contents));
    const missingSkills = yield* E.all(
      manifest.skills.map((skill) =>
        fileSystem.exists(path.join(projectRoot, "skills", skill.id, "SKILL.md")).pipe(
          E.map((exists) => ({ exists, skill })),
        ),
      ),
    );
    const marketplacePath = path.join(projectRoot, manifest.marketplace.source);
    const marketplaceContents = yield* readOptional(marketplacePath);
    const marketplace =
      marketplaceContents === undefined ? {} : parseRecord(marketplaceContents);
    const marketplacePlugins = Array.isArray(marketplace.plugins)
      ? marketplace.plugins.filter(isRecord)
      : [];
    const marketplaceProblems = [
      ...(marketplace.name === manifest.marketplace.name
        ? []
        : [`marketplace name must be ${manifest.marketplace.name}: ${marketplacePath}`]),
      ...manifest.plugins.flatMap((plugin) => {
        const entry = marketplacePlugins.find((candidate) => candidate.name === plugin.packageName);
        const source = entry !== undefined && isRecord(entry.source) ? entry.source : {};
        const policy = entry !== undefined && isRecord(entry.policy) ? entry.policy : {};
        const expectedPath = `./${plugin.source.replaceAll("\\", "/")}`;
        return [
          ...(entry === undefined
            ? [`missing marketplace plugin ${plugin.packageName}: ${marketplacePath}`]
            : []),
          ...(source.source === "local" && source.path === expectedPath
            ? []
            : [`invalid marketplace source for ${plugin.packageName}: ${marketplacePath}`]),
          ...(policy.installation === "AVAILABLE" && policy.authentication === "ON_INSTALL"
            ? []
            : [`invalid marketplace policy for ${plugin.packageName}: ${marketplacePath}`]),
        ];
      }),
    ];
    const pluginPackageProblems = yield* E.all(
      manifest.plugins.map((plugin) =>
        E.gen(function* () {
          const pluginPath = path.join(projectRoot, plugin.source, "plugin.json");
          const contents = yield* readOptional(pluginPath);
          const packageManifest = contents === undefined ? {} : parseRecord(contents);
          return [
            ...(packageManifest.$schema ===
            "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
              ? []
              : [`invalid portable plugin schema: ${pluginPath}`]),
            ...(packageManifest.name === plugin.packageName
              ? []
              : [`plugin name must be ${plugin.packageName}: ${pluginPath}`]),
            ...(typeof packageManifest.version === "string" && packageManifest.version.length > 0
              ? []
              : [`missing plugin version: ${pluginPath}`]),
          ];
        }),
      ),
      { concurrency: "unbounded" },
    );
    const invocationPolicies = yield* E.all(
      manifest.plugins
        .filter((plugin) => plugin.explicitOnly)
        .map((plugin) =>
          E.gen(function* () {
            const skillsDirectory = path.join(projectRoot, plugin.source, "skills");
            const skillNames = yield* fileSystem.readDirectory(skillsDirectory);
            return yield* E.all(
              skillNames.map((skill) =>
                E.gen(function* () {
                  const policyPath = path.join(skillsDirectory, skill, "agents", "openai.yaml");
                  const contents = yield* readOptional(policyPath);
                  return {
                    policyPath,
                    valid: contents?.includes("allow_implicit_invocation: false") === true,
                  };
                }),
              ),
              { concurrency: "unbounded" },
            );
          }),
        ),
      { concurrency: "unbounded" },
    );
    return {
      marketplaceProblems,
      pluginPackageProblems: pluginPackageProblems.flat(),
      invalidInvocationPolicies: invocationPolicies
        .flat()
        .filter((policy) => !policy.valid)
        .map((policy) => policy.policyPath),
      missingSkills: missingSkills.filter((entry) => !entry.exists).map((entry) => entry.skill.id),
      missingTokens: missingTokens.map((file) => file.source),
      personalPaths: personalPaths.map((file) => file.source),
    };
  });

export type WorkspacePlan = {
  readonly homeDirectory: string;
  readonly projectRoot: string;
  readonly statePath: string;
  readonly manifest: Manifest;
  readonly actions: ReadonlyArray<PlanAction>;
};
export type WorkspaceAction = PlanAction;
