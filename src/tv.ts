import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { state, toast } from './state'

// TV com YouTube de verdade: um iframe renderizado em CSS3D ATRÁS do canvas, que aparece por um "buraco" (material transparente) na tela da TV.
export const cssScene = new THREE.Scene()
export const cssR = new CSS3DRenderer()
cssR.domElement.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none'

const W = 640, H = 360
const frame = document.createElement('iframe')
frame.width = String(W); frame.height = String(H); frame.allow = 'autoplay; encrypted-media'
frame.style.cssText = 'border:0;pointer-events:none;background:#000'
const box = document.createElement('div'); box.style.cssText = `width:${W}px;height:${H}px`; box.appendChild(frame)
const obj = new CSS3DObject(box); cssScene.add(obj)

export const tv = {
  hole: new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.DoubleSide, fog: false }), // fura o canvas: o iframe aparece por trás
  id: 'jNQXAC9IVRw', // o primeiro vídeo do YouTube, "Me at the zoo": clássico e embedável
  on: true, muted: true, loaded: false, vol: 60, paused: false, sync: () => {}, // sync: props liga a tela/luz ao estado
  sent: -1, t: 0,
  place(x: number, y: number, z: number, rotY: number, w: number) { obj.position.set(x, y, z); obj.rotation.y = rotY; obj.scale.setScalar(w / W) },
  cmd(f: string, args: unknown[] = []) { frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: f, args }), '*') },
  load(id: string) {
    this.id = id; if (vrT) drawVr(id); this.loaded = true; this.paused = false; this.sent = -1
    frame.src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`
    this.muted = true
  },
  setOn(on: boolean) { this.on = on; this.cmd(on && !this.paused ? 'playVideo' : 'pauseVideo') },
  unmute() { this.muted = false; this.sent = -1; this.cmd('unMute') },
  // som "espacial": o iframe do YouTube não passa pelo Web Audio, então o volume cai com a distância até a TV (sem panorâmica)
  update(px: number, pz: number, dt = 0.016) {
    const d = Math.hypot(px - obj.position.x, pz - obj.position.z)
    if (this.on && !this.loaded && d < 12) this.load(this.id)
    obj.visible = this.on && d < 14
    this.t += dt
    if (this.loaded && this.t > 0.25) {
      this.t = 0
      const att = Math.pow(Math.max(0, Math.min(1, 1 - (d - 1.5) / 12)), 1.5)
      const v = this.on && !this.muted ? Math.round(this.vol * att) : 0
      if (v !== this.sent) { this.sent = v; this.cmd('setVolume', [v]) }
    }
  },
  // VR: o iframe não aparece no headset (HTML). A tela vira uma textura com a miniatura do vídeo; o som do iframe continua tocando
  vr(on: boolean) {
    const h = this.hole
    h.map = on ? vrTex() : null; h.color.set(on ? 0xffffff : 0x000000); h.opacity = on ? 1 : 0; h.blending = on ? THREE.NormalBlending : THREE.NoBlending; h.needsUpdate = true
    if (on) drawVr(this.id)
  },
  render(camera: THREE.Camera) { if (obj.visible) cssR.render(cssScene, camera) },
}
let vrCanvas: HTMLCanvasElement | null = null, vrT: THREE.CanvasTexture | null = null, vrId = ''
const vrTex = () => {
  if (!vrT) { vrCanvas = document.createElement('canvas'); vrCanvas.width = 640; vrCanvas.height = 360; vrT = new THREE.CanvasTexture(vrCanvas); vrT.colorSpace = THREE.SRGBColorSpace }
  return vrT
}
function drawVr(id: string) {
  vrTex(); const g = vrCanvas!.getContext('2d')!; vrId = id
  const paint = (img?: HTMLImageElement) => {
    if (vrId !== id) return
    g.fillStyle = '#101018'; g.fillRect(0, 0, 640, 360)
    if (img) g.drawImage(img, 0, 0, 640, 360)
    g.fillStyle = '#000a'; g.fillRect(0, 300, 640, 60)
    g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('▶ YouTube — só o som toca no VR', 320, 330)
    vrT!.needsUpdate = true
  }
  paint()
  const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => paint(im); im.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}
addEventListener('resize', () => cssR.setSize(innerWidth, innerHeight))
cssR.setSize(innerWidth, innerHeight)

// aceita link (watch?v=, youtu.be/, shorts/, embed/) ou só o id de 11 caracteres
export const videoId = (s: string) => s.trim().match(/(?:v=|youtu\.be\/|shorts\/|embed\/|^)([\w-]{11})(?:[?&#/]|$)/)?.[1] ?? null

const PRESETS: [string, string][] = [['🐘 Me at the zoo', 'jNQXAC9IVRw'], ['🎵 Lofi Girl (ao vivo)', 'jfKfPfyJRdk'], ['😼 Nyan Cat', 'QH2-TGUlwu4'], ['🕺 Never Gonna Give You Up', 'dQw4w9WgXcQ']]

// controle remoto: escolher vídeo (lista ou link), volume, pausar, mudo, ligar/desligar (solta o mouse e ignora as teclas do jogo)
let ask: HTMLDivElement | null = null
export function openRemote() {
  if (!ask) {
    ask = document.createElement('div')
    ask.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:20;background:#16161d;border:1px solid #444;border-radius:10px;padding:14px;font:14px sans-serif;color:#eee;display:none;width:min(460px,92vw)'
    const btn = 'background:#2d2d38;color:#eee;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;margin:3px 3px 0 0'
    ask.innerHTML = `<b>📺 Controle da TV</b> <button data-a="x" style="${btn};float:right">Fechar (Esc)</button>
      <div style="margin:8px 0 2px;opacity:.7">Vídeos</div><div class="pre"></div>
      <div style="margin:8px 0 2px;opacity:.7">Ou cole um link do YouTube</div><input class="lnk" style="width:100%;box-sizing:border-box;padding:7px;font:13px monospace" placeholder="https://www.youtube.com/watch?v=..."><button data-a="url" style="${btn}">Colocar</button>
      <div style="margin:10px 0 2px;opacity:.7">Volume <span class="v"></span></div><input type="range" min="0" max="100" class="vol" style="width:100%">
      <div><button data-a="pp" style="${btn}">⏯ Pausar / continuar</button><button data-a="mute" style="${btn}">🔇 Mudo</button><button data-a="pow" style="${btn}">⏻ Ligar / desligar</button></div>`
    document.body.appendChild(ask)
    const a = ask, inp = a.querySelector<HTMLInputElement>('.lnk')!, vol = a.querySelector<HTMLInputElement>('.vol')!
    const close = () => { a.style.display = 'none'; state.editing = false }
    const play = (id: string) => { tv.load(id); tv.on = true; tv.sync(); setTimeout(() => tv.unmute(), 1500); toast('Colocou o vídeo na TV. 📺') }
    a.querySelector('.pre')!.innerHTML = PRESETS.map(([n, id]) => `<button data-id="${id}" style="${btn}">${n}</button>`).join('')
    a.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); if (e.key === 'Enter' && e.target === inp) a.querySelector<HTMLElement>('[data-a=url]')!.click() })
    vol.oninput = () => { tv.vol = +vol.value; tv.sent = -1; a.querySelector('.v')!.textContent = vol.value + '%'; if (tv.muted) tv.unmute() }
    a.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return
      if (b.dataset.id) play(b.dataset.id)
      else if (b.dataset.a === 'x') close()
      else if (b.dataset.a === 'url') { const id = videoId(inp.value); if (id) { inp.value = ''; play(id) } else toast('Esse link não parece do YouTube.') }
      else if (b.dataset.a === 'pp') { tv.paused = !tv.paused; tv.cmd(tv.paused ? 'pauseVideo' : 'playVideo') }
      else if (b.dataset.a === 'mute') { if (tv.muted) tv.unmute(); else { tv.muted = true; tv.sent = -1; tv.cmd('mute') } }
      else if (b.dataset.a === 'pow') { tv.setOn(!tv.on); tv.sync() }
    })
  }
  const vol = ask.querySelector<HTMLInputElement>('.vol')!; vol.value = String(tv.vol); ask.querySelector('.v')!.textContent = tv.vol + '%'
  document.exitPointerLock?.(); state.editing = true; ask.style.display = 'block'
}
