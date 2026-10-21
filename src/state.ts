// estado único do jogo (tudo que o multiplayer vai precisar sincronizar mora aqui)
export const state = {
  mangas: 0,
  drinks: 0,
  speed: 1,           // multiplicador de velocidade
  eye: 1.07,          // altura da câmera (jogadores são menores que o Smoll, pra a casa parecer maior)
  until: 0,           // fim do efeito de código (ms)
  gateOpen: false,
  doorOpen: false,
  smollStanding: false,
  editing: false,   // editor de código aberto: o jogo ignora o teclado
  cmd: (_c: string): unknown => undefined,   // smoll.ts liga: stand/sit/sip/wave/laugh/point/think/shrug/facepalm/stretch/dance/thumbs/scratch
  tp: (_x: number, _z: number) => {},  // main.ts liga isto ao jogador
}
export const gateWalls: { visible: boolean }[] = []  // paredes 'P' do portão, escondidas quando abre

const $ = (id: string) => document.getElementById(id)!

export function setGate(open: boolean) {
  state.gateOpen = open
  gateWalls.forEach((m) => (m.visible = !open))
}

let toastT = 0
export function toast(msg: string, ms = 3200) {
  const el = $('toast')
  el.textContent = msg; el.style.opacity = '1'
  clearTimeout(toastT); toastT = window.setTimeout(() => (el.style.opacity = '0'), ms)
  $('counts').textContent = `🥭 ${state.mangas}   🥤 ${state.drinks}`
}

export function sleep() {
  const f = $('fade')
  f.style.opacity = '1'
  setTimeout(() => { f.style.opacity = '0'; toast('Dormiu 20 min. Acordou com 14 notificações.') }, 1400)
}

export const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
