---
name: effect-conventions
description: Effect conventions for TypeScript/JavaScript projects that depend on `effect`. Use when writing or reviewing Effect code, imports, APIs, tracing, or services.
---

# Effect conventions

Skip this skill if the project doesn't list `effect` as a dependency.

The installed package in `node_modules/effect` is the reference for the version in use. Trust it over memory, because the API changed a lot between v3 and v4 and most training data predates v4.

## Before writing Effect code

1. **Confirm the version.** Read `version` in `node_modules/effect/package.json`.
2. **Read the installed source.** Each module is in `node_modules/effect/src/<Module>.ts`, with its signatures and JSDoc examples. Effect 4.x also ships `AGENTS.md` and runnable examples in `ai-docs/`.
3. **Check the docs for that major version**, e.g. https://effect.website/docs/v4/api. Where the docs and the installed source disagree, the source wins.
4. **Copy the project's existing patterns.** New Services are rare. Before adding one, find the project's services directory (often `src/services`) and model the new Service on what's there.

## Imports

Import each Effect module as a namespace named after the module:

```ts
import * as Schema from "effect/Schema"
import * as Option from "effect/Option"
import * as Layer from "effect/Layer"
```

Three modules use short aliases instead. Don't add others.

```ts
import * as E from "effect/Effect"
import * as A from "effect/Array"
import * as R from "effect/Record"
```

Import the standalone `pipe` function by name:

```ts
import { pipe } from "effect/Function"
```

Never import from the `"effect"` barrel.

## Specific Effect functions

### `pipe`

The standalone `pipe(value, f, g)` passes a plain value through functions from left to right. An Effect has its own `.pipe()` method. Use the method on Effects and the standalone function on everything else.

### `E.fn`

Write any named function that returns an `E.gen` effect as `E.fn("Name")(function* (...) { ... })` or `E.fnUntraced(function* (...) { ... })`, whether or not it takes parameters. Choose one on purpose. If the project has its own tracing doc, follow it over these defaults.

Use `E.fn` for:

- Public service methods that return an Effect, including a method that only delegates to one traced call. You can then decide from the method alone, and the span survives if the callee later becomes untraced.
- Standalone exported operations that do I/O, persistence, or crypto.

Use `E.fnUntraced` for:

- Constructors that take arguments. They run once, at layer build.
- Framework-owned boundaries such as HttpApi group builders, middleware, and workflow handlers. The framework already traces them.
- Error mappers and `catch` / `catchCause` / `catchTag` callbacks.
- Private helpers inside a constructor, unless the helper does I/O.
- A private helper shared by traced public methods, such as `finishRun` behind `complete` / `exit` / `interrupt`. The public method's span already names the operation.
- Per-item hot paths, such as a function called once per log line or per event. A span per call floods the trace file.
- Functions whose body is only a log call.
- Frontend code that has no exporting tracer.
- Test helpers. Tests that assert on spans depend on production spans, not on spans in the test.

Other rules:

- A public service member that is an Effect value gets `.pipe(E.withSpan("<Service>.<member>"))`.
- Leave untraced any method that returns a `Stream`, because the span stays open for the whole subscription. Also leave untraced any member that only touches in-memory state such as a `Ref`, `PubSub`, or `Queue`.
- Name a service method's span `"<Service>.<method>"`, where `<Service>` is the `Context.Service` class. Never use the implementation or file name, so a fixture and the real service produce the same spans. A top-level function uses its own camelCase name. Don't use kebab-case or dotted namespaces.
- Pass trailing combinators as extra arguments instead of piping the result. A combinator that needs the call's arguments gets them after the effect, as in `(effect, id) => effect.pipe(...)`. Move a wrapper there only when it already covers the whole body. A `mapError` or `catch` on the last step stays put, because as a combinator it would also handle errors from every earlier step.
- Annotate the signature when nothing else pins it. That means exported functions that no Shape or interface types, and recursive functions. An annotation makes a widened error channel fail at the function that changed instead of at a distant caller. Service and DAO methods already get their type from the Shape, so don't repeat the signature there. Annotate a private helper only when its error channel is part of its intent, e.g. "fails only with `InternalServerError`".
- To annotate, put the full signature on a typed `const`. The generator's parameters then take their types from it. A generic generator still has to declare its own type parameters and parameter types, because the body can't see the ones on the annotation.

  ```ts
  const mapAbilityApiError: (
    error: AbilityDAOError,
  ) => E.Effect<never, HttpApiError.InternalServerError> = E.fnUntraced(
    function* (error) {
      yield* E.logError("Ability API operation failed.", { error })
      return yield* new HttpApiError.InternalServerError()
    },
  )
  ```
- Keep `E.gen` for inline callbacks and for helpers whose pipeline runs the effect, e.g. one that ends in `runTest`.
- Write a `make*` constructor that takes no arguments as an Effect value, `const makeX = E.gen(function* () { ... })`, not as a function that returns one. Yielding the value runs it again each time, so a wrapper function adds nothing. A `const` isn't hoisted, so define it above any static field that uses it, such as `static readonly layer = Layer.effect(this, makeX)`.

### `A.filterMap`

In v4, the callback returns a `Result`. The v3 version returned an `Option`.

```ts
A.filterMap([1, 2, 3, 4], (n) => n % 2 === 0 ? Result.succeed(n * 10) : Result.failVoid) // => [20, 40]
```

Prefer `A.filter` followed by `A.map` unless the project already uses `A.filterMap`. It makes two passes instead of one, but it's easier to read.

```ts
pipe(
  [1, 2, 3, 4],
  A.filter((n) => n % 2 === 0),
  A.map((n) => n * 10),
)
```

## When not to use Effect

Use the simplest tool that fits.

- Mapping a key to a value: use a plain object or `Map` lookup, not `Match`.
- Branching on a discriminated union or tagged error: use `effect/Match`.
- Never write a `switch` statement. Use a lookup or `Match`.
