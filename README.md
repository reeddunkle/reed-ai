# reed-ai

Canonical, versionable skills and instructions shared between Claude and Codex.

Human-authored sources live in `skills/`, `plugins/`, and `instructions/`. The repo marketplace at `.agents/plugins/marketplace.json` is the sole canonical exception under `.agents`. Runtime directories under the user profile are deployment targets, never editing locations. Product caches, synced packages, credentials, histories, databases, and installer state are intentionally outside this repository.

## Setup

The project uses Node 24.20.0 through fnm and pnpm 12.4.1.

```powershell
fnm env | Out-String | Invoke-Expression
fnm use --silent-if-unchanged
pnpm install
```

## Commands

```powershell
pnpm cli plan
pnpm cli backup
pnpm cli deploy
pnpm cli check
pnpm cli cleanup plan
pnpm cli conversations plan
pnpm check
```

`plan`, `deploy`, `check`, and `backup` run across every environment declared in `config/manifest.json`. An environment without `homeVariable` uses the current user's home. Machine-specific homes, such as a WSL home, live in a gitignored `.env`:

```powershell
Copy-Item .env.example .env
```

Deploy plans every environment first and writes nothing if any environment is unresolved, unreachable, or has conflicts. Shared flags narrow a run, or bypass the configured environments with an ad hoc home:

```powershell
pnpm cli --environment wsl plan
pnpm cli --environment windows --target codex deploy
pnpm cli --home //wsl.localhost/Ubuntu/home/example --target claude plan
```

`plan` is read-only. `deploy` writes only manifest-declared destinations and refuses unrecorded local edits. Each standalone skill declares its Claude and Codex deployment targets in the manifest. Pstack deploys to Claude and installs into Codex through the `reed-ai` marketplace. After reviewing and backing up an intentional first migration, `deploy --force` accepts the existing destinations as the baseline. Later runs should not need `--force`.

Selected user-level settings are reconciled from `config/desired-settings.json` into `~/.claude/settings.json` and `~/.codex/config.toml`. Only declared setting paths are managed; unrelated local settings are preserved. Codex TOML management is intentionally limited to declared boolean values and rejects ambiguous relevant tables.

Local memories can be reviewed and removed independently from deployment:

```powershell
pnpm cli memory plan --memory-target claude
pnpm cli memory apply --memory-target claude --force
pnpm cli memory plan --memory-target codex
```

Memory removal first creates a recoverable copy under `~/.reed-ai/backups/`.

Old local Codex conversations can be reviewed and archived through Codex's supported archive interface:

```powershell
pnpm cli conversations plan
pnpm cli conversations apply --force
pnpm cli conversations plan --older-than-days 30
```

The default retention threshold is configured in `config/manifest.json`. Archival uses last activity, protects current, active, pinned, recent, and partially eligible conversation trees, and writes metadata-only run journals under `~/.reed-ai/archive-runs/`. It is reversible organization, not deletion or disk cleanup. Claude Desktop Code sessions use the separately deployed `/archive-claude-sessions` skill because Claude exposes archival through its in-app session tools rather than a supported local CLI.

`cleanup` is limited to legacy `.claude` and `.codex` snapshot directories inside this repository. The canonical `.agents/plugins/marketplace.json` file is outside its cleanup boundary. It never manages or deletes user-home `.agents`, Claude/Codex caches, or unknown home-directory content. `cleanup apply` requires `--force`.

Backups, archive run journals, and deployment hashes live under `~/.reed-ai/` and are not automatically expired.

## Layout

- `skills/`: shared standalone skills
- `plugins/pstack/`: shared pstack source plus Claude and Codex manifests
- `.agents/plugins/marketplace.json`: repo marketplace exposing `pstack-skills@reed-ai`
- `instructions/shared.md`: portable global instructions deployed to both tools
- `config/manifest.json`: allowlisted sources and destinations
- `config/desired-settings.json`: declarative plugin and selected user-level preference intent
- `src/`: Effect CLI, planner, renderer, and executor
- `test/`: reconciliation and rendering behavior

Third-party caches are not vendored. Desired externally managed packages are recorded in the manifest with provenance and versions where available.

## License

Original reed-ai work is available under the MIT License. The modified pstack port under `plugins/pstack/` retains its upstream MIT license and copyright notice in `plugins/pstack/LICENSE`.
