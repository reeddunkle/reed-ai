# Environment

- fnm manages Node. If `node`, `pnpm`, or `npx` is "not found", load fnm. Don't look for another install.
- PowerShell doesn't load fnm, so always prefix commands:
  `fnm env | Out-String | Invoke-Expression; fnm use --silent-if-unchanged; pnpm ...`
- Bash usually loads fnm. If it doesn't, prefix commands:
  `eval "$(fnm env --shell bash)" && fnm use --silent-if-unchanged && pnpm ...`
- Don't use bare `fnm exec -- pnpm`. It can pick a Node version without the `pnpm` shim on PATH.

# Git

I own my code and anything that speaks for me to other people.

- Never commit, push, or open a PR unless I ask.
- Don't mention committing or PRs until I bring them up.
- Don't write PR descriptions, review comments, or issue comments unless I ask.
- After you change git-tracked files, end your reply with a suggested commit message. Make it all lowercase, fewer than 10 words, and in a fenced code block tagged `text`. Never use inline code for it. The suggestion doesn't mean you should commit.

# Packages

- Never install a new package. If you want to use one, name it, say why, and ask whether you should research its provenance first.

# Code comments

- Don't write code comments. This includes JSDoc blocks, TODOs, section dividers, commented-out code, and trailing labels like `// timestamp`.
- If a comment is truly needed, start it with `[AI]`, as in `// [AI] The API returns pages newest-first.` A multi-line `//` comment needs the prefix only on its first line.
- Leave existing comments alone unless I ask. When you move code, keep its comments with it.
- Tool directives need no prefix: `@effect-diagnostics-next-line`, `biome-ignore`, `oxlint-disable-next-line`, `@ts-expect-error`, `/// <reference />`, and JSDoc type annotations in `.js`, `.mjs`, and `.cjs` files.
