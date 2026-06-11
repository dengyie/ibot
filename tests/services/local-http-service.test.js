const test = require('node:test')
const assert = require('node:assert/strict')

const { createLocalHttpService } = require('../../src/main/services/local-http-service')

const requestJson = async (url, { method = 'GET', body } = {}) => {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  return {
    status: response.status,
    body: await response.json()
  }
}

test('local http service starts on loopback and returns runtime status', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({ settings: { scale: 1 }, actions: { actions: [] } }),
      say: () => {}
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0 })
    const result = await requestJson(`http://${started.host}:${started.port}/api/status`)

    assert.equal(started.host, '127.0.0.1')
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.service.host, '127.0.0.1')
    assert.equal(result.body.snapshot.settings.scale, 1)
  } finally {
    await service.stop()
  }
})

test('local http service rejects non-loopback hosts', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {}
    }
  })

  await assert.rejects(
    () => service.start({ enabled: true, host: '0.0.0.0', port: 0 }),
    /loopback/
  )
})

test('local http service rejects invalid ports', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {}
    }
  })

  await assert.rejects(
    () => service.start({ enabled: true, host: '127.0.0.1', port: 70000 }),
    /port/
  )
})

test('local http service exposes pet say endpoint', async () => {
  const sayEvents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: (payload) => {
        sayEvents.push(payload)
        return payload
      }
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0 })
    const result = await requestJson(`http://${started.host}:${started.port}/api/pet/say`, {
      method: 'POST',
      body: { text: 'hello api', ttlMs: 1200 }
    })

    assert.equal(result.status, 200)
    assert.deepEqual(result.body, {
      ok: true,
      result: { text: 'hello api', ttlMs: 1200, source: 'http' }
    })
    assert.deepEqual(sayEvents, [{ text: 'hello api', ttlMs: 1200, source: 'http' }])
  } finally {
    await service.stop()
  }
})

test('local http service exposes pet action and event endpoints', async () => {
  const intents = []
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {},
      playAction: (payload) => {
        intents.push(['action', payload])
        return payload
      },
      setEvent: (payload) => {
        intents.push(['event', payload])
        return payload
      }
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0 })
    const actionResult = await requestJson(`http://${started.host}:${started.port}/api/pet/action`, {
      method: 'POST',
      body: { actionId: 'idle' }
    })
    const eventResult = await requestJson(`http://${started.host}:${started.port}/api/pet/event`, {
      method: 'POST',
      body: { type: 'status', message: 'working', ttlMs: 900 }
    })

    assert.equal(actionResult.status, 200)
    assert.equal(eventResult.status, 200)
    assert.deepEqual(intents, [
      ['action', { actionId: 'idle', source: 'http' }],
      ['event', { type: 'status', message: 'working', ttlMs: 900, source: 'http' }]
    ])
  } finally {
    await service.stop()
  }
})

test('local http service returns 404 json for unknown routes', async () => {
  const service = createLocalHttpService({
    petService: {
      getSnapshot: () => ({}),
      say: () => {}
    }
  })

  try {
    const started = await service.start({ enabled: true, host: '127.0.0.1', port: 0 })
    const result = await requestJson(`http://${started.host}:${started.port}/api/missing`)

    assert.equal(result.status, 404)
    assert.deepEqual(result.body, { ok: false, error: 'Not found' })
  } finally {
    await service.stop()
  }
})
