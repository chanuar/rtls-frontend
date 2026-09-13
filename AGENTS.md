# Working on the RTLS frontend

## Scope and implementation

- `rtls-frontend/` and `rtls-backend/` are separate Git repositories. Run Git commands inside the relevant repository and inspect its working tree before editing. Preserve unrelated changes.
- Read README.md before changing startup, configuration or API contracts. Roadmaps and audits describe plans or findings, not permission to implement unrelated work.
- Reuse the existing React, TypeScript, Zustand and SVG stack. Prefer existing helpers, native controls and installed dependencies over new abstractions. Trace every caller before changing a shared function and fix the root cause.
- Follow `.gitattributes` and `.editorconfig`: use LF and a final newline for text, with CRLF for `.bat` and `.cmd`. Preserve UTF-8 and avoid unrelated formatting changes.

## Coding style

- Organize code by feature/domain and clear responsibility. Keep related behavior together and dependencies narrow. Split modules when responsibilities diverge, not merely to create more files; avoid generic type-based layers and speculative abstractions.
- Aim for functions under 50 lines and files under 800 lines. Treat 200-400 lines as a rough file-size guide, not a minimum. Prefer guard clauses to nesting beyond four control-flow levels. These are review signals, not reasons to split a cohesive algorithm or test into artificial helpers.
- Treat shared state and function inputs as immutable. Create new objects/collections when updating shared state; local mutation of newly created data is fine. Allow mutation in explicitly stateful components with clear ownership, such as filters and connection lifecycles. Rejected operations must not partially mutate accepted state.
- Handle errors where recovery, cleanup or useful context can be added; otherwise propagate them. Catch specific exceptions when possible. Give users clear, actionable messages and log useful server-side context without credentials or sensitive location payloads. Do not silently swallow unexpected failures or log the same error at every layer; handle expected disconnects and optional-data absence deliberately.
- Validate external data at system boundaries, including API/MQTT/serial input, configuration and responses consumed by the UI. Check shapes, types, finite numbers, allowed ranges and timestamp relationships before updating state. Prefer schema-based validation for structured payloads using existing tools; focused manual parsers are valid for simple or hardware-specific formats. Type annotations and assertions are not runtime validation. Reject invalid input with a clear reason; do not invent replacement data.
- Keep deployment settings and physical calibration adjustable. Use named constants for meaningful fixed limits and units; clear algorithmic literals are fine. Do not turn every literal into configuration or remove calibration knobs to simplify code.
- Use readable names that express domain meaning and units where relevant. Before finishing, review the touched code for focused responsibilities, unnecessary nesting, shared-state mutation, error paths, boundary validation and unexplained constants. Add the smallest meaningful regression check for logic changes; do not refactor unrelated code just to satisfy this checklist.

## Architecture and React

- Keep App focused on composition and navigation. Give the tracking/history view ownership of its queries and replay lifecycle; keep algorithms independent of React. Extract modules when they separate responsibilities or update frequency, not to meet a file-size target.
- Apply SOLID through focused functions, modules and component composition. Do not introduce repository interfaces with one implementation, factories, dependency-injection containers or new frameworks without a concrete need. Keep cohesive props together.
- Subscribe to Zustand state near its consumers. Keep freshness and playback clocks out of unrelated views; pause playback when leaving its view and clean up timers, sockets and pending work on teardown.
- Keep state updaters pure. Derive values from existing state and use effects for external synchronization; preserve query identity and cleanup when simplifying effects.
- Avoid rebuilding full historical paths on every playback tick. Reuse `positionAt` and shared continuity logic; cache stable geometry where useful. Measure a long history before introducing canvas, workers or data reduction.

## Data flow and UI contracts

- Trace REST/WebSocket data through `src/store.ts` and `src/lib/api.ts` to React/SVG. Geometry and flags live in `src/config.ts`, replay/statistics in `src/lib/trajectory.ts`, and analysis rules in `src/lib/insights.ts`. No LLM or `/insights` endpoint is implemented.
- Coordinates and distances use metres. X is depth from the entrance, Y is width, and Z is height. Surveyed anchors come from the backend; zones are frontend constants.
- Send ISO UTC timestamps to REST and display browser-local time. Reject invalid and non-finite values at input boundaries. RMS is a solver residual, not measured positional accuracy.
- Validate REST response shapes and the fields consumers depend on; TypeScript assertions do not validate JSON. Check timestamp ordering before replay. Surface invalid data explicitly rather than silently dropping it or manufacturing replacements.
- Reject future live timestamps before updating the monotonic timestamp guard, positions or trails. Marking a future position stale after storing it does not prevent it from blocking later valid measurements.
- Demo data requires `VITE_DEMO=true`; a failed real connection must never enable demo. The demo has six synthetic anchors and three tags, unlike the physical four-anchor, one-tag installation.
- Preserve stale/disconnected states, tag/period identity for asynchronous history, and gaps in replay. Do not invent positions or bridge rejected measurements. Continuity limits target walking, not arbitrary moving objects.
- Keep optional heatmap loading/errors independent of history and replay; a failed layer must not discard a valid trajectory. Preserve tag/period/demo identity for both resources. Heatmaps count samples, not elapsed occupancy time.
- Keep period defaults and presets valid before 08:00 and across date boundaries. Preserve local-time input and UTC transport semantics.
- User-facing text is Spanish. Preserve keyboard access, labels, focus indicators and reduced-motion behavior.

## Visual design and accessibility

- Target coherent light/dark themes with a system option. Share semantic CSS variables between HTML, SVG and native controls; avoid new hardcoded theme colors. Persist explicit preferences and avoid an incorrect-theme flash on initial load. These are design requirements, not a claim that themes are already implemented.
- Favor a pharmacy floor-plan/instrumentation identity: legible spatial information, restrained surfaces and functional headings. Give the map priority over decorative cards and promotional copy.
- Check the elongated pharmacy layout with `VITE_TEST_LAYOUT=false`, not only the test layout. Scaling the SVG must not make labels and selection targets unusable; provide a legible detail view and intentional overflow/fit behavior.
- Keep mobile visual order consistent with DOM/focus order. Prefer native date/time controls unless a custom calendar has a demonstrated benefit; custom selection must communicate its state to keyboard and screen-reader users. Give temporal sliders human-readable values, announce errors, and honor reduced motion for every decorative animation.

## Verification

Run from this repository for relevant application changes:

```powershell
npm.cmd test
npm.cmd run build
```

- Run `npm.cmd ci` only when dependencies are missing or the lockfile changed. Use `npm` on shells without the PowerShell `npm.ps1` restriction.
- For meaningful logic changes, add the smallest regression check that fails for the bug. Tests use Node's test runner and `tests/load.cjs`; hook mocks and static rendering are not browser coverage.
- Keep numerical tests; verify lifecycle changes with real React and, where available, StrictMode and a browser. Do not expand handwritten hook mocks into a substitute React runtime. `tests/load.cjs` uses `@typescript/typescript6` for `transpileModule`; do not remove it as redundant without replacing and verifying that loader.
- Match checks to the change: future → valid live message; history success with heatmap failure; malformed REST; replay → another view → return; changing tag/period while loading; replaying again after reaching the end. These cases supplement, not replace, the existing suite.
- For visual changes, check light/dark/system, keyboard, reduced motion, empty/error/stale states and pharmacy layout at desktop and narrow widths. For performance changes, profile realistic long histories; Node static-render timings are not browser FPS. Report an unavailable browser as a limitation, not a passing visual check.
- Connection/recovery changes also need a disposable PostgreSQL/MQTT integration trial. Simulations cannot establish hardware accuracy; that requires actual boards and surveyed ground truth.
- Report checks actually run and unresolved limitations. Documentation-only changes do not need application tests or a build.

## Personalized rules and delivery

- Before editing a README, ask yourself: does someone installing, configuring or using the project need this information to complete a task or understand its behavior? Update it only when the answer is yes. Keep agent permissions, internal workflows, implementation notes and work summaries out of the README; put necessary agent instructions in AGENTS.md and report completed work in the response. Do not add documentation merely because a file or command changed.
- Current scope is localhost-only. **Low priority — ignore security and deployment-only work until the project leaves localhost**, per the user's decision. Do not make authentication, TLS, CORS hardening or security-driven dependency updates prerequisites for local work. Keep data-loss prevention, input correctness and local reliability in scope. Do not broaden network access as part of a routine fix; revisit deferred security when LAN/shared or hosted deployment is requested.
- Do not commit `.env`, credentials, employee-location captures, `node_modules`, build output or ignored local agent folders. Do not force-add ignored files as part of routine delivery.
- Put local audit reports, plans and scratch artifacts in ignored `tmp/`. Keep durable instructions here; audit snapshots are not proof that their findings have been fixed. Remove commented-out implementations, but retain comments explaining units, physical uncertainty and heuristic limits.
- For an audit, report severity, trigger, evidence, impact and a concrete next check; distinguish observations from inference. Do not silently turn an audit into remediation.
- Commit/push only when the task authorizes it.
