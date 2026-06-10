const createEventBus = () => {
  const listeners = new Map()

  const on = (eventName, listener) => {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set())
    listeners.get(eventName).add(listener)
    return () => listeners.get(eventName)?.delete(listener)
  }

  const emit = (eventName, payload) => {
    const eventListeners = listeners.get(eventName)
    if (!eventListeners) return
    for (const listener of [...eventListeners]) {
      listener(payload)
    }
  }

  const clear = () => listeners.clear()

  return { on, emit, clear }
}

module.exports = { createEventBus }
