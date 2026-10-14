import { NodeServices } from "@effect/platform-node";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as E from "effect/Effect";
import * as Command from "effect/cli/Command";
import { fileURLToPath } from "node:url";

import { makeRootCommand } from "./commands.js";

const homeDirectory = process.env.USERPROFILE ?? process.env.HOME;
if (homeDirectory === undefined) throw new Error("USERPROFILE or HOME is required");

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const command = makeRootCommand({ homeDirectory, projectRoot });
const program = Command.run(command, { version: "0.1.0" });

program.pipe(
  E.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
