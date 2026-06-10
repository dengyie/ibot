const test = require('node:test')
const assert = require('node:assert/strict')

const { createAiService } = require('../../src/main/services/ai-service')

const createSettingsService = (initialSettings = {}) => {
  let current = {
    ai: {
      enabled: false,
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeyRef: 'ai.default',
      systemPrompt: 'You are a friendly desktop pet companion.'
    },
    ...initialSettings
  }

  return {
    get: () => current,
    save: (settings) => {
      current = settings
      return current
    }
  }
}

test('ai service exposes config without secret values', () => {
  const service = createAiService({
    settingsService: createSettingsService(),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    }
  })

  assert.deepEqual(service.getConfig(), {
    enabled: false,
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyRef: 'ai.default',
    systemPrompt: 'You are a friendly desktop pet companion.',
    hasApiKey: true
  })
})

test('ai service saves config and api key separately', () => {
  const secrets = []
  const settingsService = createSettingsService()
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: (secret) => secrets.push(secret)
    }
  })

  const saved = service.saveConfig({
    enabled: true,
    baseUrl: 'https://example.test/v1',
    model: 'example-model',
    systemPrompt: 'Be concise.'
  })
  const keyResult = service.saveApiKey('sk-new')

  assert.equal(saved.enabled, true)
  assert.equal(saved.baseUrl, 'https://example.test/v1')
  assert.equal(saved.model, 'example-model')
  assert.equal(saved.apiKeyRef, 'ai.default')
  assert.equal(saved.hasApiKey, false)
  assert.equal(settingsService.get().ai.systemPrompt, 'Be concise.')
  assert.deepEqual(secrets, [{ id: 'ai.default', value: 'sk-new', label: 'AI API Key' }])
  assert.deepEqual(keyResult, { apiKeyRef: 'ai.default', hasApiKey: true })
})

test('ai service does not persist derived config fields', () => {
  const settingsService = createSettingsService()
  const service = createAiService({
    settingsService,
    secretService: {
      getSecretValue: () => '',
      setSecret: () => {}
    }
  })

  service.saveConfig({
    enabled: true,
    hasApiKey: true,
    unexpectedField: 'ignore me'
  })

  assert.equal(Object.hasOwn(settingsService.get().ai, 'hasApiKey'), false)
  assert.equal(Object.hasOwn(settingsService.get().ai, 'unexpectedField'), false)
})

test('ai service sends openai-compatible chat completions requests', async () => {
  const requests = []
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1/',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: 'Stay cheerful.'
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello from pet AI.' } }]
        })
      }
    }
  })

  const result = await service.chat({ message: 'Hi' })

  assert.equal(result.reply, 'Hello from pet AI.')
  assert.equal(requests[0].url, 'https://example.test/v1/chat/completions')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer sk-test')
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    model: 'example-model',
    messages: [
      { role: 'system', content: 'Stay cheerful.' },
      { role: 'user', content: 'Hi' }
    ]
  })
})

test('ai service keeps message history by conversation id', async () => {
  const requests = []
  const replies = ['first reply', 'second reply']
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: 'Stay cheerful.'
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: replies.shift() } }]
        })
      }
    }
  })

  await service.chat({ conversationId: 'control-center', message: 'Hi' })
  await service.chat({ conversationId: 'control-center', message: 'Again' })

  assert.deepEqual(requests[1].messages, [
    { role: 'system', content: 'Stay cheerful.' },
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'first reply' },
    { role: 'user', content: 'Again' }
  ])
})

test('ai service testConnection validates provider response', async () => {
  const service = createAiService({
    settingsService: createSettingsService({
      ai: {
        enabled: false,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'example-model',
        apiKeyRef: 'ai.default',
        systemPrompt: ''
      }
    }),
    secretService: {
      getSecretValue: () => 'sk-test',
      setSecret: () => {}
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] })
    })
  })

  assert.deepEqual(await service.testConnection(), { ok: true, reply: 'ok' })
})
