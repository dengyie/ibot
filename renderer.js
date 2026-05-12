const pet = document.getElementById('pet')
const cat = document.getElementById('cat')
const bubble = document.getElementById('bubble')
const menu = document.getElementById('menu')

const state = {
  action: '',
  defaultAction: '',
  clickAction: '',
  animations: {},
  frameIndex: 0,
  frameTimer: 0,
  walking: false,
  walkDirection: -1,
  walkTimer: 0,
  drag: null,
  bubbleTimer: 0
}

const say = (text, duration = 1300) => {
  window.clearTimeout(state.bubbleTimer)
  bubble.textContent = text
  bubble.classList.add('show')

  state.bubbleTimer = window.setTimeout(() => {
    bubble.classList.remove('show')
  }, duration)
}

const setAction = (action) => {
  const animation = state.animations[action]
  if (!animation?.frames.length) return

  state.action = action
  state.frameIndex = 0
  cat.src = animation.frames[0]
  window.clearInterval(state.frameTimer)
  state.frameTimer = window.setInterval(tickFrame, animation.frameMs)

  if (action === state.clickAction && action !== state.defaultAction) {
    state.walking = false
    say(animation.label)
  }
}

const tickFrame = () => {
  const animation = state.animations[state.action]
  if (!animation?.frames.length) return

  state.frameIndex += 1

  if (state.frameIndex >= animation.frames.length) {
    if (animation.loop) {
      state.frameIndex = 0
    } else {
      setAction(state.defaultAction)
      return
    }
  }

  cat.src = animation.frames[state.frameIndex]
}

const tickWalk = () => {
  if (!state.walking || state.drag) return

  window.petAPI.moveBy({
    x: state.walkDirection * 2,
    y: 0
  })

  if (Math.random() < 0.012) {
    state.walkDirection *= -1
    cat.style.scale = `${state.walkDirection < 0 ? 1 : -1} 1`
  }
}

const toggleWalk = () => {
  state.walking = !state.walking
  state.walkDirection = Math.random() > 0.5 ? 1 : -1
  cat.style.scale = `${state.walkDirection < 0 ? 1 : -1} 1`
  setAction(state.defaultAction)
  say(state.walking ? '出发' : '休息一下')
}

const hideMenu = () => {
  menu.classList.remove('open')
}

const showMenu = () => {
  menu.classList.add('open')
}

const addMenuButton = (label, action) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.action = action
  button.textContent = label
  menu.appendChild(button)
}

const addMenuDivider = () => {
  const divider = document.createElement('div')
  divider.className = 'divider'
  menu.appendChild(divider)
}

const renderMenu = (actions) => {
  menu.textContent = ''

  // 动作菜单由文件夹自动生成，新增动作时不需要再改 HTML。
  actions.forEach((animation) => {
    addMenuButton(animation.label, animation.id)
  })

  addMenuDivider()
  addMenuButton('散步', 'walk')
  addMenuButton('退出', 'quit')
}

pet.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0 || event.target.closest('#menu')) return

  hideMenu()
  const bounds = await window.petAPI.getBounds()
  state.drag = {
    pointerId: event.pointerId,
    offsetX: event.screenX - bounds.x,
    offsetY: event.screenY - bounds.y,
    moved: false
  }
  pet.setPointerCapture(event.pointerId)
  pet.classList.add('dragging')
})

pet.addEventListener('pointermove', (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return

  state.drag.moved = true
  window.petAPI.setPosition({
    x: event.screenX - state.drag.offsetX,
    y: event.screenY - state.drag.offsetY
  })
})

pet.addEventListener('pointerup', (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return

  const wasClick = !state.drag.moved
  state.drag = null
  pet.classList.remove('dragging')

  if (wasClick) {
    setAction(state.clickAction)
  }
})

pet.addEventListener('dblclick', () => {
  toggleWalk()
})

pet.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  showMenu()
})

menu.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return

  const action = button.dataset.action
  hideMenu()

  if (action === 'quit') {
    window.petAPI.quit()
  } else if (action === 'walk') {
    toggleWalk()
  } else {
    state.walking = false
    setAction(action)
  }
})

window.addEventListener('blur', hideMenu)

const start = async () => {
  const { actions, defaultAction, clickAction } = await window.petAPI.getAnimations()
  state.defaultAction = defaultAction
  state.clickAction = clickAction
  state.animations = Object.fromEntries(actions.map((animation) => [animation.id, animation]))
  renderMenu(actions)

  if (!state.defaultAction) {
    say('没有找到动作图片')
    return
  }

  setAction(state.defaultAction)
  say('喵')

  state.walkTimer = window.setInterval(tickWalk, 40)
}

start()
