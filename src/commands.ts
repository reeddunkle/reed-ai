import * as Console from "effect/Console";
import * as E from "effect/Effect";
import * as Option from "effect/Option";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";

import {
  findLegacyProjectSnapshots,
  legacyProjectSnapshotDirectories,
  removeLegacyProjectSnapshots,
} from "./cleanup.js";
import {
  applyCodexConversationArchive,
  planCodexConversationArchive,
} from "./conversation-archive.js";
import type { TargetSelection } from "./domain.js";
import { type ResolvedEnvironment, resolveEnvironments } from "./environments.js";
import { ConflictDetectedError, ConversationArchiveError, DriftDetectedError } from "./errors.js";
import { backupPlan, deployPlan } from "./executor.js";
import { applyMemoryCleanup, planMemoryCleanup } from "./memory-cleanup.js";
import { actionablePlan } from "./planner.js";
import { buildPlan, loadWorkspace, validateProject } from "./workspace.js";

type CommandEnvironment = {
  readonly codexExecutable: string;
  readonly currentThreadId: string | undefined;
  readonly environmentVariables: Readonly<Record<string, string | undefined>>;
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

export const makeRootCommand = ({
  codexExecutable,
  currentThreadId,
  environmentVariables,
  homeDirectory,
  projectRoot,
}: CommandEnvironment) => {
  const rootCommand = Command.make("reed-ai").pipe(
    Command.withSharedFlags({
      home: Flag.String("home").pipe(Flag.optional),
      environment: Flag.String("environment").pipe(Flag.optional),
      target: Flag.Literals("target", ["all", "claude", "codex"] as const).pipe(
        Flag.withDefault("all" as const),
      ),
    }),
  );
  const localHome = rootCommand.pipe(
    E.map((config) => Option.getOrElse(config.home, () => homeDirectory)),
  );
  const environmentPlans = E.gen(function* () {
    const config = yield* rootCommand;
    const workspace = yield* loadWorkspace(projectRoot, homeDirectory);
    const environments = yield* resolveEnvironments({
      defaultHome: homeDirectory,
      environmentId: config.environment,
      environments: workspace.manifest.environments,
      home: config.home,
      targetSelection: config.target as TargetSelection,
      variables: environmentVariables,
    });
    return yield* E.all(
      environments.map((environment) =>
        buildPlan(projectRoot, environment.homeDirectory, environment.targets).pipe(
          E.map((plan) => ({ environment, plan })),
        ),
      ),
      { concurrency: "unbounded" },
    );
  });
  const printEnvironmentHeader = (environment: ResolvedEnvironment) =>
    Console.log(`[${environment.id}] ${environment.homeDirectory} (${environment.targets.join(", ")})`);

  const planCommand = Command.make(
    "plan",
    { json: Flag.Boolean("json").pipe(Flag.withDefault(false)) },
    ({ json }) =>
      E.gen(function* () {
        const plans = yield* environmentPlans;
        if (json) {
          const report = plans.map(({ environment, plan }) => ({
            environment: environment.id,
            actions: actionablePlan(plan.actions),
          }));
          yield* Console.log(JSON.stringify(report, null, 2));
          return;
        }
        yield* E.forEach(
          plans,
          ({ environment, plan }) =>
            E.gen(function* () {
              const actions = actionablePlan(plan.actions);
              yield* printEnvironmentHeader(environment);
              if (actions.length === 0) yield* Console.log("No deployment drift.");
              else yield* printPlan(actions);
            }),
          { discard: true },
        );
      }),
  ).pipe(Command.withDescription("Show the allowlisted deployment plan without writing files."));

  const deployCommand = Command.make(
    "deploy",
    { force: Flag.Boolean("force").pipe(Flag.withDefault(false)) },
    ({ force }) =>
      E.gen(function* () {
        const plans = yield* environmentPlans;
        const conflicts = plans.flatMap(({ environment, plan }) =>
          plan.actions
            .filter((action) => action.kind === "conflict")
            .map((action) => ({ environment, action })),
        );
        if (conflicts.length > 0 && !force) {
          yield* E.forEach(
            conflicts,
            ({ action, environment }) =>
              Console.error(`conflict  [${environment.id}] ${action.destination}`),
            { discard: true },
          );
          return yield* new ConflictDetectedError({ count: conflicts.length });
        }
        yield* E.forEach(
          plans,
          ({ environment, plan }) =>
            deployPlan(plan, force).pipe(
              E.flatMap((changed) =>
                Console.log(`[${environment.id}] Deployed ${changed} file${changed === 1 ? "" : "s"}.`),
              ),
            ),
          { discard: true },
        );
      }),
  ).pipe(Command.withDescription("Apply an allowlisted plan and record deployed hashes."));

  const checkCommand = Command.make(
    "check",
    { projectOnly: Flag.Boolean("project-only").pipe(Flag.withDefault(false)) },
    ({ projectOnly }) =>
      E.gen(function* () {
        const home = yield* localHome;
        const workspace = yield* loadWorkspace(projectRoot, home);
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
          const plans = yield* environmentPlans;
          const drifted = plans
            .map(({ environment, plan }) => ({ environment, drift: actionablePlan(plan.actions) }))
            .filter(({ drift }) => drift.length > 0);
          yield* E.forEach(
            drifted,
            ({ drift, environment }) =>
              printEnvironmentHeader(environment).pipe(E.andThen(printPlan(drift))),
            { discard: true },
          );
          const count = drifted.reduce((total, { drift }) => total + drift.length, 0);
          if (count > 0) return yield* new DriftDetectedError({ count });
        }
        yield* Console.log(projectOnly ? "Project sources are valid." : "Project and deployments are in sync.");
      }),
  ).pipe(Command.withDescription("Validate sources and fail when deployed files drift."));

  const backupCommand = Command.make("backup", {}, () =>
    E.gen(function* () {
      const plans = yield* environmentPlans;
      yield* E.forEach(
        plans,
        ({ environment, plan }) =>
          backupPlan(plan).pipe(
            E.flatMap((backupRoot) => Console.log(`[${environment.id}] Backup written to ${backupRoot}`)),
          ),
        { discard: true },
      );
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
      const home = yield* localHome;
      const plan = yield* planMemoryCleanup(home, memoryTarget);
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
        const home = yield* localHome;
        const result = yield* applyMemoryCleanup(home, memoryTarget);
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

  const conversationFlags = {
    olderThanDays: Flag.Int("older-than-days").pipe(Flag.optional),
  };
  const resolveConversationPolicy = E.fnUntraced(function* (
    olderThanDays: Option.Option<number>,
  ) {
    const home = yield* localHome;
    const workspace = yield* loadWorkspace(projectRoot, home);
    const policy = workspace.manifest.conversationRetention.codex;
    if (!policy.enabled) {
      return yield* new ConversationArchiveError({
        message: "Codex conversation archival is disabled in config/manifest.json",
      });
    }
    const archiveAfterDays = Option.getOrElse(olderThanDays, () => policy.archiveAfterDays);
    if (archiveAfterDays < 1) {
      return yield* new ConversationArchiveError({
        message: "--older-than-days must be an integer greater than zero",
      });
    }
    return {
      archiveAfterDays,
      homeDirectory: home,
    } as const;
  });
  const conversationPlanCommand = Command.make(
    "plan",
    {
      ...conversationFlags,
      json: Flag.Boolean("json").pipe(Flag.withDefault(false)),
    },
    ({ json, olderThanDays }) =>
      E.gen(function* () {
        const policy = yield* resolveConversationPolicy(olderThanDays);
        const plan = yield* planCodexConversationArchive(
          policy.archiveAfterDays,
          currentThreadId,
          codexExecutable,
        );
        if (json) {
          yield* Console.log(JSON.stringify(plan, null, 2));
        } else if (plan.candidates.length === 0) {
          yield* Console.log(`No local Codex conversations were last updated before ${plan.cutoff}.`);
        } else {
          yield* Console.log(
            `${plan.candidates.length} local Codex conversation${plan.candidates.length === 1 ? "" : "s"} were last updated before ${plan.cutoff}:`,
          );
          yield* E.forEach(
            plan.candidates,
            (candidate) =>
              Console.log(
                `${candidate.id} ${new Date(candidate.updatedAt * 1000).toISOString()} ${candidate.title}`,
              ),
            { discard: true },
          );
        }
      }),
  );
  const conversationApplyCommand = Command.make(
    "apply",
    {
      ...conversationFlags,
      force: Flag.Boolean("force").pipe(Flag.withDefault(false)),
    },
    ({ force, olderThanDays }) =>
      E.gen(function* () {
        if (!force) return yield* new DriftDetectedError({ count: 1 });
        const policy = yield* resolveConversationPolicy(olderThanDays);
        const plan = yield* planCodexConversationArchive(
          policy.archiveAfterDays,
          currentThreadId,
          codexExecutable,
        );
        const result = yield* applyCodexConversationArchive(
          policy.homeDirectory,
          plan,
          codexExecutable,
        );
        const archived = result.results.filter(({ status }) => status === "archived").length;
        const failed = result.results.length - archived;
        yield* Console.log(
          `Archived ${archived} conversation${archived === 1 ? "" : "s"}. Journal written to ${result.journalPath}`,
        );
        if (failed > 0) {
          return yield* new ConversationArchiveError({
            message: `${failed} conversation${failed === 1 ? "" : "s"} could not be archived`,
          });
        }
      }),
  );
  const conversationsCommand = Command.make("conversations").pipe(
    Command.withDescription("Plan or apply native archival of old local Codex conversations."),
    Command.withSubcommands([conversationPlanCommand, conversationApplyCommand]),
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
      conversationsCommand,
    ]),
  );
};
