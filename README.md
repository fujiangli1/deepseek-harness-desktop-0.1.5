<h1 align="center">
  <img src="assets/icon.png" width="72" alt="DeepSeek Harness Desktop logo" />
  <br />
  DeepSeek Harness Desktop 0.1.5
</h1>

<p align="center">
  A community fork of the DeepSeek Harness desktop shell, retargeted at dsh core
  <code>0.1.5-rc.2</code>.
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/fujiangli1/deepseek-harness-desktop-0.1.5?style=flat-square&color=171513" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-171513.svg?style=flat-square" /></a>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%2B%20x64-171513.svg?style=flat-square" />
  <img alt="dsh" src="https://img.shields.io/badge/dsh-0.1.5--rc.2-171513.svg?style=flat-square" />
</p>

> [!IMPORTANT]
> **This is an unofficial fork of [agent-earth/deepseek-harness-desktop](https://github.com/agent-earth/deepseek-harness-desktop).**
> The desktop architecture, design, UI handling, and security model all come from the original author —
> **the credit belongs upstream.** This fork does one thing: it moves the pinned kernel from
> `0.1.1-rc.2` to `0.1.5-rc.2` and applies the compatibility changes that requires.
> If you do not need the 0.1.5 kernel, use [the upstream project](https://github.com/agent-earth/deepseek-harness-desktop) instead.

---

## Why this fork exists

Upstream `agent-earth/deepseek-harness-desktop` v0.3.8 pins the kernel to
`@deepseek-ai/dsh@0.1.1-rc.2`, while the kernel has moved on to `0.1.5-rc.2`
(the npm `latest` / `next` tag) — four releases ahead. In between:

- The kernel added **launch-token authentication** (`0.1.2`): the ready URL became
  `http://127.0.0.1:<port>/?token=...`
- Packages were relocated (`dsh-host-apiproxy` moved out of the tree)
- The plugin market's declared peer range never caught up with the new kernel

The result: **the upstream shell cannot run the newer kernel**, and the newer kernel
ships only a CLI and a web UI — no desktop host.

So this fork has four goals:

1. **Give the 0.1.5 kernel a desktop shell you can just double-click**, instead of
   typing `dsh web` in a terminal every time
2. **Leave an existing 0.1.1 install completely untouched** — separate `DSH_HOME`,
   separate app name, separate single-instance lock, so both can coexist
3. **Stay lightweight** — reuse upstream's profile-junction mechanism rather than
   duplicating the dependency tree
4. **Keep tracking the kernel** — upstream's automatic sync workflow is preserved, so a
   new kernel release opens a PR automatically

In one line: **not to build a new shell, but to keep this good shell usable.**

---

## What this fork changes

Full rationale, evidence, and upstream comparisons live in [`FORK-NOTES.md`](FORK-NOTES.md).

| # | Change | Why it is required |
| --- | --- | --- |
| 1 | Ready-URL regex in `src/dsh-service.js` | Kernel `0.1.2+` appends a `?token=` auth parameter. The original pattern ended in `\b` and truncated the token, so the shell loaded an unauthenticated URL → **HTTP 401 → blank window.** The single most important change |
| 2 | `scripts/prepare-dependencies.mjs` tolerates a missing `dsh-host-apiproxy` | Kernel `0.1.2` relocated that package; the script aborted installation on the missing file |
| 3 | `APP_NAME` in `src/main.js` set to `DeepSeek Harness 0.1.5` | Electron derives the userData directory — and the single-instance lock — from the app name. Sharing upstream's name made this shell **exit silently (code 0, no output)** whenever the upstream app was running |
| 4 | New `resolveDshHome()` in `src/main.js` | A double-clicked launch sets no `DSH_HOME`, so the kernel fell back to the shared `~/.dsh`, which pins the 0.1.1 packages and loads the wrong version |
| 5 | Windows system directories appended to `PATH` in `src/dsh-service.js` | On some machines `System32` is absent from `PATH`, so any plugin spawning a bare `powershell.exe` failed with `ENOENT` |
| 6 | `READY_PATTERN` captures the token while still accepting loopback URLs only | An upstream test asserts that LAN URLs must resolve to `undefined`; the fix must not weaken that constraint |
| 7 | New `install-shortcuts.cmd` / `install-shortcuts.ps1` | A portable build has no installer, so Windows creates no desktop or Start menu entry and search cannot find the app. The script adds both, and `-Remove` undoes it |
| 8 | `scripts/install-dshmarket.mjs` | Every published dshmarket release declares a peer range that excludes `0.1.5-rc.2`, so `npm install` fails with `ERESOLVE`. The market is injected during packaging instead |

### About the plugin market (dshmarket)

`dshmarket` is **deliberately absent from `package.json` `dependencies`.**

Its peer range stops at `^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2`, which cannot
include `0.1.5-rc.2`.

**Do not work around this with `--legacy-peer-deps`.** That flag also skips the
peer-declared interface packages, and in 0.1.5 the packages `dsh-jobs`, `dsh-settings`,
`dsh-attachment`, `dsh-session-query`, `dsh-session-persistence`, and `dsh-util-time`
are all declared as peers by their `-local` / `-file` implementations. Skipping them
breaks the plugin tree outright with `Cannot find package '@deepseek-ai/dsh-jobs'`.

The correct approach is injection during packaging via `scripts/install-dshmarket.mjs`.
Its two runtime dependencies, `js-yaml` and `undici`, **must** be declared in
`package.json`, or `npm ci --omit=dev` will not install them and the market fails at
startup with `Cannot find package 'undici' imported from dshmarket/lib/net.js`.

---

## Download and install

This fork currently provides a **Windows x64 portable build only**.

| Platform | Architecture | Format | Download |
| --- | --- | --- | --- |
| Windows | x64 | Portable ZIP | [Download the portable build](https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5/releases/latest/download/DeepSeek-Harness-0.1.5-portable.zip) |

All versions are listed on the [Releases page](https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5/releases).

### Steps

1. Extract somewhere **you will not casually delete**, e.g. `D:\DeepSeek Harness 0.1.5\`
   - About 675 MB once extracted
2. Double-click `DeepSeek Harness 0.1.5.exe`
   - First launch is slow (roughly 10 seconds) because it builds a profile and 483
     junctions under `dsh-home\`
   - Microsoft Defender SmartScreen may intervene: click **More info → Run anyway**
3. Double-click `install-shortcuts.cmd` to create the desktop and Start menu shortcuts
   - A portable build has no installer, so **without this step Windows search cannot find the app**
   - Undo with `install-shortcuts.cmd -Remove`
4. Right-click the taskbar icon → **Pin to taskbar**

### About `DSH_HOME`

The application derives `DSH_HOME` as **the executable's directory** plus `dsh-home`,
so **the whole folder can be moved or given a different drive letter with no
configuration changes.** Re-run `install-shortcuts.cmd` afterwards so the shortcuts
point at the new location.

> [!NOTE]
> The first launch creates `profiles\` under `dsh-home\`, which contains **absolute-path
> junctions** into this application's `node_modules`. Do **not** copy `profiles\` between
> machines. To migrate, carry only `settings.yaml`, `.credentials.yaml`, and `sessions\`,
> and let the kernel rebuild the profile.

---

## Features

All of the following are inherited from the upstream shell:

- Opens the official Harness interface as soon as the local service is ready
- Shows a lightweight loading screen while the service starts
- Includes **Settings → Plugin Market** for browsing, searching, installing, updating,
  and removing community plugins
- Bundles a pnpm runtime, so installing plugins needs no separate Node.js toolchain
- Keeps running in the system tray when the main window is closed
- Opens the active local URL in the system browser from the tray menu
- Preserves the complete settings, models, sessions, plugins, and agent experience
- Gracefully terminates the kernel child process on exit
- Listens only on a random loopback port
- Uses the official in-app directory browser on Windows, avoiding packaged
  native-dialog worker failures
- Reserves a draggable Windows title bar so native window controls do not cover content
- Removes the default Electron File, Edit, View, and Window menu bar on Windows

Added by this fork:

- **`install-shortcuts.cmd`** — one-click desktop / Start menu shortcuts and App Paths
  registration for the portable build
- **A separate `DSH_HOME` and app name** — coexists with upstream 0.3.8 without interference
- **Automatic `PATH` repair** — fixes `spawn powershell.exe ENOENT`
- **Automatic kernel tracking** — upstream's `sync-upstream.yml` checks daily for a new
  kernel and opens a PR

---

## Plugin market

Open **Settings → Plugin Market** to browse and search the community catalog, inspect
plugin sources, and install, update, disable, or remove plugins.

The catalog is fetched live from [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com),
while package changes use the official `dsh plugin --profile web` workflow and remain in
your local profile.

This fork bundles `dshmarket@1.50.0` and a compatible pnpm runtime. Market-triggered
process restart is disabled because the desktop host owns the application lifecycle;
refresh the page or restart the application when a plugin requires a restart.

> [!WARNING]
> Catalog entries are community-maintained third-party code, not endorsements by
> DeepSeek or this project. Installed plugins run locally with your user permissions and
> may access data available to Harness. Review the source, publisher, permissions, and
> build-script warning before installing.

---

## Security model

- The kernel binds only to `127.0.0.1` on a random port
- Node.js integration is disabled in the renderer
- `contextIsolation` and the Chromium sandbox are enabled
- New windows and cross-origin navigation open in the system browser
- The kernel runs in a separate Electron Node child process
- The `--expose-internals` permission required by Cordis HMR is granted only to the kernel child process
- Plugin Market mutation endpoints require same-origin requests, and install sources are
  restricted to the curated catalog
- The launch token in the ready URL is accepted only on loopback addresses
- Third-party plugins still execute with the current user's permissions after installation

---

## Runtime architecture

```text
DeepSeek Harness Desktop
├── Electron Main
│   ├── Single-instance window
│   ├── Kernel child-process lifecycle
│   ├── Random loopback port and readiness checks
│   └── Platform menu and external-link handling
│
├── Harness Child Process
│   └── @deepseek-ai/dsh web
│       └── http://127.0.0.1:<random-port>/?token=<launch-token>
│
└── Sandboxed BrowserWindow
    └── DeepSeek Harness Web UI
```

The launch contract (the command the shell actually runs):

```text
dsh --expose-internals <entry> \
    --profile web \
    --patch config/plugin-market.patch.yml \
    --patch config/windows-directory-picker.patch.yml \
    --host 127.0.0.1 --port 0 --no-open
```

---

## Building from source

Requires Node.js 20+ and pnpm.

```bash
git clone https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5.git
cd deepseek-harness-desktop-0.1.5
npm ci
node scripts/install-dshmarket.mjs      # inject the plugin market (see above)
npm run dist:win                        # NSIS installer + portable ZIP
```

If the Electron or electron-builder binary downloads are slow, set mirrors:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### Tests

```bash
node test/dsh-service.test.js
node test/prepare-dependencies.test.js
node test/sync-upstream.test.js
node test/window-lifecycle.test.js
node test/window-options.test.js
node test/windows-titlebar.test.js
node test/mac-titlebar.test.js
```

7 files, 44 assertions, all passing.

> Do not use `node --test test/`. It spawns a child process per test file, which fails
> with a piped-stdio `EPERM` in some restricted environments. Run each file directly.

---

## Validation status

| Item | Result |
| --- | --- |
| Packaged kernel startup | Passed — prints a ready URL carrying a token |
| HTTP auth flow | No token → `401`; with token → `303` + `Set-Cookie`; with cookie → `200` (~28 KB, `<title>DeepSeek Harness`) |
| Profile bootstrap | 483 junctions, all pointing into this application |
| Delete `profiles` and restart | Rebuilds correctly; `node_modules` file count unchanged (27046) |
| Executable metadata | `ProductName = DeepSeek Harness 0.1.5`, icon replaced |
| Double-click launch | Passed on a real machine |
| Unit tests | 7 files, 44 assertions, all passing |
| Windows 10 compatibility | PE subsystem version `10.0`, same as upstream 0.3.8 |

---

## Known limitations

- **Windows x64 portable build only** — this fork builds no macOS or Linux packages and
  no NSIS installer
- The kernel is still an RC release and may change rapidly
- No commercial code signing, so SmartScreen may appear
- Automatic updates are not integrated
- Market-triggered process restart is unavailable (the desktop host owns the lifecycle)
- The portable build appears in Start menu and search only after running
  `install-shortcuts.cmd` once

---

## Credits and acknowledgements

This fork exists entirely because of the people and projects below.
**Please star the upstream projects first.**

### The original desktop shell — this project's direct foundation

- **[agent-earth/deepseek-harness-desktop](https://github.com/agent-earth/deepseek-harness-desktop)**
  — the upstream desktop shell, on which this fork is based at **v0.3.8**. The
  cross-platform host layer, single-instance window, readiness checks, tray, security
  model, Plugin Market integration, macOS / Linux build configuration, and the automatic
  sync workflow all originate there. **MIT licensed.**
- Upstream website: <https://deepseek-harness-desktop.vercel.app>

### DeepSeek Harness

- **[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)**
  — the official agent harness kernel; this fork targets `@deepseek-ai/dsh@0.1.5-rc.2`.
  Models, sessions, settings, plugins, and agent capabilities all come from it.

### Plugin market and catalog

- **[dsh-market/dsh-market](https://github.com/dsh-market/dsh-market)**
  — the plugin market itself; this fork bundles `dshmarket@1.50.0`.
- **[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)**
  — the curated community plugin catalog.
- **<https://awesome-dsh-plugin.com>** — the live catalog index.

### Underlying dependencies

- **[Electron](https://www.electronjs.org/)** — desktop runtime (43.4.0 here)
- **[pnpm](https://pnpm.io/)** — package manager (10.34.5, bundled)
- **[Cordis](https://github.com/shigma/cordis)** — the plugin framework behind DeepSeek
  Harness's "everything is a plugin" architecture

### Other

- The application icon uses the black whale artwork from the upstream DeepSeek Harness
  Web favicon
- Project structure, documentation wording, and security-model descriptions follow
  upstream so that future upstream changes remain mergeable

---

## Upstream version and license

This fork pins `@deepseek-ai/dsh@0.1.5-rc.2` for reproducible packaging.

| Component | Version |
| --- | --- |
| dsh kernel | `0.1.5-rc.2` |
| Shell upstream | `agent-earth/deepseek-harness-desktop` v0.3.8 |
| This fork | `0.3.8-dsh0.1.5rc2` |
| Electron | 43.4.0 |
| dshmarket | 1.50.0 |
| pnpm | 10.34.5 |

The desktop wrapper is available under the [MIT License](LICENSE). The bundled DeepSeek
Harness, dsh-market, and pnpm packages are also MIT-licensed; their notices are preserved
under [`third-party-licenses`](third-party-licenses).

This project is not affiliated with or endorsed by DeepSeek. DeepSeek Harness and related
names belong to their respective owners.
