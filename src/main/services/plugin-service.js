const fs = require('fs')
const path = require('path')
const { normalizePluginManifest } = require('../plugins/manifest')

const readLocalPluginManifests = (pluginDirs = []) => {
  const plugins = []

  for (const rootDir of pluginDirs) {
    if (!rootDir || !fs.existsSync(rootDir)) continue
    const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const basePath = path.join(rootDir, entry.name)
      const manifestPath = path.join(basePath, 'plugin.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        plugins.push({
          manifest: normalizePluginManifest(manifest, { source: 'local', basePath }),
          activate: null
        })
      } catch (_) {
        // A broken third-party manifest should not prevent the app from listing other plugins.
      }
    }
  }

  return plugins
}

const createPluginService = ({ settingsService, petService, pluginDirs = [], officialPlugins = [] }) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!petService) throw new Error('petService is required')

  const getPlugins = () => [
    ...officialPlugins.map((plugin) => ({
      manifest: normalizePluginManifest(plugin.manifest, { source: 'official' }),
      activate: plugin.activate
    })),
    ...readLocalPluginManifests(pluginDirs)
  ]

  const getEnabledMap = () => settingsService.get().plugins?.enabled || {}

  const listPlugins = () => getPlugins().map((plugin) => ({
    ...plugin.manifest,
    enabled: Boolean(getEnabledMap()[plugin.manifest.id]),
    runnable: typeof plugin.activate === 'function'
  }))

  const setEnabled = (pluginId, enabled) => {
    const settings = settingsService.get()
    const nextSettings = {
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        enabled: {
          ...(settings.plugins?.enabled || {}),
          [pluginId]: Boolean(enabled)
        }
      }
    }
    settingsService.save(nextSettings)
    return listPlugins().find((plugin) => plugin.id === pluginId)
  }

  const createSdk = (manifest) => ({
    pet: {
      say: async (payload) => {
        if (!manifest.permissions.includes('pet:say')) {
          throw new Error(`Plugin ${manifest.id} does not have pet:say permission`)
        }
        return petService.say({ ...payload, source: `plugin:${manifest.id}` })
      }
    }
  })

  const runCommand = async (pluginId, commandId, payload = {}) => {
    const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    if (!getEnabledMap()[pluginId]) throw new Error('Plugin is disabled')
    if (typeof plugin.activate !== 'function') throw new Error('Plugin is not runnable')

    const commands = plugin.activate(createSdk(plugin.manifest))
    const handler = commands[commandId]
    if (typeof handler !== 'function') throw new Error(`Plugin command not found: ${commandId}`)
    return handler(payload)
  }

  return { listPlugins, setEnabled, runCommand }
}

module.exports = { createPluginService, readLocalPluginManifests }
