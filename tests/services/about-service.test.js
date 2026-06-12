const test = require('node:test')
const assert = require('node:assert/strict')

const { createAboutService, compareVersions, normalizeGithubPublish } = require('../../src/main/services/about-service')

const createApp = (overrides = {}) => ({
  isPackaged: false,
  getName: () => 'OpenPet',
  getVersion: () => '1.0.0',
  ...overrides
})

test('about service returns version and update feed summary without secrets', () => {
  const service = createAboutService({
    app: createApp({ isPackaged: true }),
    packageJson: {
      name: 'openpet',
      version: '1.0.0',
      build: {
        productName: 'OpenPet',
        publish: [{ provider: 'github', owner: 'dengyie', repo: 'openpet', channel: 'latest' }]
      }
    }
  })

  assert.deepEqual(service.getInfo(), {
    name: 'openpet',
    productName: 'OpenPet',
    version: '1.0.0',
    packaged: true,
    platform: process.platform,
    arch: process.arch,
    update: {
      configured: true,
      provider: 'github',
      owner: 'dengyie',
      repo: 'openpet',
      channel: 'latest',
      url: 'https://github.com/dengyie/openpet/releases'
    }
  })
})

test('about service reports update checks as not configured without a publish target', async () => {
  const service = createAboutService({
    app: createApp(),
    packageJson: { name: 'openpet', version: '1.0.0' }
  })

  const result = await service.checkForUpdates()

  assert.equal(result.status, 'not-configured')
  assert.equal(result.configured, false)
  assert.equal(result.currentVersion, '1.0.0')
  assert.equal(result.updateAvailable, false)
})

test('about service checks GitHub releases and filters install assets', async () => {
  const requests = []
  const service = createAboutService({
    app: createApp(),
    packageJson: {
      name: 'openpet',
      version: '1.0.0',
      build: {
        publish: { provider: 'github', owner: 'dengyie', repo: 'openpet' }
      }
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          tag_name: 'v1.1.0',
          html_url: 'https://github.com/dengyie/openpet/releases/tag/v1.1.0',
          prerelease: false,
          assets: [
            { name: 'OpenPet.dmg', browser_download_url: 'https://example.test/OpenPet.dmg', size: 1024 },
            { name: 'OpenPet.blockmap', browser_download_url: 'https://example.test/OpenPet.blockmap', size: 12 }
          ]
        })
      }
    }
  })

  const result = await service.checkForUpdates()

  assert.equal(requests[0].url, 'https://api.github.com/repos/dengyie/openpet/releases/latest')
  assert.equal(requests[0].options.headers.Authorization, undefined)
  assert.equal(result.status, 'ok')
  assert.equal(result.latestVersion, '1.1.0')
  assert.equal(result.updateAvailable, true)
  assert.deepEqual(result.assets, [{ name: 'OpenPet.dmg', url: 'https://example.test/OpenPet.dmg', size: 1024 }])
})

test('about service returns a safe error summary for failed update checks', async () => {
  const service = createAboutService({
    app: createApp(),
    packageJson: {
      name: 'openpet',
      version: '1.0.0',
      build: {
        publish: { provider: 'github', owner: 'dengyie', repo: 'openpet' }
      }
    },
    fetchImpl: async () => ({ ok: false, status: 503 })
  })

  const result = await service.checkForUpdates()

  assert.equal(result.status, 'error')
  assert.equal(result.message, 'Update check failed with HTTP 503.')
  assert.equal(result.updateAvailable, false)
})

test('about service times out stalled update checks', async () => {
  const service = createAboutService({
    app: createApp(),
    packageJson: {
      name: 'openpet',
      version: '1.0.0',
      build: {
        publish: { provider: 'github', owner: 'dengyie', repo: 'openpet' }
      }
    },
    fetchImpl: async () => new Promise(() => {}),
    timeoutMs: 5
  })

  const result = await service.checkForUpdates()

  assert.equal(result.status, 'timeout')
  assert.equal(result.message, 'Update check timed out.')
  assert.equal(result.updateAvailable, false)
})


test('about service compares semver-like versions', () => {
  assert.equal(compareVersions('v1.2.0', '1.1.9'), 1)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1)
})

test('about service ignores unsupported publish providers', () => {
  assert.equal(normalizeGithubPublish({ provider: 'generic', url: 'https://example.test' }), null)
})
