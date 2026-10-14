# Porting notes: pstack skills -> Claude plugin

Source: `skills/` from the [pstack Cursor plugin](https://github.com/cursor/plugins/tree/main/pstack)
by Lauren Tan. This port covers **only** that `skills/` directory, per request — the
plugin's `agents/`, `automations/`, and `docs/` are not included here.

This directory contains a modified, skills-only port based on upstream pstack 0.15.2.
The precise source commit was not recorded. The original work is Copyright (c) 2026
Lauren Tan and licensed under the MIT License; see `LICENSE`. Local changes adapt the
plugin for Claude Code and Codex.

## What's in this plugin

44 of pstack's 48 skills, repackaged as a Claude Code / Cowork plugin:

- `.claude-plugin/plugin.json` — plugin manifest.
- `.claude-plugin/marketplace.json` — lets you add this folder as a local marketplace
  and install everything in one shot instead of one skill at a time:
  ```
  /plugin marketplace add /path/to/pstack-claude-plugin
  /plugin install pstack-skills@pstack-skills-marketplace
  ```
- `skills/<name>/SKILL.md` (+ any `references/`, `scripts/` subfolders) for each included skill.

## Excluded (3 skills) — please review

These depend on Cursor product features with no Claude Code equivalent, so porting them
would have shipped instructions that quietly fail. They were left out entirely rather than
guessed at:

- **`make-bot-ui`** — built on Cursor-only UI tools (`update_state` targeting a "Routines"
  panel) and a hardcoded Cursor automations webhook domain (`api2.cursor.sh`). Nothing to
  adapt to; would need a full redesign against whatever equivalent Claude surface you have
  in mind, if any.
- **`setup-pstack`** — its entire job is writing `~/.cursor/rules/pstack-models.mdc`, an
  "always-applied rule" file read back by several other skills, populated from Cursor's
  multi-provider model catalog (`grok-*`, `gpt-*`, `cursor-*` slugs). Claude Code has no
  always-applied-rule-file mechanism and a different model catalog, so this skill's output
  would never be read by anything under Claude.
- **`poteto-mode`** — the plugin's central routing hub. It hard-references: the `poteto-agent`
  subagent (lives in `agents/`, out of scope here), a *different* sibling plugin
  (`cursor-team-kit`, providing `deslop`/`control-cli`/`control-ui` — not present in this repo
  at all), Cursor's own built-in `create-skill`/`babysit` skills, Cursor's `/loop` wake
  mechanism, and 20 playbook files under `skills/poteto-mode/playbooks/` that are themselves
  full of the same Cursor-only `Task`-tool parameters described below. Porting it faithfully
  means porting most of the rest of the original plugin too — happy to take that on separately
  if you want it.

## What was automatically fixed in the 44 included skills

**Frontmatter**, every `SKILL.md`: kept only the keys Claude Code's skill loader actually
reads (`name`, `description`, `disable-model-invocation`). Dropped Cursor-only extensions
that have no Claude counterpart: `mode`/`icon`/`color`/`reminder` (Cursor's sticky-mode UI
chip, only ever set on the excluded `poteto-mode`) and `paths` (Cursor's glob-based
auto-attach, on `typescript-best-practices` — the skill still triggers fine on its
`description`, it just won't auto-attach by file glob the way it did in Cursor).

**Content**, a small set of unambiguous, mechanical substitutions across all included files:

- `AskQuestion` → `AskUserQuestion` (Claude's actual structured-question tool).
- `Task tool` / `` `Task` `` / `Task call` / `Task subagent` → `Agent tool` / `` `Agent` `` /
  `Agent call` / `Agent subagent` (Claude Code's subagent-spawning tool is named `Agent`, not
  `Task`).
- `subagent_type: generalPurpose` → `subagent_type: general-purpose` (Claude's actual agent
  type is kebab-case).
- `.cursor/skills/` → `.claude/skills/` (Claude's equivalent project/personal skill directory),
  in `automate-me`, `create-verification-skill`, and `maintain-verification-skill`.
- Three explicit mentions of "Cursor's built-in `create-skill` skill" (in `automate-me` and
  `reflect`) → the **skill-creator** skill, which is Claude's closest equivalent for
  authoring/editing/optimizing a SKILL.md.
- `why`'s MCP-discovery step, which told the agent to inspect a Cursor-specific `mcps/`
  directory → rewritten to point at the current tool list and this session's MCP server
  instructions instead.

## Known soft-dependencies left as-is (degrade gracefully, don't break)

A few skills still reference Cursor-only paths, but only as an *optional* enhancement with
a stated fallback — under Claude they'll just always take the fallback, which is the correct
behavior, not a failure:

- **`~/.cursor/rules/pstack-models.mdc`** — `arena`, `swarm`, `interrogate` check this file
  for your configured per-role model, "otherwise default to `<model>`." Since that file will
  never exist under Claude, these skills will always use their stated defaults. Those
  defaults are Cursor model slugs (`claude-fable-5-1-thinking-max`, `gpt-5.6-sol-max`,
  `grok-4.6-fast-xhigh`, `claude-opus-5-thinking-xhigh`) that don't exist in Claude's model
  catalog, so the *first* subagent spawn using one will likely error. `interrogate` already
  has explicit recovery logic for this ("if a model slug is rejected... pick the closest
  equivalent"); `arena`, `swarm`, `architect`, `how`, and `reflect` don't. If you plan to
  actually run these, it's worth swapping those default model names for real Claude ones
  (`sonnet`, `opus`, `haiku`, `fable`) — happy to do that pass if you want it.
- **Chat-transcript mining** (`recall`, `automate-me`, `reflect`, `show-me-your-work`) — all
  reference a workspace's `agent-transcripts/` directory (concretely,
  `~/.cursor/projects/<slug>/agent-transcripts/...` in `recall`) to mine your own prior
  conversations. Claude doesn't expose past-session transcripts at a predictable local path
  the way Cursor does, so this step will typically come up empty. The skills still function
  for their other steps (each has some form of fallback to "work from what's in front of
  you" or the shared record via git/gh/MCPs).

## Suggested next step

Try installing the marketplace and running a couple of skills (`/technical-writing`,
`/no-comments`, or any `principle-*`) to confirm they trigger the way you expect, then decide
whether `poteto-mode` (and its `agents/`/`playbooks/` dependencies) is worth a dedicated
follow-up port.
