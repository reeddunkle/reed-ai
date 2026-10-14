---
name: effect-layer-conventions
description: Effect service and Layer conventions. Use when defining or refactoring `Context.Service` classes, constructors, dependency layers, root composition, or test doubles.
---

# Effect layer conventions

Conventions for naming and composing Effect services and `Layer`s. These are application-level
conventions, not requirements of Effect itself — when an existing codebase already has an
established convention, follow that codebase's convention over this skill.

## Name layers with a `Layer` suffix, never `Live`/`Default`

Do not use `Live` or `Default` as the suffix for a concrete production layer. Prefer `Layer`
because it names what the value actually is.

For a standalone or module-level layer, suffix rather than prefix, so autocomplete groups related
values by domain/service name:

```ts
export const DatabaseLayer = ...
export const ApiHandlersLayer = ...
export const OptionalPolicyAiLayer = ...
```

rather than `LayerDatabase` or a `Live`/`Default` suffix.

## Service-associated layers: `layer` and `layerNoDeps`

When a layer belongs directly to a service, expose it from the service class using lowercase
`layer`/`layerNoDeps` statics rather than a top-level export:

```ts
export class GitHubClient extends Context.Service<GitHubClient, Shape>()(
  "GitHubClient",
  { make: makeGitHubClient },
) {
  static readonly layerNoDeps = Layer.effect(this, makeGitHubClient)
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(GitHubAppAuth.layerNoDeps),
    Layer.provide(FetchHttpClient.layer),
  )
}
```

- `layerNoDeps` constructs only the service itself and leaves its requirements visible
  (`Layer<GitHubClient, never, GitHubAppAuth | HttpClient>`). This is what tests provide
  alternate/mock dependencies into.
- `layer` also supplies the service's normal default local dependencies, ready for ordinary
  application use (`Layer<GitHubClient>`, no remaining requirements).
- A repository or other service with no injected dependencies (only a shared resource like
  `SqlClient`) only needs `layer` — skip `layerNoDeps` when there's nothing to leave unsatisfied.
- Don't invent other suffixes (`layerMock`, `layerTest`) for this pair; see the test-doubles
  section below for how mocking actually works here.

## Extract a named `makeX` function — don't inline `make`

Define the service's construction logic as its own top-level function, named for the service
(`makeGitHubClient`, `makeGitHubEventQueue`), and reference that function everywhere a layer
needs it. Do not inline `Effect.gen(...)` directly as the `make:` property of the
`Context.Service` config, and do not name it the generic `make` — a named `makeX` function reads
correctly wherever it's imported or referenced, on its own.

```ts
const makeGitHubEventQueue = Effect.fnUntraced(function* (
  queueResourceEffect: typeof GitHubEventsQueue,
) {
  const queue = yield* queueResourceEffect
  return { enqueue: (event) => queue.send(event) }
})

export class GitHubEventQueue extends Context.Service<GitHubEventQueue, Shape>()(
  "GitHubEventQueue",
  { make: makeGitHubEventQueue(GitHubEventsQueue) },
) {
  static readonly layer = Layer.effect(this, makeGitHubEventQueue(GitHubEventsQueue))
  static readonly layerWith = (queueResourceEffect: typeof GitHubEventsQueue) =>
    Layer.effect(this, makeGitHubEventQueue(queueResourceEffect))
}
```

A constructor that takes arguments uses `Effect.fnUntraced`. It runs once, at layer build, so a span adds nothing. A constructor with no arguments is an Effect value, `const makeX = Effect.gen(function* () { ... })`.

Anti-patterns to avoid:

- Inlining the constructor directly in the config: `{ make: Effect.gen(function* () { ... }) }`
  with no separate named function backing it, then referencing `this.make` from static layers.
  This is the single most common shape in an unrefactored Effect codebase — treat it as
  something to fix, not something to copy, even in a codebase where most existing services do it.
- Naming the extracted function generically, `const make = (...) => ...`. Always name it for the
  service it constructs (`makeGitHubEventQueue`, not `make`), the same way the layer itself gets
  a specific name rather than a bare `layer` at the top level.

## Generic `make` is fine when it's namespace-qualified

The rule above — name it `makeX`, not `make` — applies to a free-standing, bare top-level
function: one that could be imported and invoked with no qualifying prefix. It does not apply to
a `make` that's only ever accessed through a qualifying class, generated Schema member, or module
namespace, because the qualifier already says what's being constructed. Effect's own API relies on
this constantly, and this codebase follows the same idiom throughout:

```ts
Redacted.make("token")
SynchronizedRef.make(initial)
HttpClient.make((request) => ...)
HttpApiGroup.make("activity")
HttpApi.make("RootApi")
HttpApiClient.make(RootApi)
CloudflareResourceNames.make({ dev, stage })

LabelingDecision.insert.make({ ... })              // Schema.Class-generated constructor
Setup.AppNotInstalled.make({ ... })                 // a tagged case's generated constructor
Model.cases.LoadingSetup.make({})                   // FoldKit Model union case
Flags.make({ sidebar }, { disableChecks: true })    // FoldKit flags module
```

None of these read as `Redacted.makeRedacted(...)` or
`Model.cases.LoadingSetup.makeLoadingSetup({})` — the qualifying prefix already names what's being
made, so repeating the name on `make` itself would be stutter. When a `make` is a property of a
class, a generated Schema member, or a module namespace that's always dereferenced before it's
called, keep it generic, matching this established idiom.

Reserve a specific `makeX` name for a free top-level function with no such qualifier — most often
the constructor effect backing a `Context.Service`'s `make:` config (see above), since that
binding can be imported and called directly with nothing to disambiguate it at the call site.

## `layerWith` / `makeWith` for runtime-supplied resources

When a service's dependency is a resource that only exists inside a specific runtime entrypoint
(e.g. a queue binding available only in a particular Worker invocation), expose a parameterized
`layerWith(resource)` alongside the zero-argument `layer`, and have it call the named `makeX`
function with that resource — never fall back to an inline constructor for this case either.

```ts
static readonly layerWith = (resource: QueueResource) => Layer.effect(this, makeGitHubEventQueue(resource))
```

The application entrypoint calls `Service.layerWith(options.queue)` where the resource is only
known at Worker construction time, and uses the plain `Service.layer` everywhere else.

## Think in terms of produced services and requirements

Describe Effect layer relationships in terms of what a layer produces and what it requires — not
as "parent"/"child" or other object-hierarchy terms.

```ts
Layer.Layer<GitHubClient, never, GitHubAppAuth | HttpClient>
```

means: produces `GitHubClient`; requires `GitHubAppAuth` and `HttpClient`. If two layers are
merged, they produce multiple services. If one layer needs another service to construct itself,
that other service is a dependency/requirement, not a "child".

## Erase dependencies locally, including shared stable ones

Prefer providing a service's dependencies near the service itself, rather than leaving every
dependency for the application root to wire up:

```ts
static readonly layer = this.layerNoDeps.pipe(
  Layer.provide(GitHubInstallationClient.layer),
  Layer.provide(GitHubInstallationsRepo.layer),
  Layer.provide(GitHubRepositoriesRepo.layer),
)
```

This isn't limited to dependencies exclusively owned by one service — a shared dependency with a
stable, reusable layer (e.g. a common `DatabaseLayer`) can also be erased locally. Effect layers
are memoized by identity, so reusing the same layer value in multiple places does not mean
repeatedly constructing the underlying resource. Prefer sharing a stable layer value over avoiding
local provision merely because several services depend on it.

## Preserve referential equality; use `Layer.unwrap` for effectful stable layers

Dependency erasure works best when the same layer value is reused by reference. Be careful that a
function call like `makeDatabaseLayer(config)` can produce a distinct layer reference each time
it's called — prefer a single stable `const XLayer = ...` that call sites reuse.

When constructing a layer requires reading configuration or otherwise running an effect first,
express that as a stable layer with `Layer.unwrap` rather than a factory function that's called
fresh at each use site:

```ts
export const OptionalPolicyAiLayer = Layer.unwrap(
  Effect.gen(function* () {
    const apiKey = yield* Config.option(Config.redacted("OPENAI_API_KEY"))
    if (apiKey._tag === "None") return PolicyAi.unavailableLayer

    const model = yield* Config.string("LABELING_AI_MODEL").pipe(Config.withDefault("gpt-5.6-luna"))
    return PolicyAi.layerNoDeps.pipe(
      Layer.provide(OpenAiLanguageModel.model(model, { reasoning: { effort: "low" } })),
      Layer.provide(openAiLayer(apiKey.value)),
    )
  }),
)
```

Don't force this pattern where runtime composition genuinely requires a dynamically constructed
layer per call.

## Root composition can be a long chain of `Layer.provide` — that's expected

A worker/application entrypoint composing many concrete service layers via a long chain of
`.pipe(Layer.provide(...), Layer.provide(...), ...)` is not a smell to eliminate. Each dependency
already erased its own private dependencies at the `layerNoDeps -> layer` step, so a root chain of
a dozen-plus `Layer.provide` calls is wiring together distinct top-level services, not low-level
plumbing — don't restructure it into something more "compact" for its own sake.

```ts
const HttpLayer = Layer.mergeAll(ApiHandlersLayer, ApiDocsLayer).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(PolicyTesterLayer),
  Layer.provide(RuleTesterLayer),
  Layer.provide(GitHubClient.layer),
  Layer.provide(GitHubRepositoriesRepo.layer),
  Layer.provide(GitHubSetup.layer),
  Layer.provide(GitHubDataSyncQueue.layerWith(options.dataSyncQueue)),
  // ...more concrete service layers
)

const MainLayer = HttpLayer.pipe(
  Layer.provide(makeDatabaseLayer(options.database)),
  Layer.orDie,
)
```

Use `Layer.mergeAll` to combine independent/unrelated layers that need to coexist before a shared
`Layer.provide` step (e.g. several independent HTTP handler-group layers, or a browser app's
otherwise-unrelated top-level resources) — not as a mandate to avoid provide chains generally.

## Static class properties vs top-level exports — a deployment decision, not aesthetics

For application/backend code, attaching layers to a service as static properties
(`Service.layer`, `Service.layerNoDeps`) is fine and improves discoverability, because the code is
a single deployable and tree-shaking doesn't matter.

For library code, or any module shared across multiple runtime environments (e.g. code imported
by both a backend worker and a browser bundle), do not attach layers as static properties on a
shared service class. Attaching a property to a class is not reliably tree-shakeable: an unused
static referencing a backend-only dependency (a database client, a server-only SDK) can still
cause that dependency to be pulled into a frontend bundle even though the property is never
called. Prefer explicit top-level exports there instead, so an unused import can actually be
eliminated:

```ts
export const GitHubEventsRepoLayer = ...
```

A domain/schema package meant for cross-environment use should generally have no service layers
attached to its types at all — if it needs to expose behavior, do it through a separate
backend-only module with top-level exports, not through statics on the shared type.

## Test doubles: hand-build focused `Layer.succeed` stubs

Build test layers by providing hand-written `Layer.succeed` stubs for only the dependency methods
a test actually exercises into a service's `layerNoDeps`:

```ts
const layer = (result: Option.Option<Repository>) =>
  GitHubPullRequest.layerNoDeps.pipe(
    Layer.provide([
      Layer.succeed(GitHubRepositoriesRepo, {
        findByGitHubId: () => Effect.succeed(result),
        list: () => Effect.die("unexpected call: list"),
      }),
      Layer.succeed(GitHubClient, { getRepositoryLabel: () => unavailable }),
    ]),
  )
```

Combine multiple stubbed dependencies with `Layer.mergeAll` (or an array passed to
`Layer.provide`). Stub only what the test needs; leave unrelated methods failing loudly
(`Effect.die("unexpected call")`) rather than silently succeeding, so an unexpected call surfaces
as a test failure instead of a false positive. `Layer.mock` can serve the same purpose (only
implement what's needed, fail on the rest) when a project's Effect version makes it ergonomic —
either approach is acceptable, but match whichever one an existing test suite already uses.

## Decision checklist

- Name standalone layers with a `Layer` suffix; never `Live`/`Default`.
- On a service class, expose `layerNoDeps` (unsatisfied, for tests) and `layer` (default deps
  provided, for normal use) — skip `layerNoDeps` only when there's nothing to leave unsatisfied.
- Extract construction logic into a named `makeX` function; never inline `make` in the
  `Context.Service` config, and never name the extracted function generically `make` — unless
  it's only ever accessed through a qualifying class, generated Schema member, or module
  namespace (`Model.make`, `X.insert.make`), in which case keep it generic per Effect's own idiom.
- For a runtime-supplied resource, add a parameterized `layerWith(resource)` that calls the same
  named `makeX`.
- Describe relationships as "produces"/"requires", not parent/child.
- Erase dependencies locally whenever it simplifies root composition, including shared stable
  ones — layer memoization makes this safe.
- Reuse stable layer references; use `Layer.unwrap` when a stable layer's construction needs to
  run an effect first.
- Don't flatten a long, legitimate chain of `Layer.provide` calls at the application root — it's
  expected once each dependency already erased its own private deps.
- Use static `layer`/`layerNoDeps` properties only in application/backend code. Use explicit
  top-level exports in library or cross-environment code, where tree-shaking matters.
- Build test doubles as hand-written `Layer.succeed` stubs implementing only what's exercised,
  provided into `layerNoDeps`.
