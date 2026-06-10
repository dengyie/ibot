const DEFAULT_AI_CONFIG = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKeyRef: 'ai.default',
  systemPrompt: 'You are a friendly desktop pet companion.'
}

const normalizeConfig = (config = {}) => ({
  provider: config.provider || DEFAULT_AI_CONFIG.provider,
  baseUrl: (config.baseUrl || DEFAULT_AI_CONFIG.baseUrl).replace(/\/+$/, ''),
  model: config.model || DEFAULT_AI_CONFIG.model,
  apiKeyRef: config.apiKeyRef || DEFAULT_AI_CONFIG.apiKeyRef,
  systemPrompt: config.systemPrompt ?? DEFAULT_AI_CONFIG.systemPrompt,
  enabled: Boolean(config.enabled)
})

const parseChatReply = (data) => {
  const reply = data?.choices?.[0]?.message?.content
  if (typeof reply !== 'string' || !reply.trim()) {
    throw new Error('AI provider returned an empty response')
  }
  return reply
}

const createAiService = ({ settingsService, secretService, fetchImpl = globalThis.fetch }) => {
  if (!settingsService) throw new Error('settingsService is required')
  if (!secretService) throw new Error('secretService is required')

  const conversations = new Map()

  const getRawConfig = () => normalizeConfig(settingsService.get().ai)

  const getConfig = () => {
    const config = getRawConfig()
    return {
      ...config,
      hasApiKey: Boolean(secretService.getSecretValue(config.apiKeyRef))
    }
  }

  const saveConfig = (partialConfig) => {
    const settings = settingsService.get()
    const nextAi = normalizeConfig({ ...settings.ai, ...partialConfig })
    settingsService.save({ ...settings, ai: nextAi })
    return getConfig()
  }

  const saveApiKey = (value) => {
    const config = getRawConfig()
    secretService.setSecret({ id: config.apiKeyRef, value, label: 'AI API Key' })
    return { apiKeyRef: config.apiKeyRef, hasApiKey: Boolean(value) }
  }

  const complete = async ({ messages }) => {
    const config = getRawConfig()
    const apiKey = secretService.getSecretValue(config.apiKeyRef)
    if (!apiKey) throw new Error('AI API key is not configured')
    if (config.provider !== 'openai-compatible') {
      throw new Error(`Unsupported AI provider: ${config.provider}`)
    }
    if (typeof fetchImpl !== 'function') throw new Error('fetch is not available')

    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages
      })
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = data?.error?.message || `AI provider request failed with status ${response.status}`
      throw new Error(message)
    }
    return parseChatReply(data)
  }

  const chat = async ({ message, conversationId }) => {
    const config = getRawConfig()
    if (!config.enabled) throw new Error('AI chat is disabled')
    const history = conversationId ? conversations.get(conversationId) || [] : []
    const userMessage = { role: 'user', content: String(message || '') }
    const messages = []
    if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt })
    messages.push(...history, userMessage)
    const reply = await complete({ messages })
    if (conversationId) {
      conversations.set(conversationId, [...history, userMessage, { role: 'assistant', content: reply }])
    }
    return { conversationId, reply }
  }

  const testConnection = async () => {
    const reply = await complete({
      messages: [
        { role: 'user', content: 'Reply with ok.' }
      ]
    })
    return { ok: true, reply }
  }

  return { getConfig, saveConfig, saveApiKey, chat, testConnection }
}

module.exports = { DEFAULT_AI_CONFIG, createAiService }
