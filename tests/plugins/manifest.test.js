const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizePluginManifest } = require('../../src/main/plugins/manifest')

test('normalizes a plugin manifest with permissions and commands', () => {
  const manifest = normalizePluginManifest({
    id: 'focus-timer',
    name: 'Focus Timer',
    version: '1.0.0',
    description: 'Focus helper',
    main: 'index.js',
    configSchema: 'config.schema.json',
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
    main: 'index.js',
    configSchema: 'config.schema.json',
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

test('rejects unsafe plugin main paths', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-main',
    name: 'Bad Main',
    version: '1.0.0',
    main: '../index.js'
  }), /Plugin main must be a safe relative path/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-main',
    name: 'Bad Main',
    version: '1.0.0',
    main: 'index.json'
  }), /Plugin main must point to a JavaScript file/)
})

test('rejects unsafe plugin config schema paths', () => {
  assert.throws(() => normalizePluginManifest({
    id: 'bad-config',
    name: 'Bad Config',
    version: '1.0.0',
    configSchema: '../config.schema.json'
  }), /Plugin configSchema must be a safe relative path/)

  assert.throws(() => normalizePluginManifest({
    id: 'bad-config',
    name: 'Bad Config',
    version: '1.0.0',
    configSchema: 'config.js'
  }), /Plugin configSchema must point to a JSON file/)
})
