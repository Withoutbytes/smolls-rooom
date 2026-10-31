// Regras compartilhadas pelo servidor local (server/index.js) e pelo Worker (worker/index.js): validação do que os clientes mandam.
export const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d)
const MODES = ['desk', 'toBed', 'falling', 'sleep', 'rise', 'toDesk', 'goTask', 'doTask']
const CLIPS = ['sip', 'wave', 'laugh', 'point', 'think', 'shrug', 'facepalm', 'stretch', 'dance', 'thumbs', 'scratch']
const POSES = ['normal', 'spread', 'legsUp', 'scissors', 'bridge', 'curl', 'quatro']
// estado do Smoll mandado pelo "anfitrião" (o jogador mais antigo na sala, que roda a IA dele)
export function cleanSm(m) {
  if (!m || typeof m !== 'object') return null
  return {
    x: num(m.x, -5, 60), y: num(m.y, -1, 3), z: num(m.z, -5, 40), ry: num(m.ry, -20, 20), rz: num(m.rz, -4, 4),
    w: m.w ? 1 : 0, ly: m.ly ? 1 : 0, st: m.st ? 1 : 0, red: m.red ? 1 : 0, sh: m.sh ? 1 : 0,
    bd: m.bd && typeof m.bd === 'object' ? { sit: num(m.bd.sit, 0, 1), lie: num(m.bd.lie, 0, 1) } : null,
    bp: POSES.includes(m.bp) ? m.bp : 'normal', c: CLIPS.includes(m.c) ? m.c : '', cn: num(m.cn, 0, 1e9), mode: MODES.includes(m.mode) ? m.mode : 'desk',
  }
}
export const CMD_RE = /^[\w:]{1,32}$/   // comando pro Smoll (ex.: task:tv)
// estado compartilhado do mundo (portas, luzes, TV…): chave → número, booleano ou texto curto
export const okShared = (k, v) => /^[\w.]{1,40}$/.test(k) && (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 40))
