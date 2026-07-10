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

表包括 `todos`、`concerns`、`content_sources`、`news_items`、`chat_sessions`、`chat_messages` 和 `app_settings`。API Key 不属于任何业务表。

## 网络边界

- RSS 和网页快照必须是公开 HTTPS URL；Rust 层阻止 localhost、私网、链路本地、保留地址和 URL 凭据。
- 单次响应上限 2MB、最多三次重定向、15 秒超时；只将结构化摘要返回 WebView。
- DeepSeek 只访问固定官方地址，模型白名单为 `deepseek-v4-flash` 与 `deepseek-v4-pro`。
- 问答上下文最多 50 条、20,000 字；整理结果先通过 Zod 校验，再由用户确认写入。

## 扩展方式

- 新的内容源实现 `ContentProvider`，不改动关心库或新闻 UI。
- 新的模型供应商实现 `AssistantProvider`，不改动聊天页面。
- Android 沿用所有 TypeScript 领域与应用代码、Rust 命令和 SQLite migration；平台差异集中在 Tauri 插件适配层。

