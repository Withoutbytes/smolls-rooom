import * as THREE from 'three'
import { visitorReady } from './visitor'

// Tela de carregamento: título, barra de progresso (arquivos baixados pelo three + tempo mínimo), dicas e mensagens engraçadas. Quando tudo carrega ela some sozinha.
const el = document.getElementById('loading')!, bar = el.querySelector<HTMLElement>('.fill')!, msg = el.querySelector<HTMLElement>('.msg')!, tip = el.querySelector<HTMLElement>('.tip')!
const MSGS = ['Enchendo a geladeira de Kuat…', 'Ligando o PC do Smoll…', 'Acordando o Smoll (ele tava dormindo)…', 'Regando as mangueiras do quintal…', 'Procurando o controle da TV…', 'Calibrando o ventilador de teto…', 'Esquentando o miojo…', 'Soltando o caramelo na calçada…', 'Afinando o violão (nunca dá certo)…']
const TIPS = ['WASD anda · Shift corre · Espaço pula (pule contra um muro pra subir!)', 'E interage com tudo · I abre a mochila · 1–9 troca o item da mão', 'M abre o mapa · B abre os gestos · P abre o celular (se tiver o do Smoll)', 'Q solta o item, G arremessa. O Smoll também faz coisas se você pedir.', 'Cuidado com a campainha: o Smoll se irrita. 🔔', 'Sente no sofá e chame o Smoll pra assistir TV com você. 🛋️']
const t0 = performance.now()
let loaded = 0, total = 0, done = false, ready = false
THREE.DefaultLoadingManager.onProgress = (_u, l, t) => { loaded = l; total = t }
THREE.DefaultLoadingManager.onLoad = () => { done = true }
tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]

let shown = 0, mi = 0
const timer = setInterval(() => {
  const el2 = (performance.now() - t0) / 1000
  const real = total ? loaded / total : 0
  const target = ready ? 1 : Math.min(0.94, Math.max(real * 0.9, Math.min(0.85, el2 / 7)))
  shown += (target - shown) * 0.12
  bar.style.width = (shown * 100).toFixed(0) + '%'
  if (!ready && Math.floor(el2 / 1.4) !== mi) { mi = Math.floor(el2 / 1.4); msg.textContent = MSGS[mi % MSGS.length] }
  if (!ready && el2 > 2.5 && ((done && visitorReady()) || el2 > 20)) { ready = true; msg.textContent = 'Tudo pronto!'; setTimeout(enter, 800) }
  if (ready && shown > 0.99) clearInterval(timer)
}, 100)

// entra sozinho assim que tudo carregou (sem botão); o jogo pede o clique pra prender o mouse
const enter = () => { if (location.search.includes('hold')) return; el.style.opacity = '0'; setTimeout(() => (el.style.display = 'none'), 700) }
