import * as THREE from 'three'

// Esqueleto procedural de 17 ossos para a malha do Hunyuan3D (que vem sem rig), no método do aethercore:
// juntas medidas na malha (espaço nativo do GLB: y de -1 a 1, frente = +z, esquerda do personagem = +x),
// pesos por região (braços fora do tronco, pernas abaixo da virilha, tronco/cabeça por altura) e
// poses por direções: cada segmento do membro é apontado pra um vetor-alvo (aim), sem precisar de eixos de rotação.
export type V3 = [number, number, number]
export interface Limb { u: V3; f: V3; h: V3 }  // braço, antebraço, mão
export interface Pose {
  rx: number; ry: number; rz: number            // deslocamento da bacia (unidades nativas)
  lean: number; twist: number; side: number     // inclinação do tronco: frente, giro, lado
  hy: number; hp: number; hr: number            // cabeça: giro, pitch (+ olha pra baixo), roll
  L: Limb; R: Limb
  TL: V3; SL: V3; FL: V3; TR: V3; SR: V3; FR: V3 // coxa, canela, pé
}

const mir = (v: V3): V3 => [-v[0], v[1], v[2]]
// Medidas de uma malha: juntas do lado esquerdo (+x; o direito é o espelho), juntas do centro, escala dos raios e a zona da mão
export interface SkelSpec { name: string; JL: Record<string, V3>; core: Record<string, V3>; k: number; hand: [number, number, number, number, number, number] }
export const SMOLL_SKEL: SkelSpec = {
  name: 'smoll', k: 1, hand: [0.245, 0.27, 0.05, 0.2, -0.45, -0.3],  // hand = [x0, x1, yCima0, yCima1, yBaixo0, yBaixo1] da zona onde só o braço manda
  JL: {
    sh: [0.29, 0.50, 0.0], el: [0.355, 0.19, 0.01], wr: [0.35, -0.12, 0.03], ha: [0.34, -0.27, 0.04],
    hp: [0.15, -0.20, -0.03], kn: [0.17, -0.60, -0.05], an: [0.20, -0.93, -0.07], to: [0.21, -0.98, 0.12],
  },
  core: { hips: [0, -0.2, -0.01], spine: [0, -0.08, -0.01], chest: [0, 0.2, -0.01], neck: [0, 0.56, 0], head: [0, 0.64, 0.02] },
}
let J: Record<string, V3> = {}
let SEG: [string, string, string, number][] = []
let HAND: SkelSpec['hand'] = SMOLL_SKEL.hand
function defineSkeleton(sp: SkelSpec) {
  J = { ...sp.core }
  for (const [k, v] of Object.entries(sp.JL)) { J[k + 'L'] = v; J[k + 'R'] = mir(v) }
  HAND = sp.hand
  const c = sp.core, r = sp.k
  const col = (y: number, z = 0) => `0,${y},${z}`
  SEG = [ // [osso, início, fim, raio]; início/fim = nome de junta ou 'x,y,z'
    ['hips', col(c.hips[1] - 0.1), col(c.spine[1] + 0.03), 0.22 * r], ['spine', col(c.spine[1] + 0.03), col(c.chest[1] + 0.05), 0.24 * r], ['chest', col(c.chest[1] + 0.05), col(c.neck[1] - 0.04), 0.28 * r],
    ['neck', col(c.neck[1] - 0.04, 0.02), col(c.head[1] + 0.02, 0.02), 0.09 * r], ['head', col(c.head[1] + 0.02, 0.05), col(c.head[1] + 0.22, 0.05), 0.15 * r],
  ]
  for (const S of ['L', 'R']) {
    const hp = J['hp' + S], low = `${hp[0]},${hp[1] - 0.07},${hp[2]}` // coxa começa na virilha, não no quadril
    SEG.push(
      ['u' + S, 'sh' + S, 'el' + S, 0.07 * r], ['f' + S, 'el' + S, 'wr' + S, 0.06 * r], ['h' + S, 'wr' + S, 'ha' + S, 0.055 * r],
      ['t' + S, low, 'kn' + S, 0.12 * r], ['s' + S, 'kn' + S, 'an' + S, 0.09 * r], ['ft' + S, 'an' + S, 'to' + S, 0.09 * r],
    )
  }
}
const seg = (j: string): THREE.Vector3 => new THREE.Vector3(...(j.includes(',') ? (j.split(',').map(Number) as V3) : J[j]))
function withSkeleton<T>(sp: SkelSpec, fn: () => T): T { // usa o esqueleto `sp` só durante fn e volta pro anterior
  const prev = { J, SEG, HAND }
  defineSkeleton(sp)
  try { return fn() } finally { J = prev.J; SEG = prev.SEG; HAND = prev.HAND }
}
defineSkeleton(SMOLL_SKEL)

// [osso, pai, junta de origem, junta do fim (pra direção de repouso)]
const BONES: [string, string | null, string, string | null][] = [
  ['hips', null, 'hips', null], ['spine', 'hips', 'spine', null], ['chest', 'spine', 'chest', null], ['neck', 'chest', 'neck', null], ['head', 'neck', 'head', null],
  ['uL', 'chest', 'shL', 'elL'], ['fL', 'uL', 'elL', 'wrL'], ['hL', 'fL', 'wrL', 'haL'],
  ['uR', 'chest', 'shR', 'elR'], ['fR', 'uR', 'elR', 'wrR'], ['hR', 'fR', 'wrR', 'haR'],
  ['tL', 'hips', 'hpL', 'knL'], ['sL', 'tL', 'knL', 'anL'], ['ftL', 'sL', 'anL', 'toL'],
  ['tR', 'hips', 'hpR', 'knR'], ['sR', 'tR', 'knR', 'anR'], ['ftR', 'sR', 'anR', 'toR'],
]
const IDX: Record<string, number> = Object.fromEntries(BONES.map((b, i) => [b[0], i]))
const ramp = (v: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
const dirOf = (a: string, b: string): V3 => { const d = new THREE.Vector3(...J[b]).sub(new THREE.Vector3(...J[a])).normalize(); return [d.x, d.y, d.z] }

export const restPose = (sp?: SkelSpec): Pose => (sp ? withSkeleton(sp, () => restPose()) : {
  rx: 0, ry: 0, rz: 0, lean: 0, twist: 0, side: 0, hy: 0, hp: 0, hr: 0,
  L: { u: dirOf('shL', 'elL'), f: dirOf('elL', 'wrL'), h: dirOf('wrL', 'haL') },
  R: { u: dirOf('shR', 'elR'), f: dirOf('elR', 'wrR'), h: dirOf('wrR', 'haR') },
  TL: dirOf('hpL', 'knL'), SL: dirOf('knL', 'anL'), FL: dirOf('anL', 'toL'),
  TR: dirOf('hpR', 'knR'), SR: dirOf('knR', 'anR'), FR: dirOf('anR', 'toR'),
})

export function clonePose(p: Pose): Pose { return JSON.parse(JSON.stringify(p)) }
export function lerpPose(a: any, b: any, k: number) { // a é alterado em direção a b
  for (const key of Object.keys(a)) {
    if (typeof a[key] === 'number') a[key] += (b[key] - a[key]) * k
    else if (Array.isArray(a[key])) for (let i = 0; i < a[key].length; i++) a[key][i] += (b[key][i] - a[key][i]) * k
    else lerpPose(a[key], b[key], k)
  }
}

// Pesos por envelope: distância 3D do vértice até o segmento de cada osso, dividida pelo raio do osso
// (tronco largo, braço fino). Mistura suave onde a malha é colada (sovaco, virilha), sem corte seco que estica a pele.
function skinWeights(pos: THREE.BufferAttribute) {
  const n = pos.count
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4), w = new Float64Array(BONES.length), dn = new Float32Array(n) // dn = distância normalizada ao osso dominante
  const A = SEG.map((s) => seg(s[1])), B = SEG.map((s) => seg(s[2])), AB = SEG.map((_, i) => B[i].clone().sub(A[i])), L2 = AB.map((v) => v.lengthSq())
  const v = new THREE.Vector3(), q = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    const x = v.x, y = v.y, ax = Math.abs(x), S = x >= 0 ? 'L' : 'R'
    w.fill(0)
    for (let k = 0; k < SEG.length; k++) {
      const t = Math.min(1, Math.max(0, q.copy(v).sub(A[k]).dot(AB[k]) / L2[k]))
      const d = q.copy(A[k]).addScaledVector(AB[k], t).distanceTo(v) / SEG[k][3]
      w[IDX[SEG[k][0]]] = Math.exp(-2.2 * d * d)
    }
    // Mãos coladas na coxa: fora da perna (|x| > 0,25) e abaixo do cotovelo, o vértice segue SÓ o braço, senão a coxa puxa a pele da mão
    const gHand = ramp(ax, HAND[0], HAND[1]) * (1 - ramp(y, HAND[2], HAND[3])) * ramp(y, HAND[4], HAND[5]) // só na altura dos braços (os pés também ficam em |x| > 0,25)
    if (gHand > 0) {
      const ai = [IDX['u' + S], IDX['f' + S], IDX['h' + S]]
      const orig = Float64Array.from(w), st = orig.reduce((a2, b2) => a2 + b2, 0) || 1, sa = ai.reduce((a2, k) => a2 + orig[k], 0)
      for (let k = 0; k < w.length; k++) w[k] = (orig[k] / st) * (1 - gHand)
      for (const k of ai) w[k] += gHand * (sa > 1e-9 ? orig[k] / sa : k === ai[2] ? 1 : 0)
    }
    const top = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 4)
    dn[i] = Math.sqrt(-Math.log(Math.max(w[top[0]], 1e-9)) / 2.2)
    const sum = top.reduce((s, k) => s + w[k], 0) || 1
    top.forEach((k, j) => { idx[i * 4 + j] = k; wts[i * 4 + j] = w[k] / sum })
  }
  return { idx, wts, dn }
}

const wcache = new Map<string, ReturnType<typeof skinWeights>>() // pesos são caros (25 mil vértices): calcula uma vez por malha
export function buildRig(src: THREE.BufferGeometry, material: THREE.Material, spec: SkelSpec = SMOLL_SKEL) {
  return withSkeleton(spec, () => buildRigNow(src, material, spec))
}
function buildRigNow(src: THREE.BufferGeometry, material: THREE.Material, spec: SkelSpec) {
  const geo = src.clone()
  const ck = spec.name + src.uuid
  const { idx, wts } = wcache.get(ck) ?? (wcache.set(ck, skinWeights(geo.attributes.position as THREE.BufferAttribute)), wcache.get(ck)!)
  // Obs.: o braço do GLB é uma casca aberta colada ao tronco (sem a metade de dentro); por isso os gestos mantêm os braços
  // perto do corpo. Levantar o braço de lado revela a casca como uma 'asa'.
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4))
  const bones = BONES.map(([name, parent, joint]) => {
    const b = new THREE.Bone(); b.name = name
    const p = parent ? J[BONES.find((x) => x[0] === parent)![2]] : [0, 0, 0]
    b.position.set(J[joint][0] - p[0], J[joint][1] - p[1], J[joint][2] - p[2])
    return b
  })
  BONES.forEach(([, parent], i) => { if (parent) bones[IDX[parent]].add(bones[i]) })
  material.side = THREE.DoubleSide // o corte da membrana deixa um vão fino; sem isso dá pra ver através
  const mesh = new THREE.SkinnedMesh(geo, material)
  mesh.add(bones[0]); mesh.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones))
  mesh.frustumCulled = false
  mesh.raycast = () => {} // a mira usa a caixa invisível, a malha de 25 mil vértices é cara de testar

  const rest: Record<string, THREE.Vector3> = {}
  for (const [name, , joint, end] of BONES) if (end) { const d = dirOf(joint, end); rest[name] = new THREE.Vector3(...d) }
  const hipsRest = new THREE.Vector3(...J.hips)
  const wq: Record<string, THREE.Quaternion> = {}
  const e = (a: number, b: number, c: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a, b, c, 'YXZ'))
  const place = (name: string, parent: string, local: THREE.Quaternion) => { bones[IDX[name]].quaternion.copy(local); wq[name] = wq[parent].clone().multiply(local) }
  // aponta o osso pro vetor-alvo (mundo do modelo); torção mínima
  const aim = (name: string, parent: string, dir: V3) => {
    const delta = new THREE.Quaternion().setFromUnitVectors(rest[name], new THREE.Vector3(...dir).normalize())
    bones[IDX[name]].quaternion.copy(wq[parent].clone().invert().multiply(delta)); wq[name] = delta
  }

  return {
    mesh, bones,
    apply(p: Pose) {
      bones[0].position.copy(hipsRest).add(new THREE.Vector3(p.rx, p.ry, p.rz)); bones[0].quaternion.identity(); wq.hips = new THREE.Quaternion()
      place('spine', 'hips', e(p.lean * 0.5, p.twist * 0.5, p.side * 0.5))
      place('chest', 'spine', e(p.lean * 0.5, p.twist * 0.5, p.side * 0.5))
      place('neck', 'chest', e(p.hp * 0.3, p.hy * 0.3, p.hr * 0.3))
      place('head', 'neck', e(p.hp * 0.7, p.hy * 0.7, p.hr * 0.7))
      for (const S of ['L', 'R'] as const) {
        const A = p[S]
        aim('u' + S, 'chest', A.u); aim('f' + S, 'u' + S, A.f); aim('h' + S, 'f' + S, A.h)
        aim('t' + S, 'hips', p['T' + S as 'TL']); aim('s' + S, 't' + S, p['S' + S as 'SL']); aim('ft' + S, 's' + S, p['F' + S as 'FL'])
      }
    },
  }
}
