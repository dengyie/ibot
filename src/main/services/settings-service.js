const SETTINGS_CHANGED = 'settings:changed'
const SETTINGS_PREVIEW = 'settings:preview'

const createSettingsService = ({ eventBus, loadSettings, saveSettings }) => {
  let currentSettings = loadSettings()

  const get = () => ({ ...currentSettings })

  const save = (settings) => {
    currentSettings = { ...settings }
    saveSettings(currentSettings)
    eventBus?.emit(SETTINGS_CHANGED, get())
    return get()
  }

  const preview = (partialSettings) => {
    const nextSettings = { ...currentSettings, ...partialSettings }
    eventBus?.emit(SETTINGS_PREVIEW, { ...nextSettings })
    return nextSettings
  }

  const reload = () => {
    currentSettings = loadSettings()
    return get()
  }

  return { get, save, preview, reload }
}

module.exports = { SETTINGS_CHANGED, SETTINGS_PREVIEW, createSettingsService }
