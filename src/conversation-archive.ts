import * as E from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { spawn } from "node:child_process";

import { ConversationArchiveError } from "./errors.js";
import { joinPath } from "./paths.js";

type ThreadStatus = Readonly<{
  type: "notLoaded" | "idle" | "systemError" | "active";
}>;

type ThreadSection = Readonly<{
  id: string;
  name: string;
}>;

export type CodexThread = Readonly<{
  id: string;
  sessionId: string;
  parentThreadId: string | null;
  name: string | null;
  preview: string;
  updatedAt: number;
  ephemeral: boolean;
  section: ThreadSection | null;
  status: ThreadStatus;
}>;

export type ConversationArchiveCandidate = Readonly<{
  id: string;
  title: string;
  updatedAt: number;
  parentThreadId: string | null;
}>;

export type ConversationArchivePlan = Readonly<{
  archiveAfterDays: number;
  cutoff: string;
  candidates: ReadonlyArray<ConversationArchiveCandidate>;
  protectedThreadCount: number;
}>;

export type ConversationArchiveResult = Readonly<{
  id: string;
  status: "archived" | "failed";
  error?: string;
}>;

type JsonRpcResponse = Readonly<{
  id?: number;
  result?: unknown;
  error?: Readonly<{ message?: string }>;
}>;

type ThreadListResponse = Readonly<{
  data: ReadonlyArray<CodexThread>;
  nextCursor: string | null;
}>;

const sourceKinds = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown",
] as const;

const isPinned = (thread: CodexThread) =>
  thread.section?.id.toLowerCase() === "pinned" ||
  thread.section?.name.toLowerCase() === "pinned";

const threadTitle = (thread: CodexThread) => thread.name ?? thread.preview.split("\n")[0] ?? thread.id;

const treeIsEligible = (
  threads: ReadonlyArray<CodexThread>,
  cutoffSeconds: number,
  currentThreadId: string | undefined,
) =>
  threads.every(
    (thread) =>
      thread.updatedAt < cutoffSeconds &&
      !thread.ephemeral &&
      thread.status.type !== "active" &&
      !isPinned(thread) &&
      thread.id !== currentThreadId,
  );

const canonicalizeThreadCopies = (threads: ReadonlyArray<CodexThread>) =>
  [...Map.groupBy(threads, (thread) => thread.id).values()].map((copies) => {
    const newest = copies.toSorted((left, right) => right.updatedAt - left.updatedAt)[0];
    if (newest === undefined) throw new Error("A thread group cannot be empty");
    return {
      ...newest,
      ephemeral: copies.some(({ ephemeral }) => ephemeral),
      section: copies.find(isPinned)?.section ?? newest.section,
      status: copies.find(({ status }) => status.type === "active")?.status ?? newest.status,
    };
  });

const threadDepth = (
  thread: CodexThread,
  byId: ReadonlyMap<string, CodexThread>,
  visited: ReadonlySet<string> = new Set(),
): number => {
  if (visited.has(thread.id)) return 0;
  const parent = thread.parentThreadId === null ? undefined : byId.get(thread.parentThreadId);
  return parent === undefined
    ? 0
    : 1 + threadDepth(parent, byId, new Set([...visited, thread.id]));
};

export const selectConversationArchiveCandidates = (
  threads: ReadonlyArray<CodexThread>,
  archiveAfterDays: number,
  now: Date,
  currentThreadId?: string,
): ConversationArchivePlan => {
  const cutoffSeconds = Math.floor(now.getTime() / 1000) - archiveAfterDays * 24 * 60 * 60;
  const uniqueThreads = canonicalizeThreadCopies(threads);
  const bySession = Map.groupBy(uniqueThreads, (thread) => thread.sessionId);
  const eligibleSessionIds = [...bySession.entries()]
    .filter(([, sessionThreads]) => treeIsEligible(sessionThreads, cutoffSeconds, currentThreadId))
    .map(([sessionId]) => sessionId);
  const byId = new Map(uniqueThreads.map((thread) => [thread.id, thread]));
  const candidates = uniqueThreads
    .filter((thread) => eligibleSessionIds.includes(thread.sessionId))
    .toSorted((left, right) => {
      const depthDifference = threadDepth(right, byId) - threadDepth(left, byId);
      return depthDifference !== 0 ? depthDifference : left.updatedAt - right.updatedAt;
    })
    .map((thread) => ({
      id: thread.id,
      title: threadTitle(thread),
      updatedAt: thread.updatedAt,
      parentThreadId: thread.parentThreadId,
    }));
  return {
    archiveAfterDays,
    cutoff: new Date(cutoffSeconds * 1000).toISOString(),
    candidates,
    protectedThreadCount: uniqueThreads.length - candidates.length,
  };
};

class CodexAppServerClient {
  readonly #child;
  readonly #pending = new Map<
    number,
    Readonly<{ resolve: (value: unknown) => void; reject: (error: Error) => void }>
  >();
  #nextId = 1;
  #stdoutBuffer = "";
  #stderr = "";

  private constructor(executable: string) {
    this.#child = spawn(executable, ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child.stdout.setEncoding("utf8");
    this.#child.stderr.setEncoding("utf8");
    this.#child.stdout.on("data", (chunk: string) => this.#handleStdout(chunk));
    this.#child.stderr.on("data", (chunk: string) => {
      this.#stderr += chunk;
    });
    this.#child.on("error", (error) => this.#rejectAll(error));
    this.#child.on("exit", (code) => {
      if (this.#pending.size > 0) {
        this.#rejectAll(
          new Error(`Codex app server exited with code ${String(code)}. ${this.#stderr.trim()}`),
        );
      }
    });
  }

  static async start(executable: string) {
    const client = new CodexAppServerClient(executable);
    await client.#request("initialize", {
      clientInfo: { name: "reed-ai", title: "reed-ai", version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    client.#child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
    return client;
  }

  async listThreads() {
    const readPage = async (
      cursor: string | null,
      collected: ReadonlyArray<CodexThread>,
    ): Promise<ReadonlyArray<CodexThread>> => {
      const response = (await this.#request("thread/list", {
        archived: false,
        cursor,
        limit: 100,
        sortKey: "updated_at",
        sortDirection: "asc",
        sourceKinds,
      })) as ThreadListResponse;
      const next = [...collected, ...response.data];
      return response.nextCursor === null ? next : readPage(response.nextCursor, next);
    };
    return readPage(null, []);
  }

  close() {
    this.#child.stdin.end();
    this.#child.kill();
  }

  #request(method: string, params: unknown) {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { reject, resolve });
      this.#child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  #handleStdout(chunk: string) {
    const text = this.#stdoutBuffer + chunk;
    const lines = text.split(/\r?\n/);
    this.#stdoutBuffer = lines.at(-1) ?? "";
    lines.slice(0, -1).filter(Boolean).forEach((line) => {
      const response = JSON.parse(line) as JsonRpcResponse;
      if (response.id === undefined) return;
      const pending = this.#pending.get(response.id);
      if (pending === undefined) return;
      this.#pending.delete(response.id);
      if (response.error !== undefined) {
        pending.reject(new Error(response.error.message ?? "Codex app server request failed"));
      } else {
        pending.resolve(response.result);
      }
    });
  }

  #rejectAll(error: Error) {
    this.#pending.forEach(({ reject }) => reject(error));
    this.#pending.clear();
  }
}

const withCodexClient = async <A>(executable: string, use: (client: CodexAppServerClient) => Promise<A>) => {
  const client = await CodexAppServerClient.start(executable);
  try {
    return await use(client);
  } finally {
    client.close();
  }
};

const runCodexArchive = (executable: string, threadId: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ["archive", threadId], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const output: Array<string> = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => output.push(chunk));
    child.stderr.on("data", (chunk: string) => output.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(output.join("").trim() || `codex archive exited with code ${String(code)}`));
    });
  });

const archiveSequentially = async (
  candidates: ReadonlyArray<ConversationArchiveCandidate>,
  executable: string,
) => {
  const results: Array<ConversationArchiveResult> = [];
  for (const candidate of candidates) {
    try {
      await runCodexArchive(executable, candidate.id);
      results.push({ id: candidate.id, status: "archived" });
    } catch (error) {
      results.push({
        id: candidate.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
};

const archiveError = (error: unknown) =>
  new ConversationArchiveError({
    message: error instanceof Error ? error.message : String(error),
  });

export const planCodexConversationArchive = E.fn("planCodexConversationArchive")(function* (
  archiveAfterDays: number,
  currentThreadId: string | undefined,
  executable: string,
  now = new Date(),
) {
  if (!Number.isInteger(archiveAfterDays) || archiveAfterDays < 1) {
    return yield* archiveError("archiveAfterDays must be an integer greater than zero");
  }
  const threads = yield* E.tryPromise({
    try: () => withCodexClient(executable, (client) => client.listThreads()),
    catch: archiveError,
  });
  return selectConversationArchiveCandidates(threads, archiveAfterDays, now, currentThreadId);
});

export const applyCodexConversationArchive = E.fn("applyCodexConversationArchive")(function* (
  homeDirectory: string,
  plan: ConversationArchivePlan,
  executable: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const startedAt = new Date().toISOString();
  const results = yield* E.tryPromise({
    try: () => archiveSequentially(plan.candidates, executable),
    catch: archiveError,
  });
  const journalDirectory = joinPath(path, homeDirectory, ".reed-ai", "archive-runs");
  const journalPath = joinPath(
    path,
    journalDirectory,
    `${startedAt.replaceAll(":", "-")}.json`,
  );
  yield* fileSystem.makeDirectory(journalDirectory, { recursive: true });
  yield* fileSystem.writeFileString(
    journalPath,
    `${JSON.stringify({ archiveAfterDays: plan.archiveAfterDays, cutoff: plan.cutoff, results, startedAt }, null, 2)}\n`,
  );
  return { journalPath, results } as const;
});
