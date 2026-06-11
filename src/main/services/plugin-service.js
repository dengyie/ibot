const fs = require('fs')
const path = require('path')
const { fork } = require('child_process')
const { normalizePluginManifest } = require('../plugins/manifest')

const LOCAL_PLUGIN_COMMAND_TIMEOUT_MS = 5000
const SDK_REGISTERED_COMMANDS = Symbol('ibot.registeredCommands')
const SUPPORTED_CONFIG_TYPES = new Set(['string', 'number', 'boolean'])
const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9_.:-]{1,128}$/
const MAX_PLUGIN_STORAGE_BYTES = 64 * 1024
const MAX_PLUGIN_STORAGE_VALUE_BYTES = 16 * 1024
const LOCAL_PLUGIN_RUNNER_PATH = path.join(__dirname, '../plugins/local-plugin-runner.js')

const resolveLocalPluginFile = (manifest, fieldName) => {
  const relativePath = manifest[fieldName]
  if (!relativePath) return ''
  const targetPath = path.resolve(manifest.basePath, relativePath)
  const basePath = path.resolve(manifest.basePath)
  if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
    throw new Error(`Plugin ${fieldName} must stay inside the plugin directory`)
  }
  if (fs.existsSync(targetPath)) {
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error(`Plugin ${fieldName} must stay inside the plugin directory`)
    }
  }
  return targetPath
}

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key)

const cloneJsonValue = (value, fieldName = 'value', { allowUndefined = false } = {}) => {
  if (value === undefined && allowUndefined) return undefined
  const seen = new Set()

  const assertJsonValue = (candidate, pathLabel) => {
    if (candidate === null) return
    const type = typeof candidate
    if (type === 'string' || type === 'boolean') return
    if (type === 'number') {
      if (!Number.isFinite(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      return
    }
    if (Array.isArray(candidate)) {
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      seen.add(candidate)
      candidate.forEach((item, index) => assertJsonValue(item, `${pathLabel}[${index}]`))
      seen.delete(candidate)
      return
    }
    if (type === 'object') {
      const prototype = Object.getPrototypeOf(candidate)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      }
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
      seen.add(candidate)
      for (const [key, item] of Object.entries(candidate)) {
        assertJsonValue(item, `${pathLabel}.${key}`)
      }
      seen.delete(candidate)
      return
    }
    throw new Error(`Plugin ${fieldName} must be JSON serializable at ${pathLabel}`)
  }

  assertJsonValue(value, fieldName)
  return JSON.parse(JSON.stringify(value))
}

const getJsonByteSize = (value) => Buffer.byteLength(JSON.stringify(value), 'utf-8')

const assertStorageValueSize = (value) => {
  const byteSize = getJsonByteSize(value)
  if (byteSize > MAX_PLUGIN_STORAGE_VALUE_BYTES) {
    throw new Error(`Plugin storage value exceeds ${MAX_PLUGIN_STORAGE_VALUE_BYTES} bytes`)
  }
}

const assertStorageSize = (storage) => {
  const byteSize = getJsonByteSize(storage)
  if (byteSize > MAX_PLUGIN_STORAGE_BYTES) {
    throw new Error(`Plugin storage exceeds ${MAX_PLUGIN_STORAGE_BYTES} bytes`)
  }
}

const assertStorageKey = (key) => {
  if (typeof key !== 'string' || !STORAGE_KEY_PATTERN.test(key)) {
    throw new Error('Plugin storage key must be 1-128 characters using letters, numbers, _, ., :, or -')
  }
}

const coerceConfigValue = (value, field) => {
  let normalized = value
  if (normalized == null || normalized === '') {
    if (hasOwn(field, 'default')) return field.default
    if (field.required) throw new Error(`Plugin config ${field.key} is required`)
    if (field.type === 'boolean') return false
    if (field.type === 'string') return ''
    return undefined
  }

  if (field.type === 'string') normalized = String(normalized)
  if (field.type === 'number') {
    normalized = Number(normalized)
    if (!Number.isFinite(normalized)) throw new Error(`Plugin config ${field.key} must be a number`)
  }
  if (field.type === 'boolean') {
    normalized = normalized === true || normalized === 'true' || normalized === 1 || normalized === '1'
  }

  if (field.enum?.length && !field.enum.includes(normalized)) {
    throw new Error(`Plugin config ${field.key} must be one of: ${field.enum.join(', ')}`)
  }

  return normalized
}

const normalizeConfigField = (key, rawField = {}, required = false) => {
  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error(`Plugin config key is invalid: ${key}`)
  const type = rawField.type || 'string'
  if (!SUPPORTED_CONFIG_TYPES.has(type)) throw new Error(`Unsupported plugin config type: ${type}`)
  const field = {
    key,
    type,
    title: rawField.title || key,
    description: rawField.description || '',
    required: Boolean(required)
  }
  if (Array.isArray(rawField.enum)) field.enum = rawField.enum.map((value) => coerceConfigValue(value, { key, type }))
  if (hasOwn(rawField, 'default')) field.default = coerceConfigValue(rawField.default, field)
  return field
}

const normalizeConfigSchema = (schema = {}) => {
  if (!schema || schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
    throw new Error('Plugin config schema must be an object schema with properties')
  }
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  const properties = Object.entries(schema.properties).map(([key, field]) => normalizeConfigField(key, field, required.has(key)))
  return {
    title: schema.title || 'Plugin Configuration',
    description: schema.description || '',
    properties
  }
}

const readLocalPluginConfigSchema = (manifest) => {
  const schemaPath = resolveLocalPluginFile(manifest, 'configSchema')
  if (!schemaPath) return null
  if (!fs.existsSync(schemaPath)) throw new Error('Plugin config schema file does not exist')
  return normalizeConfigSchema(JSON.parse(fs.readFileSync(schemaPath, 'utf-8')))
}

const getRealPath = (targetPath) => fs.realpathSync(targetPath)

const createLocalPluginRunnerEnv = () => {
  const env = {}
  if (process.env.PATH) env.PATH = process.env.PATH
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  if (process.env.WINDIR) env.WINDIR = process.env.WINDIR
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

const createLocalPluginRunnerOptions = (mainPath) => {
  const runnerPath = getRealPath(LOCAL_PLUGIN_RUNNER_PATH)
  const pluginMainPath = getRealPath(mainPath)
  return {
    execPath: process.execPath,
    execArgv: [
      '--permission',
      `--allow-fs-read=${runnerPath}`,
      `--allow-fs-read=${pluginMainPath}`
    ],
    env: createLocalPluginRunnerEnv(),
    serialization: 'json',
    silent: true
  }
}

const handleLocalPluginSdkCall = async (sdk, operation, payload = {}) => {
  if (operation === 'storage:get') return sdk.storage.get(payload.key, payload.fallbackValue)
  if (operation === 'storage:set') return sdk.storage.set(payload.key, payload.value)
  if (operation === 'storage:remove') return sdk.storage.remove(payload.key)
  if (operation === 'storage:clear') return sdk.storage.clear()
  if (operation === 'pet:say') return sdk.pet.say(payload.payload)
  if (operation === 'pet:playAction') return sdk.pet.playAction(payload.payload)
  if (operation === 'pet:setEvent') return sdk.pet.setEvent(payload.payload)
  throw new Error(`Unsupported plugin SDK operation: ${operation}`)
}

const runLocalPluginCommand = ({ plugin, sdk, commandId, payload, config }) => new Promise((resolve, reject) => {
  const mainPath = getRealPath(plugin.mainPath)
  const runnerPath = getRealPath(LOCAL_PLUGIN_RUNNER_PATH)
  const child = fork(runnerPath, [], createLocalPluginRunnerOptions(mainPath))
  let settled = false
  let stderr = ''

  const finish = (error, result) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    child.removeAllListeners()
    if (!child.killed) child.kill()
    if (error) reject(error)
    else resolve(result)
  }

  const timer = setTimeout(() => {
    finish(new Error(`Plugin command timed out after ${LOCAL_PLUGIN_COMMAND_TIMEOUT_MS}ms`))
  }, LOCAL_PLUGIN_COMMAND_TIMEOUT_MS)

  child.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString('utf-8')}`.slice(-4096)
  })

  child.on('message', (message) => {
    if (!message || typeof message !== 'object') return
    if (message.type === 'ready') {
      child.send({
        type: 'run',
        mainPath,
        commandId,
        payload: cloneJsonValue(payload, 'payload', { allowUndefined: true }),
        config: cloneJsonValue(config, 'config')
      })
      return
    }
    if (message.type === 'sdk-call') {
      handleLocalPluginSdkCall(sdk, message.operation, message.payload)
        .then((result) => {
          if (child.connected) {
            child.send({ type: 'sdk-result', id: message.id, ok: true, result: cloneJsonValue(result, 'result', { allowUndefined: true }) })
          }
        })
        .catch((error) => {
          if (child.connected) child.send({ type: 'sdk-result', id: message.id, ok: false, error: error.message || 'Plugin SDK call failed' })
        })
      return
    }
    if (message.type === 'result') {
      if (message.ok) finish(null, cloneJsonValue(message.result, 'result', { allowUndefined: true }))
      else finish(new Error(message.error || 'Plugin command failed'))
    }
  })

  child.on('error', (error) => finish(error))
  child.on('exit', (code, signal) => {
    if (settled) return
    const detail = stderr.trim() || (signal ? `signal ${signal}` : `exit code ${code}`)
    finish(new Error(`Plugin runner exited before completing command: ${detail}`))
  })
})

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
        const normalizedManifest = normalizePluginManifest(manifest, { source: 'local', basePath })
        const mainPath = resolveLocalPluginFile(normalizedManifest, 'main')
        const configSchema = readLocalPluginConfigSchema(normalizedManifest)
        plugins.push({
          manifest: normalizedManifest,
          configSchema,
          mainPath: mainPath && fs.existsSync(mainPath) ? mainPath : '',
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

  const logs = []
  let nextLogId = 1

  const appendLog = ({ level = 'info', pluginId = '', commandId = '', message = '' } = {}) => {
    const entry = {
      id: nextLogId,
      timestamp: new Date().toISOString(),
      level,
      pluginId,
      commandId,
      message: String(message || '')
    }
    nextLogId += 1
    logs.unshift(entry)
    logs.splice(100)
    return entry
  }

  const getPlugins = () => [
    ...officialPlugins.map((plugin) => ({
      manifest: normalizePluginManifest(plugin.manifest, { source: 'official' }),
      configSchema: plugin.configSchema ? normalizeConfigSchema(plugin.configSchema) : null,
      activate: plugin.activate,
      mainPath: ''
    })),
    ...readLocalPluginManifests(pluginDirs)
  ]

  const getEnabledMap = () => settingsService.get().plugins?.enabled || {}

  const getConfigMap = () => settingsService.get().plugins?.config || {}

  const getStorageMap = () => settingsService.get().plugins?.storage || {}

  const normalizePluginConfig = (schema, config = {}) => {
    if (!schema) return {}
    return Object.fromEntries(schema.properties.map((field) => [field.key, coerceConfigValue(config[field.key], field)]))
  }

  const getPluginConfig = (pluginId, schema) => normalizePluginConfig(schema, getConfigMap()[pluginId] || {})

  const assertPermission = (manifest, permission) => {
    if (!manifest.permissions.includes(permission)) {
      throw new Error(`Plugin ${manifest.id} does not have ${permission} permission`)
    }
  }

  const getPluginStorage = (pluginId) => cloneJsonValue(getStorageMap()[pluginId] || {}, 'value')

  const savePluginStorage = (pluginId, storage) => {
    assertStorageSize(storage)
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        storage: {
          ...(settings.plugins?.storage || {}),
          [pluginId]: cloneJsonValue(storage, 'value')
        }
      }
    })
  }

  const listPlugins = () => getPlugins().map((plugin) => ({
    ...plugin.manifest,
    enabled: Boolean(getEnabledMap()[plugin.manifest.id]),
    runnable: typeof plugin.activate === 'function' || Boolean(plugin.mainPath),
    configSchema: plugin.configSchema,
    config: getPluginConfig(plugin.manifest.id, plugin.configSchema)
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
    appendLog({
      pluginId,
      level: 'info',
      message: enabled ? 'Plugin enabled' : 'Plugin disabled'
    })
    return listPlugins().find((plugin) => plugin.id === pluginId)
  }

  const saveConfig = (pluginId, config = {}) => {
    const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
    if (!plugin.configSchema) throw new Error('Plugin does not declare a config schema')
    const normalizedConfig = normalizePluginConfig(plugin.configSchema, config)
    const settings = settingsService.get()
    settingsService.save({
      ...settings,
      plugins: {
        ...(settings.plugins || {}),
        config: {
          ...(settings.plugins?.config || {}),
          [pluginId]: normalizedConfig
        }
      }
    })
    appendLog({ pluginId, level: 'info', message: 'Plugin config saved' })
    return listPlugins().find((candidate) => candidate.id === pluginId)
  }

  const createSdk = (plugin) => {
    const manifest = plugin.manifest
    const registeredCommands = {}

    return {
      [SDK_REGISTERED_COMMANDS]: () => registeredCommands,
      config: {
        get: (key) => {
          const config = getPluginConfig(manifest.id, plugin.configSchema)
          return key ? config[key] : { ...config }
        }
      },
      storage: {
        get: async (key, fallbackValue) => {
          assertPermission(manifest, 'storage')
          const storage = getPluginStorage(manifest.id)
          if (key == null) return storage
          assertStorageKey(key)
          return hasOwn(storage, key) ? cloneJsonValue(storage[key], 'value') : fallbackValue
        },
        set: async (key, value) => {
          assertPermission(manifest, 'storage')
          assertStorageKey(key)
          const storage = getPluginStorage(manifest.id)
          const nextValue = cloneJsonValue(value, 'value')
          assertStorageValueSize(nextValue)
          savePluginStorage(manifest.id, { ...storage, [key]: nextValue })
          return nextValue
        },
        remove: async (key) => {
          assertPermission(manifest, 'storage')
          assertStorageKey(key)
          const storage = getPluginStorage(manifest.id)
          delete storage[key]
          savePluginStorage(manifest.id, storage)
          return true
        },
        clear: async () => {
          assertPermission(manifest, 'storage')
          savePluginStorage(manifest.id, {})
          return true
        }
      },
      pet: {
        say: async (payload) => {
          assertPermission(manifest, 'pet:say')
          const normalizedPayload = typeof payload === 'string' ? { text: payload } : { ...payload }
          return petService.say({ ...normalizedPayload, source: `plugin:${manifest.id}` })
        },
        playAction: async (actionIdOrPayload) => {
          assertPermission(manifest, 'pet:action')
          const payload = typeof actionIdOrPayload === 'string'
            ? { actionId: actionIdOrPayload }
            : { ...actionIdOrPayload }
          return petService.playAction({ ...payload, source: `plugin:${manifest.id}` })
        },
        setEvent: async (payload) => {
          assertPermission(manifest, 'pet:event')
          return petService.setEvent({ ...payload, source: `plugin:${manifest.id}` })
        }
      },
      commands: {
        register: (command) => {
          if (!command?.id) throw new Error('Plugin command id is required')
          if (typeof command.handler !== 'function') throw new Error(`Plugin command handler is required: ${command.id}`)
          registeredCommands[command.id] = command.handler
          return command.id
        }
      }
    }
  }

  const runCommand = async (pluginId, commandId, payload = {}) => {
    try {
      const plugin = getPlugins().find((candidate) => candidate.manifest.id === pluginId)
      if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)
      if (!getEnabledMap()[pluginId]) throw new Error('Plugin is disabled')
      appendLog({ pluginId, commandId, level: 'info', message: 'Command started' })
      let result
      const sdk = createSdk(plugin)
      if (typeof plugin.activate === 'function') {
        const returnedCommands = plugin.activate(sdk) || {}
        const commands = {
          ...returnedCommands,
          ...(sdk[SDK_REGISTERED_COMMANDS]?.() || {})
        }
        const handler = commands[commandId]
        if (typeof handler !== 'function') throw new Error(`Plugin command not found: ${commandId}`)
        result = await handler(payload)
      } else if (plugin.mainPath) {
        result = await runLocalPluginCommand({
          plugin,
          sdk,
          commandId,
          payload,
          config: getPluginConfig(plugin.manifest.id, plugin.configSchema)
        })
      } else {
        throw new Error('Plugin is not runnable')
      }
      appendLog({ pluginId, commandId, level: 'info', message: 'Command completed' })
      return result
    } catch (error) {
      appendLog({
        pluginId,
        commandId,
        level: 'error',
        message: error.message || 'Command failed'
      })
      throw error
    }
  }

  const getLogs = () => logs.map((entry) => ({ ...entry }))

  const clearLogs = () => {
    logs.length = 0
    return getLogs()
  }

  return { listPlugins, setEnabled, saveConfig, runCommand, getLogs, clearLogs }
}

module.exports = { createPluginService, readLocalPluginManifests }
