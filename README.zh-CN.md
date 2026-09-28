<h1 align="center">
  <img src="assets/icon.png" width="72" alt="DeepSeek Harness Desktop 标志" />
  <br />
  DeepSeek Harness Desktop 0.1.5
</h1>

<p align="center">
  把 <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
  内核 <code>0.1.5-rc.2</code> 装进桌面外壳的社区分支。
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/fujiangli1/deepseek-harness-desktop-0.1.5?style=flat-square&color=171513" /></a>
  <a href="LICENSE"><img alt="许可证：MIT" src="https://img.shields.io/badge/License-MIT-171513.svg?style=flat-square" /></a>
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%2B%20x64-171513.svg?style=flat-square" />
  <img alt="dsh" src="https://img.shields.io/badge/dsh-0.1.5--rc.2-171513.svg?style=flat-square" />
</p>

> [!IMPORTANT]
> **这是 [agent-earth/deepseek-harness-desktop](https://github.com/agent-earth/deepseek-harness-desktop) 的非官方分支。**
> 桌面外壳的架构、设计、UI 处理和安全模型全部来自原作者，**功劳属于上游**。
> 本分支只做一件事：把它对接的内核从 `0.1.1-rc.2` 换成 `0.1.5-rc.2`，并补上必要的兼容修改。
> 如果你不需要 0.1.5 内核，请直接使用[上游原版](https://github.com/agent-earth/deepseek-harness-desktop)。

---

## 为什么做这个

上游 `agent-earth/deepseek-harness-desktop` v0.3.8 把内核**锁死在 `@deepseek-ai/dsh@0.1.1-rc.2`**，
而 dsh 内核已经推进到 `0.1.5-rc.2`（npm `latest` / `next` tag），两者之间跨了四个版本：

- 内核新增了 **启动 token 认证**（`0.1.2` 起，ready URL 变成 `http://127.0.0.1:<port>/?token=...`）
- 包结构发生迁移（`dsh-host-apiproxy` 被移出）
- 插件市场的 peer 依赖范围没有跟上新内核

结果是：**上游外壳跑不了新内核**，而新内核本身只有 CLI / Web，没有桌面宿主。

所以这个分支的目标很明确：

1. **让 0.1.5 内核有一个能日常双击使用的桌面外壳**，而不是每次都开终端敲 `dsh web`
2. **完全不影响原有的 0.1.1 安装** —— 独立 `DSH_HOME`、独立 app 名、独立单实例锁，两套可以并存
3. **保持轻量** —— 复用上游的 profile junction 机制，不复制依赖树
4. **能跟着内核继续迭代** —— 保留上游的自动同步 workflow，内核出新版本时能自动开 PR

一句话：**不是为了做一个新外壳，而是为了让上游这个好外壳能继续用下去。**

---

## 这个分支改了什么

完整的技术说明、证据和上游对比在 [`FORK-NOTES.md`](FORK-NOTES.md)。

| # | 改动 | 为什么必须改 |
| --- | --- | --- |
| 1 | `src/dsh-service.js` 的 ready URL 正则 | 内核 `0.1.2+` 给 URL 加了 `?token=` 认证参数。原正则以 `\b` 结尾会把 token 截掉，外壳于是加载未认证 URL → 服务器返回 **401 → 白屏**。**这是最关键的一处** |
| 2 | `scripts/prepare-dependencies.mjs` 容忍 `dsh-host-apiproxy` 缺失 | 内核 `0.1.2` 迁移了这个包，脚本原本会因找不到文件而中断安装 |
| 3 | `src/main.js` 的 `APP_NAME` 改为 `DeepSeek Harness 0.1.5` | Electron 用 app 名推导 userData 目录，单实例锁基于该目录。与上游同名会导致**上游外壳正在运行时本外壳静默退出**（exit 0，无任何输出） |
| 4 | `src/main.js` 新增 `resolveDshHome()` | 双击启动时没有人设置 `DSH_HOME`，内核会退回共享的 `~/.dsh`，那里锁的是 0.1.1 的包，会加载错版本 |
| 5 | `src/dsh-service.js` 补齐 Windows 系统目录到 `PATH` | 部分机器上 `System32` 不在 `PATH` 里，任何 spawn 裸 `powershell.exe` 的插件都会报 `ENOENT` |
| 6 | `src/dsh-service.js` 的 `READY_PATTERN` 保留 token 同时仍只接受回环地址 | 上游有测试断言局域网 URL 必须返回 `undefined`，改动不能破坏这条安全约束 |
| 7 | 新增 `install-shortcuts.cmd` / `install-shortcuts.ps1` | 便携版没有安装程序，Windows 不会创建桌面和开始菜单快捷方式，搜索也找不到。脚本补上这一步，并可用 `-Remove` 撤销 |
| 8 | `scripts/install-dshmarket.mjs` | 所有已发布 dshmarket 声明的 peer 范围都不覆盖 `0.1.5-rc.2`，`npm install` 会 `ERESOLVE` 失败，因此改为在打包阶段手工注入 |

### 关于插件市场（dshmarket）

`dshmarket` **刻意不放在 `package.json` 的 `dependencies` 里**。

它的 peer 范围只到 `^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2`，装不进 `0.1.5-rc.2`。

**注意：不能用 `--legacy-peer-deps` 绕过。** 那个 flag 会连 peer 声明的接口包一起跳过安装，
而 0.1.5 里 `dsh-jobs`、`dsh-settings`、`dsh-attachment`、`dsh-session-query`、
`dsh-session-persistence`、`dsh-util-time` 都是被 `-local` / `-file` 实现包声明为 peer 的，
跳过它们会导致插件树直接加载失败（`Cannot find package '@deepseek-ai/dsh-jobs'`）。

正确做法是打包阶段用 `scripts/install-dshmarket.mjs` 注入。
它的两个运行时依赖 `js-yaml` / `undici` **必须**在 `package.json` 里声明，
否则 `npm ci --omit=dev` 不会安装它们，市场会在启动时报
`Cannot find package 'undici' imported from dshmarket/lib/net.js`。

---

## 下载与安装

本分支提供两种 Windows x64 形式，**推荐安装包**。

| 平台 | 架构 | 形式 | 说明 |
| --- | --- | --- | --- |
| Windows | x64 | **安装包（推荐）** | [下载](https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5/releases/latest/download/DeepSeek-Harness-0.1.5-Setup.exe) `DeepSeek-Harness-0.1.5-Setup.exe`，159 MB。**自动创建桌面与开始菜单快捷方式**，Windows 搜索直接可搜到 |
| Windows | x64 | 便携 ZIP | [下载](https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5/releases/latest/download/DeepSeek-Harness-0.1.5-portable.zip) `DeepSeek-Harness-0.1.5-portable.zip`，240 MB。解压即用，需手动跑一次 `install-shortcuts.cmd` |

全部版本见 [Releases](https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5/releases)。

### 安装包（推荐）

1. 双击 `DeepSeek-Harness-0.1.5-Setup.exe`
   - **逐用户安装，不弹 UAC**，可以改安装目录
   - Windows Defender SmartScreen 可能拦截：点 **更多信息 → 仍要运行**
2. 装完桌面就有图标，开始菜单里也有条目 —— **Windows 搜索能直接搜到「DeepSeek Harness 0.1.5」**
3. 首次启动约 10 秒（要在 `dsh-home` 下创建 profile 和 483 个 junction）
4. 卸载走「设置 → 应用」，或用安装目录里的 `Uninstall DeepSeek Harness 0.1.5.exe`

> [!IMPORTANT]
> 安装包**不含任何 API 密钥**。首次启动后请在设置里填入你自己的密钥。

> [!NOTE]
> 本分支使用独立的 `appId` 与产品名，因此**与原版 0.3.8 完全并存**：
> 各自的安装目录、快捷方式、卸载条目互不影响，升级本分支也不会动到原版。

### 便携版

1. 解压到一个**你不会随手删掉的目录**，例如 `D:\DeepSeek Harness 0.1.5\`
   - 目录路径建议不要有中文以外的特殊字符
   - 解压后约 675 MB
2. 双击 `DeepSeek Harness 0.1.5.exe`
   - 首次启动较慢（约 10 秒），因为要在 `dsh-home\` 下创建 profile 和 483 个 junction
   - Windows Defender SmartScreen 可能拦截：点 **更多信息 → 仍要运行**
3. 双击 `install-shortcuts.cmd` 创建桌面和开始菜单快捷方式
   - 便携版没有安装程序，**不做这一步 Windows 搜索是找不到它的**
   - 撤销：`install-shortcuts.cmd -Remove`
4. 启动后右键任务栏图标 → **固定到任务栏**

### 关于 `DSH_HOME`

程序自动推导 `DSH_HOME`，**按发布形态分流**：

| 形态 | `dsh-home` 位置 | 原因 |
| --- | --- | --- |
| 安装版 | `%APPDATA%\DeepSeek Harness 0.1.5\dsh-home` | 安装程序升级时会整体替换安装目录，放在 exe 旁边会被清掉 |
| 便携版 | exe 同目录 | 保持自包含、可随意移动或改盘符 |

移动便携版目录后重新运行一次 `install-shortcuts.cmd` 即可让快捷方式指向新位置。

> [!NOTE]
> 首次启动会在 `dsh-home\` 下生成 `profiles\`，里面是指向本应用 `node_modules` 的**绝对路径 junction**。
> 因此**不要把 `profiles\` 从一台机器复制到另一台机器**。需要迁移时只带走
> `settings.yaml`、`.credentials.yaml` 和 `sessions\`，让内核自己重建 profile。

---

## 主要特性

以下特性全部继承自上游外壳：

- 内核就绪后直接进入官方界面，没有多余步骤
- 启动期间显示轻量等待界面，不会出现「点了没反应」的观感
- 内置**设置 → Plugin Market**，可直接浏览、搜索、安装、更新、卸载社区插件
- 随应用提供 pnpm 运行时，装插件不需要另配 Node.js 工具链
- 支持系统托盘驻留，关闭主窗口后继续在后台运行
- 可通过托盘菜单在系统浏览器中打开当前本地地址
- 保留完整的设置、模型、会话、插件和 Agent 能力
- 退出时优雅结束内核子进程
- 只监听随机回环端口（`127.0.0.1`）
- Windows 下使用官方内置目录浏览器，规避打包后原生对话框 worker 失败的问题
- Windows 下保留可拖拽标题栏，避免原生窗口按钮遮挡界面
- Windows 下移除 Electron 默认的 File / Edit / View / Window 菜单栏

本分支额外补充：

- **`install-shortcuts.cmd`** —— 便携版一键创建桌面 / 开始菜单快捷方式并注册 App Paths
- **独立的 `DSH_HOME` 与 app 名** —— 可与上游 0.3.8 版本并存，互不干扰
- **自动补 `PATH` 系统目录** —— 修掉 `spawn powershell.exe ENOENT`
- **自动跟随内核升级** —— 上游的 `sync-upstream.yml` 每日检测新内核并自动开 PR

---

## 插件市场

打开 **设置 → Plugin Market** 即可浏览和搜索社区插件目录、查看插件来源，
并执行安装、更新、停用或卸载。

插件目录实时读取自 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com)，
插件变更仍通过官方 `dsh plugin --profile web` 流程完成，并保存在本机 profile 中。

本分支内置 `dshmarket@1.50.0` 与兼容的 pnpm 运行时。
由于应用生命周期由桌面宿主管理，**市场内的「一键重启进程」已关闭**；
插件提示需要重启时，请刷新页面或重启本应用。

> [!WARNING]
> 插件目录中的条目是**社区维护的第三方代码，不构成本项目或 DeepSeek 的背书**。
> 安装后的插件以你的用户权限在本地运行，可能访问 Harness 能访问到的数据。
> 安装前请先审查源码、发布者、权限和构建脚本警告。

---

## 安全模型

- 内核只绑定 `127.0.0.1` 的随机端口
- 渲染进程禁用 Node.js 集成
- 启用 `contextIsolation` 与 Chromium 沙箱
- 新窗口和跨域导航一律交给系统浏览器
- 内核运行在独立的 Electron Node 子进程中
- Cordis HMR 所需的 `--expose-internals` 权限只授予内核子进程
- Plugin Market 的写操作要求同源请求，安装来源限制在经过整理的目录内
- 启动 URL 中的 token 只在回环地址下被接受
- 第三方插件安装后仍以当前用户权限执行

---

## 运行时架构

```text
DeepSeek Harness Desktop
├── Electron Main
│   ├── 单实例窗口
│   ├── 内核子进程生命周期
│   ├── 随机回环端口与就绪检测
│   └── 平台菜单与外部链接处理
│
├── Harness 子进程
│   └── @deepseek-ai/dsh web
│       └── http://127.0.0.1:<random-port>/?token=<launch-token>
│
└── 沙箱化 BrowserWindow
    └── DeepSeek Harness Web UI
```

启动契约（外壳实际执行的命令）：

```text
dsh --expose-internals <entry> \
    --profile web \
    --patch config/plugin-market.patch.yml \
    --patch config/windows-directory-picker.patch.yml \
    --host 127.0.0.1 --port 0 --no-open
```

---

## 从源码构建

需要 Node.js 20+ 与 pnpm。

```bash
git clone https://github.com/fujiangli1/deepseek-harness-desktop-0.1.5.git
cd deepseek-harness-desktop-0.1.5
npm ci
node scripts/install-dshmarket.mjs      # 注入插件市场（见上文说明）
npm run dist:win                        # 生成 NSIS 安装程序 + 便携 ZIP
```

如果 Electron 或 electron-builder 的二进制下载缓慢，可设置镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 测试

```bash
node test/dsh-home.test.js
node test/dsh-service.test.js
node test/dsh-service-start.test.js
node test/prepare-dependencies.test.js
node test/sync-upstream.test.js
node test/window-lifecycle.test.js
node test/window-options.test.js
node test/windows-titlebar.test.js
node test/mac-titlebar.test.js
```

共 9 个文件 55 项断言，全部通过。

> 注意：不要用 `node --test test/`。它会给每个测试文件 spawn 子进程，
> 在某些受限环境中会因管道 `EPERM` 失败，逐个文件直接运行即可。

---

## 验证状态

| 项目 | 结果 |
| --- | --- |
| 打包版内核启动 | 正常，输出带 token 的 ready URL |
| HTTP 认证流程 | 无 token → `401`；带 token → `303` + `Set-Cookie`；带 cookie → `200`（约 28 KB，`<title>DeepSeek Harness`） |
| profile 自动生成 | 483 个 junction，全部指向本应用自身 |
| 删除 `profiles` 后重启 | 能自动重建，`node_modules` 文件数前后一致（27046） |
| exe 元数据 | `ProductName = DeepSeek Harness 0.1.5`，图标已替换 |
| 双击启动 | 实测通过 |
| **NSIS 安装包** | 连续安装两次均 exit 0；桌面 + 开始菜单快捷方式自动创建且指向安装位置；卸载条目与 0.3.8 并存；安装目录不含密钥 |
| **升级不丢数据** | `dsh-home` 落在 `%APPDATA%\DeepSeek Harness 0.1.5\`，连装两次凭据与设置仍在 |
| **与原版共存** | 安装前后 0.3.8 目录文件数 `19799 → 19799`、时间戳未变 |
| 单元测试 | 9 文件 55 项全过 |
| **启动诊断** | 就绪超时放宽到 300 秒；内核输出落盘到 `dsh-kernel.log`；失败弹窗提供「重试 / 打开日志文件夹 / 退出」 |
| Win10 兼容性 | PE 子系统版本 `10.0`，与上游 0.3.8 一致 |

---

## 已知限制

- **只有 Windows x64**，本分支没有构建 macOS / Linux 包
- 内核仍是 RC 版本，接口和行为可能快速变化
- 未做商业代码签名，SmartScreen 可能提示
- 未集成自动更新
- 插件市场内的进程重启功能不可用（由桌面宿主接管生命周期）
- **安装包不含 API 密钥**，首次启动后需自行在设置里填写
- 便携版必须手动运行一次 `install-shortcuts.cmd` 才会出现在开始菜单和搜索中

---

## 致敬与致谢

这个分支能存在，完全是因为下面这些人和项目。**请优先给上游点 Star。**

### 桌面外壳原作者 —— 本项目的直接基础

- **[agent-earth/deepseek-harness-desktop](https://github.com/agent-earth/deepseek-harness-desktop)**
  —— 桌面外壳上游，本分支基于其 **v0.3.8**。跨平台宿主层、单实例窗口、
  就绪检测、托盘、安全模型、Plugin Market 集成、macOS / Linux 构建配置、
  自动同步 workflow，全部出自这里。**MIT 许可。**
- 上游官方网站：<https://deepseek-harness-desktop.vercel.app>

### DeepSeek Harness 官方

- **[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)**
  —— 官方 Agent Harness 内核，本项目对接 `@deepseek-ai/dsh@0.1.5-rc.2`。
  模型、会话、设置、插件和 Agent 能力都由它提供。

### 插件市场与插件目录

- **[dsh-market/dsh-market](https://github.com/dsh-market/dsh-market)**
  —— 插件市场本体，本项目内置 `dshmarket@1.50.0`。
- **[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)**
  —— 经过整理的社区插件目录。
- **<https://awesome-dsh-plugin.com>** —— 插件目录在线索引。

### 底层依赖

- **[Electron](https://www.electronjs.org/)** —— 桌面运行时（本项目使用 43.4.0）
- **[pnpm](https://pnpm.io/)** —— 包管理器（本项目随包提供 10.34.5）
- **[Cordis](https://github.com/shigma/cordis)** —— 插件框架，DeepSeek Harness 的「一切皆插件」架构基础

### 其他

- 应用图标使用上游 DeepSeek Harness Web favicon 中的黑色鲸鱼图案
- 项目结构、文档措辞与安全模型描述沿用上游，以便日后合并上游改动

---

## 上游版本与许可

本分支固定使用 `@deepseek-ai/dsh@0.1.5-rc.2`，以保证打包结果可复现。

| 组件 | 版本 |
| --- | --- |
| dsh 内核 | `0.1.5-rc.2` |
| 外壳上游 | `agent-earth/deepseek-harness-desktop` v0.3.8 |
| 本分支版本号 | `0.3.8-dsh0.1.5rc2` |
| Electron | 43.4.0 |
| dshmarket | 1.50.0 |
| pnpm | 10.34.5 |

桌面外壳采用 [MIT License](LICENSE)。内置的 DeepSeek Harness、dsh-market 与 pnpm
同样采用 MIT License，其许可声明保存在 [`third-party-licenses`](third-party-licenses)。

本项目与 DeepSeek 官方无隶属关系，也未获得其背书。
DeepSeek Harness 及相关名称归各自所有者所有。
