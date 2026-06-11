const http = require('http')

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

const readJsonBody = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > 1024 * 1024) {
      request.destroy()
      reject(new Error('Request body is too large'))
    }
  })
  request.on('end', () => {
    if (!body) {
      resolve({})
      return
    }
    try {
      resolve(JSON.parse(body))
    } catch (_) {
      reject(new Error('Invalid JSON body'))
    }
  })
  request.on('error', reject)
})

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

const getState = (server, config) => {
  const address = server?.address()
  return {
    enabled: Boolean(server?.listening),
    host: config.host,
    port: typeof address === 'object' && address ? address.port : config.port
  }
}

const createLocalHttpService = ({ petService }) => {
  if (!petService) throw new Error('petService is required')

  let server = null
  let config = { enabled: false, host: '127.0.0.1', port: 0 }

  const handleRequest = async (request, response) => {
    try {
      const url = new URL(request.url, `http://${config.host}`)

      if (request.method === 'GET' && url.pathname === '/api/status') {
        sendJson(response, 200, {
          ok: true,
          service: getState(server, config),
          snapshot: petService.getSnapshot()
        })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/say') {
        const body = await readJsonBody(request)
        const result = petService.say({ text: body.text, ttlMs: body.ttlMs, source: 'http' })
        sendJson(response, 200, { ok: true, result })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/action') {
        const body = await readJsonBody(request)
        const result = petService.playAction({ actionId: body.actionId, source: 'http' })
        sendJson(response, 200, { ok: true, result })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/pet/event') {
        const body = await readJsonBody(request)
        const result = petService.setEvent({ ...body, source: 'http' })
        sendJson(response, 200, { ok: true, result })
        return
      }

      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message || 'Bad request' })
    }
  }

  const stop = () => new Promise((resolve, reject) => {
    if (!server) {
      config = { ...config, enabled: false }
      resolve(getState(server, config))
      return
    }
    const currentServer = server
    server = null
    currentServer.close((error) => {
      config = { ...config, enabled: false }
      if (error) reject(error)
      else resolve(getState(server, config))
    })
  })

  const start = async (nextConfig = {}) => {
    const host = nextConfig.host || '127.0.0.1'
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new Error('Local HTTP service must bind to a loopback host')
    }

    await stop()
    config = {
      enabled: true,
      host,
      port: Number(nextConfig.port || 0)
    }
    server = http.createServer(handleRequest)

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(config.port, config.host, resolve)
    })
    return getState(server, config)
  }

  const getStatus = () => getState(server, config)

  return { start, stop, getStatus }
}

module.exports = { LOOPBACK_HOSTS, createLocalHttpService }
