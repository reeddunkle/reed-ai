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
pnpm check
```

Shared flags select another home directory or a single runtime:

```powershell
pnpm cli --home //wsl.localhost/Ubuntu/home/example --target claude plan
pnpm cli --home //wsl.localhost/Ubuntu/home/example --target claude backup
pnpm cli --home //wsl.localhost/Ubuntu/home/example --target claude deploy
pnpm cli --home //wsl.localhost/Ubuntu/home/example --target claude check
```

`plan` is read-only. `deploy` writes only manifest-declared destinations and refuses unrecorded local edits. Shared standalone skills deploy to both tools, while pstack deploys to Claude and installs into Codex through the `reed-ai` marketplace. After reviewing and backing up an intentional first migration, `deploy --force` accepts the existing destinations as the baseline. Later runs should not need `--force`.

`cleanup` is limited to legacy `.claude` and `.codex` snapshot directories inside this repository. The canonical `.agents/plugins/marketplace.json` file is outside its cleanup boundary. It never manages or deletes user-home `.agents`, Claude/Codex caches, or unknown home-directory content. `cleanup apply` requires `--force`.

Backups and deployment hashes live under `~/.reed-ai/` and are not automatically expired.

## Layout

- `skills/`: shared standalone skills
- `plugins/pstack/`: shared pstack source plus Claude and Codex manifests
- `.agents/plugins/marketplace.json`: repo marketplace exposing `pstack-skills@reed-ai`
- `instructions/shared.md`: portable global instructions deployed to both tools
- `config/manifest.json`: allowlisted sources and destinations
- `config/desired-settings.json`: declarative plugin and preference intent; not a full live-config replacement
- `src/`: Effect CLI, planner, renderer, and executor
- `test/`: reconciliation and rendering behavior

Third-party caches are not vendored. Desired externally managed packages are recorded in the manifest with provenance and versions where available.

## License

Original reed-ai work is available under the MIT License. The modified pstack port under `plugins/pstack/` retains its upstream MIT license and copyright notice in `plugins/pstack/LICENSE`.
