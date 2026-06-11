const fs = require('fs')
const path = require('path')
const { generateSpritesFromFrames } = require('./sprite-generator')

const isSafeActionId = (actionId) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(actionId || '')

const copyDirectory = (sourceDir, targetDir) => {
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true })
}

const createActionImportService = ({ framesRoot, spritesDir, configPath }) => {
  const importActionFrames = async ({ sourceDir, actionId, label }) => {
    if (!isSafeActionId(actionId)) throw new Error('Invalid action id')
    if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      throw new Error('Source frames folder does not exist')
    }

    const targetDir = path.join(framesRoot, actionId)
    copyDirectory(sourceDir, targetDir)
    const config = await generateSpritesFromFrames({
      framesRoot,
      spritesDir,
      configPath,
      labels: label ? { [actionId]: label } : {}
    })
    const importedAction = config.actions.find((action) => action.id === actionId)
    return { ...config, importedAction }
  }

  return { importActionFrames }
}

module.exports = { createActionImportService, isSafeActionId }
