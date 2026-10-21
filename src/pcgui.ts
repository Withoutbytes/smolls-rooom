import { state, toast } from './state'
import { openPanel } from './menu'
import { pcState } from './code'
import { defineItem, give, takeItem, count } from './inventory'
import * as THREE from 'three'

// GUI do gabinete do PC do Smoll: diagrama clicável dos componentes, temperaturas e controles (RGB, ventoinhas, overclock, limpeza, reiniciar, pentes de RAM).
const css = document.createElement('style')
css.textContent = `.pcd{position:relative;width:100%;height:190px;background:#0d1117;border:1px solid #30363d;border-radius:8px;margin-bottom:8px}
.pcd div{position:absolute;border:1px solid #556;border-radius:4px;font:10px sans-serif;display:grid;place-items:center;cursor:pointer;color:#cfd6e4;background:#161b22}.pcd div:hover{border-color:#8f8}.pcd .sel{border-color:#ffd54a;box-shadow:0 0 8px #ffd54a88}
.pcd .ram{background:#1c2a1c}.pcd .empty{opacity:.3}#panel .stat{font:12px monospace;line-height:1.5;background:#0d1117;padding:6px 8px;border-radius:6px}`
document.head.appendChild(css)

const RAM_ID = () => defineItem('Pente de RAM', (g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.004), new THREE.MeshLambertMaterial({ color: 0x1a1a22 })); b.position.y = 0.015; g.add(b); const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.005), new THREE.MeshBasicMaterial({ color: 0x30e0a0 })); l.position.set(0, 0.02, 0.003); g.add(l) })
let sel = 'cpu'
const watts = () => Math.round((pcState.mode === 'off' ? 0 : 90 + pcState.load * 250 + (pcState.oc ? 90 : 0)) + pcState.fan * 12)
const rpm = () => (pcState.fanR < 0.02 ? 0 : Math.round(400 + pcState.fanR * 1800))

const DETAIL: Record<string, () => string> = {
  cpu: () => `<b>CPU</b> Ryzen 9 7950X · 16 núcleos · ${pcState.cpuT.toFixed(0)} °C · uso ${(pcState.load * 100).toFixed(0)}%${pcState.oc ? ' · <span style="color:#f66">overclock</span>' : ''}`,
  gpu: () => `<b>Placa de vídeo</b> RTX 4080 · ${pcState.gpuT.toFixed(0)} °C · 16 GB`,
  ram: () => `<b>Memória</b> DDR5 6000 · ${pcState.ram} de 4 pentes · ${pcState.ram * 16} GB`,
  ssd: () => '<b>SSD</b> NVMe 2 TB · "projetos_final_v3_AGORA_VAI" ocupa 400 GB',
  psu: () => `<b>Fonte</b> 850 W 80+ Gold · consumindo ${watts()} W`,
  aio: () => `<b>Water cooler</b> 360 mm · bomba ${rpm() + 1200} rpm · líquido: ${pcState.dust > 0.7 ? 'sujo' : 'ok'}`,
  fans: () => `<b>Ventoinhas</b> 6 unidades · ${rpm()} rpm`,
}
const COMPS: [string, string, string][] = [ // id, rótulo, estilo
  ['aio', '💧 Water cooler 360', 'left:6px;top:6px;width:150px;height:22px'], ['cpu', '🧠 CPU', 'left:60px;top:40px;width:56px;height:46px'],
  ['gpu', '🎮 Placa de vídeo', 'left:20px;top:128px;width:150px;height:30px'], ['psu', '🔌 Fonte', 'left:6px;top:166px;width:274px;height:20px'],
  ['ssd', '💾 SSD', 'left:128px;top:40px;width:36px;height:30px'], ['fans', '🌀 Fans', 'left:232px;top:6px;width:48px;height:150px'],
]
const body = () => {
  const slots = [0, 1, 2, 3].map((i) => `<div class="ram${i < pcState.ram ? '' : ' empty'}${sel === 'ram' ? ' sel' : ''}" data-c="ram" style="left:${176 + i * 12}px;top:40px;width:9px;height:70px"></div>`).join('')
  const parts = COMPS.map(([id, label, st]) => `<div data-c="${id}" class="${sel === id ? 'sel' : ''}" style="${st}">${label}</div>`).join('')
  const stat = `CPU ${pcState.cpuT.toFixed(0)}°C · GPU ${pcState.gpuT.toFixed(0)}°C · ${rpm()} rpm · poeira ${(pcState.dust * 100).toFixed(0)}% · ${watts()} W · RGB: ${pcState.rgb}${pcState.mode !== 'ok' ? ` · <b>${pcState.mode.toUpperCase()}</b>` : ''}`
  return `<div class="pcd">${parts}${slots}</div><div class="stat">${DETAIL[sel]()}<br>${stat}</div>`
}
const PRESETS = [0.78, 0.6, 0.0, 0.33, 0.12, 0.92] // roxo, azul, vermelho, verde, laranja, rosa
let pi = 0

export function reboot(msg = 'Reiniciando o PC… o Smoll vai gritar.') {
  if (pcState.ram === 0) { pcState.mode = 'bsod'; pcState.t = 6; pcState.err = 'NO_RAM_DETECTED'; toast('Sem RAM: o PC não liga! 💥'); state.cmd('facepalm'); return }
  pcState.mode = 'boot'; pcState.t = 7; pcState.err = ''; toast(msg); state.cmd('facepalm')
}

export function openPcPanel() {
  openPanel('🖥️ Gabinete do PC do Smoll', body, [
    { t: '🌈 RGB arco-íris', keep: true, fn: () => { pcState.rgb = 'rainbow' } },
    { t: '🎨 Cor fixa (troca a cada clique)', keep: true, fn: () => { pcState.rgb = 'static'; pcState.hue = PRESETS[pi++ % PRESETS.length] } },
    { t: '⚫ RGB desligado', keep: true, fn: () => { pcState.rgb = 'off' } },
    { t: '🌀 Ventoinhas −', keep: true, fn: () => { pcState.fan = Math.max(0.1, pcState.fan - 0.15) } },
    { t: '🌀 Ventoinhas +', keep: true, fn: () => { pcState.fan = Math.min(1, pcState.fan + 0.15) } },
    { t: '🔥 Overclock', keep: true, fn: () => { pcState.oc = !pcState.oc; toast(pcState.oc ? 'Overclock ligado. Vai esquentar! 🔥' : 'Overclock desligado.') } },
    { t: '🧹 Limpar poeira', keep: true, fn: () => { pcState.dust = 0; toast('Limpou a poeira com o soprador. Dá pra respirar. 🧹') } },
    { t: '🧩 Tirar pente de RAM', keep: true, fn: () => { if (!pcState.ram) { toast('Não tem mais pente pra tirar.'); return } if (give(RAM_ID())) { pcState.ram--; toast(`Tirou um pente de RAM (${pcState.ram} instalados). 🧩`) } } },
    { t: '🧩 Colocar pente de RAM', keep: true, fn: () => { if (pcState.ram >= 4) { toast('Todos os 4 slots já estão ocupados.'); return } if (takeItem(RAM_ID())) { pcState.ram++; toast(`Encaixou o pente (${pcState.ram} instalados). ✅`) } else toast('Você não tem um pente de RAM na mochila.') } },
    { t: '🔄 Reiniciar', fn: () => reboot() },
    { t: '⏻ Ligar / desligar', fn: () => { if (pcState.mode === 'off') reboot('Ligando o PC…'); else { pcState.mode = 'off'; toast('PC desligado.') } } },
  ], (t) => { const c = (t.closest('[data-c]') as HTMLElement | null)?.dataset.c; if (c) sel = c })
}
void count
