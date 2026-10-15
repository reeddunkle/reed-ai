import { InvalidSettingsError } from "./errors.js";

type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cloneRecord = (value: JsonRecord): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isRecord(child) ? cloneRecord(child) : Array.isArray(child) ? [...child] : child,
    ]),
  );

const mergeLeaves = (current: JsonRecord, desired: JsonRecord): JsonRecord => ({
  ...current,
  ...Object.fromEntries(
    Object.entries(desired).map(([key, desiredValue]) => {
      const currentValue = current[key];
      return [
        key,
        isRecord(desiredValue)
          ? mergeLeaves(isRecord(currentValue) ? currentValue : {}, desiredValue)
          : desiredValue,
      ];
    }),
  ),
});

const projectLeaves = (current: JsonRecord, desired: JsonRecord): JsonRecord =>
  Object.fromEntries(
    Object.entries(desired).map(([key, desiredValue]) => {
      const currentValue = current[key];
      return [
        key,
        isRecord(desiredValue)
          ? projectLeaves(isRecord(currentValue) ? currentValue : {}, desiredValue)
          : currentValue,
      ];
    }),
  );

const changedJsonPaths = (current: JsonRecord, desired: JsonRecord, prefix = ""): ReadonlyArray<string> =>
  Object.entries(desired).flatMap(([key, desiredValue]) => {
    const path = prefix.length === 0 ? key : `${prefix}.${key}`;
    const currentValue = current[key];
    if (isRecord(desiredValue)) {
      return changedJsonPaths(isRecord(currentValue) ? currentValue : {}, desiredValue, path);
    }
    return JSON.stringify(currentValue) === JSON.stringify(desiredValue) ? [] : [path];
  });

export const parseDesiredSettings = (contents: string): JsonRecord => {
  const value: unknown = JSON.parse(contents);
  if (!isRecord(value)) throw new InvalidSettingsError({ message: "desired settings must be an object" });
  return value;
};

export const selectDesiredSettings = (
  settings: JsonRecord,
  selector: "claude.settings" | "codex.config",
): JsonRecord => {
  const [target, section] =
    selector === "claude.settings" ? (["claude", "settings"] as const) : (["codex", "config"] as const);
  const targetValue = settings[target];
  const selected = isRecord(targetValue) ? targetValue[section] : undefined;
  if (!isRecord(selected)) {
    throw new InvalidSettingsError({ message: `missing desired settings selector: ${selector}` });
  }
  return cloneRecord(selected);
};

export const selectDesiredSettingRemovals = (
  settings: JsonRecord,
  selector: "claude.settings" | "codex.config",
): ReadonlyArray<string> => {
  const target = selector === "claude.settings" ? "claude" : "codex";
  const targetValue = settings[target];
  const removals = isRecord(targetValue) ? targetValue.settingsToRemove : undefined;
  if (removals === undefined) return [];
  if (!Array.isArray(removals) || !removals.every((value) => typeof value === "string")) {
    throw new InvalidSettingsError({ message: `settingsToRemove must be a string array: ${target}` });
  }
  return removals;
};

const removePath = (record: JsonRecord, segments: ReadonlyArray<string>): JsonRecord => {
  const [head, ...tail] = segments;
  if (head === undefined || !(head in record)) return record;
  if (tail.length === 0) {
    return Object.fromEntries(Object.entries(record).filter(([key]) => key !== head));
  }
  const child = record[head];
  return isRecord(child) ? { ...record, [head]: removePath(child, tail) } : record;
};

const readPath = (record: JsonRecord, segments: ReadonlyArray<string>): unknown =>
  segments.reduce<unknown>(
    (value, segment) => (isRecord(value) ? value[segment] : undefined),
    record,
  );

export const reconcileJsonSettings = (
  currentContents: string | undefined,
  desired: JsonRecord,
  removals: ReadonlyArray<string> = [],
) => {
  const currentValue: unknown = currentContents === undefined ? {} : JSON.parse(currentContents);
  if (!isRecord(currentValue)) {
    throw new InvalidSettingsError({ message: "live JSON settings must be an object" });
  }
  const merged = removals.reduce(
    (value, path) => removePath(value, path.split(".")),
    mergeLeaves(currentValue, desired),
  );
  const currentRemovals = Object.fromEntries(
    removals.map((path) => [path, readPath(currentValue, path.split(".")) === undefined]),
  );
  const desiredState = { values: desired, removals: Object.fromEntries(removals.map((path) => [path, true])) };
  return {
    contents: `${JSON.stringify(merged, null, 2)}\n`,
    currentState: JSON.stringify({ values: projectLeaves(currentValue, desired), removals: currentRemovals }),
    desiredState: JSON.stringify(desiredState),
    changedPaths: [
      ...changedJsonPaths(currentValue, desired),
      ...removals.filter((path) => readPath(currentValue, path.split(".")) !== undefined),
    ],
  } as const;
};

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findTable = (contents: string, table: string) => {
  const headerPattern = new RegExp(`^\\[${escapePattern(table)}\\]\\s*(?:#.*)?$`, "gm");
  const matches = [...contents.matchAll(headerPattern)];
  if (matches.length > 1) {
    throw new InvalidSettingsError({ message: `duplicate TOML table: [${table}]` });
  }
  const ambiguousPattern = new RegExp(`^\\s*(?:${escapePattern(table)}\\.|\\[\\[${escapePattern(table)}\\]\\])`, "m");
  if (ambiguousPattern.test(contents)) {
    throw new InvalidSettingsError({ message: `ambiguous TOML structure for: ${table}` });
  }
  if (matches.length === 0) return undefined;
  const start = (matches[0]?.index ?? 0) + (matches[0]?.[0].length ?? 0);
  const nextHeader = contents.slice(start).search(/^\s*\[/m);
  return { start, end: nextHeader === -1 ? contents.length : start + nextHeader };
};

const readTomlBoolean = (body: string, key: string): boolean | undefined => {
  const pattern = new RegExp(`^\\s*${escapePattern(key)}\\s*=\\s*(true|false)\\s*(?:#.*)?$`, "gm");
  const matches = [...body.matchAll(pattern)];
  if (matches.length > 1) throw new InvalidSettingsError({ message: `duplicate TOML key: ${key}` });
  const anyAssignment = new RegExp(`^\\s*(?:${escapePattern(key)}|["']${escapePattern(key)}["'])\\s*=`, "m");
  if (matches.length === 0 && anyAssignment.test(body)) {
    throw new InvalidSettingsError({ message: `unsupported TOML value for: ${key}` });
  }
  return matches[0]?.[1] === undefined ? undefined : matches[0][1] === "true";
};

const writeTomlBoolean = (contents: string, table: string, key: string, value: boolean): string => {
  const range = findTable(contents, table);
  if (range === undefined) {
    const separator = contents.length === 0 || contents.endsWith("\n\n") ? "" : contents.endsWith("\n") ? "\n" : "\n\n";
    return `${contents}${separator}[${table}]\n${key} = ${value}\n`;
  }
  const body = contents.slice(range.start, range.end);
  readTomlBoolean(body, key);
  const pattern = new RegExp(`^(\\s*)${escapePattern(key)}\\s*=\\s*(?:true|false)(\\s*(?:#.*)?)$`, "m");
  const nextBody = pattern.test(body)
    ? body.replace(pattern, `$1${key} = ${value}$2`)
    : `${body.replace(/\\s*$/, "")}\n${key} = ${value}\n`;
  return `${contents.slice(0, range.start)}${nextBody}${contents.slice(range.end)}`;
};

export const reconcileTomlBooleans = (
  currentContents: string | undefined,
  desired: JsonRecord,
) => {
  const tables = Object.entries(desired);
  const leaves = tables.flatMap(([table, values]) => {
    if (!isRecord(values)) throw new InvalidSettingsError({ message: `TOML table must be an object: ${table}` });
    return Object.entries(values).map(([key, value]) => {
      if (typeof value !== "boolean") throw new InvalidSettingsError({ message: `TOML setting must be boolean: ${table}.${key}` });
      return { table, key, value };
    });
  });
  const original = currentContents ?? "";
  const currentProjection = Object.fromEntries(
    tables.map(([table, values]) => {
      const range = findTable(original, table);
      const body = range === undefined ? "" : original.slice(range.start, range.end);
      return [
        table,
        Object.fromEntries(
          Object.keys(values as JsonRecord).map((key) => [key, readTomlBoolean(body, key)]),
        ),
      ];
    }),
  );
  const contents = leaves.reduce(
    (text, leaf) => writeTomlBoolean(text, leaf.table, leaf.key, leaf.value),
    original,
  );
  return {
    contents,
    currentState: JSON.stringify(currentProjection),
    desiredState: JSON.stringify(desired),
    changedPaths: leaves
      .filter(({ table, key, value }) => {
        const tableValue = currentProjection[table];
        return !isRecord(tableValue) || tableValue[key] !== value;
      })
      .map(({ table, key }) => `${table}.${key}`),
  } as const;
};
