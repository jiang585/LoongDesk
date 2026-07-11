# 御案（Yù Àn）

御案是一款本地优先的新中式桌面效率工具：像批阅奏折一样处理待办、关心之事、今日奏报，并可召见接入 DeepSeek 的 AI 小太监“小安子”。

![御案主视觉](./src/assets/generated/imperial-desk.png)

## 已实现

- 今日御览、待办记录、轻重缓急、截止日期、标签、搁置与归档
- 关心库手工录入、显式粘贴、网页文字拖入、`.txt/.md` 文件导入、HTTPS 网页快照
- 始终置顶的 Q 版“小安子”桌宠：点击展开轻量对话，文字或文本文件可直接拖入其窗口归入关心库
- 全局 16px 正文字号与 100% / 112% / 125% 阅读缩放；聊天流式回复自动跟随，用户上翻时不会被强制拉回
- RSS/Atom 来源管理、30 分钟前台刷新、本地缓存、关心事项关键词匹配
- DeepSeek V4 Flash/Pro 流式问答、取消生成、JSON 整理预览、确认后落库
- Stronghold 加密保存 API Key；SQLite 保存其他数据
- JSON 备份与恢复、离线降级、浏览器开发预览
- 为 Android 预留的响应式底部导航和平台无关领域/用例层

## 技术栈

- Tauri 2、Rust、SQLite、Stronghold
- React 19、TypeScript、Vite、Zod
- Vitest、Testing Library、Playwright

## 本地开发

要求：Node.js 20+、Rust 1.77.2+、Windows WebView2，以及带 C++ 桌面工作负载的 Visual Studio Build Tools。

```powershell
npm install
npm run dev
```

浏览器预览使用 `localStorage`，不会调用外部 RSS 或 DeepSeek；桌面正式运行固定使用 SQLite 与 Tauri 网络命令：

```powershell
npm run tauri dev
```

## 验证与打包

```powershell
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

Windows 默认产物为 NSIS 安装包。当前机器若设置了无效的 `CC` 环境变量，运行 Rust 命令前应在当前终端移除它；不要把 `CC` 指向目录。

## 隐私与数据

- 待办、关心库、聊天记录、设置和新闻缓存只保存在本机。
- DeepSeek Key 只保存于 Stronghold，不进入 SQLite、日志或 JSON 备份。
- 仅在 DeepSeek 问答、刷新 RSS/网页快照、主动打开原文时联网。
- 详细边界见 [隐私说明](./docs/PRIVACY.md)，模块设计见 [架构说明](./docs/ARCHITECTURE.md)。

## Android 后续

桌面 MVP 验收后执行 `npm run tauri android init`。领域模型、仓储接口、SQLite schema、DeepSeek/RSS 适配器和响应式 UI 均可复用；后续仅补移动壳、分享入口、安全区、返回键、后台调度和生物识别解锁。
