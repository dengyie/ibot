const fs = require('fs')
const vm = require('vm')

const LOCAL_PLUGIN_SCRIPT_TIMEOUT_MS = 1000

let nextRequestId = 1
const pendingRequests = new Map()

const sendMessage = (message) => {
  if (typeof process.send === 'function') process.send(message)
}

const toCommonJsPluginSource = (source) => {
  return source
    .replace(/^\s*export\s+default\s+function\s+([a-zA-Z_$][\w$]*)?\s*\(/m, 'module.exports = function $1(')
    .replace(/^\s*export\s+default\s+/m, 'module.exports = ')
}

const cloneJsonValue = (value, fieldName = 'value', { allowUndefined = false } = {}) => {
  if (value === undefined && allowUndefined) return undefined
  const seen = new Set()

  const assertJsonValue = (candidate, path) => {
    if (candidate === null) return
    const type = typeof candidate
    if (type === 'string' || type === 'boolean') return
    if (type === 'number') {
      if (!Number.isFinite(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
      return
    }
    if (Array.isArray(candidate)) {
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
      seen.add(candidate)
      candidate.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`))
      seen.delete(candidate)
      return
    }
    if (type === 'object') {
      if (Object.prototype.toString.call(candidate) !== '[object Object]') {
        throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
      }
      if (seen.has(candidate)) throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
      seen.add(candidate)
      for (const [key, item] of Object.entries(candidate)) {
        assertJsonValue(item, `${path}.${key}`)
      }
      seen.delete(candidate)
      return
    }
    throw new Error(`Plugin ${fieldName} must be JSON serializable at ${path}`)
  }

  assertJsonValue(value, fieldName)
  return JSON.parse(JSON.stringify(value))
}

const invokeSdk = (operation, payload = {}) => new Promise((resolve, reject) => {
  const id = nextRequestId
  nextRequestId += 1
  pendingRequests.set(id, { resolve, reject })
  sendMessage({
    type: 'sdk-call',
    id,
    operation,
    payload: cloneJsonValue(payload, 'sdk payload', { allowUndefined: true })
  })
})

const createContext = (mainPath) => {
  const context = vm.createContext(Object.create(null), {
    name: `openpet-local-plugin:${mainPath}`,
    codeGeneration: { strings: false, wasm: false }
  })

  new vm.Script(`
    globalThis.module = { exports: {} };
    globalThis.exports = globalThis.module.exports;
    globalThis.console = Object.freeze({
      log: () => {},
      warn: () => {},
      error: () => {}
    });
  `, { filename: `${mainPath}:bootstrap` }).runInContext(context, { timeout: LOCAL_PLUGIN_SCRIPT_TIMEOUT_MS })

  return context
}

const loadPlugin = (context, mainPath) => {
  const source = toCommonJsPluginSource(fs.readFileSync(mainPath, 'utf-8'))
  const script = new vm.Script(source, { filename: mainPath })
  script.runInContext(context, { timeout: LOCAL_PLUGIN_SCRIPT_TIMEOUT_MS })
}

const runPluginCommand = async ({ mainPath, commandId, payload = {}, config = {} }) => {
  const context = createContext(mainPath)
  loadPlugin(context, mainPath)

  const execute = vm.compileFunction(`
    const __openpetPayload = JSON.parse(payloadJson);
    const __openpetConfig = JSON.parse(configJson);
    const __openpetClone = (value) => value == null || typeof value !== 'object'
      ? value
      : JSON.parse(JSON.stringify(value));
    const __openpetRegisteredCommands = Object.create(null);
    const __openpetCtx = Object.freeze({
      config: Object.freeze({
        get: (key) => key ? __openpetClone(__openpetConfig[key]) : __openpetClone(__openpetConfig)
      }),
      storage: Object.freeze({
        get: (key, fallbackValue) => {
          const payload = {};
          if (key !== undefined) payload.key = key;
          if (fallbackValue !== undefined) payload.fallbackValue = fallbackValue;
          return bridge('storage:get', payload);
        },
        set: (key, value) => bridge('storage:set', { key, value }),
        remove: (key) => bridge('storage:remove', { key }),
        clear: () => bridge('storage:clear')
      }),
      pet: Object.freeze({
        say: (payload) => bridge('pet:say', { payload }),
        playAction: (payload) => bridge('pet:playAction', { payload }),
        setEvent: (payload) => bridge('pet:setEvent', { payload })
      }),
      ai: Object.freeze({
        chat: (payload) => bridge('ai:chat', { payload })
      }),
      network: Object.freeze({
        fetch: (url, options) => {
          const payload = { url };
          if (options !== undefined) payload.options = options;
          return bridge('network:fetch', payload);
        }
      }),
      commands: Object.freeze({
        register: (command) => {
          if (!command || !command.id) throw new Error('Plugin command id is required');
          if (typeof command.handler !== 'function') throw new Error('Plugin command handler is required: ' + command.id);
          __openpetRegisteredCommands[command.id] = command.handler;
          return command.id;
        }
      })
    });

    return (async () => {
      const exported = module.exports && module.exports.default ? module.exports.default : module.exports;
      const activate = typeof exported === 'function' ? exported : exported && exported.activate;
      if (typeof activate !== 'function') throw new Error('Plugin main must export an activate function');
      const returnedCommands = await Promise.resolve(activate(__openpetCtx) || {});
      const commands = Object.assign(Object.create(null), returnedCommands, __openpetRegisteredCommands);
      const handler = commands[commandId];
      if (typeof handler !== 'function') throw new Error('Plugin command handler is not a function');
      return await Promise.resolve(handler(__openpetPayload));
    })();
  `, ['bridge', 'commandId', 'payloadJson', 'configJson'], {
    parsingContext: context,
    filename: `${mainPath}:activate`
  })

  const result = await execute(
    invokeSdk,
    commandId,
    JSON.stringify(cloneJsonValue(payload, 'payload')),
    JSON.stringify(cloneJsonValue(config, 'config'))
  )
  return cloneJsonValue(result, 'result', { allowUndefined: true })
}

process.on('message', async (message) => {
  if (!message || typeof message !== 'object') return

  if (message.type === 'sdk-result') {
    const request = pendingRequests.get(message.id)
    if (!request) return
    pendingRequests.delete(message.id)
    if (message.ok) request.resolve(message.result)
    else request.reject(new Error(message.error || 'Plugin SDK call failed'))
    return
  }

  if (message.type !== 'run') return

  try {
    const result = await runPluginCommand(message)
    sendMessage({ type: 'result', ok: true, result })
  } catch (error) {
    sendMessage({ type: 'result', ok: false, error: error.message || 'Plugin command failed' })
  }
})

sendMessage({ type: 'ready' })
