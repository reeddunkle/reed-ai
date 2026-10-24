import * as E from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import type { Environment, Target, TargetSelection } from "./domain.js";
import { EnvironmentResolutionError } from "./errors.js";

export type ResolvedEnvironment = {
  readonly id: string;
  readonly homeDirectory: string;
  readonly targets: ReadonlyArray<Target>;
};

type EnvironmentRequest = {
  readonly environments: ReadonlyArray<Environment>;
  readonly variables: Readonly<Record<string, string | undefined>>;
  readonly defaultHome: string;
  readonly home: Option.Option<string>;
  readonly environmentId: Option.Option<string>;
  readonly targetSelection: TargetSelection;
};

const narrowTargets = (targets: ReadonlyArray<Target>, selection: TargetSelection) =>
  selection === "all" ? targets : targets.filter((target) => target === selection);

export const selectEnvironments = ({
  defaultHome,
  environmentId,
  environments,
  home,
  targetSelection,
  variables,
}: EnvironmentRequest) => {
  if (Option.isSome(home)) {
    return {
      environments: [
        {
          id: "home",
          homeDirectory: home.value,
          targets: narrowTargets(["claude", "codex"], targetSelection),
        },
      ],
      problems: [],
    } as const;
  }
  const selected = Option.match(environmentId, {
    onNone: () => environments,
    onSome: (id) => environments.filter((environment) => environment.id === id),
  });
  const unknownEnvironment = Option.match(environmentId, {
    onNone: () => [],
    onSome: (id) =>
      selected.length === 0
        ? [`unknown environment ${id}; configured: ${environments.map(({ id }) => id).join(", ")}`]
        : [],
  });
  const resolved = selected.map((environment) => {
    const homeDirectory =
      environment.homeVariable === undefined ? defaultHome : variables[environment.homeVariable];
    return {
      environment,
      homeDirectory: homeDirectory === undefined || homeDirectory.length === 0 ? undefined : homeDirectory,
    };
  });
  const missingHomes = resolved
    .filter(({ homeDirectory }) => homeDirectory === undefined)
    .map(
      ({ environment }) =>
        `environment ${environment.id} needs ${environment.homeVariable} in .env (see .env.example)`,
    );
  return {
    environments: resolved.flatMap(({ environment, homeDirectory }) =>
      homeDirectory === undefined
        ? []
        : [
            {
              id: environment.id,
              homeDirectory,
              targets: narrowTargets(environment.targets, targetSelection),
            },
          ],
    ),
    problems: [...unknownEnvironment, ...missingHomes],
  } as const;
};

export const resolveEnvironments = (request: EnvironmentRequest) =>
  E.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const selection = selectEnvironments(request);
    const reachability = yield* E.all(
      selection.environments.map((environment) =>
        fileSystem.exists(environment.homeDirectory).pipe(
          E.orElseSucceed(() => false),
          E.map((exists) => ({ environment, exists })),
        ),
      ),
      { concurrency: "unbounded" },
    );
    const problems = [
      ...selection.problems,
      ...reachability
        .filter(({ exists }) => !exists)
        .map(({ environment }) => `environment ${environment.id} home is unreachable: ${environment.homeDirectory}`),
    ];
    if (problems.length > 0) {
      return yield* new EnvironmentResolutionError({ message: problems.join("\n") });
    }
    return selection.environments.filter((environment) => environment.targets.length > 0);
  });
