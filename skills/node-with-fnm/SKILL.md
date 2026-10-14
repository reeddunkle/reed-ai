---
name: node-with-fnm
description: Run Node, pnpm, TypeScript, Vitest, and related project commands through the fnm-managed toolchain. Use whenever a task invokes Node-based tooling.
---

# Node with fnm

When running Node-based project commands, do not use the bundled Codex
Node or pnpm runtime.

Run the helper for the current shell:

```powershell
scripts/run.ps1 <command> <arguments>
```

```bash
bash scripts/run.sh <command> <arguments>
```

Examples:

```powershell
scripts/run.ps1 node --version
scripts/run.ps1 pnpm --version
scripts/run.ps1 pnpm check
scripts/run.ps1 pnpm test
scripts/run.ps1 pnpm exec vitest run
scripts/run.ps1 pnpm typecheck
```

The Bash helper accepts the same arguments.

The helpers initialize fnm and execute the requested command in the same shell process so fnm can select the Node version required by the current project.

If fnm is unavailable, stop and report that the environment needs fnm configured. If execution is blocked by the sandbox, retry the same helper outside the sandbox. Do not fall back to another Node or pnpm runtime.
