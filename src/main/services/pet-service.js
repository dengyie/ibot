const PET_SAY = 'pet:say'
const PET_ACTION = 'pet:action'
const PET_EVENT = 'pet:event'

const createPetService = ({ eventBus, settingsService, actionService }) => {
  const getSnapshot = () => ({
    settings: settingsService.get(),
    actions: actionService.getConfig()
  })

  const getAnimations = () => actionService.getConfig()

  const getPreviewAnimations = () => actionService.getPreviewConfig?.() || actionService.getConfig()

  const reloadAnimations = () => actionService.reload?.() || actionService.getConfig()

  const getSettings = () => settingsService.get()

  const saveSettings = (settings) => settingsService.save(settings)

  const previewSettings = (settings) => settingsService.preview(settings)

  const getAction = (actionId) => actionService.getAction(actionId)

  const say = ({ text, ttlMs, source } = {}) => {
    const payload = { text: String(text || ''), ttlMs, source }
    eventBus?.emit(PET_SAY, payload)
    return payload
  }

  const onSay = (listener) => eventBus?.on(PET_SAY, listener)

  const playAction = ({ actionId, source } = {}) => {
    if (!actionService.getAction(actionId)) throw new Error(`Unknown action: ${actionId}`)
    const payload = { actionId, source }
    eventBus?.emit(PET_ACTION, payload)
    return payload
  }

  const setEvent = ({ type, message, ttlMs, source } = {}) => {
    const payload = { type, message, ttlMs, source }
    eventBus?.emit(PET_EVENT, payload)
    return payload
  }

  const onAction = (listener) => eventBus?.on(PET_ACTION, listener)

  const onEvent = (listener) => eventBus?.on(PET_EVENT, listener)

  return {
    getSnapshot,
    getAnimations,
    getPreviewAnimations,
    reloadAnimations,
    getSettings,
    saveSettings,
    previewSettings,
    getAction,
    say,
    onSay,
    playAction,
    onAction,
    setEvent,
    onEvent
  }
}

module.exports = { PET_SAY, PET_ACTION, PET_EVENT, createPetService }
