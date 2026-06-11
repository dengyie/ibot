const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { createSecretService } = require('../../src/main/services/secret-service')

const createTempStore = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-secrets-')), 'secrets.json')

test('secret service stores secret values behind refs', () => {
  const storePath = createTempStore()
  const service = createSecretService({ storePath })

  service.setSecret({ id: 'ai.default', value: 'sk-test', label: 'OpenAI key' })

  assert.equal(service.getSecretValue('ai.default'), 'sk-test')
  assert.deepEqual(service.listSecretRefs(), [
    { id: 'ai.default', label: 'OpenAI key', hasValue: true }
  ])
})

test('secret service persists secrets with private file permissions when possible', () => {
  const storePath = createTempStore()
  const service = createSecretService({ storePath })

  service.setSecret({ id: 'ai.default', value: 'sk-test' })
  const reloaded = createSecretService({ storePath })

  assert.equal(reloaded.getSecretValue('ai.default'), 'sk-test')
  if (process.platform !== 'win32') {
    const mode = fs.statSync(storePath).mode & 0o777
    assert.equal(mode, 0o600)
  }
})
