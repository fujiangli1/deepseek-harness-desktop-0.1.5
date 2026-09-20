# Fork notes - deepseek-harness-desktop retargeted at dsh core 0.1.5-rc.2

This checkout is **upstream `agent-earth/deepseek-harness-desktop` v0.3.8**, which
pins `@deepseek-ai/dsh*` at `0.1.1-rc.2`. This fork moves it to `0.1.5-rc.2`.

Everything below is a deliberate difference from upstream. Nothing else was
touched, so `git diff` against a v0.3.8 checkout shows exactly the adaptation.

---

## Why 0.3.8 could not simply be repointed at 0.1.5

Three incompatibilities, in order of severity.

### 1. The ready-URL regex dropped the launch token (the blocking one)

Upstream 0.1.2 added per-process launch-token authentication. `dsh web` now
prints an authenticated URL and the server refuses every unauthenticated request:

```
dsh web: http://127.0.0.1:56474/?token=oTed2R7m9Q34j-wEd9FVioVR60g0jxjKwOYlFGnHF2g
```

The stock pattern was `(http:\/\/127\.0\.0\.1:\d+)\b`. The `\b` word boundary
terminates the match at the `?`, so the shell captured
`http://127.0.0.1:56474` and loaded it without the token. The server answered:

```
HTTP 401  dsh web authentication required; reopen the URL printed by dsh web.
```

That is the white/blank window. Verified against a live 0.1.5 server: the
token-less URL returns 401, the token URL returns 303 and mints the cookie the
GUI then uses.

**Fix** - `src/dsh-service.js`:

```js
const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/\?\S+)?)/m
```

The optional `(?:\/\?\S+)?` captures the query verbatim. The loopback-only
anchor is deliberately kept: upstream's own test
(`extractReadyUrl ignores non-loopback output`) asserts that a LAN URL such as
`http://192.168.1.10:3080` still yields `undefined`, and widening the pattern
would have broken it.

### 2. `dsh-host-apiproxy` no longer exists

`prepareApiProxy()` patched a console-opener inside `dsh-host-apiproxy`, which
upstream migrated away and removed in 0.1.2. On 0.1.5 the function threw while
resolving a package that is not in the tree.

**Fix** - `scripts/prepare-dependencies.mjs` returns `false` early when the
target file is absent, and the Windows path-opener patch is wrapped in
try/catch so an upstream refactor degrades to a warning instead of a failed
install.

### 3. Identical app name collided on the single-instance lock

Electron derives the userData directory from the app name, and
`requestSingleInstanceLock()` keys on it. With `APP_NAME = 'DeepSeek Harness'`
the fork shared `%APPDATA%\DeepSeek Harness` with an already-running stock
0.3.8 install, lost the lock and quit silently (exit 0, no output).

**Fix** - `src/main.js` uses `'DeepSeek Harness 0.1.5'`, giving the fork its own
userData directory so both can run side by side.

---

## Packaged-launch adaptations

The two changes above make the shell *work*; these two make it work when it is
started by double-clicking an executable rather than by a script that has
already set up the environment.

### `DSH_HOME` is resolved by the app

Started from Explorer, nothing has exported `DSH_HOME`, so dsh falls back to the
shared `~/.dsh`. That home is not inherently wrong, but its profile pins
whichever core was installed there and dsh may rewrite it in place, so a fork
running a different core must not share it.

`resolveDshHome()` in `src/main.js` prefers a `dsh-home` directory beside the
executable, which keeps the folder self-contained and movable, and falls back to
Electron's `userData` directory when the application directory is not writable -
as happens for an installation under `Program Files`. An explicitly exported
`DSH_HOME` always wins, so the existing launcher scripts keep working unchanged.

### The Windows system directories are appended to the child `PATH`

Windows resolves a bare `powershell.exe` through `PATH`, and some installations
carry no system directories on `PATH` at all. Any plugin spawning one then dies
with `ENOENT`; `dsh-host-open-in-app` does exactly that, which surfaces as

```
path open failed: path open failed: spawn powershell.exe ENOENT
```

when a path is clicked in the GUI. `dsh-pwsh-local` survives the same
environment only because it falls back to an absolute path.

`buildDshEnvironment()` now appends `%SystemRoot%\System32`, `%SystemRoot%`,
`%SystemRoot%\System32\Wbem` and `%SystemRoot%\System32\WindowsPowerShell\v1.0`
when they are absent. They are appended rather than prepended so a tool the user
put on `PATH` still wins, and entries already present are never repeated.

---

## Version and dependency changes

| File | Change |
|---|---|
| `package.json` | `version` -> `0.3.8-dsh0.1.5rc2` |
| `package.json` | 19 `@deepseek-ai/dsh*` pins `0.1.1-rc.2` -> `0.1.5-rc.2` |
| `package.json` | `dshmarket` removed from `dependencies` (see below) |
| `.npmrc` | `registry=https://registry.npmmirror.com/` |

`scripts/sync-upstream.mjs` (upstream's own version-bump tool) still works: it
requires every `@deepseek-ai/dsh*` pin to be equal, which they are.

### dshmarket is installed out of band

0.1.5 dropped `dshmarket` from the `@deepseek-ai/dsh` dependency list, so the
fork must supply it. It is **not** in `package.json`, because every published
`dshmarket` version declares

```
peerOptional @deepseek-ai/dsh-settings@^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2
```

which no `0.1.5-rc.2` release satisfies. Under npm's semver rules a prerelease
only satisfies a range carrying the same `[major,minor,patch]` tuple, so
`npm install` fails with ERESOLVE. Bypassing it with `--legacy-peer-deps` is
**not** an option: that flag also skips installing peer dependencies outright,
and on 0.1.5 the interface packages (`dsh-jobs`, `dsh-settings`,
`dsh-attachment`, `dsh-session-query`, `dsh-session-persistence`,
`dsh-util-time`) are declared *as peers* by their `-local`/`-file`/`-jsonl`
implementations. Skipping them makes the plugin tree fail to load:

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include
Cannot find package '@deepseek-ai/dsh-jobs' imported from dsh-jobs-local
```

So: install the tree normally, then inject the market with

```
node scripts/install-dshmarket.mjs
```

That fetches the tarball and unpacks it into `node_modules/dshmarket` without
invoking npm's resolver, leaving the resolved peer tree intact. Pass a directory
to target another tree, which is how a packaged app - it carries no `scripts/`
of its own - gets its market:

```
node scripts/install-dshmarket.mjs ../packaged/resources/app
```

`DSH_MARKET_VERSION` in `scripts/prepare-dependencies.mjs` and the expectation in
`test/prepare-dependencies.test.js` are both `1.50.0`.

### dshmarket's runtime dependencies must be declared in package.json

Because dshmarket is not a normal dependency, nothing pulls in what it imports.
Node resolves its `js-yaml` and `undici` from the target's `node_modules`, and a
clean `npm ci --omit=dev` installs only what `package.json` declares - so the
market loaded in a development tree, where `undici` arrived as somebody else's
transitive dependency, and then failed to load in the packaged app:

```
failed to import loader entry dsh-market (dshmarket):
Cannot find package 'undici' imported from .../node_modules/dshmarket/lib/net.js
```

`js-yaml ^4.1.0` and `undici ^7.29.0` are therefore listed in `dependencies`
alongside the dsh packages. They are not the wrapper's own dependencies, but
they are the application's, because the application bundles the market.

`install-dshmarket.mjs` verifies each of dshmarket's declared dependencies
resolves from the target and fails with a message naming the culprit, so this
class of mistake surfaces at install time rather than at boot.

---

## Packaging a runnable app without electron-builder

`npm run pack` needs `app-builder.exe` and the `winCodeSign` binaries from
electron-builder's own CDN, which is not always reachable. A runnable
application directory can be assembled by hand instead:

1. copy `node_modules/electron/dist/**` to the output directory and rename
   `electron.exe` to the application name;
2. copy the `files` whitelist from `package.json`'s `build` section into
   `resources/app/` - note it is a whitelist, so `assets/icon.svg` and the other
   unused icons are deliberately excluded;
3. run `npm ci --omit=dev --ignore-scripts` inside `resources/app/`, which drops
   the development tree from 893 MB to about 238 MB;
4. run `scripts/install-dshmarket.mjs <resources/app>` and reapply the
   `patchDshManifest` step, since `npm ci` wipes `node_modules`;
5. point `DSH_HOME` at a fresh directory. Do **not** copy an existing profile:
   its `profiles/node_modules` entries are Windows junctions into the
   `node_modules` of whichever app created it, and dsh rebuilds them correctly
   on first boot. Copy `settings.yaml`, `.credentials.yaml` and `sessions/`
   instead.

---

## Tests

Upstream suite plus three cases covering the token fix in
`test/dsh-service.test.js`: the token is kept, the match still stops before a
LAN suffix, and a token-less loopback URL still matches.

```
node test/dsh-service.test.js
node test/prepare-dependencies.test.js
```

Note: `node --test test/` spawns one child per file with piped stdio, which a
restricted sandbox denies (`spawn EPERM`). Running each file directly executes
the same `node:test` cases in-process.

---

## Runtime requirements this fork does not change

- **Windows 10 or later.** Both `electron.exe` (Electron 43.4.0) and upstream's
  packaged `DeepSeek Harness.exe` declare PE subsystem version `10.0`, so the
  fork's floor is identical to the stock install's. x64 only.
- **`DSH_HOME` must point at an isolated home.** The dsh profile resolves its
  bundles from the shared home, so pointing 0.1.5 at a `~/.dsh` whose
  `profiles/node_modules` holds 0.1.1 packages loads the old web app, and dsh
  may also rewrite that profile. A separate home also keeps 0.1.1's session log
  files (format V3 has no downgrade read) out of reach.
- **`%SystemRoot%\System32` on `PATH`.** `dsh-pwsh-local` survives its absence
  because it falls back to an absolute path, but `dsh-host-open-in-app` spawns a
  bare `powershell.exe` and fails with
  `path open failed: spawn powershell.exe ENOENT`.
