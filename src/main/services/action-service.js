const { loadLegacyPetPack } = require('../pet-pack/loader')

const emptyConfig = {
  defaultAction: '',
  clickAction: '',
  actions: []
}

const emptyPetPack = {
  rootPath: '',
  manifest: {
    schemaVersion: 1,
    id: 'empty',
    displayName: 'Empty',
    version: '1.0.0',
    ...emptyConfig
  },
  source: {
    type: 'empty'
  }
}

const createActionService = ({ getPetAnimations, loadPetPack }) => {
  let cachedPetPack = null

  const getPetPack = () => {
    if (cachedPetPack) return cachedPetPack
    try {
      if (loadPetPack) {
        cachedPetPack = loadPetPack()
        return cachedPetPack
      }
      if (getPetAnimations) {
        cachedPetPack = loadLegacyPetPack({
          id: 'legacy-cat',
          displayName: 'Legacy Cat',
          getPetAnimations
        })
        return cachedPetPack
      }
    } catch (error) {
      console.error('Failed to load pet pack:', error)
    }
    return emptyPetPack
  }

  const getConfig = () => {
    const config = getPetPack().manifest || emptyConfig
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions : []
    }
  }

  const listActions = () => getConfig().actions

  const getAction = (actionId) => listActions().find((action) => action.id === actionId) || null

  const reload = () => {
    cachedPetPack = null
    return getConfig()
  }

  return { getPetPack, getConfig, listActions, getAction, reload }
}

module.exports = { createActionService }
