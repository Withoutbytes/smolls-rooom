import { state, toast, setGate } from './state'

// O código que aparece no monitor do Smoll. O jogador pode editar e executar: não é eval, só uma lista de comandos conhecidos.
export const DEFAULT_CODE = `import { Scene } from 'three'
const smoll = new Dev('rondonia')
// TODO: multiplayer
export function update(dt) {
  player.move(dt)
  if (bug) fixLater()
  render(scene, camera)
}
const SPEED = 2.5
while (alive) tick()
await deploy('prod') // sexta 18h
Room.open(door)
// não mexe, funciona
return smoll.sentFor(8)`
export const codeState = {
  lines: DEFAULT_CODE.split('\n'),
  edited: false,
  term: ['  VITE ready in 312 ms', '  ➜  Local: http://localhost:5173/', '[vite] hmr update /src/smoll.ts', 'smoll@rondonia:~/smolls-room$ npm run dev'],
}

const SMOLL_CMDS = 'sleep|wake|sit|stand|dance|wave|laugh|think|shrug|facepalm|stretch|thumbs|sip|scratch|point'
const num = (s: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, parseFloat(s)))
const timed = (ms: number, f: () => void) => { f(); state.until = performance.now() + ms }

const CMDS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [new RegExp(`^smoll\\.(${SMOLL_CMDS})\\(\\)`), (m) => (state.cmd(m[1]) === false ? 'ocupado agora' : 'ok')],
  [/^smoll\.say\((['"`])(.*)\1\)/, (m) => { toast(`Smoll: ${m[2]}`); return 'ok' }],
  [/^gate\.(open|close)\(\)/, (m) => { setGate(m[1] === 'open'); return 'ok' }],
  [/^door\.(open|close)\(\)/, (m) => { state.doorOpen = m[1] === 'open'; return 'ok' }],
  [/^player\.speed\s*=\s*(\d+(?:\.\d+)?)/, (m) => { timed(30000, () => (state.speed = num(m[1], 0.3, 4))); return `speed = ${state.speed} (30 s)` }],
  [/^player\.height\s*=\s*(\d+(?:\.\d+)?)/, (m) => { timed(30000, () => (state.eye = num(m[1], 0.6, 2.6))); return `height = ${state.eye} (30 s)` }],
  [/^player\.tp\((-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\)/, (m) => { state.tp(+m[1], +m[2]); return 'ok' }],
]

/** executa cada linha uma vez; devolve o que foi feito (vai pro terminal do monitor) */
export function runCode(text: string) {
  codeState.lines = text.split('\n'); codeState.edited = true
  const out: string[] = []
  for (const raw of codeState.lines) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    const cmd = CMDS.find(([re]) => re.test(line))
    if (cmd) out.push(`> ${line}`, `  ${cmd[1](line.match(cmd[0])!)}`)
    else if (/^(smoll|gate|door|player)\./.test(line)) out.push(`> ${line}`, `  TypeError: comando desconhecido`)
  }
  if (!out.length) out.push('  (nada pra executar)')
  codeState.term.push(...out); codeState.term = codeState.term.slice(-40)
  return out
}
