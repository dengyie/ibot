const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const { generateSpritesFromFrames } = require('../../src/main/services/sprite-generator')

const createFrame = async (filePath, width, height) => {
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.8 }
    }
  }).png().toFile(filePath)
}

test('sprite generator discovers frame folders and writes animations config', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ibot-sprites-'))
  const framesRoot = path.join(root, 'flames')
  const spritesDir = path.join(root, 'sprites')
  const configPath = path.join(root, 'animations.json')
  const waveDir = path.join(framesRoot, 'wave')
  fs.mkdirSync(waveDir, { recursive: true })
  await createFrame(path.join(waveDir, '02_no_bg.png'), 12, 14)
  await createFrame(path.join(waveDir, '01_no_bg.png'), 10, 10)

  const result = await generateSpritesFromFrames({ framesRoot, spritesDir, configPath })

  assert.equal(result.actions.length, 1)
  assert.equal(result.defaultAction, 'wave')
  assert.equal(result.clickAction, 'wave')
  assert.deepEqual(result.actions[0], {
    id: 'wave',
    label: 'wave',
    loop: false,
    frameMs: 95,
    frameWidth: 12,
    frameHeight: 14,
    sprite: path.posix.join('cat_anime', 'sprites', 'wave.png'),
    frameCount: 2
  })
  assert.equal(fs.existsSync(path.join(spritesDir, 'wave.png')), true)
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf-8')), result)
})
