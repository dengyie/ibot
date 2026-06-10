const createPetService = ({ settingsService, actionService }) => {
  const getSnapshot = () => ({
    settings: settingsService.get(),
    actions: actionService.getConfig()
  })

  const getAnimations = () => actionService.getConfig()

  const getSettings = () => settingsService.get()

  const saveSettings = (settings) => settingsService.save(settings)

  const previewSettings = (settings) => settingsService.preview(settings)

  const getAction = (actionId) => actionService.getAction(actionId)

  return {
    getSnapshot,
    getAnimations,
    getSettings,
    saveSettings,
    previewSettings,
    getAction
  }
}

module.exports = { createPetService }
