const emptyConfig = {
  defaultAction: '',
  clickAction: '',
  actions: []
}

const createActionService = ({ getPetAnimations }) => {
  const getConfig = () => {
    const config = getPetAnimations() || emptyConfig
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions : []
    }
  }

  const listActions = () => getConfig().actions

  const getAction = (actionId) => listActions().find((action) => action.id === actionId) || null

  return { getConfig, listActions, getAction }
}

module.exports = { createActionService }
