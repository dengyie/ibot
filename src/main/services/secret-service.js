const fs = require('fs')
const path = require('path')

const getDefaultStorePath = () => {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'secrets.json')
}

const readStore = (storePath) => {
  try {
    if (!fs.existsSync(storePath)) return { secrets: {} }
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
    return { secrets: parsed.secrets || {} }
  } catch (_) {
    return { secrets: {} }
  }
}

const writeStore = (storePath, store) => {
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 })
  if (process.platform !== 'win32') fs.chmodSync(storePath, 0o600)
}

const createSecretService = ({ storePath = getDefaultStorePath() } = {}) => {
  let store = readStore(storePath)

  const persist = () => writeStore(storePath, store)

  const setSecret = ({ id, value, label = id }) => {
    if (!id) throw new Error('Secret id is required')
    store.secrets[id] = {
      label,
      value: String(value || ''),
      updatedAt: new Date().toISOString()
    }
    persist()
    return { id, label, hasValue: Boolean(store.secrets[id].value) }
  }

  const getSecretValue = (id) => store.secrets[id]?.value || ''

  const deleteSecret = (id) => {
    delete store.secrets[id]
    persist()
  }

  const listSecretRefs = () => Object.entries(store.secrets)
    .map(([id, secret]) => ({
      id,
      label: secret.label || id,
      hasValue: Boolean(secret.value)
    }))

  return { setSecret, getSecretValue, deleteSecret, listSecretRefs }
}

module.exports = { createSecretService }
