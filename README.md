<div align="center">
  <img src="./src-tauri/icons/icon.png" width="128" height="128" alt="御案应用图标" />
  <h1>御案（Yù Àn）</h1>
  <p>像批阅奏折一样，管理待办、关心之事与今日奏报。</p>

  <p>
    <a href="./package.json"><img src="https://img.shields.io/badge/version-0.1.1-9c3b2d" alt="Version 0.1.1" /></a>
    <a href="https://v2.tauri.app/"><img src="https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri&amp;logoColor=white" alt="Tauri 2" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&amp;logoColor=white" alt="TypeScript 6" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-b3945d" alt="MIT License" /></a>
  </p>
</div>

---

御案是一款本地优先的新中式桌面效率工具，将日常信息处理映射为“呈奏、御览、朱批、归档”。应用不需要账户，不包含广告或遥测；除 DeepSeek 问答、RSS/网页内容获取和用户主动打开外部链接外，业务数据均保存在本机。

![御案新中式主视觉](./src/assets/generated/imperial-desk.png)

## 功能特性

### 今日御览与待办

- 汇总今日待办、关心事项和新闻奏报。
- 支持标题、正文、优先级、截止日期与标签。
- 支持完成、搁置、归档、筛选和本地持久化。

### 关心库与内容采集

- 支持手工录入、显式粘贴、拖入文字和 HTTPS 链接。
- 支持 `.txt`、`.md` 和 `.markdown` 文件导入。
- 使用内容哈希与 SQLite 原子约束阻止重复收录。
- 网页仅提取标题、摘要和原始链接，不在 WebView 中执行第三方脚本。

### 今日奏报

- 支持 RSS/Atom 来源管理和手动刷新。
- 前台定时刷新，失败时显示本地缓存和最后更新时间。
- 通过本地关键词与标签匹配关心事项，不依赖 AI。

### AI 小太监“小安子”

- 通过 DeepSeek 提供流式问答、关心库摘要、标签与待办建议。
- 整理操作始终“先预览、后确认”，AI 不能直接修改本地数据。
- 桌面端提供 Q 版始终置顶小安子，可展开轻量对话窗口。
- 可将文字或文本文件拖到小安子窗口，直接加入关心库。
- 主聊天与桌宠聊天分别保存会话，流式回复自动跟随到底部。

### 本地优先与可访问性

- SQLite 保存待办、关心库、新闻缓存、聊天和非敏感设置。
- Stronghold 加密保存 DeepSeek API Key，不写入数据库、日志或备份。
- 支持 JSON 数据备份与恢复。
- 支持 100%、112% 和 125% 界面字号缩放，并遵循系统“减少动画”偏好。
- 未配置 DeepSeek 或处于离线状态时，本地功能仍然可用。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面运行时 | Tauri 2、Rust、Windows WebView2 |
| 前端 | React 19、TypeScript、Vite、React Router |
| 数据与校验 | SQLite、Stronghold、Zod |
| 外部服务 | DeepSeek API、RSS/Atom、HTTPS 网页快照 |
| 测试 | Vitest、Testing Library、Playwright、Rust Test |

## 快速开始

### 环境要求

- Node.js 20 或更高版本
- Rust 1.77.2 或更高版本
- Windows 10/11 与 Microsoft Edge WebView2 Runtime
- 包含“使用 C++ 的桌面开发”工作负载的 Visual Studio Build Tools

### 安装依赖

```powershell
git clone git@github.com:jiang585/LoongDesk.git
cd LoongDesk
npm install
```

### 浏览器开发预览

```powershell
npm run dev
```

浏览器预览使用 `localStorage`，用于界面开发和自动化测试。它不会使用桌面端 SQLite、Stronghold 或 Rust 网络命令。

### 启动桌面开发版

```powershell
npm run tauri dev
```

首次启动后可按引导设置保险库密码、DeepSeek API Key 和默认新闻来源。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 浏览器开发服务器 |
| `npm run tauri dev` | 启动 Tauri 桌面开发版 |
| `npm test` | 运行 TypeScript/Vitest 测试 |
| `npm run test:e2e` | 运行 Playwright 端到端测试 |
| `npm run lint` | 运行 Oxlint 静态检查 |
| `npm run build` | 执行 TypeScript 检查并构建前端 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 运行 Rust 测试 |
| `npm run tauri build` | 生成 Windows NSIS 安装包 |

如果系统中存在无效的 `CC` 环境变量，Rust 的 SQLite 编译可能失败。请在当前 PowerShell 会话中移除它，不要将 `CC` 指向目录：

```powershell
Remove-Item Env:CC -ErrorAction SilentlyContinue
Remove-Item Env:CFLAGS -ErrorAction SilentlyContinue
```

## 项目结构

```text
LoongDesk/
├─ src/
│  ├─ domain/           # 领域模型、校验与端口
│  ├─ application/      # 用例规则与领域服务
│  ├─ infrastructure/   # SQLite、Stronghold、DeepSeek、内容源适配器
│  └─ presentation/     # React 页面、组件、状态与交互钩子
├─ src-tauri/
│  ├─ src/              # Rust 网络、安全、迁移和窗口生命周期
│  ├─ capabilities/     # Tauri 权限声明
│  └─ icons/            # 桌面与移动端图标
├─ docs/                # 架构、隐私和视觉资产说明
└─ e2e/                 # Playwright 流程测试
```

依赖方向保持为：

```text
presentation → application → domain
       ↓             ↓
infrastructure implements domain ports
       ↓
Tauri IPC / SQLite / Stronghold / DeepSeek / RSS
```

领域层和应用层不依赖 React、Tauri、SQLite 或具体 API。详细设计见[架构说明](./docs/ARCHITECTURE.md)。

## 隐私与安全

- 待办、关心库、聊天、设置和新闻缓存仅保存在本机。
- API Key 仅进入 Stronghold，不进入 SQLite、日志、前端快照或 JSON 备份。
- RSS 和网页快照默认只允许公开 HTTPS 地址，并阻止 localhost、私网地址和带凭据 URL。
- 新闻详情通过系统浏览器打开，不在应用 WebView 内执行第三方页面脚本。
- 不提供账户、云同步、广告或遥测。

完整数据边界见[隐私说明](./docs/PRIVACY.md)。

## 已知限制

- 当前首要支持平台为 Windows 10/11；macOS 和 Linux 仅保持源码兼容。
- 跨管理员权限级别拖放受 Windows 安全机制限制，可使用 `Ctrl+Shift+V` 显式收录剪贴板内容。
- 新闻获取依赖来源自身的 RSS/Atom 可用性，离线时展示本地缓存。
- Android 结构已经预留，但当前版本尚未生成 APK/AAB。

## 开发路线图

路线图用于表达方向，不代表固定发布日期。涉及本地数据结构的变更将继续使用版本化 SQLite 迁移。

### v0.1 — Windows 桌面 MVP（已完成）

- [x] 今日御览、待办、关心库和今日奏报
- [x] RSS/Atom、网页摘要和离线缓存
- [x] DeepSeek 流式问答与 AI 整理提案
- [x] SQLite 本地持久化与 Stronghold 密钥保护
- [x] Q 版小安子桌宠、拖放采集与多窗口生命周期
- [x] JSON 备份恢复、Windows NSIS 安装包和基础测试

### v0.2 — 桌面体验与可靠性

- [ ] 系统托盘与用户可选的后台驻留模式
- [ ] 全局快捷键唤起小安子和快速添加待办
- [ ] 多显示器、不同 DPI 和窗口位置恢复测试
- [ ] 数据库迁移诊断、备份校验与恢复预览
- [ ] 聊天会话管理、搜索、重命名与导出
- [ ] Windows 自动更新与签名发布流程
- [ ] 完整 Tauri 桌面端端到端测试矩阵

### v0.3 — 关心事项与信息处理

- [ ] 关心库全文搜索、保存筛选器和批量操作
- [ ] 网页关注项的手动复查与内容变化对比
- [ ] 更多公开 RSS/Atom 分类源和来源健康检查
- [ ] PDF、HTML 等格式的安全本地文本提取
- [ ] 本地规则驱动的摘要模板、标签规则和待办模板
- [ ] AI 提案的逐项选择、撤销记录和历史对比

### v0.4 — Android 客户端

- [ ] 初始化 Tauri Android 工程并复用领域层、用例层和 SQLite schema
- [ ] 底部导航、触摸目标、安全区和系统返回键适配
- [ ] 通过 Android 分享面板将文字和链接送入关心库
- [ ] 移动端网络权限、前后台刷新和省电策略
- [ ] 生物识别解锁保险库
- [ ] APK/AAB 构建、签名与真机兼容性测试

### v1.0 — 稳定版

- [ ] Windows 与 Android 核心功能一致性验收
- [ ] 大数据量性能优化和长期运行稳定性测试
- [ ] 无障碍、键盘操作、高对比度与国际化基础
- [ ] 完整的升级、备份恢复和隐私审计流程
- [ ] 用户文档、故障排查手册和稳定发布通道

## 参与开发

欢迎通过 Issue 提交缺陷、功能建议或 RSS 来源建议。提交代码前请确保以下命令通过：

```powershell
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

建议每个 Pull Request 聚焦一个问题，并包含对应测试、用户可见变化和数据迁移说明。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
