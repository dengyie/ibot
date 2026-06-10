const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createPluginService } = require('../../src/main/services/plugin-service')

const createSettingsService = (initialSettings = {}) => {
  let current = {
    ...initialSettings,
    plugins: {
      enabled: {},
      ...(initialSettings.plugins || {})
    }
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

const createOfficialPlugin = () => ({
  manifest: {
    id: 'official.basic-behavior',
    name: 'Basic Behavior',
    version: '1.0.0',
    description: 'Built-in behavior commands',
    permissions: ['pet:say'],
    commands: [{ id: 'greet', title: 'Greet' }]
  },
  activate: (ctx) => ({
    greet: async () => {
      await ctx.pet.say({ text: '你好，我在这里' })
      return { ok: true }
    }
  })
})

const createPluginDir = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-plugins-'))
  const pluginPath = path.join(root, 'focus-timer')
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'focus-timer',
    name: 'Focus Timer',
    version: '1.0.0',
    permissions: ['pet:say'],
    commands: [{ id: 'start', title: 'Start focus' }]
  }))
  return root
}

const createPluginDirWithInvalidManifest = () => {
  const root = createPluginDir()
  const pluginPath = path.join(root, 'bad-plugin')
  fs.mkdirSync(pluginPath)
  fs.writeFileSync(path.join(pluginPath, 'plugin.json'), JSON.stringify({
    id: 'bad-plugin',
    name: 'Bad Plugin',
    version: '1.0.0',
    permissions: ['fs:read']
  }))
  return root
}

test('plugin service discovers official plugins and local manifests', () => {
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'official.basic-behavior': true } }
    }),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()],
    pluginDirs: [createPluginDir()]
  })

  assert.deepEqual(service.listPlugins().map((plugin) => ({
    id: plugin.id,
    source: plugin.source,
    enabled: plugin.enabled,
    runnable: plugin.runnable
  })), [
    { id: 'official.basic-behavior', source: 'official', enabled: true, runnable: true },
    { id: 'focus-timer', source: 'local', enabled: false, runnable: false }
  ])
})

test('plugin service isolates invalid local manifests', () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [],
    pluginDirs: [createPluginDirWithInvalidManifest()]
  })

  assert.deepEqual(service.listPlugins().map((plugin) => plugin.id), ['focus-timer'])
})

test('plugin service persists enablement without replacing unrelated settings', () => {
  const settingsService = createSettingsService({
    theme: 'system',
    plugins: { enabled: { existing: true } }
  })
  const service = createPluginService({
    settingsService,
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  const saved = service.setEnabled('official.basic-behavior', true)

  assert.equal(saved.enabled, true)
  assert.deepEqual(settingsService.get(), {
    theme: 'system',
    plugins: {
      enabled: {
        existing: true,
        'official.basic-behavior': true
      }
    }
  })
})

test('plugin service runs enabled official commands through a permissioned pet sdk', async () => {
  const petEvents = []
  const service = createPluginService({
    settingsService: createSettingsService({
      plugins: { enabled: { 'official.basic-behavior': true } }
    }),
    petService: {
      say: async (payload) => petEvents.push(payload)
    },
    officialPlugins: [createOfficialPlugin()]
  })

  assert.deepEqual(await service.runCommand('official.basic-behavior', 'greet'), { ok: true })
  assert.deepEqual(petEvents, [{
    text: '你好，我在这里',
    source: 'plugin:official.basic-behavior'
  }])
})

test('plugin service blocks commands for disabled plugins', async () => {
  const service = createPluginService({
    settingsService: createSettingsService(),
    petService: { say: async () => {} },
    officialPlugins: [createOfficialPlugin()]
  })

  await assert.rejects(
    () => service.runCommand('official.basic-behavior', 'greet'),
    /Plugin is disabled/
  )
})
