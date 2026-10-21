import * as THREE from 'three'
import { type Pose, type V3, type Limb, clonePose, lerpPose, restPose } from './rig'
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
  ...clonePose(REST), ry: -0.264, rz: -0.02, lean: 0.16, hp: 0.1,
  L: limb([0.10, -0.88, 0.40], [-0.6, -0.28, 1], [-0.45, -0.55, 1]),
  R: limb([-0.10, -0.88, 0.40], [-0.25, -0.28, 1], [-0.2, -0.55, 1]),
  TL: [0.10, -0.30, 1], SL: [0, -1, 0.06], FL: [0, -0.08, 1],
  TR: [-0.10, -0.30, 1], SR: [0, -1, 0.06], FR: [0, -0.08, 1],
}
const STAND: Pose = clonePose(REST)
// deitado de costas na cama: braços dobrados com as mãos na barriga
const LYING: Pose = { ...clonePose(REST), L: limb([0.15, -0.95, 0.25], [-0.55, -0.45, 0.7]), R: limb([-0.15, -0.95, 0.25], [0.55, -0.45, 0.7]) }

// sentado na quina da cama (pés quase no chão, mãos nos joelhos); bedPose mistura em pé → sentado (sit) → deitado (lie)
const SIT_EDGE: Pose = {
  ...clonePose(REST), ry: -0.12, lean: 0.12, hp: 0.08,
  L: limb([0.12, -0.95, 0.2], [0.1, -0.6, 0.8], [0.1, -0.3, 0.9]), R: limb([-0.12, -0.95, 0.2], [-0.1, -0.6, 0.8], [-0.1, -0.3, 0.9]),
  TL: [0.05, -0.75, 0.66], SL: [0.02, -1, -0.05], FL: [0, -0.1, 1],
  TR: [-0.05, -0.75, 0.66], SR: [-0.02, -1, -0.05], FR: [0, -0.1, 1],
}
export function bedPose(sit: number, lie: number): Pose {
  const p = clonePose(STAND); lerpPose(p, SIT_EDGE, sit); lerpPose(p, LYING, lie); return p
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

export function createAnim(rig: Rig, mug: THREE.Object3D) {
  let standing = false, clip: Clip | null = null, clipT = 0, pending: Clip | null = null, pendingAt = 0, idleT = 5, away = 0
  const cur = clonePose(SIT)
  let walkPhase = 0
  mug.visible = false
  const api = {
    /** controlado pelo smoll.ts: andando até a cama/PC ou deitado */
    loco: { walk: 0, lying: false, bed: null as null | { sit: number; lie: number } },
    get standing() { return standing },
    stand(on: boolean) { standing = on; clip = null },
    play(c: Clip) {
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
      away = standing && dist > 6 && !busy ? away + dt : 0
      if (away > 6) { standing = false; away = 0 }
      // gestos aleatórios enquanto ninguém está falando com ele
      if (!busy && !clip && !pending && !standing && (idleT -= dt) <= 0) {
        idleT = 7 + Math.random() * 8
        api.play((['sip', 'think', 'stretch', 'scratch'] as Clip[])[Math.floor(Math.random() * 4)])
      }
      const p = busy ? (api.loco.bed ? bedPose(api.loco.bed.sit, api.loco.bed.lie) : api.loco.lying ? clonePose(LYING) : walkPose(REST, (walkPhase += dt * 5.5), 1, t)) : clonePose(standing ? STAND : SIT)
      if (api.loco.lying) p.lean += Math.sin(t * 1.6) * 0.012 // respira dormindo
      if (!busy && !standing && !clip) { // digitando
        p.L.f[1] += Math.sin(t * 13) * 0.05; p.R.f[1] += Math.sin(t * 11 + 1) * 0.05; p.L.h[1] += Math.sin(t * 17) * 0.08
        p.hy += Math.sin(t * 0.5) * 0.25; p.hp += Math.sin(t * 0.8) * 0.04       // olha de uma tela pra outra
        p.lean += Math.sin(t * 1.3) * 0.015
      }
      if (!busy && standing && !clip) { p.lean += Math.sin(t * 1.4) * 0.015; p.side += Math.sin(t * 0.9) * 0.015; p.R.f[2] += Math.sin(t * 1.4) * 0.02 }
      if (clip && !busy) clipMod(clip, clipT, p, standing)
      if (near && !(clip === 'point')) { // olha pro jogador: gira a cabeça e mira nos olhos dele (compensa a inclinação do tronco)
        p.hy += Math.max(-0.9, Math.min(0.9, look)) * 0.8
        const want = Math.max(-0.5, Math.min(0.5, lookPitch)) - p.lean
        p.hp = p.hp * 0.2 + want * 0.8
      }
      lerpPose(cur, p, 1 - Math.exp(-dt * 7))
      rig.apply(cur)
      mug.visible = clip === 'sip'
    },
  }
  return api
}
