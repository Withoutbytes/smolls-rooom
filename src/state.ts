import type { Object3D } from 'three'
// veículo dirigível: g = grupo (frente = -x local), eye = posição do olhar do motorista (local, já escalada), len/wid = tamanho da caixa de colisão
export type Vehicle = { g: Object3D; kind: 'car' | 'bike'; eye: [number, number, number]; len: number; wid: number; top: number; rects: number[][]; ox: number; v: number }
export const vehicles: Vehicle[] = []
// estado único do jogo (tudo que o multiplayer vai precisar sincronizar mora aqui)
export const state = {
  mangas: 0,
  drinks: 0,
  speed: 1,           // multiplicador de velocidade
  py: 0,              // altura dos pés do jogador (sobe em cima de objetos)
  eye: 1.07,          // altura da câmera (jogadores são menores que o Smoll, pra a casa parecer maior)
  until: 0,           // fim do efeito de código (ms)
  gateOpen: false,
  doorOpen: false,
  smollStanding: false,
  photoReq: null as null | ((url: string) => void), // pedido de foto: main.ts entrega o quadro depois de renderizar
  avatar: null as null | { visible: boolean }, // corpo do próprio jogador: só aparece no reflexo do espelho (em primeira pessoa você não se vê)
  seat: null as null | { x: number; y: number; z: number; yaw: number; key: string; ex: number; ez: number }, // assento ocupado pelo jogador (ex/ez = onde ele levanta)
  takenSeats: new Set<string>(), // assentos ocupados por outros jogadores (vem do servidor)
  myEmote: { id: '', n: 0 },     // último gesto do jogador (n cresce a cada gesto, pra rede e pro avatar do espelho)
  power: true,
  internet: true,     // roteador ligado
  tvBlocked: false,   // TV bloqueada no roteador        // disjuntor geral da casa
  smollShorts: false, // de bermuda (true) ou de calça jeans (false)
  editing: false,   // editor de código aberto: o jogo ignora o teclado
  cmd: (_c: string): unknown => undefined,   // smoll.ts liga: stand/sit/sip/wave/laugh/point/think/shrug/facepalm/stretch/dance/thumbs/scratch
  tp: (_x: number, _z: number) => {},
  driving: false,   // dentro de um veículo
  enter: (_v: Vehicle) => {},  // main.ts liga isto: entra no veículo  // main.ts liga isto ao jogador
}
// relógio do jogo: um dia = 20 min reais. O servidor manda a hora (h) e cada cliente segue contando; sem servidor começa às 8h
export const DAY_MS = 20 * 60 * 1000
export const clock = { h: 8, at: performance.now() }
export const gameHour = () => (clock.h + ((performance.now() - clock.at) / DAY_MS) * 24) % 24
// ações do mundo que o Smoll pode executar sozinho (props.ts liga cada uma): luz/ventilador por cômodo, TV, chuveiro
export const world = { luz: {} as Record<string, () => void>, ventilador: {} as Record<string, () => void>, tv: () => {}, chuveiro: (_on: boolean) => {}, cozinha: { cafe: () => {}, louca: () => {}, cozinhar: () => {} } }
// itens da mesa do Smoll que sumiram (alguém pegou): o Smoll repõe bebidas indo à geladeira/cafeteira; o resto volta sozinho depois de um tempo
export const deskMissing: { name: string; kind: 'drink' | 'cafe' | 'other'; at: number; restore: () => void }[] = []
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
  updateCounts()
}
export const updateCounts = () => ($('counts').textContent = `🥭 ${state.mangas}   🥤 ${state.drinks}`)

export function sleep() {
  const f = $('fade')
  f.style.opacity = '1'
  setTimeout(() => { f.style.opacity = '0'; toast('Dormiu 20 min. Acordou com 14 notificações.') }, 1400)
}

export const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
