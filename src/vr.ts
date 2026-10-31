import * as THREE from 'three'
import { dialog, dialogView, pickOpt, closeDialog } from './interact'
import { makeArm, curlArm, attachHeld, useHeld, cycleSlot } from './inventory'

// VR: cada controle vira um braço com mão (e o item da mão do jogador), com laser pra apontar.
// Analógico dir.: cima pula, baixo agacha · clicar o esq. corre · Gatilho = E (falar/agir) ou escolher opção no painel · grip = usar o item · A/X e B/Y = próximo/anterior da hotbar · analógico esq. anda, dir. gira 30°
// O HTML (dica, aviso, diálogo) não aparece dentro do headset: desenhamos num canvas e colamos em planos 3D.
const noRay = (o: THREE.Object3D) => { o.raycast = () => {}; return o }

function canvasPlane(w: number, h: number, mw: number, mh: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, fog: false }))
  mesh.renderOrder = 1000
  return { c, g: c.getContext('2d')!, tex, mesh }
}
const wrap = (g: CanvasRenderingContext2D, text: string, maxW: number) => {
  const out: string[] = []; let line = ''
  for (const w of text.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w } else line = t }
  if (line) out.push(line)
  return out
}
const fit = (g: CanvasRenderingContext2D, t: string, maxW: number) => { while (t.length > 1 && g.measureText(t).width > maxW) t = t.slice(0, -2) + '…'; return t }

// log visível dentro do headset (o console não aparece lá): erros e eventos de VR, últimas 6 linhas
const lines: string[] = []
let logDirty = false, shownAt = 0
export function vrLog(...a: unknown[]) {
  const m = a.map((x) => (x instanceof Error ? `${x.message} @ ${(x.stack ?? '').split('\n')[1]?.trim() ?? ''}` : String(x))).join(' ')
  console.log('[vr]', m)
  if (!/ERRO|PROMESSA|FALHA/.test(m)) return // só erro vai pro painel: o resto fica no console
  lines.push(m.slice(0, 110)); if (lines.length > 4) lines.shift(); logDirty = true; shownAt = performance.now()
}
addEventListener('error', (e) => vrLog('ERRO', e.message, `${e.filename?.split('/').pop()}:${e.lineno}`))
addEventListener('unhandledrejection', (e) => vrLog('PROMESSA', (e.reason as Error)?.message ?? e.reason))

export function initVR(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, rig: THREE.Object3D) {
  const ctl = [0, 1].map((i) => {
    const c = renderer.xr.getController(i); rig.add(c)
    const arm = makeArm(); c.add(arm)
    const laser = noRay(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -3)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })))
    c.add(laser)
    const s = { c, arm, laser, hand: '', keys: new Set<string>(), cur: [0, 0, 0], down: false, grip: false, a: false, b: false }
    c.addEventListener('connected', (e: any) => { s.hand = e.data.handedness; if (s.hand === 'left') { c.remove(arm); s.arm = makeArm(true); c.add(s.arm, wrist.mesh) } })
    return s
  })
  const key = (s: { keys: Set<string> }, code: string, on: boolean) => { // tecla virtual: só dispara na mudança
    if (on === s.keys.has(code)) return; on ? s.keys.add(code) : s.keys.delete(code)
    dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code }))
  }
  const right = () => ctl.find((s) => s.hand === 'right') ?? ctl[1]
  const gp = (i: number) => Array.from(renderer.xr.getSession()?.inputSources ?? []).find((x) => x.handedness === ctl[i].hand && x.gamepad)?.gamepad
  let pointer = right()

  // cola dos controles no antebraço esquerdo: só aparece quando você vira o pulso pra olhar
  const wrist = canvasPlane(320, 480, 0.15, 0.225); noRay(wrist.mesh); wrist.mesh.rotation.x = -Math.PI / 2; wrist.mesh.position.set(0, 0.075, 0.2); wrist.mesh.visible = false
  {
    const g = wrist.g, L: [string, string][] = [['Gatilho', 'interagir'], ['Grip', 'usar item'], ['A / B', 'trocar item'], ['Analóg. E', 'andar'], ['  clicar', 'correr'], ['Analóg. D', 'girar'], ['  cima', 'pular'], ['  baixo', 'agachar']]
    g.fillStyle = '#12141af0'; g.beginPath(); g.roundRect(0, 0, 320, 480, 20); g.fill()
    g.fillStyle = '#ffd54a'; g.font = 'bold 30px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('Controles', 18, 14)
    L.forEach(([k, v], i) => { g.fillStyle = '#9cf'; g.font = 'bold 26px sans-serif'; g.fillText(k, 18, 66 + i * 50); g.fillStyle = '#fff'; g.font = '26px sans-serif'; g.fillText(v, 170, 66 + i * 50) })
    wrist.tex.needsUpdate = true
  }
  const wp = new THREE.Vector3(), wn = new THREE.Vector3(), hp = new THREE.Vector3()
  const wristShow = (c: THREE.Object3D) => { // normal do painel (pra cima do controle) apontando pra cabeça
    wrist.mesh.getWorldPosition(wp); wn.set(0, 1, 0).transformDirection(c.matrixWorld); camera.getWorldPosition(hp)
    return wn.dot(hp.sub(wp).normalize()) > 0.6
  }
  // dica da mira + aviso: um plano preso na frente do olhar
  const hud = canvasPlane(512, 96, 0.64, 0.12); hud.mesh.position.set(0, -0.27, -0.8); noRay(hud.mesh); camera.add(hud.mesh)
  const logP = canvasPlane(1024, 200, 1.2, 0.234); logP.mesh.position.set(0, 0.22, -1); noRay(logP.mesh); camera.add(logP.mesh); logP.mesh.visible = false
  const drawLog = () => {
    if (logP.mesh.visible && performance.now() - shownAt > 8000) { logP.mesh.visible = false; lines.length = 0 } // some sozinho
    if (!logDirty) return; logDirty = false
    const g = logP.g; g.clearRect(0, 0, 1024, 200); g.fillStyle = '#000c'; g.fillRect(0, 0, 1024, 200)
    g.font = '24px monospace'; g.textBaseline = 'top'; g.fillStyle = '#7f7'
    lines.forEach((l, i) => { g.fillStyle = /ERRO|PROMESSA|FALHA/.test(l) ? '#f77' : '#7f7'; g.fillText(l, 10, 8 + i * 30) })
    logP.tex.needsUpdate = true; logP.mesh.visible = true
  }
  renderer.xr.addEventListener('sessionstart', () => {
    const s = renderer.xr.getSession()!
    vrLog('sessão VR iniciada', s.environmentBlendMode)
    s.addEventListener('inputsourceschange', (e) => vrLog('controles:', [...s.inputSources].map((x) => x.handedness).join(',') || 'nenhum', `(+${e.added.length} -${e.removed.length})`))
  })
  let hudTxt = ''
  const drawHud = () => {
    const tip = document.getElementById('tip')!, toast = document.getElementById('toast')!
    const t = [tip.style.display !== 'none' ? tip.textContent : '', toast.style.opacity === '1' ? toast.textContent : ''].filter(Boolean).join('\n')
    if (t === hudTxt) return; hudTxt = t
    const g = hud.g; g.clearRect(0, 0, 512, 96)
    if (!t) { hud.tex.needsUpdate = true; return }
    g.fillStyle = '#000b'; g.beginPath(); g.roundRect(4, 4, 504, 88, 14); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    const lines = t.split('\n').flatMap((l) => wrap(g, l, 480)).slice(0, 2)
    lines.forEach((l, i) => g.fillText(l, 256, 48 + (i - (lines.length - 1) / 2) * 32))
    hud.tex.needsUpdate = true
  }

  // painel do diálogo: aparece na frente de você quando o menu do Smoll abre; aponte + gatilho
  const W = 1024, H = 768, panel = canvasPlane(W, H, 1.6, 1.2); panel.mesh.visible = false; scene.add(panel.mesh)
  const ROW = 46, TOP = 230, rc = new THREE.Raycaster()
  let wasOpen = false, hover = -1, drawn = ''
  const rowAt = (s: typeof ctl[0]) => {
    s.c.updateWorldMatrix(true, false)
    rc.ray.origin.setFromMatrixPosition(s.c.matrixWorld); rc.ray.direction.set(0, 0, -1).transformDirection(s.c.matrixWorld)
    const h = rc.intersectObject(panel.mesh)[0]; if (!h?.uv) return -1
    const x = h.uv.x * W, y = (1 - h.uv.y) * H, n = dialogView().opts.length, per = Math.ceil(n / 2)
    if (y < TOP) return -1
    const r = Math.floor((y - TOP) / ROW), col = x < W / 2 ? 0 : 1, i = col * per + r
    return r < per && i < n ? i : -1
  }
  const drawPanel = () => {
    const v = dialogView(), key = v.say + v.opts.join('|') + hover; if (key === drawn) return; drawn = key
    const g = panel.g; g.clearRect(0, 0, W, H)
    g.fillStyle = '#12141ae6'; g.beginPath(); g.roundRect(0, 0, W, H, 28); g.fill()
    g.textAlign = 'left'; g.textBaseline = 'top'
    g.fillStyle = '#ffd54a'; g.font = 'bold 34px sans-serif'; g.fillText('Smoll', 32, 22)
    g.fillStyle = '#fff'; g.font = '30px sans-serif'
    wrap(g, v.say, W - 64).slice(0, 4).forEach((l, i) => g.fillText(l, 32, 70 + i * 38))
    g.font = '28px sans-serif'
    const per = Math.ceil(v.opts.length / 2)
    v.opts.forEach((t, i) => {
      const col = Math.floor(i / per), r = i % per, x = 24 + col * (W / 2), y = TOP + r * ROW
      g.fillStyle = i === hover ? '#3a6df0' : '#2d2d38'; g.beginPath(); g.roundRect(x, y, W / 2 - 40, ROW - 6, 10); g.fill()
      g.fillStyle = '#fff'; g.fillText(fit(g, t, W / 2 - 70), x + 14, y + 6)
    })
    panel.tex.needsUpdate = true
  }
  const place = () => { // 1,3 m à frente (na direção do olhar, sem inclinar), na altura dos olhos
    const p = new THREE.Vector3(), d = new THREE.Vector3(); camera.getWorldPosition(p); camera.getWorldDirection(d); d.y = 0; d.normalize()
    panel.mesh.position.copy(p).addScaledVector(d, 1.3); panel.mesh.position.y = p.y - 0.05; panel.mesh.lookAt(p.x, panel.mesh.position.y, p.z)
  }

  let snap = true, held = -1
  return {
    /** controle apontando (o último que apertou o gatilho) — updateInteract mira por ele */
    pointer: () => pointer.c as THREE.Object3D,
    /** chamar a cada quadro em VR; devolve [frente, lado, giro em rad] */
    update(dt: number): [number, number, number] {
      let fwd = 0, side = 0, turn = 0
      const r = right(); if (held !== ctl.indexOf(r)) { held = ctl.indexOf(r); attachHeld(r.c) }
      if (dialog.open) { if (!wasOpen) { place(); drawn = '' } wasOpen = true; panel.mesh.visible = true; hover = rowAt(pointer); drawPanel() }
      else { wasOpen = false; panel.mesh.visible = false; hover = -1 }
      ctl.forEach((s, i) => {
        const pad = gp(i); if (!pad) return
        if (s.hand === 'left') wrist.mesh.visible = wristShow(s.c)
        const b = (k: number) => !!pad.buttons[k]?.pressed
        s.laser.visible = s === pointer || dialog.open
        if (s.hand === 'left') { fwd = Math.abs(pad.axes[3]) > 0.15 ? -pad.axes[3] : 0; side = Math.abs(pad.axes[2]) > 0.15 ? pad.axes[2] : 0 }
        else { const rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0; key(s, 'Space', ry < -0.7); key(s, 'ShiftLeft', ry > 0.7); if (Math.abs(rx) < 0.6) snap = true; else if (snap) { snap = false; turn = -Math.sign(rx) * Math.PI / 6 } }
        if (s.hand === 'left') key(s, 'KeyR', b(3)) // clicar o analógico esquerdo = correr
        const trig = b(0), grip = b(1), a = b(4), bb = b(5)
        if (trig !== s.down) {
          s.down = trig; pointer = s
          if (dialog.open) { if (trig) { const k = rowAt(s); if (k >= 0) pickOpt(k) } }
          else dispatchEvent(new KeyboardEvent(trig ? 'keydown' : 'keyup', { code: 'KeyE' })) // segurar = tocar (ver interact.ts)
        }
        if (grip && !s.grip) { if (dialog.open) closeDialog(); else useHeld() }
        if (a && !s.a && !dialog.open) cycleSlot(1)
        if (bb && !s.b && !dialog.open) cycleSlot(-1)
        s.grip = grip; s.a = a; s.b = bb
        const k = Math.min(1, dt * 20), tb = pad.buttons // dedos seguem o analógico dos botões, suavizados
        s.cur[0] += ((tb[0]?.value ?? 0) - s.cur[0]) * k; s.cur[1] += ((tb[1]?.value ?? 0) - s.cur[1]) * k
        s.cur[2] += ((a || bb || tb[3]?.pressed || tb[3]?.touched || tb[4]?.touched || tb[5]?.touched ? 1 : 0) - s.cur[2]) * k
        curlArm(s.arm, s.cur[0], s.cur[1], s.cur[2])
      })
      drawHud(); drawLog()
      return [fwd, side, turn]
    },
    drawLog,
    end() { attachHeld(null); held = -1; panel.mesh.visible = false },
  }
}
