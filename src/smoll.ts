import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { blockers } from './props'
import { buildPC } from './pc'
import { act, openTalk } from './interact'
import { state } from './state'
import { buildRig } from './rig'
import { createAnim, type Clip } from './smollAnim'

// Smoll 3D de primitivas: cadeira gamer + ele sentado + mesa com 2 monitores. Frente do grupo = +x (virado pra parede leste).
const CX = 17.9, CZ = 13
const lm = (c: number) => new THREE.MeshLambertMaterial({ color: c })

export function buildSmoll(scene: THREE.Scene) {
  const box = (w: number, h: number, d: number, c: number | THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? lm(c) : c)
    m.position.set(x, y + h / 2, z); p.add(m); return m
  }
  const ball = (r: number, c: number, x: number, y: number, z: number, p: THREE.Object3D, sy = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), lm(c)); m.position.set(x, y, z); m.scale.y = sy; p.add(m); return m
  }
  const cyl = (r: number, h: number, c: number, x: number, y: number, z: number, p: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), lm(c)); m.position.set(x, y + h / 2, z); p.add(m); return m
  }

  const pc = buildPC(scene)

  // ---- grupo giratório: cadeira + Smoll ----
  const R = new THREE.Group(); R.position.set(CX, 0, CZ); scene.add(R)
  // cadeira
  cyl(0.04, 0.3, 0x222222, 0, 0.0, 0, R)
  for (let i = 0; i < 5; i++) { const a = new THREE.Group(); a.rotation.y = i * 1.2566; R.add(a); box(0.3, 0.03, 0.05, 0x222222, 0.15, 0.06, 0, a); ball(0.035, 0x111111, 0.3, 0.035, 0, a) }
  box(0.5, 0.08, 0.5, 0x222226, 0, 0.30, 0, R)
  box(0.07, 0.8, 0.46, 0x222226, -0.26, 0.34, 0, R)
  for (const z of [-0.2, 0.2]) box(0.075, 0.8, 0.04, 0xc0202a, -0.26, 0.34, z, R) // detalhe vermelho
  for (const z of [-0.29, 0.29]) { box(0.3, 0.04, 0.07, 0x222226, 0.05, 0.62, z, R); box(0.05, 0.2, 0.05, 0x222226, 0, 0.42, z, R) }
  // corpo (fallback de primitivas, escondido quando o modelo realista carrega)
  const B = new THREE.Group(); R.add(B)
  const hoodie = 0x3b3b44, skin = 0xc68e65, hair = 0x14110f, shorts = 0x6b6b3a
  box(0.3, 0.56, 0.46, hoodie, -0.04, 0.44, 0, B)
  for (const z of [-0.26, 0.26]) ball(0.1, hoodie, -0.04, 0.98, z, B)
  box(0.14, 0.14, 0.3, hoodie, -0.16, 0.98, 0, B)             // capuz
  cyl(0.05, 0.1, skin, 0, 1.0, 0, B)
  ball(0.13, skin, 0.03, 1.27, 0, B, 1.1)                      // cabeça
  ball(0.145, hair, -0.01, 1.33, 0, B, 0.85)                   // cabelo
  box(0.12, 0.1, 0.22, hair, 0.07, 1.4, 0, B)                  // topete
  box(0.05, 0.12, 0.05, hair, 0.14, 1.36, 0.08, B)             // mecha na testa
  box(0.1, 0.1, 0.2, hair, 0.09, 1.1, 0, B)                    // barba
  box(0.05, 0.035, 0.13, hair, 0.15, 1.22, 0, B)               // bigode
  for (const z of [-0.12, 0.12]) { box(0.08, 0.14, 0.02, hair, 0.04, 1.16, z, B); ball(0.035, skin, 0.01, 1.27, z * 1.1, B) }
  for (const z of [-0.05, 0.05]) { ball(0.018, 0x111111, 0.155, 1.3, z, B); box(0.02, 0.015, 0.07, hair, 0.15, 1.34, z, B) }
  box(0.05, 0.06, 0.04, 0xb77e57, 0.16, 1.24, 0, B)            // nariz
  // pernas
  for (const z of [-0.14, 0.14]) {
    box(0.5, 0.14, 0.15, shorts, 0.24, 0.42, z, B)
    box(0.13, 0.42, 0.13, skin, 0.55, 0.02, z, B)
    box(0.3, 0.04, 0.14, 0x1b1b1b, 0.6, 0, z, B)               // chinelo
  }
  // braços e mãos (animados: digitando)
  const hands: THREE.Object3D[] = []
  for (const z of [-0.18, 0.18]) {
    box(0.11, 0.28, 0.11, hoodie, -0.02, 0.7, z * 1.6, B)
    const f = new THREE.Group(); f.position.set(0.05, 0, z); B.add(f)
    box(0.5, 0.1, 0.1, hoodie, 0.25, 0.66, 0, f)
    ball(0.05, skin, 0.52, 0.72, 0, f)
    hands.push(f)
  }

  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 1.0), new THREE.MeshBasicMaterial({ visible: false })); hitbox.position.set(0.1, 1.0, 0); R.add(hitbox) // alvo invisível: a mira acha ele de qualquer altura
  act(R, 'Falar com o Smoll', openTalk)
  blockers.push([17.4, 11.4, 19, 14.6])

  // ---- Smoll realista rigado (Hunyuan3D + esqueleto de 17 ossos, ver rig.ts e smollAnim.ts) ----
  const MX = 17.95, S = 1.75 / 1.99
  const M = new THREE.Group(); M.position.set(MX, 0, CZ); M.visible = false; scene.add(M)
  const hitM = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 1.0), new THREE.MeshBasicMaterial({ visible: false })); hitM.position.y = 1; M.add(hitM)
  const holder = new THREE.Group(); holder.rotation.y = Math.PI / 2; M.add(holder) // o modelo olha pra +z; a frente do grupo é +x
  let anim: ReturnType<typeof createAnim> | null = null
  let yawM = 0, chairYaw = 0, sitAmt = 0
  // onde o Smoll está: no PC, indo pra cama, se jogando nela, dormindo, levantando ou voltando pro PC
  type Mode = 'desk' | 'toBed' | 'falling' | 'sleep' | 'rise' | 'toDesk'
  let mode: Mode = 'desk', modeT = 0, wp: [number, number][] = []
  const zz = document.createElement('canvas'); zz.width = 128; zz.height = 128
  { const g = zz.getContext('2d')!; g.fillStyle = '#fff'; g.font = 'bold 60px sans-serif'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText('Z', 10, 60); g.font = 'bold 44px sans-serif'; g.fillText('z', 52, 90); g.font = 'bold 30px sans-serif'; g.fillText('z', 86, 110) }
  const zzS = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(zz), transparent: true, depthTest: false })); zzS.scale.set(0.6, 0.6, 1); zzS.visible = false; scene.add(zzS)
  new GLTFLoader().load('/models/smoll_real_hq.glb', (gltf) => {
    let src: THREE.Mesh | undefined
    gltf.scene.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh })
    if (!src) return
    src.geometry.computeVertexNormals() // o GLB do Hunyuan vem sem normais
    const rig = buildRig(src.geometry, new THREE.MeshLambertMaterial({ map: (src.material as THREE.MeshStandardMaterial).map }))
    const mw = new THREE.Group(); mw.scale.setScalar(S); mw.position.y = 0.999 * S; mw.add(rig.mesh); holder.add(mw)
    // caneca na mão direita (osso hR): só aparece quando ele bebe
    const mug = new THREE.Group()
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), lm(0xffffff)); const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.005, 12), lm(0x3a1f10))
    coffee.position.y = -0.05; mug.add(cup, coffee); mug.position.set(0, -0.1, 0.04); rig.bones[10].add(mug)
    anim = createAnim(rig, mug)
    M.visible = true; B.visible = false
    hitbox.visible = false; delete R.userData.act                            // o alvo agora é o modelo
    const gotoBed = () => { if (mode !== 'desk') return false; anim!.stand(true); mode = 'toBed'; wp = [[17.5, 12.2], [15.1, 12.2], [14.65, 13]]; return true }
    const wake = () => { if (mode !== 'sleep') return false; mode = 'rise'; modeT = 0; return true }
    act(M, () => (mode === 'sleep' ? 'Acordar o Smoll' : 'Falar com o Smoll'), () => (mode === 'sleep' ? wake() : openTalk()))
    state.cmd = (c) => {
      if (c === 'sleep') return mode === 'sleep' ? wake() : gotoBed()
      if (c === 'wake') return wake()
      if (mode !== 'desk') return false // ocupado (andando ou dormindo)
      if (c === 'stand') return anim!.toggleStand()
      if (c === 'sit') return anim!.stand(false)
      anim!.play(c as Clip)
    }
  }, undefined, () => console.warn('smoll_real_hq.glb não carregou, ficando com o Smoll de primitivas'))

  let acc = 0, yaw = 0
  return {
    update(dt: number, now: number, px: number, pz: number) {
      if (M.visible && anim) {
        const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
        const sm2 = (k: number) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k) }
        let walk = 0, lying = false
        const tx = px - MX, tz = pz - CZ, dist = Math.hypot(tx, tz)
        const toPlayer = Math.atan2(-tz, tx)
        if (mode === 'desk') {
          const t = dist < 3 ? toPlayer : 0 // dentro de 3 m o corpo (e a cadeira) gira pro jogador
          yawM += wrap(t - yawM) * Math.min(1, dt * 4)
          M.position.set(MX, 0, CZ); M.rotation.set(0, yawM, 0)
        } else {
          modeT += dt
          const goTo = ([gx, gz]: [number, number]) => { // anda em linha reta até o ponto, olhando pra onde vai
            const dx2 = gx - M.position.x, dz2 = gz - M.position.z, d = Math.hypot(dx2, dz2)
            if (d < 0.06) return true
            const sp = Math.min(d, 1.25 * dt); M.position.x += (dx2 / d) * sp; M.position.z += (dz2 / d) * sp
            yawM += wrap(Math.atan2(-dz2, dx2) - yawM) * Math.min(1, dt * 8); walk = 1
            return false
          }
          if (mode === 'toBed' || mode === 'toDesk') {
            if (wp.length && goTo(wp[0])) wp.shift()
            if (!wp.length) {
              if (mode === 'toBed') { mode = 'falling'; modeT = 0 }
              else { mode = 'desk'; anim.stand(false); yawM = 0 }
            }
            M.rotation.set(0, yawM, 0)
          } else if (mode === 'falling' || mode === 'rise') {
            // de costas pra cama, ele se joga de costas: gira o corpo em torno dos pés (z = 90°) e sobe até o colchão
            const l = mode === 'falling' ? sm2((modeT - 0.5) / 1.5) : 1 - sm2(modeT / 1.5)
            if (mode === 'falling' && modeT < 0.5) yawM += wrap(0 - yawM) * Math.min(1, dt * 8)
            M.rotation.set(0, l > 0 ? 0 : yawM, (l * Math.PI) / 2)
            M.position.set(14.65 - 0.5 * l, 0.84 * l, 13)
            lying = l > 0.25
            if (mode === 'falling' && modeT > 2.0) mode = 'sleep'
            if (mode === 'rise' && modeT > 1.5) { mode = 'toDesk'; wp = [[15.1, 12.2], [17.5, 12.2], [17.95, 13]]; yawM = 0; M.rotation.set(0, 0, 0); M.position.set(14.65, 0, 13) }
          } else { lying = true; M.rotation.set(0, 0, Math.PI / 2); M.position.set(14.15, 0.84, 13) } // dormindo
        }
        zzS.visible = mode === 'sleep'
        if (zzS.visible) zzS.position.set(13.3, 1.25 + 0.12 * Math.sin(now * 1.5), 13)
        let look = toPlayer - yawM; look = wrap(look)
        anim.loco.walk = walk; anim.loco.lying = lying
        anim.update(dt, now, look, dist < 5 && mode === 'desk', dist, Math.atan2((anim.standing ? 1.6 : 1.37) - state.eye, Math.max(dist, 0.5))) // pitch: cabeça do Smoll vs olhos do jogador
        state.smollStanding = anim.standing
        // cadeira acompanha o giro enquanto ele está sentado e recua quando ele levanta
        sitAmt += ((anim.standing ? 1 : 0) - sitAmt) * Math.min(1, dt * 2.5)
        if (sitAmt < 0.5) chairYaw = yawM
        const back = 0.05 + 0.85 * sitAmt
        R.position.set(MX - Math.cos(chairYaw) * back, 0, CZ + Math.sin(chairYaw) * back); R.rotation.y = chairYaw
        pc.update(now, dt)
        return
      }
      // fallback (modelo ainda carregando): gira a cadeira pro jogador quando ele chega perto, senão volta pro PC
      const dx = px - CX, dz = pz - CZ
      const target = Math.hypot(dx, dz) < 3 ? Math.atan2(-dz, dx) : 0
      let d = target - yaw; d = Math.atan2(Math.sin(d), Math.cos(d))
      yaw += d * Math.min(1, dt * 4); R.rotation.y = yaw
      const typing = Math.abs(yaw) < 0.3
      hands.forEach((h, i) => { h.rotation.z = typing ? Math.sin(now * 14 + i * 2) * 0.05 : 0 })
      pc.update(now, dt)
    },
  }
}
