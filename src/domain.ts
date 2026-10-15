export type Target = "claude" | "codex";
export type TargetSelection = Target | "all";

export type Manifest = {
  readonly version: 1;
  readonly conversationRetention: {
    readonly codex: {
      readonly enabled: boolean;
      readonly archiveAfterDays: number;
    };
    readonly claude: {
      readonly enabled: boolean;
      readonly archiveAfterDays: number;
    };
  };
  readonly marketplace: {
    readonly name: string;
    readonly source: string;
  };
  readonly skills: ReadonlyArray<{
    readonly id: string;
    readonly targets: ReadonlyArray<Target>;
  }>;
  readonly plugins: ReadonlyArray<{
    readonly id: string;
    readonly packageName: string;
    readonly source: string;
    readonly explicitOnly: boolean;
    readonly claudeDestination: string;
  }>;
  readonly instructions: ReadonlyArray<{
    readonly source: string;
    readonly destinations: ReadonlyArray<string>;
  }>;
  readonly settings: ReadonlyArray<{
    readonly source: string;
    readonly destination: string;
    readonly target: Target;
    readonly selector: "claude.settings" | "codex.config";
    readonly format: "json" | "toml-booleans";
  }>;
  readonly thirdParty: ReadonlyArray<{
    readonly id: string;
    readonly source?: string;
    readonly version?: string;
    readonly managedBy: string;
  }>;
};

export type DesiredFile = {
  readonly source: string;
  readonly destination: string;
  readonly target: Target;
  readonly contents: string;
  readonly desiredState?: string;
  readonly currentState?: string;
  readonly changedPaths?: ReadonlyArray<string>;
};

export type PlanAction = {
  readonly kind: "create" | "update" | "conflict" | "unchanged";
  readonly source: string;
  readonly destination: string;
  readonly target: Target;
  readonly contents: string;
  readonly currentContents?: string;
  readonly desiredState?: string;
  readonly currentState?: string;
  readonly changedPaths?: ReadonlyArray<string>;
};
