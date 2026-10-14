---

name: general-js-ts-style
description: Baseline JavaScript/TypeScript conventions for strict equality, nullish checks, mutation, and control flow. Use when writing or reviewing JS/TS.
---

# General JavaScript/TypeScript style

## Use explicit comparisons

Always use `===` and `!==`. Never use `==` or `!=`, including the common `value == null` shorthand.

```ts
// Prefer
if (status === "active") { ... }

if (value === null || value === undefined) { ... }

// Avoid
if (status == "active") { ... }

if (value == null) { ... }
```

If a nullish check is repeated enough to justify a helper, a type-narrowing `isNil(value)` helper may use the explicit `=== null || === undefined` check internally.

Optional chaining (`?.`) and nullish coalescing (`??`) are fine. They do not use loose equality.

## Avoid mutation by default

Prefer deriving new values over mutating existing values or using mutable variables to track state.

Use `const` unless reassignment is genuinely required. Prefer immutable collection and object operations over mutating methods or property assignment.

```ts
// Prefer
const nextOptions = {
  ...options,
  enabled: true,
};

const nextItems = [...items, newItem];

// Avoid
options.enabled = true;
items.push(newItem);
```

Do not treat this as a ban on every local mutation. Mutation can be appropriate when required by an API or when a contained implementation has a concrete clarity or performance benefit.

For collection transformations, follow `data-transformation-style`. That skill contains the more specific rules for avoiding mutable accumulators and deriving new collections.

## Prefer declarative control flow over loops

Avoid `for`, `for...of`, `while`, and similar imperative loops when a collection API or another declarative construct expresses the behavior clearly.

For existing collections, prefer `map`, `filter`, `flatMap`, or `reduce` as appropriate. Do not replace a `while` loop with a `for` loop merely to avoid `while`.

```ts
// Prefer
const activeNames = users
  .filter((user) => {
    return user.isActive;
  })
  .map((user) => {
    return user.name;
  });

// Avoid
const activeNames: string[] = [];

for (const user of users) {
  if (!user.isActive) {
    continue;
  }

  activeNames.push(user.name);
}
```

The preferred example also avoids mutation and `continue`. These concerns often appear together.

Avoid `continue` by default. Structure the condition directly or filter the collection before processing it when that is clearer. A contained loop may use `continue` when it materially reduces nesting or makes condition-driven iteration easier to understand.

```ts
// Prefer when a loop is genuinely necessary
for (const item of items) {
  if (item.isActive) {
    processItem(item);
  }
}

// Avoid
for (const item of items) {
  if (!item.isActive) {
    continue;
  }

  processItem(item);
}
```

Avoid `while` loops when the work is naturally bounded by existing data or another explicit structure. Be especially cautious with `while (true)` and control flow that depends on internal `break` statements.

A loop is acceptable when iteration is genuinely condition-driven, sequential execution is required, or an imperative form communicates the behavior more clearly.

For collection processing, transformation, and per-item work, follow `data-transformation-style` for the detailed rules.
