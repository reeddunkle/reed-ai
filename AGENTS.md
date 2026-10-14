# Project source-of-truth rules

- Edit shared skills only under `skills/`, `plugins/`, and `instructions/`.
- Treat `.agents/plugins/marketplace.json` as the sole canonical exception under `.agents`.
- Treat `.claude`, `.codex`, and `.agents` directories as runtime or legacy deployment surfaces, never canonical sources.
- Run `pnpm check` after changing the CLI or canonical content.
- Run `pnpm cli plan` before deployment and `pnpm cli backup` before intentional overwrites.
- Never commit credentials, histories, caches, databases, generated runtime state, or absolute user-profile paths.
- Do not modify or delete `~/.agents`; it is outside this tool's ownership boundary.

The portable global agent policy is maintained in `instructions/shared.md` and deployed by the manifest.
