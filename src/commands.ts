import * as Console from "effect/Console";
import * as E from "effect/Effect";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";

import {
  findLegacyProjectSnapshots,
  legacyProjectSnapshotDirectories,
  removeLegacyProjectSnapshots,
} from "./cleanup.js";
import type { TargetSelection } from "./domain.js";
import { DriftDetectedError } from "./errors.js";
import { backupPlan, deployPlan } from "./executor.js";
import { applyMemoryCleanup, planMemoryCleanup } from "./memory-cleanup.js";
import { actionablePlan } from "./planner.js";
import { buildPlan, loadWorkspace, validateProject } from "./workspace.js";

type CommandEnvironment = {
  readonly homeDirectory: string;
  readonly projectRoot: string;
};

const printPlan = (
  actions: ReadonlyArray<{
    readonly kind: string;
    readonly destination: string;
    readonly changedPaths?: ReadonlyArray<string>;
  }>,
) =>
  E.forEach(
    actions,
    (action) =>
      E.gen(function* () {
        yield* Console.log(`${action.kind.padEnd(9)} ${action.destination}`);
        yield* E.forEach(action.changedPaths ?? [], (path) => Console.log(`          ${path}`));
      }),
    { discard: true },
  );

export const makeRootCommand = ({ homeDirectory, projectRoot }: CommandEnvironment) => {
  const rootCommand = Command.make("reed-ai").pipe(
    Command.withSharedFlags({
      home: Flag.String("home").pipe(Flag.withDefault(homeDirectory)),
      target: Flag.Literals("target", ["all", "claude", "codex"] as const).pipe(
        Flag.withDefault("all" as const),
      ),
    }),
  );
  const deploymentEnvironment = E.gen(function* () {
    const config = yield* rootCommand;
    return {
      homeDirectory: config.home,
      targetSelection: config.target as TargetSelection,
    };
  });
  const planCommand = Command.make(
    "plan",
    { json: Flag.Boolean("json").pipe(Flag.withDefault(false)) },
    ({ json }) =>
      E.gen(function* () {
        const deployment = yield* deploymentEnvironment;
        const plan = yield* buildPlan(
          projectRoot,
          deployment.homeDirectory,
          deployment.targetSelection,
        );
        const actions = actionablePlan(plan.actions);
        if (json) {
          yield* Console.log(JSON.stringify(actions, null, 2));
        } else if (actions.length === 0) {
          yield* Console.log("No deployment drift.");
        } else {
          yield* printPlan(actions);
        }
      }),
  ).pipe(Command.withDescription("Show the allowlisted deployment plan without writing files."));

  const deployCommand = Command.make(
    "deploy",
    { force: Flag.Boolean("force").pipe(Flag.withDefault(false)) },
    ({ force }) =>
      E.gen(function* () {
        const deployment = yield* deploymentEnvironment;
        const plan = yield* buildPlan(
          projectRoot,
          deployment.homeDirectory,
          deployment.targetSelection,
        );
        const changed = yield* deployPlan(plan, force);
        yield* Console.log(`Deployed ${changed} file${changed === 1 ? "" : "s"}.`);
      }),
  ).pipe(Command.withDescription("Apply an allowlisted plan and record deployed hashes."));

  const checkCommand = Command.make(
    "check",
    { projectOnly: Flag.Boolean("project-only").pipe(Flag.withDefault(false)) },
    ({ projectOnly }) =>
      E.gen(function* () {
        const deployment = yield* deploymentEnvironment;
        const workspace = yield* loadWorkspace(projectRoot, deployment.homeDirectory);
        const validation = yield* validateProject(projectRoot, workspace.manifest);
        const validationProblems = [
          ...validation.marketplaceProblems,
          ...validation.pluginPackageProblems,
          ...validation.invalidInvocationPolicies.map(
            (source) => `missing explicit-only invocation policy: ${source}`,
          ),
          ...validation.missingSkills.map((skill) => `missing skill: ${skill}`),
          ...validation.missingTokens.map((source) => `unresolved template token: ${source}`),
          ...validation.personalPaths.map((source) => `personal absolute path: ${source}`),
        ];
        yield* E.forEach(validationProblems, (problem) => Console.error(problem), { discard: true });
        if (validationProblems.length > 0) {
          return yield* new DriftDetectedError({ count: validationProblems.length });
        }
        if (!projectOnly) {
          const plan = yield* buildPlan(
            projectRoot,
            deployment.homeDirectory,
            deployment.targetSelection,
          );
          const drift = actionablePlan(plan.actions);
          if (drift.length > 0) {
            yield* printPlan(drift);
            return yield* new DriftDetectedError({ count: drift.length });
          }
        }
        yield* Console.log(projectOnly ? "Project sources are valid." : "Project and deployments are in sync.");
      }),
  ).pipe(Command.withDescription("Validate sources and fail when deployed files drift."));

  const backupCommand = Command.make("backup", {}, () =>
    E.gen(function* () {
      const deployment = yield* deploymentEnvironment;
      const plan = yield* buildPlan(
        projectRoot,
        deployment.homeDirectory,
        deployment.targetSelection,
      );
      const backupRoot = yield* backupPlan(plan);
      yield* Console.log(`Backup written to ${backupRoot}`);
    }),
  ).pipe(Command.withDescription("Back up existing managed destination files."));

  const cleanupPlanCommand = Command.make("plan", {}, () =>
    E.gen(function* () {
      const existing = yield* findLegacyProjectSnapshots(projectRoot);
      if (existing.length === 0) {
        yield* Console.log("No legacy project snapshot directories remain.");
      } else {
        yield* E.forEach(existing, (directory) => Console.log(`project snapshot ${directory}`));
      }
    }),
  );
  const cleanupApplyCommand = Command.make(
    "apply",
    { force: Flag.Boolean("force").pipe(Flag.withDefault(false)) },
    ({ force }) =>
      E.gen(function* () {
        if (!force) {
          return yield* new DriftDetectedError({ count: legacyProjectSnapshotDirectories.length });
        }
        yield* removeLegacyProjectSnapshots(projectRoot);
        yield* Console.log("Removed legacy project snapshot directories. User home directories were untouched.");
      }),
  );
  const cleanupCommand = Command.make("cleanup").pipe(
    Command.withDescription("Review or remove legacy project snapshots only."),
    Command.withSubcommands([cleanupPlanCommand, cleanupApplyCommand]),
  );

  const memoryTarget = Flag.Literals("memory-target", ["claude", "codex"] as const);
  const memoryPlanCommand = Command.make("plan", { memoryTarget }, ({ memoryTarget }) =>
    E.gen(function* () {
      const deployment = yield* deploymentEnvironment;
      const plan = yield* planMemoryCleanup(deployment.homeDirectory, memoryTarget);
      if (plan.directories.length === 0) {
        yield* Console.log(`No ${memoryTarget} memory directories exist.`);
      } else {
        yield* E.forEach(plan.directories, (directory) => Console.log(`memory directory ${directory}`));
      }
    }),
  );
  const memoryApplyCommand = Command.make(
    "apply",
    {
      memoryTarget,
      force: Flag.Boolean("force").pipe(Flag.withDefault(false)),
    },
    ({ force, memoryTarget }) =>
      E.gen(function* () {
        if (!force) return yield* new DriftDetectedError({ count: 1 });
        const deployment = yield* deploymentEnvironment;
        const result = yield* applyMemoryCleanup(deployment.homeDirectory, memoryTarget);
        yield* Console.log(
          result.backupDirectory === undefined
            ? `No ${memoryTarget} memory directory exists.`
            : `Backed up memories to ${result.backupDirectory} and removed ${result.directories.length} director${result.directories.length === 1 ? "y" : "ies"}.`,
        );
      }),
  );
  const memoryCommand = Command.make("memory").pipe(
    Command.withDescription("Plan or apply backed-up removal of local agent memories."),
    Command.withSubcommands([memoryPlanCommand, memoryApplyCommand]),
  );

  return rootCommand.pipe(
    Command.withDescription("Manage shared Claude and Codex skills from one source of truth."),
    Command.withSubcommands([
      planCommand,
      deployCommand,
      checkCommand,
      backupCommand,
      cleanupCommand,
      memoryCommand,
    ]),
  );
};
