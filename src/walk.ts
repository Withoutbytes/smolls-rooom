import { clonePose, type Pose, type V3 } from './rig'

const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

// ciclo de caminhada: pernas e braços balançam em fases opostas; amp = 0 parado (só respira), 1 = andando
export function walkPose(REST: Pose, phase: number, amp: number, t: number): Pose {
  const p = clonePose(REST), s = Math.sin(phase), c = Math.cos(phase)
  p.TL = norm(add(REST.TL, [0, 0, 0.75 * s * amp])); p.TR = norm(add(REST.TR, [0, 0, -0.75 * s * amp]))
  p.SL = norm(add(REST.SL, [0, 0, -0.7 * amp * Math.max(0, -c)])); p.SR = norm(add(REST.SR, [0, 0, -0.7 * amp * Math.max(0, c)]))
  p.L.u = norm(add(REST.L.u, [0, 0, -0.55 * s * amp])); p.R.u = norm(add(REST.R.u, [0, 0, 0.55 * s * amp]))
  p.L.f = norm(add(REST.L.f, [0, 0.15 * amp, 0.3 * amp - 0.2 * s * amp])); p.R.f = norm(add(REST.R.f, [0, 0.15 * amp, 0.3 * amp + 0.2 * s * amp]))
  p.ry = -0.025 * Math.abs(c) * amp; p.lean = 0.06 * amp + Math.sin(t * 1.4) * 0.012 * (1 - amp); p.twist = 0.08 * s * amp
  return p
}
