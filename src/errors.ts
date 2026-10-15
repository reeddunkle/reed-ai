import * as Data from "effect/Data";

export class InvalidManifestError extends Data.TaggedError("InvalidManifestError")<{
  readonly message: string;
}> {}

export class DriftDetectedError extends Data.TaggedError("DriftDetectedError")<{
  readonly count: number;
}> {}

export class ConflictDetectedError extends Data.TaggedError("ConflictDetectedError")<{
  readonly count: number;
}> {}

export class InvalidSettingsError extends Data.TaggedError("InvalidSettingsError")<{
  readonly message: string;
}> {}

export class ConversationArchiveError extends Data.TaggedError("ConversationArchiveError")<{
  readonly message: string;
}> {}
