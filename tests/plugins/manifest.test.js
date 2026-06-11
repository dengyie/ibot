const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')

test('normalizes a plugin manifest with permissions and commands', () => {
  const manifest = normalizePluginManifest({
    id: 'focus-timer',
    name: 'Focus Timer',
    version: '1.0.0',
    description: 'Focus helper',
    permissions: ['pet:say'],
    commands: [{ id: 'start', title: 'Start focus' }]
  }, { source: 'local', basePath: '/plugins/focus-timer' })

  assert.deepEqual(manifest, {
    id: 'focus-timer',
    name: 'Focus Timer',
    version: '1.0.0',
    description: 'Focus helper',
    source: 'local',
    basePath: '/plugins/focus-timer',
    permissions: ['pet:say'],
    commands: [{ id: 'start', title: 'Start focus' }]
  })
})

test('rejects plugin manifests with unknown permissions', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-plugin',
    name: 'Bad Plugin',
    version: '1.0.0',
    permissions: ['fs:read']
  }), /Unknown plugin permission/)
})

test('rejects plugin manifests without required identity fields', () => {
  assert.throws(() => normalizePluginManifest({
    name: 'Missing Id',
    version: '1.0.0'
  }), /Plugin id is required/)
})
