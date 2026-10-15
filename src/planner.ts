import type { DesiredFile, PlanAction } from "./domain.js";
import { createHash } from "node:crypto";

export const hashContents = (contents: string): string =>
  createHash("sha256").update(contents).digest("hex");

export const classifyFile = (
  desired: DesiredFile,
  currentContents: string | undefined,
  lastDeployedHash: string | undefined,
): PlanAction => {
  const desiredState = desired.desiredState ?? desired.contents;
  const currentState = desired.currentState ?? currentContents;

  if (currentState === desiredState) {
    return currentContents === undefined
      ? { ...desired, kind: "unchanged" }
      : { ...desired, kind: "unchanged", currentContents };
  }

  if (currentContents === undefined) {
    return { ...desired, kind: "create" };
  }

  if (lastDeployedHash === undefined || hashContents(currentState ?? "") !== lastDeployedHash) {
    return { ...desired, kind: "conflict", currentContents };
  }

  return { ...desired, kind: "update", currentContents };
};

export const actionablePlan = (actions: ReadonlyArray<PlanAction>) =>
  actions.filter((action) => action.kind !== "unchanged");
