# Phase 7 开发文档：生态运营闭环

> 阶段目标：把插件和 pet pack 从“能装”升级为“可发现、可升级、可治理”。
> 范围约束：catalog 只提供元数据和下载入口；下载后必须做 sha256 校验，插件仍进入安装审查流，pet pack 仍进入 manifest 检查流。

## 1. 本阶段交付

- 新增静态 catalog JSON，统一承载插件与 pet pack 条目。
- 新增 `CatalogService`：加载 catalog、合并本地 blocklist、识别已安装项更新、下载并校验 package hash。
- Control Center 新增 Catalog 页：展示插件 / pet pack、更新状态、下载安装、blocklist 管理。
- 插件和 pet pack 的安装、启用、运行路径接入 blocklist：按 pluginId / packId / sha256 拦截。
- 新增 `docs/ecosystem-catalog.md`，说明 catalog 格式和运营流程。

## 2. 数据模型

新增 `settings.ecosystem`：

```json
{
  "ecosystem": {
    "blocklist": {
      "pluginIds": [],
      "packIds": [],
      "sha256": []
    }
  }
}
```

内置 catalog 位于 `catalog/openpet-catalog.json`，打包时随应用一起发布。后续如果接入远端 marketplace，仍复用同一 schema。

## 3. 安全规则

- catalog 不能直接执行代码。
- 下载 URL 第一版只允许 HTTPS，测试可通过注入 fetch 实现模拟。
- 下载内容必须与 catalog 声明的 sha256 完全匹配。
- blocklist 命中时：
  - 禁止 catalog 下载 / 安装。
  - 禁止手动安装命中的插件 / pet pack。
  - 禁止启用或运行已安装的命中插件。
  - 禁止启用命中的 pet pack。
- renderer 不接触本地文件路径、下载临时路径或插件代码，只接收 review 摘要。

## 4. 验收

- Control Center 能加载 catalog，并展示插件和 pet pack。
- catalog 下载包必须 hash 匹配，不匹配时拒绝安装。
- blocklist 命中 pluginId / packId / sha256 时拒绝安装或运行。
- 已安装插件 / pet pack 能显示是否有更新。
- `npm test`、`npm run check:syntax`、`npm run pack` 通过。

## 5. Production Code Quality Review 关注点

- 下载与 hash 校验是否无法绕过。
- catalog metadata 是否不会直接驱动执行。
- blocklist 是否覆盖安装、启用、运行三类路径。
- 临时文件是否清理，下载失败是否不会污染安装目录。
- UI 是否保留插件权限 review，而不是一键静默安装。
