import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SavePass } from 'three/examples/jsm/postprocessing/SavePass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

// Acabamento de cinema: AO de contato, bloom, vinheta e grão. Tudo em linear até o OutputPass (ACES + sRGB).
// O canvas tem alpha (o "buraco" da TV mostra o iframe por trás): o alpha da cena é guardado logo após o RenderPass e devolvido no fim.
const FINAL = {
  uniforms: { tDiffuse: { value: null }, tAlpha: { value: null }, time: { value: 0 }, sat: { value: 0.62 }, vignette: { value: 0.75 }, grain: { value: 0.07 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse, tAlpha; uniform float time, sat, vignette, grain; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec2 e = (vUv - 0.5) * 0.004;                                    // aberração cromática nas bordas
      vec3 c = vec3(texture2D(tDiffuse, vUv + e).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - e).b);
      float a = texture2D(tAlpha, vUv).a;
      vec2 d = vUv - 0.5; c *= 1.0 - vignette * smoothstep(0.25, 0.95, length(d * vec2(1.0, 0.85)) * 1.45);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);                                          // dessaturado, estilo Village
      c *= mix(vec3(0.88, 0.97, 1.12), vec3(1.0, 0.98, 0.95), smoothstep(0.15, 0.7, l)); // sombras azuladas, luzes levemente quentes
      c = (c - 0.5) * 1.12 + 0.5;                                        // mais contraste
      c += (hash(vUv * 1000.0) - 0.5) * grain;
      gl_FragColor = vec4(c * a, a);
    }`,
}

export function initFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.85
  const { x: w, y: h } = renderer.getSize(new THREE.Vector2())
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 2 }))
  composer.setPixelRatio(0.75) // renderiza os efeitos em 75% e amplia: o maior ganho de FPS; suba pra 1 em GPU forte
  composer.addPass(new RenderPass(scene, camera))
  const save = new SavePass(); composer.addPass(save)
  const ao = new GTAOPass(scene, camera, w, h, undefined, { samples: 8 }, { samples: 8 }); ao.blendIntensity = 0.85; composer.addPass(ao)
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.5, 1.0))
  composer.addPass(new OutputPass())
  const fin = new ShaderPass(FINAL); fin.uniforms.tAlpha.value = save.renderTarget.texture; composer.addPass(fin)
  let on = true
  return {
    grade(sat: number) { fin.uniforms.sat.value = sat },
    toggle() { return (on = !on) },
    get on() { return on },
    render(now: number) { fin.uniforms.time.value = (now % 1000) / 1000; composer.render() },
    resize(w: number, h: number) { composer.setSize(w, h) },
  }
}
