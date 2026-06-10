const test = require('node:test')
const assert = require('node:assert/strict')

const { createPetService } = require('../../src/main/services/pet-service')

test('pet service exposes a snapshot composed from settings and actions', () => {
  const service = createPetService({
    settingsService: {
      get: () => ({ scale: 1, walkSpeed: 2 })
    },
    actionService: {
      getConfig: () => ({
        defaultAction: 'idle',
        clickAction: 'eat',
        actions: [{ id: 'idle' }]
      })
    }
  })

  assert.deepEqual(service.getSnapshot(), {
    settings: { scale: 1, walkSpeed: 2 },
    actions: {
      defaultAction: 'idle',
      clickAction: 'eat',
      actions: [{ id: 'idle' }]
    }
  })
})

test('pet service delegates settings and action operations', () => {
  const calls = []
  const service = createPetService({
    settingsService: {
      get: () => ({ scale: 1 }),
      save: (settings) => {
        calls.push(['save', settings])
        return settings
      },
      preview: (settings) => {
        calls.push(['preview', settings])
        return settings
      }
    },
    actionService: {
      getConfig: () => ({ defaultAction: 'idle', clickAction: 'idle', actions: [] }),
      getAction: (id) => ({ id })
    }
  })

  assert.deepEqual(service.saveSettings({ scale: 1.2 }), { scale: 1.2 })
  assert.deepEqual(service.previewSettings({ scale: 1.4 }), { scale: 1.4 })
  assert.deepEqual(service.getAction('idle'), { id: 'idle' })
  assert.deepEqual(calls, [
    ['save', { scale: 1.2 }],
    ['preview', { scale: 1.4 }]
  ])
})
