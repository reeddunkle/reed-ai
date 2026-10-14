---
name: code-comment-policy
description: Comment policy for JavaScript/TypeScript — avoid comments and prefix necessary agent-written comments with `[AI]`. Use when writing, editing, or reviewing JS/TS comments.
---

# Code Comment Policy

## Don't write comments

Make code explain itself through naming and structure. Put the reasoning behind a change in the commit message or PR description, not in the code.

This includes JSDoc blocks, TODOs, section dividers, commented-out code, and trailing labels like `// timestamp`.

## If a comment is truly needed, start it with `[AI]`

Every comment you write must begin with `[AI]`, so the user can find and review it:

```ts
// [AI] The API returns pages newest-first, so reverse before merging.
/** [AI] ... */
```

- A comment that spans several `//` lines only needs the prefix on the first line.
- Leave existing comments alone unless asked. When moving code, keep its comments with it.

## Always allowed: tool directives

These aren't prose comments. They need no prefix and are fine whenever the tool needs them:

- `// @effect-diagnostics-next-line <rule>:off`
- `// biome-ignore <rule>: <reason>`, `// oxlint-disable-next-line`
- `// @ts-expect-error`
- `/// <reference ... />`
- `/** @type {...} */` and similar JSDoc type annotations in `.js`, `.mjs`, and `.cjs` files
