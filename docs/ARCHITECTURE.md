# 御案架构说明

## 依赖方向

```text
presentation → application → domain
       ↓             ↓
infrastructure implements domain ports
       ↓
Tauri IPC / SQLite / Stronghold / DeepSeek / RSS
```

- `domain` 只包含模型、Zod 边界 schema 和端口，不依赖 React、Tauri 或数据库。
- `application` 保存哈希、匹配、上下文裁剪等用例规则。
- `infrastructure` 实现 SQLite/Web 仓储、Stronghold、内容源和 DeepSeek 适配器。
- `presentation` 按页面组织 UI，通过 `AppContext` 作为组合根调用端口。

## 本地持久化

正式桌面端使用 `sqlite:yuan.db`，Rust 启动时执行事务化、带版本号的迁移。浏览器预览使用 `WebPersistence`，仅供 UI 开发和自动化测试。两者实现同一 `Persistence` 端口。

表包括 `todos`、`concerns`、`content_sources`、`news_items`、`chat_sessions`、`chat_messages`、`ai_proposal_history` 和 `app_settings`。迁移 v3 增加 AI 提案历史，应用和撤销均在单个 SQLite 事务中执行。API Key 不属于任何业务表。

桌面窗口位置、显示器、DPI、托盘驻留与快捷键偏好保存在应用数据目录的 `desktop-state.json`，由 Rust 桌面基础设施层负责；业务数据仍只经过 `Persistence` 端口。

## 网络边界

- RSS 和网页快照必须是公开 HTTPS URL；Rust 层阻止 localhost、私网、链路本地、保留地址和 URL 凭据。
- 单次响应上限 2MB、最多三次重定向、15 秒超时；只将结构化摘要返回 WebView。
- DeepSeek 只访问固定官方地址，模型白名单为 `deepseek-v4-flash` 与 `deepseek-v4-pro`。
- 问答上下文最多 50 条、20,000 字；整理结果先通过 Zod 校验，再由用户确认写入。
- 更新器只读取本仓库 GitHub Release 的 HTTPS 元数据，并在安装前验证 Tauri 更新签名。

## 桌面边界

- 系统托盘、全局快捷键、窗口恢复和更新器集中在 `src-tauri/src/desktop.rs` 与 `infrastructure/desktopManager.ts`。
- 主窗口和宠物窗保存物理坐标、目标显示器与缩放因子；恢复时按当前 DPI 换算并钳制在可用工作区内。
- Windows 原生 E2E 通过 `tauri-driver` 验证双窗口、真实 SQLite 写入和重启恢复；浏览器流程继续由 Playwright 覆盖。

## 扩展方式

- 新的内容源实现 `ContentProvider`，不改动关心库或新闻 UI。
- 新的模型供应商实现 `AssistantProvider`，不改动聊天页面。
- Android 沿用所有 TypeScript 领域与应用代码、Rust 命令和 SQLite migration；平台差异集中在 Tauri 插件适配层。
