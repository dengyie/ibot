# Production Code Quality Review：Phase 5 MCP / 外部 agent 产品化

> Review date：2026-06-12  
> Scope：`McpTransportService`、`LocalHttpService` MCP routing/session/logging、Service tab session UI、MCP usage/compatibility docs、tests。

## 1. Findings

No blocking findings after fixes.

## 2. Issues Found And Fixed During Review

- MCP schema validation initially accepted numeric strings for `number` fields because it used `Number(value)`. Fixed by requiring actual JSON numbers and finite values.

## 3. Review Notes

- MCP session, tool schema, tools/list, tools/call and JSON-RPC handling are now owned by `McpTransportService`; `LocalHttpService` owns HTTP routing, auth, content-type checks and access logs.
- `initialize` still requires the local HTTP token and returns `Mcp-Session-Id`; every subsequent MCP operation requires token + valid session.
- Token rotation calls `revokeSessions()`, invalidating old MCP sessions.
- Session TTL is configurable for tests and reported in runtime status.
- `GET /mcp` provides an authenticated `text/event-stream` endpoint handshake for clients probing streamable HTTP.
- Service tab can display active MCP session count and revoke all sessions.
- Access logs now distinguish MCP tool calls with paths such as `/mcp/tools/call/openpet.say`, while still avoiding token values.
- MCP docs now include usage examples and a compatibility matrix.

## 4. Residual Risk

- The stream endpoint is a minimal handshake, not a full long-running bidirectional MCP transport.
- Real-client verification is still pending for Claude Desktop, Cursor/Windsurf and OpenAI Agents SDK.
- MCP resources/prompts remain intentionally unimplemented until there is a concrete product use case.

## 5. Verification

- `npm test` passed：148/148.
- `npm run check:syntax` passed.
- New tests cover MCP session TTL, strict input schema validation, stream handshake, session revocation, token rotation invalidation, and tool-specific access log paths.

## 6. Recommendation

Safe to merge with the residual follow-ups above.
