# Audit Claude plugin alignment

Determine which source, package, runtime, and invocation-policy improvements from the Codex pstack migration should also apply to Claude. Keep this audit separate from the Codex migration so neither runtime changes implicitly.

## Questions

- Should Claude install pstack from this project's canonical package or continue receiving a rendered skill tree?
- Which Claude marketplace or plugin-manager metadata belongs in this repository?
- Does Claude honor the existing explicit-invocation metadata, or does it need a different package boundary?
- Which duplicated Claude runtime trees can be retired after a clean-session verification?
- What update workflow keeps Claude and Codex aligned without treating either product's cache as canonical?

## Completion criteria

- Current Claude discovery and installation behavior is verified against primary documentation and a fresh session.
- Product-specific metadata is separated from portable skill content.
- Any proposed deployment or cleanup has an explicit backup and verification gate.

## Primary-source findings

### Discovery and packaging

- Claude supports personal skills at `~/.claude/skills/<skill-name>/SKILL.md`, project skills at `.claude/skills/<skill-name>/SKILL.md`, and plugin skills at `<plugin>/skills/<skill-name>/SKILL.md`. Personal skills load in every local project on that machine; plugin skills load wherever the plugin is enabled and use the `/plugin-name:skill-name` namespace. [Anthropic: Extend Claude with skills](https://code.claude.com/docs/en/skills#choose-where-skills-load)
- A directory under a personal or project skills location can itself become a plugin when it contains `.claude-plugin/plugin.json`. Claude identifies that installation as `<name>@skills-dir`. Therefore the current rendered `~/.claude/skills/pstack-claude-plugin` deployment is supported, provided it contains the manifest; it is not merely an accidental discovery path. [Anthropic: Extend Claude with skills](https://code.claude.com/docs/en/skills#choose-where-skills-load)
- Anthropic recommends plugins when several skills or other components should be installed, updated, and shared as one unit. A plugin manifest belongs at `.claude-plugin/plugin.json`; its skills are namespaced, avoiding collisions with standalone skills. [Anthropic: Plugins overview](https://code.claude.com/docs/en/plugins)
- Claude marketplaces use `.claude-plugin/marketplace.json`. The required marketplace fields are `name`, `owner`, and `plugins`; a plugin entry needs a matching `name` and `source`. A repository-local plugin may use a relative source such as `./plugins/pstack`. [Anthropic: Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- The repository's `.agents/plugins/marketplace.json` is not Claude marketplace metadata. Claude's documented discovery path is `.claude-plugin/marketplace.json`, so the two product-specific marketplace files should coexist and point to the same canonical `plugins/pstack` package.

### Installation and updates

- A local marketplace can be registered with `claude plugin marketplace add <repository-path>` and its plugin installed as `<plugin>@<marketplace>`. User scope enables it across local projects and records it in `~/.claude/settings.json`; the terminal, desktop local sessions, and VS Code share those settings. [Anthropic: Install and manage plugins](https://code.claude.com/docs/en/discover-plugins)
- Installed plugin files live under Claude's plugin runtime area, while settings determine whether they are enabled and sessions load them at startup or after `/reload-plugins`. These runtime copies should be treated as generated state, not source. [Anthropic: Plugins overview](https://code.claude.com/docs/en/plugins#make-an-installed-plugin-available-in-your-session)
- Third-party and local-development marketplaces do not auto-update by default. An explicit project workflow should validate the package and marketplace, update the installed plugin, and then reload or start a fresh session. [Anthropic: Install and manage plugins](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated)
- Local plugin installation does not make the plugin available in Claude cloud sessions. Cloud sessions can load committed project skills, but they do not load plugins enabled only through local or project settings. The proposed user-scoped plugin is therefore a local Claude Code solution, not a cloud-portability solution. [Anthropic: Extend Claude with skills](https://code.claude.com/docs/en/skills#use-skills-in-cowork-and-cloud-sessions)

### Explicit-only behavior

- Claude honors `disable-model-invocation: true` in `SKILL.md` frontmatter. It prevents automatic invocation, removes the skill description from Claude's regular context, and leaves direct `/name` invocation available. This is the correct Claude-side equivalent of Codex's explicit-only policy for pstack. [Anthropic: Extend Claude with skills](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill)
- Plugin skills remain namespaced as `/pstack-skills:<skill>`. Claude may also expose a bare short name when it does not collide, but verification should use the namespaced form because it proves which package supplied the skill. [Anthropic: Extend Claude with skills](https://code.claude.com/docs/en/skills#how-a-skill-gets-its-command-name)

### Verification results

- `claude plugin list` recognizes the rendered package as `pstack-skills@skills-dir` version 0.15.2.
- The rendered package contains all 44 skills. It matches 42 canonical `SKILL.md` files byte-for-byte; the other two contain the expected Claude path substitutions produced by the project renderer.
- Claude validates the rendered skills-directory plugin as a supported plugin. Claude rejects `.agents/plugins/marketplace.json` because that file uses Codex-specific fields and schema.

## Recommendation

Keep `plugins/pstack` as the single portable skill-content and package source for both products. Retain the current rendered skills-directory deployment for Claude:

- Keep `plugins/pstack/.claude-plugin/plugin.json` for Claude and the portable/root metadata needed by Codex.
- Continue rendering the package into `~/.claude/skills/pstack-claude-plugin`. Claude officially loads this as the namespaced `pstack-skills@skills-dir` plugin.
- Preserve `disable-model-invocation: true` on every pstack skill. Do not replace it with Codex `agents/openai.yaml`; the two policy files serve different runtimes and should remain adjacent to the shared content.
- Treat the rendered tree, Claude's synced tree, plugin settings, and caches as runtime state. None should become canonical.

Do not install the raw canonical package through a Claude marketplace yet. `automate-me` and `maintain-verification-skill` contain portable path tokens that the CLI resolves during deployment. A direct marketplace install would bypass that rendering. Reconsider a Claude marketplace only after either eliminating the target-specific tokens or adding a deliberate generated-package build step outside canonical source.

## Proposed migration gate

1. Run `pnpm cli plan`, back up intentional overwrites, and deploy the rendered package.
2. Run `claude plugin validate` against the rendered plugin.
3. Start a fresh local Claude session and verify:
   - `claude plugin list` reports `pstack-skills@skills-dir` enabled;
   - `/pstack-skills:unslop` appears exactly once and invokes the canonical package;
   - an ordinary TypeScript request does not expose or invoke pstack automatically;
   - all 44 packaged skills are present;
   - the six standalone personal skills still resolve separately;
   - project validation and deployment checks pass.
4. Keep any duplicate cloud-managed copy suppressed. If cloud behavior matters, reconcile it through Claude's cloud-managed workflow rather than editing its synced cache.
5. Revisit marketplace installation only after the canonical package no longer requires target rendering.

## Audit conclusion

Claude should keep the supported rendered skills-directory plugin. It preserves the intended source/package/runtime separation: the project is canonical, the CLI produces Claude-specific runtime files, and Claude loads them as one namespaced plugin. Duplicate cloud-managed packages should remain outside this repository and be handled only if cloud usage becomes part of the desired workflow.

## Completion status

Complete. A fresh Claude session verified the rendered plugin behaves correctly. No migration or runtime cleanup remains.
