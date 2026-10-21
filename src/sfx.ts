// sons gerados na hora (Web Audio, sem arquivos). O contexto só destrava depois de um gesto do jogador, então tocamos a partir do E.
let ctx: AudioContext | null = null
const ac = () => (ctx ??= new AudioContext())
const note = (f: number, t0: number, dur: number, vol: number) => {
  const a = ac(), o = a.createOscillator(), g = a.createGain()
  o.type = 'sine'; o.frequency.value = f
  g.gain.setValueAtTime(0.0001, a.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol, a.currentTime + t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur)
  o.connect(g).connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + 0.05)
}
/** campainha "ding-dong"; vol 0..1 cai com a distância de quem ouve */
export function chime(vol = 0.3) { if (vol < 0.01) return; note(659, 0, 0.9, vol); note(523, 0.45, 1.2, vol) }
/** latido curto */
export function bark(vol = 0.2) { if (vol < 0.01) return; const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(420, a.currentTime); o.frequency.exponentialRampToValueAtTime(180, a.currentTime + 0.15); g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.18); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.2) }
/** acorde de violão (cordas soltas, uma depois da outra) */
export function strum(vol = 0.12) { [196, 247, 294, 392, 494].forEach((f, i) => note(f, i * 0.04, 1.4, vol)) }
/** fritura / chiado de panela (ruído filtrado) */
export function sizzle(vol = 0.1, dur = 3) {
  const a = ac(), buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - (i / d.length) * 0.6)
  const src = a.createBufferSource(); src.buffer = buf
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500
  const g = a.createGain(); g.gain.value = vol; src.connect(f).connect(g).connect(a.destination); src.start()
}
