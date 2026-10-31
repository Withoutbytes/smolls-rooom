import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { blockers } from './props'
import { buildPC } from './pc'
import { act, openTalk, dialog, getTarget } from './interact'
import { ITEMS, give, heldId } from './inventory'
import { state, toast, world, deskMissing, gameHour, pick, type Mood } from './state'
import { strum, breath, sheet } from './sfx'
import { tv } from './tv'
import { RED_SKEL, SHORTS_SKEL, buildRig, redPose } from './rig'
import { createAnim, type Clip, type BedPose, BED_POSES, CLIP_DUR, bedHeat , BED_ROLL } from './smollAnim'

// Smoll 3D de primitivas: cadeira gamer + ele sentado + mesa com 2 monitores. Frente do grupo = +x (virado pra parede leste).
const CX = 17.9, CZ = 13
// altura do grupo do Smoll quando está DEITADO: o centro do corpo fica 12 cm acima do colchão (0,66),
// que é a metade da espessura das costas — antes ficava 18 cm e ele flutuava na cama.
const LY_Y = 0.83
// Fase 4: som de cama (respiração de 3 em 3 s) e a coberta subindo/descendo suave
let bedSfxT = 2.5, cobertaK = 0, lastBedPose = ''
// rolagem do corpo em torno do próprio eixo (pose "de bruços"): vai no GRUPO pra ser rígida.
// Girar a bacia em π esticava braços e pernas (a junta muda de lado, o vértice não).
let bedRollK = 0
// A malha afunda no colchão em algumas poses (a "de quatro" ia 29 cm pra dentro). Em vez de acertar
// cada pose na mão, medimos o vértice mais baixo da malha e assentamos o grupo nele — vale pra
// qualquer pose nova e pra qualquer roupa.
// estado por instância (há mais de um Smoll na cena): y assentado, pose medida e frames restantes
const LIFTS = new WeakMap<THREE.Object3D, { y: number; pose: string; frames: number; last: number }>()
function liftFor(g: THREE.Object3D) {
  let o = LIFTS.get(g)
  if (!o) { o = { y: 0.83, pose: '', frames: 0, last: -1e9 }; LIFTS.set(g, o) }
  return o
}
const LOW_V = new THREE.Vector3()
function lowestY(root: THREE.Object3D): number {
  root.updateMatrixWorld(true)
  let min = 1e9
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isSkinnedMesh || !m.applyBoneTransform) return
    const pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i += 7) {
      LOW_V.fromBufferAttribute(pos as THREE.BufferAttribute, i); m.applyBoneTransform(i, LOW_V); LOW_V.applyMatrix4(m.matrixWorld)
      if (LOW_V.y < min) min = LOW_V.y
    }
  })
  return min
}
const ROLL_AX = new THREE.Vector3(1, 0, 0), ROLL_Q = new THREE.Quaternion()
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

  // ---- Smoll realista rigado (Hunyuan3D + esqueleto de 17 ossos, ver rig.ts e smollAnim.ts) ----
  const MX = 17.95, S = 1.75 / 1.99
  const M = new THREE.Group(); M.position.set(MX, 0, CZ); M.visible = false; scene.add(M)
  const hitM = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 1.0), new THREE.MeshBasicMaterial({ visible: false })); hitM.position.y = 1; M.add(hitM)
  const holder = new THREE.Group(); holder.rotation.y = Math.PI / 2; M.add(holder) // o modelo olha pra +z; a frente do grupo é +x
;(window as any).__smoll = M // debug: posição do Smoll
  let anim: ReturnType<typeof createAnim> | null = null
  let yawM = 0, chairYaw = 0, sitAmt = 0
  let outfitSync: (() => void) | null = null // reaplica a roupa (modo marionete: o anfitrião trocou)
  let wasPuppet = false, appliedN = -1
  let routeOut: ((to: string) => [number, number][]) | null = null // caminho do Smoll (definido quando o modelo carrega, usado no update)
  let idleTrip = 60 + Math.random() * 60                                                // próxima saída espontânea (s)
  let trips: { restock: (e: (typeof deskMissing)[number]) => boolean; start: (n: string) => boolean } | null = null
  let task: { to: string; face: number; clip: Clip; secs: number; run: () => void; done?: () => void; sit?: number; tick?: number } | null = null // tarefa em andamento (ver TASKS)
  // onde o Smoll está: no PC, indo pra cama, se jogando nela, dormindo, levantando ou voltando pro PC
  type Mode = 'desk' | 'toBed' | 'falling' | 'sleep' | 'rise' | 'toDesk' | 'goTask' | 'doTask'
  let mode: Mode = 'desk', modeT = 0, wp: [number, number][] = []
  const zz = document.createElement('canvas'); zz.width = 128; zz.height = 128
  { const g = zz.getContext('2d')!; g.fillStyle = '#fff'; g.font = 'bold 60px sans-serif'; g.shadowColor = '#000'; g.shadowBlur = 6; g.fillText('Z', 10, 60); g.font = 'bold 44px sans-serif'; g.fillText('z', 52, 90); g.font = 'bold 30px sans-serif'; g.fillText('z', 86, 110) }
  const zzS = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(zz), transparent: true, depthTest: false })); zzS.scale.set(0.6, 0.6, 1); zzS.visible = false; scene.add(zzS)
  new GLTFLoader().load('/models/smoll_real_hq.glb', (gltf) => {
    let src: THREE.Mesh | undefined
    gltf.scene.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh })
    if (!src) return
    src.geometry.computeVertexNormals() // o GLB do Hunyuan vem sem normais
    // calça ↔ bermuda: a calça está pintada na textura, então o shader troca a cor das pernas pela bermuda (coxa) e pela pele (canela) pela altura no corpo
    const mat = new THREE.MeshLambertMaterial({ map: (src.material as THREE.MeshStandardMaterial).map })
    const shorts = { value: 0 }
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uShorts = shorts
      sh.vertexShader = 'varying vec2 vB;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vB = position.xy;')
      sh.fragmentShader = 'varying vec2 vB;\nuniform float uShorts;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        if (uShorts > 0.5 && abs(vB.x) < 0.3 && vB.y < -0.17 && vB.y > -0.93) {
          vec3 skin = vec3(0.56, 0.34, 0.2), bermuda = vec3(0.1, 0.2, 0.36);
          float cloth = smoothstep(-0.66, -0.6, vB.y);
          diffuseColor.rgb = mix(skin, bermuda, cloth);
        }`)
    }
    const rig = buildRig(src.geometry, mat)
    const mw = new THREE.Group(); mw.scale.setScalar(S); mw.position.y = 0.999 * S; mw.add(rig.mesh); holder.add(mw)
    // caneca na mão direita (osso hR): só aparece quando ele bebe
    const mug = new THREE.Group()
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), lm(0xffffff)); const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.005, 12), lm(0x3a1f10))
    coffee.position.y = -0.05; mug.add(cup, coffee); mug.position.set(0, -0.1, 0.04); rig.bones[10].add(mug)
    // outras roupas: modelos 3D (Hunyuan3D) de bermuda+chinelo e de cueca vermelha. A pose vai pra todos os esqueletos; só um aparece. Sem o arquivo da bermuda, vale o efeito de tinta no jeans.
    type Outfit = { rig: ReturnType<typeof buildRig>; grp: THREE.Group }
    const outfits: Record<'shorts' | 'red', Outfit | null> = { shorts: null, red: null }
    const cur = () => (state.smollRed ? 'red' : state.smollShorts ? 'shorts' : 'jeans')
    const showOutfit = () => {
      const c = cur(); mw.visible = c === 'jeans'
      for (const k of ['shorts', 'red'] as const) { const o = outfits[k]; if (o) o.grp.visible = c === k }
      const o = c === 'jeans' ? null : outfits[c]; ;(o ? o.rig : rig).bones[10].add(mug)
      shorts.value = c === 'shorts' && !outfits.shorts ? 1 : 0
    }
    outfitSync = showOutfit
    for (const [k, file] of [['shorts', 'smoll_bermuda_hq'], ['red', 'smoll_skin_red_hq']] as const) new GLTFLoader().load(`/models/${file}.glb`, (g2) => {
      let s2: THREE.Mesh | undefined
      g2.scene.traverse((o) => { if (!s2 && (o as THREE.Mesh).isMesh) s2 = o as THREE.Mesh })
      if (!s2) return
      s2.geometry.computeVertexNormals()
      const r2 = buildRig(s2.geometry, new THREE.MeshLambertMaterial({ map: (s2.material as THREE.MeshStandardMaterial).map }), k === 'red' ? RED_SKEL : SHORTS_SKEL)
      const grp = new THREE.Group(); grp.scale.setScalar(S); grp.position.y = 0.999 * S; grp.add(r2.mesh); holder.add(grp)
      outfits[k] = { rig: r2, grp }; showOutfit()
    })
    anim = createAnim({ apply: (pose) => { rig.apply(pose); outfits.shorts?.rig.apply(pose); outfits.red?.rig.apply(redPose(pose)) } }, mug)
    M.visible = true; B.visible = false
    hitbox.visible = false; delete R.userData.act                            // o alvo agora é o modelo
    const gotoBed = () => { if (mode !== 'desk') return false; anim!.stand(true); mode = 'toBed'; wp = [[17.5, 12.2], [15.3, 12.2], [14.85, 13]]; return true }
    const wake = () => { if (mode !== 'sleep') return false; mode = 'rise'; modeT = 0; anim!.loco.pose = 'normal'; return true }
    const inBed = () => mode === 'sleep' || mode === 'falling'
    const bondBy = (d: number) => { state.smollBond = Math.max(0, Math.min(100, state.smollBond + d)) }
    // TOQUE: E curto fala, E SEGURADO (0,45 s) toca. A mão em 1ª pessoa sobe (inventory.ts) e ele reage pelo humor.
    const touchSmoll = () => {
      if (!anim) return
      state.touchAnim = 1
      anim.touch(inBed() ? 1 : 0.55)
      const m = state.smollMood
      if (m === 'irritado') { bondBy(-3); state.smollPatience = Math.max(0, state.smollPatience - 0.25); toast('Smoll: Ei. Não.', 3000); return }
      if (m === 'contido') { bondBy(-1); toast('Smoll: …devagar, tá?', 3000); return }
      bondBy(4)
      const lines = inBed()
        ? (m === 'entregue' ? ['Não para.', 'Fica com a mão aí. Um pouco mais.'] : m === 'provocando' ? ['Assim você não me deixa descansar, sabia?', 'Só isso? Achei que você tinha coragem de mais.'] : ['Hum. Tudo bem, continua.', 'Tocou. Tá me testando ou tá com frio?'])
        : (m === 'entregue' ? ['Pode encostar.', 'Eu não vou fugir.'] : ['Ei. Tá tudo bem?', 'Cuidado com o braço, ele trabalha muito.'])
      toast('Smoll: ' + pick(lines), 3600)
    }
    act(M, () => (mode === 'sleep' ? 'Acordar o Smoll · segure E p/ tocar' : mode === 'falling' ? 'Tocar no Smoll · segure E' : 'Falar com o Smoll · segure E p/ tocar'),
      () => (mode === 'sleep' ? wake() : openTalk()),
      (id, kind) => { // dar um item pro Smoll: agora ele ACEITA ou RECUSA pelo humor
        const n = ITEMS[id].name, m = state.smollMood
        if (mode === 'sleep') { toast('Ele tá dormindo. Zzz.'); return true }
        if (m === 'irritado') { toast(`Smoll: Agora não. Deixa aí. (${n})`); return true }
        if (m === 'contido' && Math.random() < 0.5) { anim!.play('shrug'); bondBy(-1); toast(`Smoll: …valeu. (${n})`); return 'consume' }
        if (kind === 'drink') { anim!.play('sip'); bondBy(2); toast(`Smoll: Valeu! Tava morrendo de sede. (${n})`); return 'consume' }
        if (kind === 'food') { anim!.play('thumbs'); bondBy(2); toast(`Smoll: Hmm, ${n}. Aceito, claro.`); return 'consume' }
        if (kind === 'wear') { anim!.play('facepalm'); bondBy(-2); toast(`Smoll: ISSO NÃO É MEU! Nunca vi ${n} na vida!`); return 'consume' }
        anim!.play('shrug'); toast(`Smoll: Pra que eu quero ${n}? Mas obrigado.`); return 'consume'
      }, { smoll: true, touch: touchSmoll })
    // troca de roupa: escurece a tela, troca (calça ↔ bermuda ↔ cueca vermelha) e clareia
    const changeClothes = (kind: 'shorts' | 'red') => {
      const f = document.getElementById('fade')!, now = kind === 'red' ? !state.smollRed : !(state.smollShorts && !state.smollRed)
      f.style.opacity = '1'
      setTimeout(() => {
        if (kind === 'red') state.smollRed = now; else { state.smollShorts = now; state.smollRed = false }
        showOutfit(); f.style.opacity = '0'
        toast(kind === 'red' ? (now ? 'Smoll voltou de calcinha vermelha. Ninguém pediu. 🩲' : 'Smoll se vestiu de novo. Graças a Deus.') : now ? 'Smoll voltou de bermuda. As pernas nunca viram o sol. 🩳' : 'Smoll voltou de calça jeans. Calor? Ele nem liga.')
      }, 1300)
      return now
    }
    // ---- tarefas: o Smoll anda por um grafo de pontos (portas e cômodos), faz a ação e volta pro PC pelo mesmo caminho ----
    const N: Record<string, [number, number]> = {
      desk: [17.5, 12.2], qin: [15.8, 11.8], qdoor: [15.5, 10.5], c15: [15.5, 8.5], c16: [16.5, 8.5], c10: [10.5, 8.5], c9: [9.5, 8.5], c4: [4.5, 8.5],
      kdoor: [16.5, 6.5], kin: [16.5, 5.2], fridge: [17.6, 1.6], sdoor: [10.5, 6.5], sin: [10.5, 5.0], tv: [11.95, 4.4], bdoor: [9.5, 10.5], bin: [9.5, 12.6], shower: [10.2, 13.8],
      g1: [15.0, 13.4], gtr: [13.4, 14.4], qsw: [16.45, 11.7], ssw: [9.0, 4.4],
      sofa: [10.5, 1.75], kw1: [15.2, 4.9], kw2: [15.2, 2.4], pia: [16.5, 2.1], fogao: [17.9, 4.95], mesa: [16.5, 2.6],
      odoor: [4.5, 6.5], oin: [4.5, 4.8], ofi: [5.8, 4.2],                                                          // oficina
      fdoor: [19.5, 8.5], q1: [21.5, 8.5], q2: [22.0, 11.8], horta: [23.0, 14.9], q3: [26.0, 11.6], churras: [26.4, 14.6], // quintal (pela porta da frente)
      vdoor: [3.5, 10.5], vin: [3.5, 12.0], vsit: [4.4, 12.6],                                                      // varanda
    }
    const E: [string, string][] = [['desk', 'qin'], ['qin', 'qdoor'], ['qdoor', 'c15'], ['c15', 'c16'], ['c15', 'c10'], ['c10', 'c9'], ['c9', 'c4'], ['c16', 'kdoor'], ['kdoor', 'kin'], ['kin', 'kw1'], ['kw1', 'kw2'], ['kw2', 'pia'], ['kw1', 'fogao'], ['fogao', 'fridge'], ['pia', 'mesa'],
      ['c10', 'sdoor'], ['sdoor', 'sin'], ['sin', 'tv'], ['sin', 'sofa'], ['sin', 'ssw'], ['c9', 'bdoor'], ['bdoor', 'bin'], ['bin', 'shower'], ['qin', 'g1'], ['g1', 'gtr'], ['qin', 'qsw'],
      ['c4', 'odoor'], ['odoor', 'oin'], ['oin', 'ofi'], ['c16', 'fdoor'], ['fdoor', 'q1'], ['q1', 'q2'], ['q2', 'horta'], ['q2', 'q3'], ['q3', 'churras'], ['c4', 'vdoor'], ['vdoor', 'vin'], ['vin', 'vsit']]
    const route = (to: string): [number, number][] => { // busca em largura no grafo
      const prev: Record<string, string> = { desk: '' }, q = ['desk']
      while (q.length) { const a = q.shift()!; for (const [x, y] of E) { const b = x === a ? y : y === a ? x : ''; if (b && !(b in prev)) { prev[b] = a; q.push(b) } } }
      const out: [number, number][] = []; for (let n = to; n; n = prev[n]) out.unshift(N[n]); return out
    }
    routeOut = route
    type Task = { to: string; face: number; clip: Clip; secs: number; run: () => void; done?: () => void; sit?: number; open?: boolean } // open: sai pela porta da frente (abre e fecha depois)
    const TASKS: Record<string, Task> = {
      tv: { to: 'tv', face: -Math.PI / 2, clip: 'point', secs: 2.5, run: () => { world.tv(); toast('Smoll mexeu na TV. 📺') } },
      luz: { to: 'ssw', face: Math.PI, clip: 'point', secs: 2, run: () => { world.luz.sala?.(); toast('Smoll apertou o interruptor da sala. 💡') } },
      vent: { to: 'qsw', face: Math.PI / 2, clip: 'point', secs: 2, run: () => { world.ventilador.quarto?.(); toast('Smoll mexeu no ventilador do quarto. 🌀') } },
      assistir: { to: 'sofa', face: -Math.PI / 2, clip: 'laugh', secs: 50, sit: 0.14, run: () => { anim!.stand(false); if (!tv.on) world.tv(); toast('Smoll sentou no sofá pra assistir TV com você. 📺🛋️') } },
      cafe: { to: 'pia', face: Math.PI / 2, clip: 'sip', secs: 7, run: () => world.cozinha.cafe() },
      louca: { to: 'pia', face: Math.PI / 2, clip: 'scratch', secs: 5, run: () => world.cozinha.louca() },
      cozinhar: { to: 'fogao', face: -Math.PI / 2, clip: 'point', secs: 5, run: () => world.cozinha.cozinhar() },
      comer: { to: 'mesa', face: -Math.PI / 2, clip: 'thumbs', secs: 5, run: () => toast('Smoll comeu em pé, na mesa, sem prato. Quem lava é depois. 🍽️') },
      almocar: { to: 'mesa', face: -Math.PI / 2, clip: 'thumbs', secs: 12, run: () => { toast('Smoll pegou prato, garfo e faca e sentou pra almoçar. 🍛'); world.cozinha.almocar() } },
      guardar: { to: 'fridge', face: 0, clip: 'point', secs: 4, run: () => world.cozinha.guardar() },
      agua: { to: 'pia', face: Math.PI / 2, clip: 'sip', secs: 3, run: () => toast('Smoll bebeu água do filtro. 💧') },
      banheiro: { to: 'bin', face: -Math.PI / 2, clip: 'stretch', secs: 5, run: () => toast('Smoll foi ao banheiro. 🚽') },
      kuat: { to: 'fridge', face: 0, clip: 'sip', secs: 3.6, run: () => toast('Smoll abriu a geladeira e pegou uma Kuat gelada. 🥤') },
      'kuat-voce': { to: 'fridge', face: 0, clip: 'sip', secs: 3.6, run: () => toast('Smoll pegou uma Kuat pra você. 🥤'), done: () => { if (give('kuat')) toast('Smoll jogou uma Kuat pra você! 🥤 (mochila)') } },
      violao: { to: 'gtr', face: Math.PI, clip: 'dance', secs: 6.5, run: () => { for (let i = 0; i < 5; i++) setTimeout(() => strum(0.1), i * 1200) } },
      banho: { to: 'shower', face: -Math.PI / 2, clip: 'stretch', secs: 7, run: () => { world.chuveiro(true); setTimeout(() => world.chuveiro(false), 6500); toast('Smoll entrou no banho. Cantando alto. 🚿') } },
      jogar: { to: 'sofa', face: -Math.PI / 2, clip: 'laugh', secs: 40, sit: 0.14, run: () => { anim!.stand(false); world.acao.jogar?.() } },
      consertar: { to: 'ofi', face: -Math.PI / 2, clip: 'point', secs: 5, run: () => world.acao.consertar?.() },
      regar: { to: 'horta', face: -Math.PI / 2, clip: 'point', secs: 7, open: true, run: () => world.acao.regar?.() },
      churrasco: { to: 'churras', face: -Math.PI / 2, clip: 'point', secs: 14, open: true, run: () => world.acao.churrasco?.(), done: () => world.acao.churrascoFim?.() },
      violaovaranda: { to: 'vsit', face: Math.PI, clip: 'dance', secs: 7, run: () => { toast('Smoll pegou o violão e sentou na varanda. 🎸'); for (let i = 0; i < 5; i++) setTimeout(() => strum(0.1), i * 1300) } },
    }
    // abre a geladeira / os armários da cozinha enquanto ele mexe neles (props.ts liga world.acao.geladeira e .armario)
    const openFor = (t: Task) => { const ms = t.secs * 1000 + 1500; if (t.to === 'fridge') (world.acao.geladeira as any)?.(ms); else if (['pia', 'mesa'].includes(t.to)) (world.acao.armario as any)?.(...N[t.to], ms) }
    const startTask = (name: string) => {
      const t = TASKS[name]; if (!t || mode !== 'desk') return false
      if (t.open) { state.doorOpen = true; setTimeout(() => (state.doorOpen = false), (t.secs + 35) * 1000) }
      anim!.stand(true); task = t; mode = 'goTask'; modeT = 0; wp = route(t.to).slice(1); return true
    }
    // repor a mesa: quando acaba energético ou café da mesa dele, vai buscar (geladeira / cafeteira) e coloca de volta
    const restock = (e: (typeof deskMissing)[number]) => {
      if (mode !== 'desk') return false
      const cafe = e.kind === 'cafe'
      anim!.stand(true); mode = 'goTask'; modeT = 0
      task = {
        to: cafe ? 'pia' : 'fridge', face: cafe ? Math.PI / 2 : 0, clip: 'sip', secs: 4,
        run: () => toast(cafe ? 'Smoll passou um café novo na cafeteira. ☕' : 'Smoll pegou um energético novo na geladeira. 🥫'),
        done: () => { e.restore(); toast(`Smoll colocou ${cafe ? 'o café' : 'o energético'} de volta na mesa dele. 🧃`) },
      }
      wp = route(task.to).slice(1); return true
    }
    trips = { restock, start: startTask }
    state.cmd = (c) => {
      if (!state.smollHost && state.smollRemote) { state.smollCmd(c); return true } // não sou o anfitrião: o pedido vai pra quem roda o Smoll
      if (c.startsWith('pose:')) { // poses na cama: deitado, pernas abertas, pernas pra cima, tesoura, ponte, fetal
        const p = c.slice(5) as BedPose
        if (!BED_POSES.includes(p)) return false
        if (mode === 'desk') { if (!gotoBed()) return false; anim!.loco.pose = p; return true } // ele vai até a cama e faz
        if (mode === 'toBed' || mode === 'falling' || mode === 'sleep') { anim!.loco.pose = p; return true }
        return false // ocupado: no meio de uma tarefa
      }
      if (c.startsWith('task:')) return startTask(c.slice(5))
      if (c === 'shorts' || c === 'red') return changeClothes(c)
      if (c === 'sleep') return mode === 'sleep' ? wake() : gotoBed()
      if (c === 'wake') return wake()
      if (mode !== 'desk') return false // ocupado (andando ou dormindo)
      if (c === 'stand') return anim!.toggleStand()
      if (c === 'sit') return anim!.stand(false)
      if (!(c in CLIP_DUR)) return false // comando desconhecido (também vem da rede)
      anim!.play(c as Clip)
    }
  }, undefined, () => console.warn('smoll_real_hq.glb não carregou, ficando com o Smoll de primitivas'))

  // ---- ele TOMA INICIATIVA: em vez de só esperar comando, de vez em quando ele puxa assunto.
  // É o outro lado da interação — sem isso o Smoll é um objeto que responde, não uma pessoa na sala.
  let nextTalk = 14 + Math.random() * 26, pendingReply = 0
  const smollTalk = (dt: number, dist: number) => {
    // se ele falou e você não abriu a conversa, ele sente
    if (pendingReply > 0 && (pendingReply -= dt) <= 0) { state.smollIgnored++; state.smollBond = Math.max(0, state.smollBond - 2); state.smollPatience = Math.max(0, state.smollPatience - 0.12) }
    if (!anim || dialog.open || state.editing || pendingReply > 0 || dist > 6) return
    if ((nextTalk -= dt) > 0) return
    nextTalk = 26 + Math.random() * 70
    const s = state.smollSees, m = state.smollMood, bd = mode === 'sleep' || mode === 'falling', h = s.hour
    let line = ''
    if (s.stare > 4 && bd) line = m === 'provocando' || m === 'entregue' ? pick(['… continua olhando. Eu não vou me mexer.', 'Você tá com uma cara de quem não veio só ver a cama.']) : pick(['Tem algo na minha cara?', 'Se for tirar foto, avisa antes.'])
    else if (s.stare > 5) line = pick(['Tô te vendo aí parado me encarando.', 'Ou fala comigo, ou desencana.'])
    else if (h < 5 || h >= 23) line = pick(['Essa hora acordado? Preocupante. Pra nós dois.', 'A casa fica boa de madrugada. Silenciosa, igual bug que não reproduz.'])
    else if (m === 'entregue') line = pick(['Você tá indo embora?', 'Fica mais um pouco.'])
    else if (m === 'irritado') line = pick(['…', 'hm.'])
    else if (m === 'provocando') line = pick(['Você vai ficar aí parado mesmo?', 'Tô com uma ideia. Mas você tem que chegar mais perto.'])
    else if (m === 'contido') line = pick(['Deixa.'])
    else if (bd) line = pick(['A cama tá boa hoje. Vem ver.', 'Sabe o que é engraçado? Eu vim descansar e continuo pensando em código.'])
    else if (s.held) line = pick(['O que você arrumou aí na mão?', 'Esse troço na sua mão não é meu, né.'])
    else line = pick(['Ei. Tá tudo bem aí?', 'Tô aqui. Faz tempo que ninguém aparece.', 'Sabia que essa casa tem 3 bugs que eu nunca consertei? Faço de propósito.'])
    pendingReply = 16
    state.smollSaidAt = performance.now()
    anim.play((m === 'provocando' || m === 'entregue') ? 'thumbs' : m === 'irritado' ? 'shrug' : pick(['wave', 'think', 'shrug'] as Clip[]))
    toast('Smoll: ' + line, 4600)
  }
  let acc = 0, yaw = 0
  return {
    update(dt: number, now: number, px: number, pz: number) {
      if (M.visible && anim) {
        const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
        const sm2 = (k: number) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k) }
        let walk = 0, lying = false
        const tx = px - MX, tz = pz - CZ, dist = Math.hypot(tx, tz)
        const toPlayer = Math.atan2(-tz, tx)
        const remote = !state.smollHost ? state.smollRemote : null // marionete: desenha o Smoll do anfitrião em vez de rodar a IA
        if (!remote && wasPuppet) { wasPuppet = false; anim.puppet = false; mode = 'desk'; task = null; wp = []; modeT = 0; anim.loco.bed = null } // virei anfitrião: recomeço do PC
        if (remote) {
          const r = remote, k = Math.min(1, dt * 12)
          if (!wasPuppet) { wasPuppet = true; anim.puppet = true; M.position.set(r.x, r.y, r.z); yawM = r.ry; appliedN = r.cn }
          M.position.x += (r.x - M.position.x) * k; M.position.y += (r.y - M.position.y) * k; M.position.z += (r.z - M.position.z) * k
          yawM += wrap(r.ry - yawM) * k; M.rotation.set(0, yawM, r.rz)
          const rrg = BED_ROLL[r.bp] ?? 0
          if (rrg && r.ly) M.quaternion.premultiply(ROLL_Q.setFromAxisAngle(ROLL_AX, rrg))
          mode = r.mode; walk = r.w; lying = !!r.ly; anim.loco.bed = r.bd; anim.loco.pose = r.bp
          if (r.bn !== undefined) state.smollBond += (r.bn - state.smollBond) * k // o humor viaja junto com o corpo
          if (!!r.st !== anim.standing) anim.stand(!!r.st)
          if (r.cn !== appliedN) { appliedN = r.cn; if (r.c) anim.play(r.c) }
          if (state.smollRed !== !!r.red || state.smollShorts !== !!r.sh) { state.smollRed = !!r.red; state.smollShorts = !!r.sh; outfitSync?.() }
        } else if (mode === 'desk') {
          if (trips && !dialog.open && !state.editing) { // rotina: repõe a mesa quando falta bebida e, de vez em quando, sai do quarto
            const tn = performance.now() / 1000, miss = deskMissing.find((e) => e.kind !== 'other' && tn - e.at > 10)
            if (miss && trips.restock(miss)) deskMissing.splice(deskMissing.indexOf(miss), 1)
            else if ((idleTrip -= dt) <= 0) { idleTrip = 70 + Math.random() * 110; trips.start(['kuat', 'cafe', 'comer', 'agua', 'banheiro', 'tv'][Math.floor(Math.random() * 6)]) }
          }
          const t = dist < ((window as any).__turnR ?? 3) ? toPlayer : 0 // __turnR: debug, 0 = o corpo não gira pro jogador (tirar print de lado) // dentro de 3 m o corpo (e a cadeira) gira pro jogador
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
          if (mode === 'goTask' || mode === 'doTask') {
            if (mode === 'goTask') {
              if (wp.length && goTo(wp[0])) wp.shift()
              if (!wp.length) { mode = 'doTask'; modeT = 0; openFor(task!); task!.run(); anim.play(task!.clip) }
            } else {
              yawM += wrap(task!.face - yawM) * Math.min(1, dt * 6)
              if (task!.sit !== undefined) { M.position.y = task!.sit; if ((task!.tick = (task!.tick ?? 5) + dt) > 5) { task!.tick = 0; anim.play((['laugh', 'thumbs', 'think'] as Clip[])[Math.floor(Math.random() * 3)]) } } // sentado no sofá: reage à TV de tempos em tempos
              if (modeT > task!.secs) { M.position.y = 0; const t = task!; wp = routeOut!(t.to).slice(0, -1).reverse().concat([[17.95, 13]]); task = null; mode = 'toDesk'; t.done?.() }
            }
            M.rotation.set(0, yawM, 0)
          } else if (mode === 'toBed' || mode === 'toDesk') {
            if (wp.length && goTo(wp[0])) wp.shift()
            if (!wp.length) {
              if (mode === 'toBed') { mode = 'falling'; modeT = 0; yawM = wrap(yawM) }
              else { mode = 'desk'; anim.stand(false); yawM = 0 }
            }
            M.rotation.set(0, yawM, 0)
          } else if (mode === 'falling' || mode === 'rise') {
            // vira de costas pra cama, senta na quina, deita pra trás (a bacia é o pivô: pernas sobem, ele escorrega pra cima do colchão) e fica de barriga pra cima
            // rise é o contrário. sit = 0 em pé → 1 sentado; lie = 0 sentado → 1 deitado
            const t = mode === 'falling' ? modeT : 6.2 - modeT
            let sit = 0, lie = 0, px = 14.85
            if (t < 0.9) yawM += wrap(0 - yawM) * Math.min(1, dt * 6)                          // dá meia-volta
            else if (t < 2.3) { sit = sm2((t - 0.9) / 1.4); px = 14.85 - 0.53 * sit }          // recua e senta na quina: a bacia na borda (x = 14,32) e as coxas pra fora do colchão, que acaba em x = 14,3
            else { sit = 1; px = 14.32; if (t > 2.9) lie = sm2((t - 2.9) / 3.3) }              // deita
            if (mode === 'rise') { yawM = 0 }
            // deitar: o tronco desce e as pernas sobem girando em torno da bacia, que fica na borda pra perna não cortar a quina da cama (colchão + cobertor, 0,67 m);
            // só no fim (pernas quase na horizontal, por cima do cobertor) ele escorrega pra trás até o travesseiro. ang = giro do corpo (0 sentado, 1 deitado)
            if (anim.loco.pose === 'edge') lie = 0 // "sentado na quina da cama": senta e FICA sentado
            const ang = lie < 0.45 ? 0.78 * sm2(lie / 0.45) : 0.78 + 0.22 * sm2((lie - 0.45) / 0.55)
            const th = ang * Math.PI / 2, yp = 0.75 + 0.02 * sit * (1 - ang)                  // altura da bacia no corpo
            const pxw = lie < 0.45 ? 14.32 - 0.2 * sm2(lie / 0.45) : 14.12 - 0.72 * sm2((lie - 0.45) / 0.55), pyw = LY_Y + 0.06 * Math.sin(Math.PI * lie) // bacia no mundo (sobe um pouco no meio: a perna passa por cima da quina)
            M.rotation.set(0, yawM, th)
            if (sit < 1) M.position.set(px, 0.07 * sit, 13); else M.position.set(pxw + Math.sin(th) * yp, pyw - Math.cos(th) * yp + (liftFor(M).y - LY_Y) * ang, 13)
            anim.loco.bed = { sit, lie: ang }; lying = false
            if (mode === 'falling' && modeT > 6.2) { mode = 'sleep'; anim.loco.bed = null }
            if (mode === 'rise' && modeT > 6.2) { mode = 'toDesk'; anim.loco.bed = null; wp = [[17.5, 12.2], [17.95, 13]]; yawM = 0; M.rotation.set(0, 0, 0); M.position.set(14.85, 0, 13) }
          } else if (anim.loco.pose === 'edge') { anim.loco.bed = null; M.rotation.set(0, 0, 0); M.position.set(14.32, 0.07, 13) } // sentado na quina
          else { lying = true; anim.loco.bed = null; M.rotation.set(0, 0, Math.PI / 2); M.position.set(14.15, liftFor(M).y, 13) } // dormindo
          // ---- rolagem do corpo (de bruços): no GRUPO, rígida ----
          const rollTarget = BED_ROLL[anim.loco.pose] ?? 0
          bedRollK += (rollTarget - bedRollK) * Math.min(1, dt * 3.2)
          if (bedRollK > 0.001) M.quaternion.premultiply(ROLL_Q.setFromAxisAngle(ROLL_AX, bedRollK))
          // ---- assenta a malha no colchão: algumas poses afundavam (a "de quatro", 29 cm) ----
          // a pose só é aplicada no anim.update() abaixo: aqui só marca, mede lá embaixo
          // mede por ~0,8 s: a pose entra em crossfade, então uma medida só pegaria o meio da transição
          const LF = liftFor(M)
          // mexe no rig: só re-mede quando a pose muda, e no máximo a cada 2 s
          const kBed = anim.loco.pose + (mode === 'sleep' ? ':s' : ':f')
          if (LF.pose !== kBed && now - LF.last > 2) { LF.pose = kBed; LF.frames = 45; LF.last = now }
        }
        zzS.visible = mode === 'sleep'
        if (zzS.visible) zzS.position.set(13.3, 1.25 + 0.12 * Math.sin(now * 1.5), 13)
        let look = toPlayer - yawM; look = wrap(look)
        anim.loco.walk = walk; anim.loco.lying = lying
        // ---- PERCEPÇÃO: o que ele sabe de você. É a fonte de todo o contexto dele (fala, humor, gesto) ----
        const bd = mode === 'sleep' || mode === 'falling'
        const sees = state.smollSees
        sees.dist = dist; sees.hour = gameHour(); sees.held = heldId()
        sees.seat = state.seat ? (state.seat.lie ? 'cama' : state.seat.key) : ''
        sees.seen = dist < 6.5 && Math.abs(look) < 1.15
        sees.stare = getTarget()?.smoll ? sees.stare + dt : 0 // há quanto tempo você está MIRANDO nele
        sees.near = dist < 2.4 || sees.stare > 0.15
        // vínculo: sobe com atenção de perto (bem mais rápido na cama), esfria devagar quando você some
        if (!remote) state.smollBond = Math.max(0, Math.min(100, state.smollBond + dt * (dist < 2.5 && !dialog.open ? (bd ? 0.9 + bedHeat(anim.loco.pose) : 0.15) : -0.03)))
        if (!remote) state.smollPatience = Math.min(1, state.smollPatience + dt * 0.02)
        const mood: Mood = state.smollPatience <= 0.001 ? 'irritado' : state.smollBond > 85 ? 'entregue' : state.smollBond > 60 ? 'provocando' : state.smollBond < 10 && state.smollIgnored >= 2 ? 'contido' : 'neutro'
        state.smollMood = mood; anim.loco.mood = mood
        // deitado o corpo está girado 90°: pra virar a cara pro seu lado o sinal do hy depende do lado da cama
        anim.loco.gaze = -Math.sign(pz - 13) || 0
        anim.loco.aside = state.seat?.lie ? Math.sign(state.seat.z - 13) : 0
        state.smollMode = mode; state.smollPose = anim.loco.pose
        // a cena "fecha" quando ele está na cama e você chega perto (FOV aplicado em main.ts)
        state.bedFocus += (((bd || mode === 'sleep' || mode === 'falling') && dist < 2.8 ? 1 : 0) - state.bedFocus) * Math.min(1, dt * 2.2)
        // ---- encenação (Fase 4) ----
        // coberta até a cintura só nas poses com as pernas esticadas: levantada, ela atravessaria o joelho
        const straight = anim.loco.pose === 'normal' || anim.loco.pose === 'edge'
        cobertaK += ((bd && straight ? 1 : 0) - cobertaK) * Math.min(1, dt * 1.6)
        world.coberta(cobertaK)
        world.camaLuz(bd ? 1 : 0)
        // respiração + lençol: volume cai com a distância (só o anfitrião toca, pra não duplicar o som)
        bedSfxT -= dt
        if (bedSfxT <= 0) {
          bedSfxT = 3 + Math.random() * 2.4
          if (bd && dist < 7) breath(0.055 * Math.max(0, 1 - dist / 7) * (anim.loco.pose === 'normal' || anim.loco.pose === 'curl' ? 1 : 0.5))
        }
        if (bd && state.smollPose !== lastBedPose) { lastBedPose = state.smollPose; if (dist < 8) sheet(0.06 * Math.max(0, 1 - dist / 8)) }
        smollTalk(dt, dist)
        anim.update(dt, now, look, dist < 5 && (mode === 'desk' || bd), dist, Math.atan2((anim.standing ? 1.6 : 1.37) - (state.py + state.eye), Math.max(dist, 0.5))) // pitch: cabeça do Smoll vs olhos do jogador
        // mede DEPOIS de aplicar a pose: assenta a malha no colchão (uma pose nova pode afundar)
        const LF2 = liftFor(M)
        if (LF2.frames > 0) { LF2.frames--; if (LF2.frames % 3 === 0) { const low = lowestY(M) - M.position.y; LF2.y = Math.max(LY_Y - 0.25, Math.min(LY_Y + 0.45, 0.664 - low)) } }
        state.smollStanding = anim.standing
        if (!remote) { // anfitrião: publica o estado pra os outros desenharem
          const q = (n: number) => Math.round(n * 1000) / 1000, b = anim.loco.bed
          state.smollOut = { x: q(M.position.x), y: q(M.position.y), z: q(M.position.z), ry: q(M.rotation.y), rz: q(M.rotation.z), w: walk, ly: lying ? 1 : 0, st: anim.standing ? 1 : 0, red: state.smollRed ? 1 : 0, sh: state.smollShorts ? 1 : 0, bd: b ? { sit: q(b.sit), lie: q(b.lie) } : null, bp: anim.loco.pose, c: anim.played.c, cn: anim.played.n, mode, bn: Math.round(state.smollBond * 10) / 10 }
        }
        // cadeira acompanha o giro enquanto ele está sentado e recua quando ele levanta
        sitAmt += ((anim.standing ? 1 : 0) - sitAmt) * Math.min(1, dt * 2.5)
        if (sitAmt < 0.5) chairYaw = yawM
        const back = 0.05 + 0.85 * sitAmt
        R.position.set(MX - back, 0, CZ); R.rotation.y = chairYaw // recua sempre pra longe da mesa (-x), não pra onde o Smoll olha
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
