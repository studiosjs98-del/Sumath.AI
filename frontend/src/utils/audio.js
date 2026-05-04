let audioCtx = null

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

function playTone(frequency, duration, type = 'sine', volume = 0.3) {
  try {
    const ctx = getAudioCtx()
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)
    gainNode.gain.setValueAtTime(volume, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration)
  } catch {}
}

export function playCorrectSound() {
  playTone(523.25, 0.15)
  setTimeout(() => playTone(659.25, 0.15), 100)
  setTimeout(() => playTone(783.99, 0.25), 200)
}

export function playWrongSound() {
  playTone(220, 0.3, 'sawtooth', 0.2)
}

export function playHintSound() {
  playTone(440, 0.1, 'sine', 0.15)
  setTimeout(() => playTone(550, 0.15, 'sine', 0.1), 80)
}

export function playXPSound() {
  playTone(659.25, 0.1)
  setTimeout(() => playTone(783.99, 0.1), 80)
  setTimeout(() => playTone(1046.50, 0.2), 160)
}
