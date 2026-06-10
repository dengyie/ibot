const test = require('node:test')
const assert = require('node:assert/strict')

const { createActionService } = require('../../src/main/services/action-service')

test('action service returns legacy animation config as runtime actions', () => {
  const service = createActionService({
    getPetAnimations: () => ({
      defaultAction: 'idle',
      clickAction: 'eat',
      actions: [
        { id: 'idle', label: '待机', loop: true },
        { id: 'eat', label: '喂食', loop: false }
      ]
    })
  })

  assert.deepEqual(service.getConfig(), {
    defaultAction: 'idle',
    clickAction: 'eat',
    actions: [
      { id: 'idle', label: '待机', loop: true },
      { id: 'eat', label: '喂食', loop: false }
    ]
  })
  assert.deepEqual(service.listActions().map((action) => action.id), ['idle', 'eat'])
  assert.equal(service.getAction('eat').label, '喂食')
})
