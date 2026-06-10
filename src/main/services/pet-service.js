const PET_SAY = 'pet:say'

const createPetService = ({ eventBus, settingsService, actionService }) => {
  const getSnapshot = () => ({
    settings: settingsService.get(),
    actions: actionService.getConfig()
  })

  const getAnimations = () => actionService.getConfig()

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

  return {
    getSnapshot,
    getAnimations,
    getSettings,
    saveSettings,
    previewSettings,
    getAction,
    say,
    onSay
  }
}

module.exports = { PET_SAY, createPetService }
