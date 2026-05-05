const KEY = 'sumath_chat_history'
const MAX = 50

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function persist(chats) {
  try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0, MAX))) } catch {}
}

export function getChats() { return load() }

export function getChat(id) { return load().find(c => c.id === id) || null }

export function saveChat(id, title, messages) {
  const chats = load().filter(c => c.id !== id)
  chats.unshift({ id, title, timestamp: new Date().toISOString(), messages })
  persist(chats)
}

export function deleteChat(id) {
  persist(load().filter(c => c.id !== id))
}

export function clearChats() {
  localStorage.removeItem(KEY)
}

export function newChatId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
