// Planta do bairro (Jardim das Palmeiras, Ariquemes) a partir da foto de satélite que o usuário mandou, girada pra encaixar com a casa:
//  • R. Umuarama = nossa rua, eixo N–S em x = UM. A casa fica do lado oeste, de frente pra rua (a foto original tem a rua ao norte da casa).
//  • R. Palomas sai da Umuarama em "T" (só pro lado leste, onde fica a escola) e a R. Joinville nasce nela, paralela à Umuarama.
//  • R. Macaúbas é paralela, atrás das casas; a R. Barreiras corta tudo, bem mais adiante.
// Distâncias estimadas pela escala da foto (lote ≈ 10 m, rua ≈ 10 m com calçadas).
export const UM = 34       // eixo da R. Umuarama (asfalto x 31–37, calçadas 29–31 e 37–39)
export const JOIN = 105    // R. Joinville (~70 m a leste)
export const MAC = -42     // R. Macaúbas (~76 m a oeste; a foto dá ~85 m, encurtei pra não sobrar vazio atrás da casa)
export const PAL = -25     // R. Palomas (eixo z, a ~33 m da casa, segue pro leste)
export const BAR = 155     // R. Barreiras (cruza tudo, ~150 m da casa)
export const WORLD = { x0: -100, x1: 170, z0: -110, z1: 215 } // limites do mundo andável

export type Rect = [number, number, number, number] // x0, z0, x1, z1
// ruas com calçadas (10 m de largura): é onde dá pra andar fora do mapa da casa
export const STREET_RECTS: Rect[] = [
  [UM - 5, WORLD.z0, UM + 5, WORLD.z1],         // R. Umuarama
  [MAC - 5, WORLD.z0, MAC + 5, WORLD.z1],       // R. Macaúbas
  [JOIN - 5, PAL - 5, JOIN + 5, WORLD.z1],      // R. Joinville (começa na Palomas)
  [UM, PAL - 5, WORLD.x1, PAL + 5],             // R. Palomas (T na Umuarama, pro leste)
  [WORLD.x0, BAR - 5, WORLD.x1, BAR + 5],       // R. Barreiras
]
export const inWorld = (x: number, z: number) => x >= WORLD.x0 && x <= WORLD.x1 && z >= WORLD.z0 && z <= WORLD.z1 // só a borda do mundo é parede invisível
export const inStreet = (x: number, z: number) => STREET_RECTS.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)
