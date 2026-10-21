import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildRig, restPose, clonePose, lerpPose, type SkelSpec } from './rig'
import { walkPose } from './walk'

// Modelo dos visitantes (jogadores remotos): Hunyuan3D de `public/models/visitante_real_hq.glb`, mesmo método de rig do Smoll.
// Juntas medidas na malha (espaço nativo do GLB). Se o arquivo não existir, net.ts usa o boneco simples.
export const VISITOR_SKEL: SkelSpec = {
  name: 'visitante', k: 1, hand: [0.30, 0.33, 0.05, 0.2, -0.45, -0.3],   // medido na malha: braços abertos ~25°, colete e camuflagem
  JL: {
    sh: [0.31, 0.50, 0.0], el: [0.405, 0.15, 0.0], wr: [0.395, -0.06, 0.02], ha: [0.385, -0.17, 0.03],
    hp: [0.14, -0.17, -0.02], kn: [0.18, -0.58, -0.03], an: [0.20, -0.90, -0.05], to: [0.22, -0.98, 0.14],
  },
  core: { hips: [0, -0.15, 0], spine: [0, -0.03, 0], chest: [0, 0.25, 0], neck: [0, 0.6, 0], head: [0, 0.67, 0.03] },
}
export const HEIGHT = 1.15  // altura do visitante em metros (os olhos do jogador ficam a 1,07 m; o Smoll tem 1,75 m)
const NATIVE_H = 1.987 // altura da malha nativa (y de -0,999 a 0,988)

let geometry: THREE.BufferGeometry | null = null
let map: THREE.Texture | null = null
let loading: Promise<boolean> | null = null
export const visitorReady = () => !!geometry

export function loadVisitorModel() {
  return (loading ??= new Promise<boolean>((res) => {
    new GLTFLoader().load('/models/visitante_real_hq.glb', (gltf) => {
      let src: THREE.Mesh | undefined
      gltf.scene.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh })
      if (!src) return res(false)
      src.geometry.computeVertexNormals() // o GLB do Hunyuan vem sem normais
      geometry = src.geometry; map = (src.material as THREE.MeshStandardMaterial).map
      res(true)
    }, undefined, () => res(false))
  }))
}

const REST = restPose(VISITOR_SKEL)
export function createVisitor() {
  if (!geometry) return null
  const rig = buildRig(geometry, new THREE.MeshLambertMaterial({ map }), VISITOR_SKEL)
  const holder = new THREE.Group(); holder.rotation.y = Math.PI           // o modelo olha pra +z; o grupo olha pra -z (yaw 0)
  const s = HEIGHT / NATIVE_H
  const mw = new THREE.Group(); mw.scale.setScalar(s); mw.position.y = 0.999 * s; mw.add(rig.mesh); holder.add(mw)
  const cur = clonePose(REST)
  let phase = 0
  return {
    object: holder,
    /** speed em m/s; chamado todo frame */
    update(dt: number, t: number, speed: number) {
      const amp = Math.min(1, speed / 2.2)
      phase += dt * (2 + speed * 2.2)
      lerpPose(cur, walkPose(REST, phase, amp, t), 1 - Math.exp(-dt * 12))
      rig.apply(cur)
    },
  }
}
