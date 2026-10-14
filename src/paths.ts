import type * as Path from "effect/Path";
import { win32 } from "node:path";

const isWindowsUnc = (value: string) => value.startsWith("\\\\");

export const joinPath = (path: Path.Path, root: string, ...segments: ReadonlyArray<string>) =>
  isWindowsUnc(root) ? win32.join(root, ...segments) : path.join(root, ...segments);

export const dirnamePath = (path: Path.Path, value: string) =>
  isWindowsUnc(value) ? win32.dirname(value) : path.dirname(value);

export const relativePath = (path: Path.Path, root: string, value: string) =>
  isWindowsUnc(root) ? win32.relative(root, value) : path.relative(root, value);
