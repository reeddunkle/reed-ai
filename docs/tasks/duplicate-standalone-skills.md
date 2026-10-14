# Consolidate duplicate standalone skills

Audit standalone skills that appear under more than one Claude, Codex, or legacy runtime root. Choose the best canonical version, biasing toward the most recently edited version when quality is otherwise equal.

## Current status

- The project versions of all six duplicated skills were selected as canonical.
- `code-comment-policy`, `data-transformation-style`, `effect-conventions`, `effect-layer-conventions`, and `general-js-ts-style` contain newer guidance than their `~/.agents` counterparts.
- `node-with-fnm` is byte-identical across the compared roots.
- Canonical descriptions were tightened from 1,991 to 964 characters in total.
- After fresh-session verification and explicit approval, the six `~/.agents` copies were retired to the deployment backup directory.

## Completion criteria

- Every duplicate standalone skill is inventoried with its paths and meaningful differences.
- One canonical project source is selected for each retained skill.
- Runtime copies are deployed from the project or retired after fresh-session verification.
- Skill descriptions are tightened where they spend unnecessary always-loaded context.
- `~/.agents` remains outside the cleanup tool's ownership boundary unless a separately approved migration narrows that boundary.
