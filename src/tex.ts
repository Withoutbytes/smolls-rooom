import * as THREE from 'three'

// Materiais PBR (cor + normal + rugosidade) das texturas CC0 do Poly Haven em public/tex. `repeat` = quantas vezes a textura se repete por UV (1 = uma vez por metro nos pisos de 1 m).
const loader = new THREE.TextureLoader(), texs: Record<string, THREE.Texture> = {}, mats: Record<string, THREE.MeshStandardMaterial> = {}
const tex = (id: string, kind: 'diff' | 'nor' | 'rough', repeat: number) => (texs[`${id}${kind}${repeat}`] ??= (() => {
  const t = loader.load(`/tex/${id}_${kind}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8
  if (kind === 'diff') t.colorSpace = THREE.SRGBColorSpace
  return t
})())
export const pbr = (id: string, tint = 0xffffff, repeat = 1, side: THREE.Side = THREE.FrontSide) =>
  (mats[`${id}${tint}${repeat}${side}`] ??= new THREE.MeshStandardMaterial({ color: tint, map: tex(id, 'diff', repeat), normalMap: tex(id, 'nor', repeat), roughnessMap: tex(id, 'rough', repeat), metalness: 0, side }))

// textura de cada tipo de chão do mapa (letras de map.ts)
export const FLOOR_TEX: Record<string, string> = {
  G: 'concrete_floor_02', g: 'concrete_floor_02', P: 'concrete_floor_02', S: 'laminate_floor_02', H: 'laminate_floor_03', F: 'laminate_floor_03',
  K: 'floor_tiles_06', B: 'floor_tiles_02', V: 'terracotta_floor_tiles', Q: 'dark_wooden_planks', C: 'concrete_pavement', R: 'concrete_floor_worn_02',
}

// UV em metros numa caixa (w×h×d): a textura não estica em móveis de proporções diferentes
export const metersUV = (g: THREE.BoxGeometry, w: number, h: number, d: number) => {
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]] // px, nx, py, ny, pz, nz
  for (let i = 0; i < uv.count; i++) { const [u, v] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v) }
}

// material de um móvel/objeto a partir da cor: tons de madeira ganham textura de madeira, o resto vira PBR liso (brilho de tinta/plástico).
// Compartilhado por cor: milhares de objetos com o mesmo material = poucas trocas de estado na GPU (era o gargalo de FPS).
// Quem muda cor/opacidade de um objeto depois de criado precisa antes de `own()` (props.ts).
const surfaces = new Map<number, THREE.MeshStandardMaterial>()
export const surface = (color: number): THREE.MeshStandardMaterial => {
  let m = surfaces.get(color); if (m) return m
  const c = new THREE.Color(color), { h, s, l } = c.getHSL({ h: 0, s: 0, l: 0 })
  m = h >= 0.05 && h <= 0.12 && s >= 0.25 && s <= 0.6 && l >= 0.1 && l <= 0.55 ? pbr('dark_wooden_planks', c.multiplyScalar(2.4).getHex()) : new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 })
  surfaces.set(color, m); return m
}

// ---------- árvores ----------
// folhagem: textura procedural de folhas com alpha (recorte) aplicada numa copa irregular de duas camadas
let leafMat: THREE.MeshStandardMaterial | null = null
const leaves = () => (leafMat ??= (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512
  const g = c.getContext('2d')!
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) // determinístico: a mesma textura em toda carga
  for (let i = 0; i < 520; i++) {
    const x = rnd() * 512, y = rnd() * 512, a = rnd() * Math.PI, L = 22 + rnd() * 20, hue = 95 + rnd() * 30, lig = 16 + rnd() * 20
    for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) { // repete nas bordas: sem emenda
      g.save(); g.translate(x + dx, y + dy); g.rotate(a); g.fillStyle = `hsl(${hue},55%,${lig}%)`
      g.beginPath(); g.ellipse(0, 0, L, L * 0.38, 0, 0, Math.PI * 2); g.fill()
      g.strokeStyle = `hsl(${hue},45%,${lig + 12}%)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke(); g.restore()
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.anisotropy = 8
  return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 })
})())
// copa: esfera irregular (ruído por vértice) com a folhagem; `seed` varia o formato entre árvores
export const crown = (r: number, seed = 0) => {
  const geo = new THREE.IcosahedronGeometry(r, 3), p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.22 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + y * 1.9 + seed) + 0.08 * Math.sin(y * 7 + x * 5 + seed)
    p.setXYZ(i, x * k, y * k * 0.9, z * k)
  }
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, leaves())
}
export const barkMat = () => pbr('bark_brown_02')
