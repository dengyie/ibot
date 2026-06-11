const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createActionService } = require('../../src/main/services/action-service')
const { BUILT_IN_PACK_ID, createPetPackService } = require('../../src/main/services/pet-pack-service')

const createSettingsService = (initialSettings = {}) => {
  let settings = {
    petPacks: {
      activePackId: BUILT_IN_PACK_ID,
      installed: {}
    },
    ...initialSettings
  }
  return {
    get: () => settings,
    save: (nextSettings) => {
      settings = nextSettings
      return settings
    }
  }
}

const createTempDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `ibot-${name}-`))

const createPetPackDirectory = (root, manifest = {}) => {
  fs.mkdirSync(path.join(root, 'sprites'), { recursive: true })
  const actions = manifest.actions || [
    { id: 'idle', label: 'Idle', kind: 'idle', sprite: 'sprites/idle.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 },
    { id: 'wave', label: 'Wave', kind: 'greeting', sprite: 'sprites/wave.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
  ]
  for (const action of actions) {
    fs.writeFileSync(path.join(root, action.sprite), '')
  }
  fs.writeFileSync(path.join(root, 'pet.json'), JSON.stringify({
    schemaVersion: 1,
    id: manifest.id || 'pack-cat',
    displayName: manifest.displayName || 'Pack Cat',
    version: manifest.version || '1.0.0',
    defaultAction: manifest.defaultAction || actions[0].id,
    clickAction: manifest.clickAction || actions[1]?.id || actions[0].id,
    actions
  }))
}

const createService = (settingsService = createSettingsService()) => createPetPackService({
  settingsService,
  userPacksDir: createTempDir('pet-packs'),
  projectRoot: '/app/ibot',
  loadLegacyAnimations: () => ({
    defaultAction: 'bai_no_bg',
    clickAction: 'eat_no_bg',
    actions: [
      { id: 'bai_no_bg', label: '待机', loop: true, frameCount: 16, frameMs: 95, frameWidth: 191, frameHeight: 453, sprite: 'cat_anime/sprites/bai_no_bg.png' },
      { id: 'eat_no_bg', label: '喂食', loop: false, frameCount: 16, frameMs: 85, frameWidth: 381, frameHeight: 253, sprite: 'cat_anime/sprites/eat_no_bg.png' }
    ]
  }),
  now: () => new Date('2026-06-12T00:00:00.000Z')
})

test('pet pack service lists the built-in legacy pack', () => {
  const service = createService()

  const result = service.listPacks()

  assert.equal(result.activePackId, BUILT_IN_PACK_ID)
  assert.equal(result.packs.length, 1)
  assert.equal(result.packs[0].id, BUILT_IN_PACK_ID)
  assert.equal(result.packs[0].source, 'built-in')
  assert.equal(result.packs[0].active, true)
  assert.equal(result.packs[0].actionCount, 2)
})

test('pet pack service inspects and imports a valid pack directory', () => {
  const sourceDir = createTempDir('pet-pack-source')
  createPetPackDirectory(sourceDir)
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  const imported = service.importPack(inspection.selectionId)
  const listed = service.listPacks()

  assert.equal(inspection.valid, true)
  assert.equal(inspection.pack.id, 'pack-cat')
  assert.equal(imported.pack.id, 'pack-cat')
  assert.equal(settingsService.get().petPacks.installed['pack-cat'].version, '1.0.0')
  assert.equal(listed.packs.some((pack) => pack.id === 'pack-cat'), true)
})

test('action service loads the active installed pet pack and uses its root for previews', () => {
  const sourceDir = createTempDir('pet-pack-action-source')
  createPetPackDirectory(sourceDir, { id: 'active-cat', displayName: 'Active Cat' })
  const settingsService = createSettingsService()
  const petPackService = createService(settingsService)
  const actionService = createActionService({ petPackService })

  const inspection = petPackService.inspectPackDirectory(sourceDir)
  petPackService.importPack(inspection.selectionId)
  petPackService.setActivePack('active-cat')
  actionService.reload()

  assert.equal(actionService.getPetPack().manifest.id, 'active-cat')
  assert.deepEqual(actionService.getConfig().actions.map((action) => action.id), ['idle', 'wave'])
  assert.match(actionService.getPreviewConfig().actions[0].previewSprite, /file:\/\/.*active-cat\/sprites\/idle\.png$/)
})

test('pet pack service rejects invalid packs before import', () => {
  const sourceDir = createTempDir('pet-pack-invalid')
  fs.mkdirSync(path.join(sourceDir, 'sprites'), { recursive: true })
  fs.writeFileSync(path.join(sourceDir, 'pet.json'), JSON.stringify({
    id: 'broken-cat',
    defaultAction: 'idle',
    actions: [
      { id: 'idle', sprite: 'sprites/missing.png', frameCount: 1, frameMs: 100, frameWidth: 32, frameHeight: 32 }
    ]
  }))
  const service = createService()

  const inspection = service.inspectPackDirectory(sourceDir)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /sprite does not exist/)
})

test('pet pack service rejects source folders containing symlinks', () => {
  const sourceDir = createTempDir('pet-pack-symlink')
  createPetPackDirectory(sourceDir, { id: 'symlink-cat' })
  const targetPath = path.join(sourceDir, 'sprites', 'idle.png')
  const linkPath = path.join(sourceDir, 'sprites', 'idle-link.png')
  fs.symlinkSync(targetPath, linkPath)
  const service = createService()

  const inspection = service.inspectPackDirectory(sourceDir)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /symlinks/)
})

test('pet pack service rejects a source folder that is itself a symlink', () => {
  const sourceDir = createTempDir('pet-pack-root-target')
  createPetPackDirectory(sourceDir, { id: 'root-symlink-cat' })
  const linkParent = createTempDir('pet-pack-root-link')
  const linkDir = path.join(linkParent, 'pack-link')
  fs.symlinkSync(sourceDir, linkDir, 'dir')
  const service = createService()

  const inspection = service.inspectPackDirectory(linkDir)

  assert.equal(inspection.valid, false)
  assert.match(inspection.errors[0], /symlinks/)
})

test('pet pack service protects built-in and active packs from removal', () => {
  const sourceDir = createTempDir('pet-pack-remove')
  createPetPackDirectory(sourceDir, { id: 'remove-cat' })
  const service = createService()

  const inspection = service.inspectPackDirectory(sourceDir)
  service.importPack(inspection.selectionId)

  assert.throws(() => service.removePack(BUILT_IN_PACK_ID), /built-in/)
  service.setActivePack('remove-cat')
  assert.throws(() => service.removePack('remove-cat'), /active/)
})

test('pet pack service removes non-active installed packs', () => {
  const sourceDir = createTempDir('pet-pack-removable')
  createPetPackDirectory(sourceDir, { id: 'removable-cat' })
  const settingsService = createSettingsService()
  const service = createService(settingsService)

  const inspection = service.inspectPackDirectory(sourceDir)
  service.importPack(inspection.selectionId)
  const result = service.removePack('removable-cat')

  assert.equal(result.petPacks.installed['removable-cat'], undefined)
  assert.equal(settingsService.get().petPacks.installed['removable-cat'], undefined)
})
