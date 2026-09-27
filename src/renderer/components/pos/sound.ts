// ============================================================================
//  Âm báo cho máy quét mã vạch (P0.2 — roadmap §5: "toast sonner + âm báo lỗi
//  thay alert()"). Dùng WebAudio oscillator nên không cần file âm thanh.
// ============================================================================

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Kêu ngắn: 'error' = tít trầm dài (quét lỗi), 'success' = tít cao ngắn (quét đúng). */
export function beep(kind: 'error' | 'success'): void {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  const t = c.currentTime
  if (kind === 'error') {
    osc.type = 'square'
    osc.frequency.setValueAtTime(210, t)
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    osc.start(t)
    osc.stop(t + 0.4)
  } else {
    osc.type = 'sine'
    osc.frequency.setValueAtTime(920, t)
    gain.gain.setValueAtTime(0.07, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    osc.start(t)
    osc.stop(t + 0.12)
  }
}
