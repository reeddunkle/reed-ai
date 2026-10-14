export type Target = "claude" | "codex";
export type TargetSelection = Target | "all";

export type Manifest = {
  readonly version: 1;
  readonly marketplace: {
    readonly name: string;
    readonly source: string;
  };
  readonly skills: ReadonlyArray<string>;
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
};

export type PlanAction = {
  readonly kind: "create" | "update" | "conflict" | "unchanged";
  readonly source: string;
  readonly destination: string;
  readonly target: Target;
  readonly contents: string;
  readonly currentContents?: string;
};
