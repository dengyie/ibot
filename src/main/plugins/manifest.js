const KNOWN_PLUGIN_PERMISSIONS = new Set([
  'pet:say',
  'pet:action',
  'pet:event',
  'ai:chat',
  'storage',
  'network',
  'commands'
])

const normalizeCommands = (commands = []) => commands.map((command) => {
  if (!command?.id) throw new Error('Plugin command id is required')
  return {
    id: command.id,
    title: command.title || command.id
  }
})

const normalizePluginManifest = (manifest, { source = 'local', basePath = '' } = {}) => {
  if (!manifest?.id) throw new Error('Plugin id is required')
  if (!manifest.name) throw new Error('Plugin name is required')
  if (!manifest.version) throw new Error('Plugin version is required')

  const permissions = manifest.permissions || []
  for (const permission of permissions) {
    if (!KNOWN_PLUGIN_PERMISSIONS.has(permission)) {
      throw new Error(`Unknown plugin permission: ${permission}`)
    }
  }

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description || '',
    source,
    basePath,
    permissions: [...permissions],
    commands: normalizeCommands(manifest.commands)
  }
}

module.exports = { KNOWN_PLUGIN_PERMISSIONS, normalizePluginManifest }
