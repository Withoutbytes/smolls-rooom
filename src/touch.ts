import { cycleSlot } from './inventory'

// Controles de celular/tablet (só liga em tela touch). Reaproveita o que já existe: o joystick e os botões disparam as mesmas teclas do desktop
// (WASD, E, Espaço, R, Shift, M, F), e arrastar a tela gira a câmera (p.yaw / p.pitch).
export function initTouch(p: { yaw: number; pitch: number }, canvas: HTMLCanvasElement) {
  if (!matchMedia('(pointer: coarse)').matches) return
  // o jogo trata "mouse preso" como "jogando" (usar item, foto do celular…): no touch isso vale sempre
  Object.defineProperty(document, 'pointerLockElement', { get: () => canvas })
  document.getElementById('hud')!.style.display = 'none'
  const key = (code: string, on: boolean) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code }))

  const css = document.createElement('style')
  css.textContent = `canvas{touch-action:none}
#tc{position:fixed;inset:0;z-index:9;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
#tc *{touch-action:none}
#tc .joy{position:absolute;left:24px;bottom:28px;width:130px;height:130px;border-radius:50%;background:#fff2;border:2px solid #fff5;pointer-events:auto}
#tc .knob{position:absolute;left:45px;top:45px;width:40px;height:40px;border-radius:50%;background:#fffa}
#tc .btns{position:absolute;right:14px;bottom:24px;display:grid;grid-template-columns:repeat(3,56px);gap:8px}
#tc button{pointer-events:auto;height:56px;border-radius:50%;border:2px solid #fff5;background:#0008;color:#fff;font:600 13px sans-serif;padding:0}
#tc button.on{background:#2f6f3fcc}
#tc .big{background:#238636cc}`
  document.head.append(css)
  const root = document.createElement('div'); root.id = 'tc'
  root.innerHTML = `<div class="joy"><div class="knob"></div></div><div class="btns"></div>`
  document.body.append(root)

  // joystick → WASD
  const joy = root.querySelector<HTMLElement>('.joy')!, knob = root.querySelector<HTMLElement>('.knob')!
  const dirs: [string, (x: number, y: number) => boolean][] = [['KeyW', (_, y) => y < -0.35], ['KeyS', (_, y) => y > 0.35], ['KeyA', (x) => x < -0.35], ['KeyD', (x) => x > 0.35]]
  const held = new Set<string>()
  const steer = (x: number, y: number) => { for (const [c, f] of dirs) { const on = f(x, y); if (on !== held.has(c)) { on ? held.add(c) : held.delete(c); key(c, on) } } }
  const move = (e: PointerEvent) => {
    const r = joy.getBoundingClientRect(), R = r.width / 2
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l }
    knob.style.transform = `translate(${x * R * 0.6}px,${y * R * 0.6}px)`; steer(x, y)
  }
  const end = () => { knob.style.transform = ''; steer(0, 0) }
  joy.addEventListener('pointerdown', (e) => { joy.setPointerCapture(e.pointerId); move(e) })
  joy.addEventListener('pointermove', (e) => { if (joy.hasPointerCapture(e.pointerId)) move(e) })
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end)

  // arrastar a tela = olhar
  const looks = new Map<number, [number, number]>()
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') looks.set(e.pointerId, [e.clientX, e.clientY]) })
  canvas.addEventListener('pointermove', (e) => {
    const l = looks.get(e.pointerId); if (!l) return
    p.yaw -= (e.clientX - l[0]) * 0.005; p.pitch = Math.max(-1.3, Math.min(1.3, p.pitch - (e.clientY - l[1]) * 0.005)); l[0] = e.clientX; l[1] = e.clientY
  })
  for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e) => looks.delete((e as PointerEvent).pointerId))

  // botões: segurar = tecla apertada (E curto age, E segurado toca); Correr/Agachar alternam
  const btns = root.querySelector('.btns')!
  const add = (label: string, down: () => void, up?: () => void, cls = '') => {
    const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls
    b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); down() })
    if (up) { b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up) }
    btns.append(b); return b
  }
  const hold = (label: string, code: string, cls = '') => add(label, () => key(code, true), () => key(code, false), cls)
  const toggle = (label: string, code: string) => { let on = false; const b = add(label, () => { on = !on; b.classList.toggle('on', on); key(code, on) }) }
  hold('E', 'KeyE', 'big'); hold('Pular', 'Space')
  add('Usar', () => dispatchEvent(new MouseEvent('mousedown', { button: 0 })))
  toggle('Correr', 'KeyR'); toggle('Agachar', 'ShiftLeft'); hold('Sair', 'KeyF')
  add('◀', () => cycleSlot(-1)); hold('Mapa', 'KeyM'); add('▶', () => cycleSlot(1))
}
