---

name: data-transformation-style
description: Collection-transformation and per-item side-effect conventions for JavaScript/TypeScript. Use when transforming collections, looping over them, or coordinating per-item async work.
---

# Data transformation style

## Prefer declarative transformations

When deriving data from a collection, prefer `map`, `filter`, `flatMap`, or `reduce` over `for`, `for...of`, `.forEach()`, and mutable accumulators.

Choose the operation that most directly describes the transformation. Do not force a transformation through `reduce` when `map`, `filter`, or `flatMap` says what it does more clearly.

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
  if (user.isActive) {
    activeNames.push(user.name);
  }
}
```

This example captures the default rules together:

* derive new values instead of mutating an accumulator
* use collection operations instead of loops
* separate filtering from mapping when they are distinct operations

Do not mutate the source collection or its objects as part of a transformation unless an API specifically requires mutation or mutation is materially clearer or more efficient.

Local mutation inside a contained implementation is acceptable when it does not mutate caller-owned data and has a concrete clarity or performance benefit.

## Keep transformation separate from side effects

A transformation should describe how input data becomes output data. Do not mix unrelated side effects into the transformation.

```ts
// Prefer
const rows = records.map((record) => {
  return toRow(record);
});

writeRows(rows);

// Avoid
records.map((record) => {
  const row = toRow(record);
  writeToLog(row);
  return row;
});
```

Once the transformed data has been produced, side-effect execution belongs to orchestration code. Follow the project's side-effect and concurrency conventions there.

For independent asynchronous side effects, build the effects after transforming the data and execute them concurrently. In Effect projects, prefer `E.all(effects, { concurrency })`; otherwise use `Promise.all`. Choose an explicit concurrency limit when the target is rate-limited or resource-constrained. Sequential execution is appropriate only when ordering or dependencies require it.

## Handle filtering and type narrowing deliberately

Prefer `filter` when it clearly expresses the operation. Use a type predicate when TypeScript needs help narrowing the result.

```ts
const values = items.filter(
  (item): item is ItemWithValue => {
    return item.value !== null && item.value !== undefined;
  },
);
```

If filtering and projection happen together, `flatMap` can sometimes express the transformation more cleanly:

```ts
const values = items.flatMap((item) => {
  if (item.value === null || item.value === undefined) {
    return [];
  }

  return [item.value];
});
```

Do not use `flatMap` merely to avoid writing a straightforward type predicate. Choose whichever version makes the transformation easier to understand.

When the project uses Effect data types such as `Option`, `Result`, or tagged unions, prefer their native transformation APIs when they model the data more directly.

## Quick reference

| Goal                                      | Prefer                                         |
| ----------------------------------------- | ---------------------------------------------- |
| Transform every item                      | `map`                                          |
| Keep matching items                       | `filter`                                       |
| Filter and project together               | `flatMap`                                      |
| Combine the collection into one result    | `reduce`                                       |
| Produce output by mutating an accumulator | Restructure as a declarative transformation    |
| Transform data and perform side effects   | Transform first, orchestrate effects afterward |
| Run independent asynchronous side effects | `E.all` or `Promise.all`, with safe concurrency |
