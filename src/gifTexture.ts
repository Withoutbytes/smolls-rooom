import * as THREE from 'three'

// Textura animada a partir de um GIF (decodifica os quadros com ImageDecoder, do Chrome; sem suporte mostra o primeiro quadro).
export function gifTexture(url: string, size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const g = cv.getContext('2d')!; g.fillStyle = '#111'; g.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace
  let dec: any = null, frames = 0, idx = 0, wait = 0, busy = false
  const show = (img: CanvasImageSource) => { g.drawImage(img, 0, 0, size, size); texture.needsUpdate = true }
  const step = async () => { // desenha o quadro `idx` e espera a duração dele (em µs) antes do próximo
    const { image } = await dec.decode({ frameIndex: idx })
    show(image); wait = (image.duration || 100000) / 1e6; image.close(); idx = (idx + 1) % frames
  }
  fetch(url).then((r) => r.arrayBuffer()).then(async (buf) => {
    const ID = (window as any).ImageDecoder
    if (ID) { dec = new ID({ data: buf, type: 'image/gif' }); await dec.tracks.ready; frames = dec.tracks.selectedTrack.frameCount; await step() }
    else show(await createImageBitmap(new Blob([buf], { type: 'image/gif' })))
  }).catch(() => {})
  return {
    texture,
    update(dt: number) {
      if (!dec || busy || (wait -= dt) > 0) return
      busy = true; step().catch(() => {}).finally(() => (busy = false))
    },
  }
}
