import { describe, expect, it } from "vitest";

import {
  type CodexThread,
  selectConversationArchiveCandidates,
} from "../src/conversation-archive.js";

const now = new Date("2026-10-15T16:00:00.000Z");
const old = Math.floor(new Date("2026-09-01T16:00:00.000Z").getTime() / 1000);
const recent = Math.floor(new Date("2026-10-10T16:00:00.000Z").getTime() / 1000);

const thread = (overrides: Partial<CodexThread> = {}): CodexThread => ({
  id: "root",
  sessionId: "session",
  parentThreadId: null,
  name: "Old task",
  preview: "Old task preview",
  updatedAt: old,
  ephemeral: false,
  section: null,
  status: { type: "notLoaded" },
  ...overrides,
});

describe("Codex conversation archival", () => {
  it("selects whole old conversation trees with children first", () => {
    const plan = selectConversationArchiveCandidates(
      [thread(), thread({ id: "child", parentThreadId: "root" })],
      14,
      now,
    );

    expect(plan.candidates.map(({ id }) => id)).toEqual(["child", "root"]);
    expect(plan.cutoff).toBe("2026-10-01T16:00:00.000Z");
  });

  it.each([
    ["recent", thread({ updatedAt: recent })],
    ["active", thread({ status: { type: "active" } })],
    ["pinned", thread({ section: { id: "pinned", name: "Pinned" } })],
    ["ephemeral", thread({ ephemeral: true })],
  ])("protects a tree containing a %s thread", (_label, protectedThread) => {
    const plan = selectConversationArchiveCandidates(
      [thread(), protectedThread, thread({ id: "child", parentThreadId: "root" })],
      14,
      now,
    );

    expect(plan.candidates).toEqual([]);
  });

  it("protects the current conversation tree", () => {
    const plan = selectConversationArchiveCandidates(
      [thread(), thread({ id: "child", parentThreadId: "root" })],
      14,
      now,
      "child",
    );

    expect(plan.candidates).toEqual([]);
  });

  it("keeps unrelated eligible sessions", () => {
    const plan = selectConversationArchiveCandidates(
      [thread({ updatedAt: recent }), thread({ id: "other", sessionId: "other-session" })],
      14,
      now,
    );

    expect(plan.candidates.map(({ id }) => id)).toEqual(["other"]);
    expect(plan.protectedThreadCount).toBe(1);
  });

  it("deduplicates repeated app-server records conservatively", () => {
    const plan = selectConversationArchiveCandidates(
      [thread(), thread({ status: { type: "active" } })],
      14,
      now,
    );

    expect(plan.candidates).toEqual([]);
    expect(plan.protectedThreadCount).toBe(1);
  });

  it("does not archive a conversation updated exactly at the cutoff", () => {
    const cutoff = Math.floor(new Date("2026-10-01T16:00:00.000Z").getTime() / 1000);
    const plan = selectConversationArchiveCandidates(
      [thread({ updatedAt: cutoff })],
      14,
      now,
    );

    expect(plan.candidates).toEqual([]);
  });

  it("handles malformed parent cycles without recursing forever", () => {
    const plan = selectConversationArchiveCandidates(
      [
        thread({ id: "one", parentThreadId: "two" }),
        thread({ id: "two", parentThreadId: "one" }),
      ],
      14,
      now,
    );

    expect(plan.candidates).toHaveLength(2);
  });
});
