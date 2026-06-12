# Phase 5 开发文档：MCP / 外部 agent 产品化

> 阶段目标：让外部 agent 能稳定、安全、可文档化地使用 OpenPet MCP，而不只是“能 POST JSON-RPC”。  
> 范围约束：本地服务仍默认关闭，只允许 loopback，所有 MCP mutating 行为必须通过 token + session，并最终走 `PetService`。

## 1. 本阶段交付

- 新增 `McpTransportService`，从 `LocalHttpService` 中拆出 MCP session、tools/list、tools/call、schema validation。
- 保留 `POST /mcp` JSON-RPC。
- 增加 session TTL、active session count、revoke all sessions。
- 增加最小 `GET /mcp` streamable/SSE-style handshake，用于客户端探测 transport。
- Service 页展示 MCP active session 数并可撤销所有 sessions。
- 访问日志区分普通 HTTP pet API 与 MCP tool call。
- 新增 `docs/mcp-usage.md` 与 `docs/mcp-compatibility.md`。

## 2. 安全规则

- `initialize` 必须带 token，成功后返回 `Mcp-Session-Id`。
- `tools/list`、`tools/call`、`GET /mcp` 必须带 token + valid session。
- token 轮换必须撤销所有 MCP sessions。
- tool args 必须按 input schema 验证，拒绝额外字段和错误类型。
- MCP 不暴露 API Key、插件 storage 或任意文件系统能力。

## 3. 验收

- token 轮换后旧 session 失效。
- session TTL 到期后旧 session 失效。
- Service 页可撤销所有 MCP sessions。
- 访问日志能区分 `/mcp/tools/call/<tool>`。
- tests 覆盖 session TTL、schema validation、streaming handshake、session revoke。
- `npm test` 通过。
- `npm run check:syntax` 通过。

## 4. Production Code Quality Review 关注点

- MCP session 是否和 token 生命周期绑定。
- tool schema validation 是否覆盖 required、type、additionalProperties。
- MCP tool side effect 是否仍通过 `PetService`。
- streaming handshake 是否不绕过 token/session。
- 日志是否不记录 token。
