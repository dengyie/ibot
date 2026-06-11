const { getLegacyPetAnimations, loadLegacyPetPack } = require('../pet-pack/loader')
const path = require('path')
const { pathToFileURL } = require('url')

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

const createActionService = ({ loadPetPack, loadLegacyAnimations = getLegacyPetAnimations, projectRoot = path.join(__dirname, '..', '..', '..') }) => {
  let cachedPetPack = null

  const getPetPack = () => {
    if (cachedPetPack) return cachedPetPack
    try {
      if (loadPetPack) {
        cachedPetPack = loadPetPack()
        return cachedPetPack
      }
      cachedPetPack = loadLegacyPetPack({
        id: 'legacy-cat',
        displayName: 'Legacy Cat',
        getPetAnimations: loadLegacyAnimations
      })
      return cachedPetPack
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

  const getPreviewConfig = () => {
    const config = getConfig()
    return {
      ...config,
      actions: config.actions.map((action) => ({
        ...action,
        previewSprite: action.sprite
          ? pathToFileURL(path.join(projectRoot, action.sprite)).toString()
          : ''
      }))
    }
  }

  const reload = () => {
    cachedPetPack = null
    return getConfig()
  }

  return { getPetPack, getConfig, getPreviewConfig, listActions, getAction, reload }
}

module.exports = { createActionService }
