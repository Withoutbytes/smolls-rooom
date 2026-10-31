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
/** tilintar de prato/talher/panela */
export function clink(vol = 0.1) { note(1568, 0, 0.18, vol); note(2093, 0.05, 0.25, vol * 0.6) }
/** passarinho: dois gorjeios rápidos */
export function tweet(vol = 0.06) { if (vol < 0.01) return; const a = ac(); for (const [t0, f] of [[0, 2600], [0.12, 3300], [0.24, 2900]]) { const o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(f, a.currentTime + t0); o.frequency.exponentialRampToValueAtTime(f * 1.4, a.currentTime + t0 + 0.08); g.gain.setValueAtTime(vol, a.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + 0.09); o.connect(g).connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + 0.1) } }
/** galinha: có-có-có */
export function cluck(vol = 0.08) { if (vol < 0.01) return; const a = ac(); for (let i = 0; i < 3; i++) { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + i * 0.13; o.type = 'square'; o.frequency.setValueAtTime(380 - i * 40, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.08); g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.1) } }

/** respiração de quem dorme: ruído grave com envelope lento (in e out) */
export function breath(vol = 0.05, dur = 2.2) {
  if (vol < 0.006) return
  const a = ac()
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * (i / d.length)) ** 1.5
  const src = a.createBufferSource(); src.buffer = buf
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 560; f.Q.value = 0.7
  const g = a.createGain(); g.gain.value = vol
  src.connect(f).connect(g).connect(a.destination); src.start()
}
/** lençol: ruído curto e seco, como corpo se mexendo na cama */
export function sheet(vol = 0.06) {
  if (vol < 0.006) return
  const a = ac(), dur = 0.42
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2
  const src = a.createBufferSource(); src.buffer = buf
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 1.4
  const g = a.createGain(); g.gain.value = vol
  src.connect(f).connect(g).connect(a.destination); src.start()
}

// ---------- vitrola / caixa de som: playlist gerada na hora (acordes + baixo + melodia aleatória na escala), volume ajustado de fora pela distância ----------
export const TRACKS = [
  { name: 'Lo-fi do Smoll', bpm: 72, type: 'sine' as OscillatorType, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], lead: [69, 72, 74, 76, 79] },
  { name: 'Forró de garagem', bpm: 118, type: 'triangle' as OscillatorType, chords: [[62, 66, 69], [67, 71, 74], [62, 66, 69], [69, 73, 76]], lead: [74, 76, 78, 81, 83] },
  { name: 'Chiptune do bug', bpm: 140, type: 'square' as OscillatorType, chords: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], lead: [72, 76, 79, 84, 88] },
]
let master: GainNode | null = null, musicT = 0, musicI = -1, step = 0
const mhz = (n: number) => 440 * 2 ** ((n - 69) / 12)
const voice = (n: number, dur: number, vol: number, type: OscillatorType) => {
  const a = ac(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime
  o.type = type; o.frequency.value = mhz(n); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(master!); o.start(t); o.stop(t + dur + 0.05)
}
export const musicTrack = () => musicI
/** volume geral da música (0..1): props.ts ajusta todo quadro pela distância */
export function musicVol(v: number) { if (master) master.gain.value = v }
export function musicStop() { clearInterval(musicT); musicI = -1 }
/** toca a faixa i (0..2); i < 0 desliga */
export function musicPlay(i: number) {
  musicStop(); if (i < 0) return
  master ??= (() => { const g = ac().createGain(); g.connect(ac().destination); return g })()
  const tr = TRACKS[i]; musicI = i; step = 0
  musicT = window.setInterval(() => {
    const ch = tr.chords[Math.floor(step / 8) % 4]
    if (step % 8 === 0) ch.forEach((n) => voice(n, 60 / tr.bpm * 3.6, 0.07, tr.type))
    if (step % 4 === 0) voice(ch[0] - 12, 60 / tr.bpm * 1.8, 0.12, 'sine')
    if (Math.random() < 0.55) voice(tr.lead[Math.floor(Math.random() * tr.lead.length)], 60 / tr.bpm * 0.9, 0.06, tr.type)
    step++
  }, (60 / tr.bpm / 2) * 1000)
}
