import * as THREE from 'three'
import { type Pose, type V3, type Limb, clonePose, lerpPose, restPose } from './rig'
import type { Mood } from './state'
import { walkPose } from './walk'

type Rig = { apply(p: Pose): void }
const REST = restPose()
const mx = (v: V3): V3 => [-v[0], v[1], v[2]]
const sm = (k: number) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k) }
const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const limb = (u: V3, f: V3, h: V3 = f): Limb => ({ u, f, h })
const mirror = (l: Limb): Limb => ({ u: mx(l.u), f: mx(l.f), h: mx(l.h) })

// sentado na cadeira digitando: bacia baixa (coxa na cadeira), tronco inclinado, mãos no teclado (esq.) e no mouse (dir.)
const SIT: Pose = {
  ...clonePose(REST), ry: -0.175, rz: -0.02, lean: 0.16, hp: 0.1, // ry: bacia na altura do assento (estofado a 0,38 m); com -0,264 as coxas afundavam 8 cm na cadeira
  L: limb([0.10, -0.88, 0.40], [-0.6, -0.28, 1], [-0.45, -0.55, 1]),
  R: limb([-0.10, -0.88, 0.40], [-0.25, -0.28, 1], [-0.2, -0.55, 1]),
  TL: [0.03, -0.22, 1], SL: [-0.03, -1, 0.05], FL: [0, -0.08, 1],   // joelhos juntos (antes abriam pros lados), canelas levemente pra dentro
  TR: [-0.03, -0.22, 1], SR: [0.03, -1, 0.05], FR: [0, -0.08, 1],
}
const STAND: Pose = clonePose(REST)
// deitado de costas: braço ao longo do corpo, cotovelo na cintura, ANTEBRAÇO DEITADO sobre o abdômen
// (o antebraço tem de cruzar a barriga na horizontal — antes ele apontava pra cima e as mãos ficavam 44 cm no ar)
const LYING: Pose = {
  ...clonePose(REST), ry: -0.02, hp: -0.08,
  L: limb([0.10, -0.96, -0.26], [-0.83, -0.12, 0.55], [-0.82, -0.15, 0.55]),
  R: limb([-0.10, -0.96, -0.26], [0.83, -0.12, 0.55], [0.82, -0.15, 0.55]),
}

// sentado na quina da cama (pés quase no chão, mãos nos joelhos); bedPose mistura em pé → sentado (sit) → deitado (lie)
const SIT_EDGE: Pose = {
  ...clonePose(REST), ry: 0.023, lean: 0.12, hp: 0.08, // bacia na altura da cama (colchão a 0,67 m): a cama é alta, ele senta na quina com as pernas pendendo
  L: limb([0.12, -0.95, 0.2], [0.1, -0.6, 0.8], [0.1, -0.3, 0.9]), R: limb([-0.12, -0.95, 0.2], [-0.1, -0.6, 0.8], [-0.1, -0.3, 0.9]),
  TL: [0.05, -0.8, 0.6], SL: [0.02, -1, -0.05], FL: [0, -0.1, 1],
  TR: [-0.05, -0.8, 0.6], SR: [-0.02, -1, -0.05], FR: [0, -0.1, 1],
}
// ---- poses na cama ----
// Vetores no espaço local do modelo: +y é o eixo do corpo (pra cabeça), -y pros pés,
// +x = esquerda do personagem, +z = frente. Deitado, o grupo M está girado 90° em z, então +z local vira
// "pra cima" no mundo e -y local é o comprimento da cama (pros pés). O colchão fica em z ≈ -0,18 local.
// Com roll: π/2 = de lado (o +x local vira "pra baixo"); π = prona (o +z local vira "pra baixo").
// ptilt/pitch da bacia e arch/curvatura do tórax: ver Pose em rig.ts.
export type BedPose = 'normal' | 'spread' | 'legsUp' | 'scissors' | 'bridge' | 'quatro' | 'curl' | 'side' | 'junto' | 'edge'
const nrm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l] }
const bedOf = (o: Partial<Pose>): Pose => ({ ...clonePose(LYING), ...o })
// cada pose é uma LYING com as pernas (e às vezes a bacia) mudadas. alvo = direção de cada segmento.
// ---- direções em coordenadas de MUNDO ----
// A malha é girada 90° dentro do grupo M (Rz) e o grupo holder outros 90° (Ry), então:
//   mundo x ← -mesh y   ·   mundo y ← mesh z   ·   mundo z ← -mesh x
// W(x,y,z) recebe a direção como você a vê na cena — x = pros pés, y = pra cima, z = pro lado do
// personagem — e devolve o vetor da malha. Sem isso é impossível acertar altura de joelho e de mão.
const W = (x: number, y: number, z: number): V3 => nrm([-z, -x, y])
// espelha no plano sagital do corpo (mesh x → -x, quer dizer mundo z → -z): a mesma pose serve pro
// jogador que deitou do lado direito ou do esquerdo da cama.
export function mirrorX(p: Pose): Pose {
  const q = clonePose(p)
  q.rx = -q.rx; q.roll = -q.roll; q.side = -q.side; q.twist = -q.twist; q.hy = -q.hy; q.hr = -q.hr
  for (const S of ['L', 'R'] as const) for (const j of ['u', 'f', 'h'] as const) q[S][j] = [-q[S][j][0], q[S][j][1], q[S][j][2]] as V3
  for (const k of ['TL', 'SL', 'FL', 'TR', 'SR', 'FR'] as const) q[k] = [-q[k][0], q[k][1], q[k][2]]
  return q
}
const MIR = (v: V3): V3 => [-v[0], v[1], v[2]]
// Q é W para poses em que o CORPO INTEIRO rola 180° em torno do próprio eixo (de bruços). A rolagem é
// aplicada no grupo M (rígida). Como ela vem DEPOIS, a direção que você escreve é a de antes do giro:
// por isso o y e o z vão invertidos e a leitura continua sendo "pra cima / pro lado" na cena final.
const Q = (x: number, y: number, z: number): V3 => W(x, -y, -z)
// rolagem do corpo por pose (aplicada no grupo, ver smoll.ts). Girar o OSSO da bacia em π move as juntas
// de ombro e quadril pro outro lado enquanto os vértices, presos por peso, ficam onde estavam: o membro
// sai esticado e a textura escorre. No grupo, o corpo gira inteiro e nada deforma.
export const BED_ROLL: Partial<Record<BedPose, number>> = { quatro: Math.PI }
// braço (o direito recebe o espelho) e as duas pernas de uma vez
const armLR = (u: V3, f: V3, h: V3 = f) => ({ L: limb(u, f, h), R: limb(MIR(u), MIR(f), MIR(h)) })
const legsLR = (tl: V3, sl: V3, fl: V3) => ({ TL: tl, SL: sl, FL: fl, TR: MIR(tl), SR: MIR(sl), FR: MIR(fl) })
// Cada pose é uma LYING com quadril (ptilt), coluna (arch), cabeça, braços E pernas mudados.
// Regras: 2 contatos com o colchão · curva em S (ptilt e arch) · assimetria intencional · as mãos com um
// trabalho · a cabeça viva · braço só em FLEXÃO (abdução > ~50° mostra a casca aberta do GLB como "asa").
// O colchão está em 0,66 m: deitado o quadril fica a ~11 cm dele, o ombro a ~13 e a cabeça a ~14.
const BED: Record<BedPose, Pose> = {
  normal: bedOf({
    // pé apoiado no calcanhar (dedos pra cima): o GLB tem 10 cm de pé abaixo do tornozelo e afundava 3 cm
  ...legsLR(W(1, -0.13, 0.10), W(1, 0.0, 0.02), W(1, 0.14, 0.30)),
    ...armLR(W(0.96, -0.26, -0.10), W(-0.10, 0.55, 0.83)), hy: 0.30, hp: -0.06,
  }),
  // pernas abertas: joelhos dobrados pra CIMA e pros lados, pés apoiados, quadril empinado.
  // mão esquerda na barriga, direita aberta no colchão (assimetria: não é boneco simétrico)
  spread: bedOf({
    ptilt: 0.10, arch: -0.20, rz: 0.01, hy: 0.52, hp: -0.10,
    ...legsLR(W(0.55, 0.45, -0.70), W(0.32, -0.80, -0.48), W(1, 0.15, 0.30)),
    L: limb(W(0.96, -0.10, -0.10), W(-0.10, 0.60, 0.80), W(-0.10, 0.62, 0.78)),
    R: limb(W(0.90, 0.00, 0.35), W(0.90, 0.05, 0.35), W(0.88, 0.08, 0.38)),
  }),
  // pernas pro alto, ASSIMÉTRICAS: a esquerda esticada na vertical, a direita dobrada com o pé no colchão
  legsUp: bedOf({
    ptilt: 0.08, arch: -0.16, rz: 0.04, hy: 0.26, hp: -0.08,
    TL: W(0.20, 0.96, -0.18), SL: W(0.12, 0.98, -0.14), FL: W(0.10, 0.95, -0.30),
    TR: W(0.55, 0.45, 0.55), SR: W(0.20, -0.90, 0.39), FR: W(1, 0.20, 0.35),
    L: limb(W(0.96, -0.12, 0.10), W(-0.12, 0.58, 0.81), W(-0.12, 0.60, 0.79)),
    R: limb(W(0.85, -0.05, 0.35), W(0.90, 0.00, 0.30), W(0.88, 0.05, 0.33)),
  }),
  // tesoura: as duas pernas no ar com as canelas cruzadas de verdade; uma mão segurando o lençol
  scissors: bedOf({
    ptilt: 0.08, arch: -0.18, rz: 0.03, hy: 0.28, hp: -0.10,
    TL: W(0.12, 0.97, 0.16), SL: W(0.05, 0.55, 0.83), FL: W(0.05, 0.45, 0.89),
    TR: W(0.12, 0.95, 0.20), SR: W(0.05, 0.55, 0.83), FR: W(0.05, 0.45, 0.89),
    L: limb(W(0.90, -0.02, 0.30), W(0.92, 0.02, 0.30), W(0.90, 0.05, 0.33)),
    R: limb(W(0.96, -0.10, 0.0), W(-0.10, 0.58, 0.81), W(-0.10, 0.60, 0.79)),
  }),
  // ponte: bacia no alto, pés e ombros apoiados, tronco arqueado, mãos abertas ao lado do quadril
  bridge: bedOf({
    rz: 0.30, ptilt: -0.30, lean: -0.50, arch: 0.30, hp: -1.60,
    ...legsLR(W(0.9, -0.12, 0.18), W(0.15, -0.97, 0.06), W(1, 0.12, 0.20)),
    ...armLR(W(0.95, -0.30, 0.18), W(0.9, -0.35, 0.22)),
  }),
  // de quatro: joelhos e MÃOS no colchão, bunda alta, peito baixo, cabeça erguida olhando você.
  // O roll π gira o TRONCO (barriga pra baixo), mas a direção dos membros é absoluta: mão e joelho
  // continuam apontando pra BAIXO (W com y negativo).
  quatro: bedOf({
    rz: -0.36, ptilt: 0.30, lean: -0.10, arch: 0.10, hp: -0.42,
    // coxa a 45° (a 0,28 m de altura o joelho cai EXATO no colchão; a 97% ele afundava 11 cm)
    TL: Q(0.42, -0.90, -0.07), SL: Q(0.97, 0.02, -0.04), FL: Q(0.88, 0.06, 0.0),
    TR: Q(0.42, -0.90, 0.07), SR: Q(0.97, 0.02, 0.04), FR: Q(0.88, 0.06, 0.0),
    // braços abertos na altura do travesseiro, cotovelo cedendo: as mãos encostam no colchão
    L: limb(Q(-0.90, 0.18, -0.26), Q(-0.74, -0.30, -0.30), Q(-0.76, -0.28, -0.28)),
    R: limb(Q(-0.90, 0.18, 0.26), Q(-0.74, -0.30, 0.30), Q(-0.76, -0.28, 0.28)),
  }),
  // fetal de verdade: corpo DE LADO (roll π/2 = lado esquerdo pra baixo), joelhos na direção do peito,
  // braço de baixo esticado sob a cabeça e o de cima abraçando a perna
  curl: bedOf({
    roll: Math.PI / 2, ptilt: 0.14, arch: 0.22, hy: 0.12, hp: 0.24,
    TL: W(-0.55, 0.60, 0.20), SL: W(0.88, -0.42, 0.10), FL: W(0.92, -0.30, 0.15),
    TR: W(-0.62, 0.68, -0.10), SR: W(0.86, -0.48, -0.12), FR: W(0.90, -0.35, -0.15),
    L: limb(W(-0.75, 0.55, 0.15), W(0.55, 0.45, 0.55), W(0.55, 0.42, 0.58)),
    R: limb(W(-0.55, 0.70, -0.20), W(0.70, -0.30, -0.30), W(0.72, -0.32, -0.30)),
  }),
  // de lado te encarando: cotovelo no colchão, cabeça na mão, quadril à mostra, joelho de cima à frente
  side: bedOf({
    roll: Math.PI / 2, ptilt: 0.26, arch: 0.26, hp: -0.14, hy: -0.16, hr: 0.14,
    TL: W(-0.25, 0.30, 0.30), SL: W(0.75, -0.55, 0.25), FL: W(0.85, -0.40, 0.25),
    TR: W(0.15, 0.20, -0.35), SR: W(0.80, -0.50, -0.20), FR: W(0.88, -0.35, -0.20),
    L: limb(W(0.55, 0.20, 0.30), W(-0.20, 0.85, 0.30), W(-0.22, 0.88, 0.28)),
    R: limb(W(0.95, -0.20, 0.10), W(-0.10, 0.15, 0.95), W(-0.10, 0.18, 0.94)),
  }),
  // junto: colado em você, cabeça no seu ombro, a mão procurando o seu peito
  junto: bedOf({
    roll: Math.PI / 2, ptilt: 0.20, arch: 0.30, hp: -0.28, hy: -0.26, hr: 0.22,
    TL: W(-0.20, 0.26, 0.30), SL: W(0.80, -0.50, 0.22), FL: W(0.88, -0.36, 0.22),
    TR: W(-0.10, 0.10, 0.35), SR: W(0.85, -0.48, 0.25), FR: W(0.90, -0.32, 0.25),
    L: limb(W(0.60, 0.10, 0.35), W(-0.05, 0.75, 0.45), W(-0.05, 0.78, 0.42)),
    R: limb(W(0.85, -0.05, 0.35), W(0.10, 0.55, 0.80), W(0.10, 0.58, 0.78)),
  }),
  // sentado na quina da cama, pés quase no chão (a transição não deixa deitar: ver bedPose)
  edge: clonePose(SIT_EDGE),
}
export const BED_POSES = Object.keys(BED) as BedPose[]
// aside: de que lado da cama o JOGADOR deitou (-1 = lado de z menor, +1 = lado de z maior, 0 = sozinho).
// As poses de lado (curl/side/junto) são espelhadas por isso — senão ele fica de costas pra você.
export function bedPose(sit: number, lie: number, pose: BedPose = 'normal', aside = 0): Pose {
  const p = clonePose(STAND)
  lerpPose(p, SIT_EDGE, sit)
  const l2 = pose === 'edge' ? 0 : lie // "sentado na quina": não deita
  lerpPose(p, LYING, l2)
  if (l2 > 0.05) {
    const bed = aside > 0 && BED[pose].roll ? mirrorX(BED[pose]) : BED[pose]
    lerpPose(p, bed, Math.min(1, l2)) // só quando já deitado
  }
  return p
}

// ---- humor: o mesmo corpo com ritmos diferentes. É o que faz a cama parecer viva em vez de congelada ----
const HEAT: Record<BedPose, number> = { normal: 0, spread: 0.6, legsUp: 0.5, scissors: 0.55, bridge: 0.35, quatro: 0.8, curl: 0.1, side: 0.7, junto: 0.95, edge: 0.35 }
export const bedHeat = (p: BedPose) => HEAT[p] ?? 0
// micro-animação da cama: respiração (que acelera com o calor), quadril rolando, tremor de perna,
// mão que desliza pela barriga e cabeça sempre viva. Tudo em cima da pose, nada substitui a pose.
export function bedMod(p: Pose, t: number, pose: BedPose, mood: Mood) {
  const heat = HEAT[pose] ?? 0
  const entregue = mood === 'entregue' ? 1 : 0, irritado = mood === 'irritado' ? 1 : 0, contido = mood === 'contido' ? 1 : 0
  const rate = 0.9 + heat * 0.7 + entregue * 0.8 - contido * 0.25 // Hz
  const br = Math.sin(t * rate * Math.PI * 2)
  p.arch += br * (0.012 + heat * 0.022) * (1 - irritado * 0.5)
  p.rz += br * (0.003 + heat * 0.006)
  p.hy += Math.sin(t * 0.29) * 0.06 - irritado * 0.25
  p.hp += Math.sin(t * 0.61) * 0.02 + contido * 0.10
  p.hr += Math.sin(t * 0.37) * 0.05 + contido * 0.10
  const tr = Math.sin(t * 17) * 0.005 * heat // tremor de perna
  p.SL[2] += tr; p.FL[2] += tr; p.SR[2] -= tr; p.FR[2] -= tr
  p.L.f[0] += Math.sin(t * 0.23) * 0.04 * heat // mão deslizando
  p.R.f[0] -= Math.sin(t * 0.23 + 1.1) * 0.04 * heat
  p.rz += Math.sin(t * 0.17) * 0.008 * heat // se ajeitando
  p.ry += Math.sin(t * 0.13) * 0.006 * heat
}

export type Clip = 'sip' | 'wave' | 'laugh' | 'point' | 'think' | 'shrug' | 'facepalm' | 'stretch' | 'dance' | 'thumbs' | 'scratch'
const DUR: Record<Clip, number> = { sip: 3.2, wave: 2.6, laugh: 3.2, point: 2.6, think: 3.4, shrug: 2, facepalm: 2.4, stretch: 3.2, dance: 7, thumbs: 2.2, scratch: 2.6 }
const NEEDS_STAND: Clip[] = ['dance']

// modifica a pose base durante o clipe (t em segundos). R = braço direito do personagem (x negativo)
function clipMod(c: Clip, t: number, p: Pose, standing: boolean) {
  const d = DUR[c], k = sm(Math.min(t / 0.45, (d - t) / 0.45, 1)) // entra e sai suave
  const R = p.R, L = p.L
  switch (c) {
    case 'sip': { // pega a caneca e bebe
      R.u = mix(R.u, [-0.15, -0.7, 0.65], k); R.f = mix(R.f, [0.3, 0.8, 0.5], k); R.h = mix(R.h, [0.3, 0.9, 0.3], k); p.hp -= 0.18 * k; break
    }
    case 'wave': { // tchau com a mão direita
      R.u = mix(R.u, [-0.3, -0.75, 0.55], k); R.f = mix(R.f, [-0.2 + Math.sin(t * 9) * 0.5, 0.95, 0.25], k); R.h = R.f; p.hy += 0.15 * k; p.hr += 0.05 * k; break
    }
    case 'laugh': { // gargalhada: tronco balançando, cabeça pra trás, mãos na barriga
      const s = Math.sin(t * 14)
      p.lean += (-0.1 + s * 0.12) * k; p.hp -= 0.3 * k; p.ry += Math.abs(s) * 0.01 * k
      L.u = mix(L.u, [0.15, -0.9, 0.3], k); L.f = mix(L.f, [-0.8, -0.3, 0.5], k); R.u = mix(R.u, [-0.15, -0.9, 0.3], k); R.f = mix(R.f, [0.8, -0.3, 0.5], k); break
    }
    case 'point': { // aponta pra tela
      R.u = mix(R.u, [-0.25, -0.2, 0.95], k); R.f = mix(R.f, [-0.1, 0.0, 1], k); R.h = R.f; p.hy -= 0.25 * k; break
    }
    case 'think': { // mão no queixo, cabeça inclinada
      R.u = mix(R.u, [-0.2, -0.8, 0.5], k); R.f = mix(R.f, [0.15, 0.9, 0.45], k); R.h = R.f; p.hr += 0.18 * k; p.hy += Math.sin(t * 1.5) * 0.1 * k; p.hp += 0.1 * k; break
    }
    case 'shrug': { // ombros, palmas pra cima
      L.u = mix(L.u, [0.3, -0.85, 0.3], k); R.u = mix(R.u, [-0.3, -0.85, 0.3], k)
      L.f = mix(L.f, [0.3, 0.2, 0.9], k); R.f = mix(R.f, [-0.3, 0.2, 0.9], k); p.hr += 0.1 * k; p.hp -= 0.1 * k; break
    }
    case 'facepalm': {
      R.u = mix(R.u, [-0.3, -0.4, 0.8], k); R.f = mix(R.f, [0.3, 0.9, 0.3], k); R.h = R.f; p.hp += 0.3 * k; p.lean += 0.1 * k; break
    }
    case 'stretch': { // espreguiçar com os braços pra cima
      L.u = mix(L.u, [0.12, -0.15, 1], k); R.u = mix(R.u, [-0.12, -0.15, 1], k); L.f = mix(L.f, [-0.45, 0.1, 1], k); R.f = mix(R.f, [0.45, 0.1, 1], k); L.h = L.f; R.h = R.f
      p.lean -= 0.18 * k; p.hp -= 0.3 * k; break
    }
    case 'scratch': { // coça a cabeça
      R.u = mix(R.u, [-0.25, -0.5, 0.75], k); R.f = mix(R.f, [0.35 + Math.sin(t * 14) * 0.15, 0.95, 0.3], k); R.h = R.f; p.hr += 0.1 * k; break
    }
    case 'thumbs': { // joinha
      R.u = mix(R.u, [-0.3, 0.1, 0.95], k); R.f = mix(R.f, [0, 0.95, 0.3], k); R.h = R.f; p.hp -= 0.05 * k; break
    }
    case 'dance': { // dancinha em pé
      const s = Math.sin(t * 6), co = Math.cos(t * 6)
      p.ry -= Math.abs(s) * 0.04 * k; p.rx += s * 0.05 * k; p.lean += 0.05 * co * k; p.side += s * 0.1 * k; p.hr += s * 0.12 * k
      L.u = mix(L.u, [0.3, -0.75 + 0.35 * s, 0.45], k); R.u = mix(R.u, [-0.3, -0.75 - 0.35 * s, 0.45], k)
      L.f = mix(L.f, [-0.1, 0.8 + 0.3 * s, 0.6], k); R.f = mix(R.f, [0.1, 0.8 - 0.3 * s, 0.6], k); L.h = L.f; R.h = R.f
      p.TL = mix(p.TL, [0.15, -0.9, 0.25 * s], k); p.TR = mix(p.TR, [-0.15, -0.9, -0.25 * s], k)
      p.SL = mix(p.SL, [0, -1, -0.1 + 0.3 * Math.max(0, s)], k); p.SR = mix(p.SR, [0, -1, -0.1 + 0.3 * Math.max(0, -s)], k); break
    }
  }
  void standing
}

// poses isoladas de cada ação, sem lerp nem locomoção — é o que tools/act-icons.html usa pra
// renderar as thumbnails do menu. t = meio do clipe, onde o gesto tá mais "legível"
export const POSES = { stand: clonePose(STAND), sit: clonePose(SIT) }
export const CLIP_DUR = DUR
export const clipPose = (c: Clip, t = DUR[c] / 2, standing = true): Pose => {
  const p = clonePose(standing ? STAND : SIT); clipMod(c, t, p, standing); return p
}

export function createAnim(rig: Rig, mug: THREE.Object3D) {
  let standing = false, clip: Clip | null = null, clipT = 0, pending: Clip | null = null, pendingAt = 0, idleT = 5, away = 0, touchT = 0
  const cur = clonePose(SIT)
  let walkPhase = 0
  mug.visible = false
  const api = {
    /** controlado pelo smoll.ts: andando até a cama/PC ou deitado. pose = a pose na cama */
    puppet: false, // true = só desenha o que o anfitrião manda: sem gestos aleatórios nem sentar sozinho
    played: { n: 0, c: '' as Clip | '' }, // contador de gestos (vai pros outros jogadores)
    loco: { walk: 0, lying: false, pose: 'normal' as BedPose, bed: null as null | { sit: number; lie: number }, aside: 0, mood: 'neutro' as Mood, gaze: 0, heat: 0 },
    /** reação a toque: 1 = cheio (na cama), 0.5 = em pé. Decai em ~1,2 s. */
    touch(k = 1) { touchT = Math.min(1.4, k * 1.2) },
    get standing() { return standing },
    stand(on: boolean) { standing = on; clip = null },
    play(c: Clip) {
      api.played.n++; api.played.c = c
      if (NEEDS_STAND.includes(c) && !standing) { standing = true; pending = c; pendingAt = 1.2; return }
      clip = c; clipT = 0
    },
    toggleStand() { api.stand(!standing); return standing },
    /** look = ângulo (rad) do jogador relativo à frente do corpo; near = jogador perto */
    update(dt: number, t: number, look: number, near: boolean, dist: number, lookPitch = 0) {
      if (pending && (pendingAt -= dt) <= 0) { clip = pending; clipT = 0; pending = null }
      if (clip && (clipT += dt) > DUR[clip]) clip = null
      // levanta/senta sozinho: se ficar em pé e o jogador sumir, ele volta pro PC
      const busy = api.loco.lying || !!api.loco.bed || api.loco.walk > 0.02
      away = !api.puppet && standing && dist > 6 && !busy ? away + dt : 0
      if (away > 6) { standing = false; away = 0 }
      // gestos aleatórios enquanto ninguém está falando com ele
      if (!api.puppet && !busy && !clip && !pending && !standing && (idleT -= dt) <= 0) {
        idleT = 7 + Math.random() * 8
        api.play((['sip', 'think', 'stretch', 'scratch'] as Clip[])[Math.floor(Math.random() * 4)])
      }
      const p = busy ? (api.loco.bed ? bedPose(api.loco.bed.sit, api.loco.bed.lie, api.loco.pose, api.loco.aside) : api.loco.lying ? bedPose(1, 1, api.loco.pose, api.loco.aside) : walkPose(REST, (walkPhase += dt * 5.5), 1, t)) : clonePose(standing ? STAND : SIT)
      if (api.loco.lying || api.loco.bed) bedMod(p, t, api.loco.pose, api.loco.mood) // respira, treme, se ajeita
      if (!busy && !standing && !clip) { // digitando
        p.L.f[1] += Math.sin(t * 13) * 0.05; p.R.f[1] += Math.sin(t * 11 + 1) * 0.05; p.L.h[1] += Math.sin(t * 17) * 0.08
        p.hy += Math.sin(t * 0.5) * 0.25; p.hp += Math.sin(t * 0.8) * 0.04       // olha de uma tela pra outra
        p.lean += Math.sin(t * 1.3) * 0.015
      }
      if (!busy && standing && !clip) { p.lean += Math.sin(t * 1.4) * 0.015; p.side += Math.sin(t * 0.9) * 0.015; p.R.f[2] += Math.sin(t * 1.4) * 0.02 }
      if (clip && !busy) clipMod(clip, clipT, p, standing)
      const recl = api.loco.lying || !!api.loco.bed // deitado: a cabeça vira em torno do eixo do corpo, não do mundo
      if (near && recl) { // na cama ele SEMPRE te acha: vira a cara pro seu lado (era o que faltava — deitado ele nunca olhava)
        const roll = Math.abs(BED[api.loco.pose].roll ?? 0)
        p.hy += api.loco.gaze * 0.95 * (roll > 3 ? 0.45 : roll > 1 ? 0.5 : 1)
        p.hp += 0.05
      } else if (near && !(clip === 'point')) { // olha pro jogador: gira a cabeça e mira nos olhos dele (compensa a inclinação do tronco)
        p.hy += Math.max(-0.9, Math.min(0.9, look)) * 0.8
        const want = Math.max(-0.5, Math.min(0.5, lookPitch)) - p.lean
        p.hp = p.hp * 0.2 + want * 0.8
      }
      if (touchT > 0) { // reação ao toque: encolhe de leve, cabeça vira pro seu lado
        touchT = Math.max(0, touchT - dt * 0.85)
        const k = Math.sin(Math.min(1, touchT) * Math.PI) // 0 → 1 → 0
        p.lean -= 0.10 * k; p.hr += 0.16 * k; p.hy += api.loco.gaze * 0.25 * k; p.arch += 0.06 * k
        p.L.f[2] += 0.10 * k; p.R.f[2] += 0.06 * k
      }
      lerpPose(cur, p, 1 - Math.exp(-dt * 7))
      rig.apply(cur)
      mug.visible = clip === 'sip'
    },
  }
  return api
}
