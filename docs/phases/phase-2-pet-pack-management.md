# Phase 2 开发文档：Pet pack 完整管理体验

> 阶段目标：把已有 pet pack runtime/schema/loader/importer 补齐为 Control Center 可操作的安装、预览、切换、删除体验。  
> 范围约束：保持 legacy `cat_anime/` 路径可用；现有 Actions 帧文件夹导入继续工作；所有宠物动作仍通过 `PetService`。

## 1. 背景

当前项目已经有：

- `src/main/pet-pack/schema.js`：严格 manifest 校验。
- `src/main/pet-pack/loader.js`：目录加载和 legacy 包装。
- `src/main/pet-pack/importer.js`：从 actions 元数据创建 manifest。
- `ActionService`：把 active 动作配置暴露给 renderer。
- Control Center Actions 页：单动作帧文件夹导入、预览、删除、默认/点击动作配置。

缺口是用户无法管理“整只宠物”的素材包：没有安装列表、没有整包预览、不能切换 pet pack、不能删除或版本查看。

## 2. 本阶段交付

### 2.1 主进程服务

新增 `src/main/services/pet-pack-service.js`：

- `listPacks()`：列出内置 legacy pack 和用户安装 pack。
- `inspectPackDirectory(sourceDir)`：校验一个 pet pack 目录，返回 selectionId、manifest 摘要、预览 sprite URL、错误。
- `importPack(selectionId)`：复制已检查通过的目录到 `userData/pet-packs/<pack-id>/`。
- `setActivePack(packId)`：保存 active pack，并让 `ActionService.reload()` 后宠物窗口刷新动作。
- `removePack(packId)`：删除用户安装 pack；禁止删除 built-in 和 active pack。
- `clearPendingSelection(selectionId)`：清理待导入目录选择。

### 2.2 设置模型

新增 `settings.petPacks`：

```json
{
  "petPacks": {
    "activePackId": "legacy-cat",
    "installed": {}
  }
}
```

内置 legacy pack 不写入 `installed`，由 service 合成展示。用户 pack 存在 `app.getPath('userData')/pet-packs/<pack-id>/`。

### 2.3 ActionService 接入

`ActionService` 增加 `petPackService` 注入：

```text
ActionService.getPetPack()
  -> petPackService.getActivePetPack()
  -> fallback legacy pack
```

`getPreviewConfig()` 根据 active pack 的 `rootPath` 生成 `previewSprite`，避免用户安装包 preview 仍按项目根目录拼路径。

### 2.4 IPC / preload

新增通道：

- `pet-packs:list`
- `pet-packs:inspect-directory`
- `pet-packs:clear-selection`
- `pet-packs:import`
- `pet-packs:set-active`
- `pet-packs:remove`

### 2.5 Control Center

Actions 页增加 “Pet Packs” 区块：

- 当前 active pack。
- 已安装 pack 列表：名称、id、版本、来源、动作数。
- 选择并检查 pet pack 目录。
- 显示检查报告：manifest、默认/点击动作、动作数、预览图、错误。
- 导入、启用、删除。

## 3. 安全与兼容规则

- `pet.json` 必须通过 `normalizePetPackManifest()`。
- action `sprite` 必须是 safe relative path，且导入前确认文件存在。
- pack id 只能是安全目录名。
- 待导入目录不能包含 symlink，避免导入后留下指向包外部的文件引用。
- 导入时使用临时/目标目录复制，不允许路径穿越。
- 删除 active pack 被拒绝。
- 删除 built-in legacy pack 被拒绝。
- active pack 加载失败时 fallback 到 legacy pack，避免应用无法启动。

## 4. 验收

- Control Center 可列出 built-in legacy pack。
- 可选择合法 pet pack 目录并预览 manifest。
- 可导入合法 pack，导入后出现在列表。
- 可启用用户 pack，宠物窗口动作菜单刷新。
- 可删除非 active 用户 pack。
- 非法 pack 目录、缺失 sprite、重复/不安全 id 被拒绝。
- `npm run check:syntax` 通过。
- `npm test` 通过。

## 5. Production Code Quality Review 关注点

- `ActionService` 是否仍是 renderer 动作配置的唯一来源。
- active pack 切换是否通过 `PetService.reloadAnimations()` 通知宠物窗口。
- userData pack 路径是否被限制在 `pet-packs/` 下。
- preview URL 是否基于 pack root，而不是硬编码项目根目录。
- 设置迁移是否兼容旧 `settings.json`。
