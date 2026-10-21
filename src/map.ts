import { state } from './state'

// 1 caractere = 1 m. '#' parede, 'w' janela (buraco com vidro), 'F' porta da frente, 'P' portão de correr da garagem,
// 'M' muro, 'g' garagem aberta (só telhado), 'Y' quintal (céu aberto), '.' passagem, letras = cômodos,
// 'C' calçada, 'R' rua, 'X' parede invisível. Colunas: casa 0–19, garagem/quintal 20–27, muro/portão 28, rua 29–38.
const HOUSE = [
  '##w#######w#####w###',
  '#GGGGGG#SSSSS#KKKKK#',
  '#GGGGGG#SSSSS#KKKKK#',
  '#GGGGGG.SSSSS.KKKKKw',
  '#GGGGGG#SSSSS#KKKKK#',
  '#GGGGGG#SSSSS#KKKKK#',
  '####.#####.#####.###',
  '#HHHHHHHHHHHHHHHHHH#',
  '#HHHHHHHHHHHHHHHHHHF',
  '#HHHHHHHHHHHHHHHHHH#',
  '###.#####.#####.####',
  '#VVVVV#BBBB#QQQQQQQ#',
  '#VVVVV#BBBB#QQQQQQQ#',
  '#VVVVV#BBBB#QQQQQQQ#',
  '#VVVVV#BBBB#QQQQQQQ#',
  '#####w#######w######',
]
const houseRow = (z: number) => (z < HOUSE.length ? HOUSE[z] : z === 16 ? 'X'.repeat(19) + 'M' : 'X'.repeat(20))
const yardRow = (z: number) => (z === 0 || z === 16 ? 'MMMMMMMM' : z <= 5 ? 'gggggggg' : z <= 15 ? 'YYYYYYYY' : 'XXXXXXXX')
const fence = (z: number) => (z === 0 ? 'T' : z <= 5 ? 'P' : z <= 16 ? 'T' : 'X') // T = muro de pedra; a única entrada é o portão de correr (P)
// z 0 = tampa invisível; z 25–30 = cruzamento com a rua transversal (esquina); z 31 = tampa
const street = (z: number) => (z === 0 || z >= 31 ? 'X'.repeat(14) : z >= 25 ? 'RRRRRRRRRR' + 'XXXX' : 'CCRRRRRRCC' + 'XXXX')
export const MAP = Array.from({ length: 32 }, (_, z) => houseRow(z) + yardRow(z) + fence(z) + street(z))

// G oficina, S sala, K cozinha, H corredor, V varanda, B banheiro, Q quarto do Smoll
export const FLOOR: Record<string, number> = {
  G: 0x6b6b6b, S: 0xb08968, K: 0xd9d2c0, H: 0xa08060, V: 0x9c4a2f, B: 0x8fb5c4, Q: 0x3a3a52, F: 0xa08060,
  g: 0x777777, P: 0x777777, C: 0xb8b8b0, R: 0x8d8c86, // rua de concreto
}
export const WALL: Record<string, number> = { '#': 0xe8dcc0, M: 0xd8cdb8, T: 0x9a9a98 }
export const WALL_H: Record<string, number> = { '#': 2.6, M: 1.8, T: 2.0 }
export const OUTDOOR = 'YCR' // sem teto (a garagem 'g' e o portão 'P' têm telhado)

// Onde dá pra andar fora do mapa: a rua principal (x 29–39, z −60 a 90) e a transversal (z 23–33, x −60 a 120).
// O resto do lado de fora é parede invisível, bem longe da casa pra dar pra explorar.
const inStreet = (x: number, z: number) => (x >= 29 && x <= 39 && z >= -60 && z <= 90) || (z >= 23 && z <= 33 && x >= -60 && x <= 120)

export const solid = (x: number, z: number) => {
  const c = MAP[Math.floor(z)]?.[Math.floor(x)]
  if (c === undefined || c === 'X') return !inStreet(x, z)
  if (c === 'P') return !state.gateOpen
  if (c === 'F') return !state.doorOpen
  return c === '#' || c === 'M' || c === 'T' || c === 'w'
}
