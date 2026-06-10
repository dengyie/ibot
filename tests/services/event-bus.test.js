const test = require('node:test')
const assert = require('node:assert/strict')

const { createEventBus } = require('../../src/main/services/event-bus')

test('event bus publishes payloads to subscribers and supports unsubscribe', () => {
  const bus = createEventBus()
  const received = []

  const unsubscribe = bus.on('settings:changed', (payload) => {
    received.push(payload)
  })

  bus.emit('settings:changed', { scale: 1.2 })
  unsubscribe()
  bus.emit('settings:changed', { scale: 1.4 })

  assert.deepEqual(received, [{ scale: 1.2 }])
})
