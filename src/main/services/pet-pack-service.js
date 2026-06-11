const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { getLegacyPetAnimations, loadLegacyPetPack, loadPetPackFromDirectory } = require('../pet-pack/loader')

const BUILT_IN_PACK_ID = 'legacy-cat'
const PET_PACK_SELECTION_TTL_MS = 10 * 60 * 1000

const isSafePackId = (packId) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(packId || '')

const ensureDirectory = (dirPath) => fs.mkdirSync(dirPath, { recursive: true })

const normalizePetPackSettings = (settings = {}) => ({
  activePackId: settings.activePackId || BUILT_IN_PACK_ID,
  installed: settings.installed && typeof settings.installed === 'object' && !Array.isArray(settings.installed)
    ? settings.installed
    : {}
})

const createSelectionId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const createBuiltInPack = ({ projectRoot, loadLegacyAnimations }) => {
  const pack = loadLegacyPetPack({
    id: BUILT_IN_PACK_ID,
    displayName: 'Legacy Cat',
    getPetAnimations: loadLegacyAnimations
  })
  return {
    ...pack,
    rootPath: projectRoot,
    source: { type: 'built-in', path: projectRoot }
  }
}

const assertInsideDirectory = (rootPath, targetPath, fieldName) => {
  const rootRealPath = fs.realpathSync(rootPath)
  const targetRealPath = fs.realpathSync(targetPath)
  if (targetRealPath !== rootRealPath && !targetRealPath.startsWith(`${rootRealPath}${path.sep}`)) {
    throw new Error(`Pet pack ${fieldName} must stay inside the pet pack directory`)
  }
}

const assertNoSymlinks = (rootPath) => {
  if (fs.lstatSync(rootPath).isSymbolicLink()) {
    throw new Error('Pet pack folders must not contain symlinks')
  }

  const walk = (currentPath) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      const stats = fs.lstatSync(entryPath)
      if (stats.isSymbolicLink()) throw new Error('Pet pack folders must not contain symlinks')
      if (stats.isDirectory()) walk(entryPath)
    }
  }
  walk(rootPath)
}

const validatePackFiles = (pack) => {
  for (const action of pack.manifest.actions) {
    const spritePath = path.join(pack.rootPath, action.sprite)
    if (!fs.existsSync(spritePath)) {
      throw new Error(`Pet pack action sprite does not exist: ${action.sprite}`)
    }
    assertInsideDirectory(pack.rootPath, spritePath, `action(${action.id}).sprite`)
  }
}

const pickPreviewAction = (actions = []) => {
  return actions.find((action) => action.kind === 'idle')
    || actions.find((action) => action.kind === 'greeting')
    || actions[0]
}

const createPackSummary = (pack, { active = false, installedAt = '', updatedAt = '' } = {}) => {
  const previewAction = pickPreviewAction(pack.manifest.actions)
  return {
    id: pack.manifest.id,
    displayName: pack.manifest.displayName,
    version: pack.manifest.version,
    source: pack.source?.type || 'directory',
    rootPath: pack.rootPath,
    active,
    installedAt,
    updatedAt,
    actionCount: pack.manifest.actions.length,
    defaultAction: pack.manifest.defaultAction,
    clickAction: pack.manifest.clickAction,
    previewSprite: previewAction?.sprite
      ? pathToFileURL(path.join(pack.rootPath, previewAction.sprite)).toString()
      : '',
    previewAction: previewAction ? {
      id: previewAction.id,
      label: previewAction.label || previewAction.id,
      frameCount: previewAction.frameCount,
      frameWidth: previewAction.frameWidth,
      frameHeight: previewAction.frameHeight,
      frameMs: previewAction.frameMs
    } : null
  }
}

const copyDirectory = (sourceDir, targetDir) => {
  fs.rmSync(targetDir, { recursive: true, force: true })
  ensureDirectory(targetDir)
  fs.cpSync(sourceDir, targetDir, { recursive: true })
}

const createPetPackService = ({
  settingsService,
  userPacksDir,
  projectRoot = path.join(__dirname, '..', '..', '..'),
  loadLegacyAnimations = getLegacyPetAnimations,
  now = () => new Date()
}) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!userPacksDir) throw new Error('userPacksDir is required')

  let pendingSelection = null

  const getSettings = () => normalizePetPackSettings(settingsService.get().petPacks)

  const savePetPackSettings = (petPacks) => {
    const settings = settingsService.get()
    settingsService.save({ ...settings, petPacks })
    return getSettings()
  }

  const getBuiltInPack = () => createBuiltInPack({ projectRoot, loadLegacyAnimations })

  const loadInstalledPack = (packId) => {
    const metadata = getSettings().installed[packId]
    if (!metadata) throw new Error(`Pet pack is not installed: ${packId}`)
    const pack = loadPetPackFromDirectory(path.join(userPacksDir, packId))
    if (pack.manifest.id !== packId) throw new Error(`Installed pet pack id mismatch: ${packId}`)
    validatePackFiles(pack)
    return {
      ...pack,
      source: { type: 'user-installed', path: pack.rootPath },
      metadata
    }
  }

  const getActivePetPack = () => {
    const petPackSettings = getSettings()
    if (petPackSettings.activePackId && petPackSettings.activePackId !== BUILT_IN_PACK_ID) {
      try {
        return loadInstalledPack(petPackSettings.activePackId)
      } catch (error) {
        console.error('Failed to load active pet pack:', error.message)
      }
    }
    return getBuiltInPack()
  }

  const listPacks = () => {
    const petPackSettings = getSettings()
    const builtInPack = getBuiltInPack()
    const packs = [createPackSummary(builtInPack, { active: petPackSettings.activePackId === BUILT_IN_PACK_ID })]

    for (const [packId, metadata] of Object.entries(petPackSettings.installed)) {
      try {
        const pack = loadInstalledPack(packId)
        packs.push(createPackSummary(pack, {
          active: petPackSettings.activePackId === packId,
          installedAt: metadata.installedAt,
          updatedAt: metadata.updatedAt
        }))
      } catch (error) {
        packs.push({
          id: packId,
          displayName: metadata.displayName || packId,
          version: metadata.version || 'unknown',
          source: 'user-installed',
          rootPath: path.join(userPacksDir, packId),
          active: petPackSettings.activePackId === packId,
          installedAt: metadata.installedAt || '',
          updatedAt: metadata.updatedAt || '',
          actionCount: 0,
          defaultAction: '',
          clickAction: '',
          previewSprite: '',
          valid: false,
          error: error.message || 'Failed to load pet pack'
        })
      }
    }

    return { activePackId: petPackSettings.activePackId, packs }
  }

  const inspectPackDirectory = (sourceDir) => {
    const selectionId = createSelectionId()
    const result = {
      selectionId,
      folderName: path.basename(sourceDir || ''),
      valid: false,
      errors: [],
      pack: null
    }

    try {
      if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
        throw new Error('Pet pack folder does not exist')
      }
      assertNoSymlinks(sourceDir)
      const pack = loadPetPackFromDirectory(sourceDir)
      if (!isSafePackId(pack.manifest.id)) throw new Error('Pet pack id is invalid')
      if (pack.manifest.id === BUILT_IN_PACK_ID) throw new Error('Pet pack id is reserved for the built-in pack')
      validatePackFiles(pack)
      result.valid = true
      result.pack = createPackSummary({ ...pack, source: { type: 'directory', path: sourceDir } })
      pendingSelection = {
        id: selectionId,
        sourceDir,
        inspectedAt: Date.now(),
        packId: pack.manifest.id
      }
    } catch (error) {
      result.errors.push(error.message || 'Pet pack inspection failed')
      pendingSelection = null
    }

    return result
  }

  const getPendingSelection = (selectionId) => {
    if (!pendingSelection || pendingSelection.id !== selectionId) {
      throw new Error('Selected pet pack folder is no longer available')
    }
    if (Date.now() - pendingSelection.inspectedAt > PET_PACK_SELECTION_TTL_MS) {
      pendingSelection = null
      throw new Error('Selected pet pack folder expired')
    }
    return pendingSelection
  }

  const clearPendingSelection = (selectionId) => {
    if (!selectionId || pendingSelection?.id === selectionId) pendingSelection = null
    return { ok: true }
  }

  const importPack = (selectionId) => {
    const selection = getPendingSelection(selectionId)
    assertNoSymlinks(selection.sourceDir)
    const pack = loadPetPackFromDirectory(selection.sourceDir)
    validatePackFiles(pack)
    const packId = pack.manifest.id
    if (!isSafePackId(packId)) throw new Error('Pet pack id is invalid')
    if (packId === BUILT_IN_PACK_ID) throw new Error('Pet pack id is reserved for the built-in pack')
    ensureDirectory(userPacksDir)
    const targetDir = path.join(userPacksDir, packId)
    const sourceRealPath = fs.realpathSync(selection.sourceDir)
    const targetParentRealPath = fs.existsSync(userPacksDir) ? fs.realpathSync(userPacksDir) : userPacksDir
    if (sourceRealPath === path.resolve(targetDir) || sourceRealPath.startsWith(`${path.resolve(targetDir)}${path.sep}`)) {
      throw new Error('Cannot import a pet pack from its install target')
    }
    copyDirectory(selection.sourceDir, targetDir)
    assertInsideDirectory(targetParentRealPath, targetDir, 'install target')
    const installedPack = loadPetPackFromDirectory(targetDir)
    validatePackFiles(installedPack)

    const current = getSettings()
    const previousMetadata = current.installed[packId] || {}
    const timestamp = now().toISOString()
    const nextSettings = savePetPackSettings({
      ...current,
      installed: {
        ...current.installed,
        [packId]: {
          id: packId,
          displayName: installedPack.manifest.displayName,
          version: installedPack.manifest.version,
          installedAt: previousMetadata.installedAt || timestamp,
          updatedAt: timestamp
        }
      }
    })
    pendingSelection = null
    return { pack: createPackSummary({ ...installedPack, source: { type: 'user-installed', path: targetDir } }), petPacks: nextSettings }
  }

  const setActivePack = (packId) => {
    if (!isSafePackId(packId)) throw new Error('Pet pack id is invalid')
    if (packId !== BUILT_IN_PACK_ID) loadInstalledPack(packId)
    const current = getSettings()
    const nextSettings = savePetPackSettings({ ...current, activePackId: packId })
    return { activePackId: nextSettings.activePackId, pack: createPackSummary(getActivePetPack(), { active: true }) }
  }

  const removePack = (packId) => {
    if (!isSafePackId(packId)) throw new Error('Pet pack id is invalid')
    if (packId === BUILT_IN_PACK_ID) throw new Error('Cannot remove the built-in pet pack')
    const current = getSettings()
    if (current.activePackId === packId) throw new Error('Cannot remove the active pet pack')
    if (!current.installed[packId]) throw new Error(`Pet pack is not installed: ${packId}`)
    fs.rmSync(path.join(userPacksDir, packId), { recursive: true, force: true })
    const nextInstalled = { ...current.installed }
    delete nextInstalled[packId]
    const nextSettings = savePetPackSettings({ ...current, installed: nextInstalled })
    return { petPacks: nextSettings }
  }

  return {
    getActivePetPack,
    listPacks,
    inspectPackDirectory,
    clearPendingSelection,
    importPack,
    setActivePack,
    removePack
  }
}

module.exports = {
  BUILT_IN_PACK_ID,
  createPetPackService,
  isSafePackId,
  normalizePetPackSettings
}
