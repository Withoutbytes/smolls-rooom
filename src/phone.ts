import * as THREE from 'three'
import { state, toast, gameHour, pick } from './state'
import { ITEMS, defineItem, give, count } from './inventory'
import { STREET_RECTS } from './bairro'
import { PLACE } from './place'

// Celular do Smoll, no estilo do celular do GTA V: tela escura, relógio e bateria no topo, grade de apps (setas + Enter ou clique, Backspace volta, Esc fecha).
// Apps: Contatos (ligações, pede pizza), Mensagens, Internet (iframe pelo proxy do servidor), Câmera (foto vira item), GPS (mapa do bairro), Lanterna.
const PHONE_ID = 'celular-do-smoll'
let root: HTMLDivElement, screen: HTMLDivElement, spot: THREE.SpotLight, player: { x: number; z: number; yaw: number }
let page = 'home', sel = 0, camMode = false, flash: HTMLDivElement, hint: HTMLDivElement, lightOn = false, battery = 74
let mapTimer = 0

const APPS: [string, string, string, string][] = [ // id, ícone, nome, cor
  ['contatos', '📞', 'Contatos', '#3a8f4a'], ['mensagens', '✉️', 'Mensagens', '#2e86de'], ['internet', '🌐', 'Internet', '#7a4ac9'],
  ['camera', '📷', 'Câmera', '#c0392b'], ['gps', '🗺️', 'GPS', '#16a085'], ['lanterna', '🔦', 'Lanterna', '#d4a017'],
]
const CONTACTS: [string, string][] = [['Shadowy 💙', '🖤'], ['Aprendiz', '🧑‍💻'], ['Prohat', '😎'], ['Hammy', '🐹'], ['Deka', '🕶️'], ['Bia', '👩'], ['Mãe', '👵'], ['Pizzaria do Zé', '🍕'], ['Caramelo', '🐶'], ['Polícia', '🚓']]
const MSGS: [string, string][] = [
  ['Shadowy 💙', 'amor, já comeu? não esquece de beber água, só tem Kuat na geladeira'], ['Shadowy 💙', 'chego em 10 min. deixa o portão aberto 🥰'], ['Shadowy 💙', 'para de programar e vem dormir, tá tarde'],
  ['Deka', 'o pacote chegou. não abre na frente de ninguém'], ['Hammy', 'apaga aquela mensagem de ontem. AGORA'], ['Prohat', 'vc tá com o negócio? o Aprendiz já tá a caminho'],
  ['Aprendiz', 'mestre, fiz o que vc pediu… mas deu ruim. não conta pro Hammy'], ['Hammy', 'quem mexeu no meu código?? foi o Prohat?'], ['Deka', 'o combinado é 22h na esquina. leva o dinheiro (e a Kuat)'],
  ['Prohat', 'a senha do cofre mudou. 1234 de novo kkk'], ['Aprendiz', 'cadê o Hammy? ele sumiu depois que vc ligou pra ele'], ['Deka', 'apaga esse número. a gente nunca se falou'],
  ['Bia', 'kkkkk viu o que o Smoll fez?'], ['Mãe', 'Come direito! E fecha esse computador!'], ['Grupo da família', '🙏 bom dia 🙏 (47 mensagens)'], ['Pizzaria do Zé', 'Seu pedido saiu para entrega.'], ['Smoll → Bia', 'n é oq vc tá pensando (visualizado)']]

const css = document.createElement('style')
css.textContent = `
#phone{position:fixed;right:28px;bottom:-640px;width:290px;height:560px;z-index:26;background:#0b0d12;border:6px solid #20232b;border-radius:34px;box-shadow:0 10px 40px #000a;color:#e8ecf3;font:14px sans-serif;transition:bottom .35s;overflow:hidden;display:flex;flex-direction:column}
#phone.on{bottom:24px}#phone .st{display:flex;justify-content:space-between;padding:12px 18px 4px;font-size:12px;opacity:.9}
#phone .scr{flex:1;padding:6px 14px;overflow:auto}#phone .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:20px}
#phone .app{aspect-ratio:1;border-radius:16px;display:grid;place-items:center;cursor:pointer;font-size:28px;position:relative;border:2px solid transparent}#phone .app small{position:absolute;bottom:-17px;font-size:10px;color:#cfd6e4;white-space:nowrap}#phone .app.sel{border-color:#fff;box-shadow:0 0 12px #fff8}
#phone .row{padding:10px 8px;border-bottom:1px solid #222a35;cursor:pointer}#phone .row.sel,#phone .row:hover{background:#1c2430}#phone h4{margin:6px 0 10px;font-weight:600}
#phone .bar{padding:8px;text-align:center;font-size:11px;opacity:.7;border-top:1px solid #20232b}#phone input{width:100%;box-sizing:border-box;background:#1a1f29;border:0;color:#fff;border-radius:8px;padding:7px}#phone iframe{width:100%;height:330px;border:0;background:#fff;margin-top:6px;border-radius:6px}
#phone button{background:#2d3748;color:#fff;border:0;border-radius:8px;padding:7px 10px;cursor:pointer;margin:4px 4px 0 0}
#camhint{position:fixed;left:50%;bottom:14%;transform:translateX(-50%);z-index:12;color:#fff;font:16px sans-serif;background:#000a;padding:8px 16px;border-radius:8px;display:none;pointer-events:none}#camflash{position:fixed;inset:0;background:#fff;opacity:0;z-index:40;pointer-events:none;transition:opacity .4s}`
document.head.appendChild(css)

const ico = (a: (typeof APPS)[number], i: number) => `<div class="app${i === sel ? ' sel' : ''}" data-app="${a[0]}" style="background:${a[3]}">${a[1]}<small>${a[2]}</small></div>`
const timeStr = () => { const h = gameHour(); return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}` }

function render() {
  const s = screen
  const back = page === 'home' ? '' : '<div class="bar">⌫ Backspace volta · Esc fecha</div>'
  clearInterval(mapTimer)
  if (page === 'home') s.innerHTML = `<h4>Celular do Smoll</h4><div class="grid">${APPS.map(ico).join('')}</div>`
  else if (page === 'contatos') s.innerHTML = '<h4>📞 Contatos</h4>' + CONTACTS.map(([n, i], k) => `<div class="row${k === sel ? ' sel' : ''}" data-call="${k}">${i} ${n}</div>`).join('')
  else if (page === 'mensagens') s.innerHTML = '<h4>✉️ Mensagens</h4>' + MSGS.map(([n, t]) => `<div class="row"><b>${n}</b><br><span style="opacity:.8">${t}</span></div>`).join('') + '<button data-reply="1">Responder "tô ocupado kkk"</button>'
  else if (page === 'internet') s.innerHTML = '<h4>🌐 Internet</h4><input placeholder="endereço ou busca" spellcheck="false"><iframe></iframe>'
  else if (page === 'gps') { s.innerHTML = '<h4>🗺️ GPS</h4><canvas width="262" height="262" style="border-radius:8px;background:#1b2a1f"></canvas><div class="gl" style="margin-top:6px;font-size:12px"></div>'; drawMap(); mapTimer = window.setInterval(drawMap, 400) }
  else if (page === 'camera') s.innerHTML = '<h4>📷 Câmera</h4><p>Vai pro jogo: <b>clique</b> pra tirar a foto (vira item na mochila). P ou Esc sai.</p><button data-cam="1">Abrir câmera</button>'
  root.querySelector('.bar')?.remove(); if (back) root.insertAdjacentHTML('beforeend', back)
  const b = root.querySelector('.st b'); if (b) b.textContent = timeStr()
}

function drawMap() {
  const c = screen.querySelector('canvas'); if (!c) return
  const g = c.getContext('2d')!, W = 262, span = 140 // 140 m de lado, centrado no jogador
  g.fillStyle = '#1b2a1f'; g.fillRect(0, 0, W, W)
  const k = W / span, px = player.x, pz = player.z
  g.fillStyle = '#6b6f78'
  for (const [x0, z0, x1, z1] of STREET_RECTS) g.fillRect((x0 - px) * k + W / 2, (z0 - pz) * k + W / 2, (x1 - x0) * k, (z1 - z0) * k)
  g.fillStyle = '#e8dcc0'; g.fillRect((0 - px) * k + W / 2, (0 - pz) * k + W / 2, 20 * k, 16 * k) // casa do Smoll
  g.save(); g.translate(W / 2, W / 2); g.rotate(-player.yaw + Math.PI); g.fillStyle = '#ff4422'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore() // você, olhando pra frente
  const gl = screen.querySelector('.gl'); if (gl) gl.textContent = `${PLACE.street} · ${PLACE.sector} — x ${px.toFixed(0)}, z ${pz.toFixed(0)}`
}

const dialog = (msg: string, after?: () => void) => { toast(msg, 4500); after?.() }
const CALLS: Record<string, string> = {
  'Shadowy 💙': '"Oi, amor! Tô saindo do trabalho. Quer que eu leve alguma coisa? …Kuat de novo? Tá bom 🥰"',
  Aprendiz: '"Mestre?! Tô no meio de uma coisa… depois eu explico. Não tem nada a ver com o Hammy." *desliga*',
  Prohat: '"Fala, Smoll. Tá com o negócio? …Não, esquece, não fala por telefone." *desliga*',
  Hammy: '"Quem tá falando? Não conheço ninguém com esse número." *barulho de roda de hamster*',
  Deka: '"Shhh. Esse telefone tá grampeado. Fala só \"sim\" ou \"não\". …Sim." *desliga*',
}
function call(k: number) {
  const [n] = CONTACTS[k]
  if (n === 'Pizzaria do Zé') {
    toast('📞 Pizzaria do Zé: "Boa noite! Uma pizza de calabresa? Chega em 20 minutinhos." (na verdade 25 s)', 5000)
    setTimeout(() => { const id = defineItem('Pizza de calabresa', (g) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 16), new THREE.MeshLambertMaterial({ color: 0xe0a040 })); m.position.y = 0.0125; g.add(m); for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 8), new THREE.MeshLambertMaterial({ color: 0xb02a20 })); p.position.set(Math.cos(i * 1.26) * 0.08, 0.03, Math.sin(i * 1.26) * 0.08); g.add(p) } }); ITEMS[id].kind = 'food'; ITEMS[id].icon = '🍕'; if (give(id)) toast('🍕 O motoboy chegou e deixou a pizza com você! (mochila)') }, 25000)
  } else if (n === 'Polícia') dialog('📞 Polícia: "Qual a emergência?" — "O Smoll tá tocando violão." — "…isso é crime sim. Mas não é com a gente."')
  else if (n === 'Caramelo') dialog('📞 Caramelo: "Au! Au!" (ele atendeu mesmo sendo um cachorro)')
  else if (n === 'Mãe') dialog('📞 Mãe: "Já comeu? Tá usando casaco? Fecha esse computador!"')
  else if (n in CALLS) dialog(`📞 ${n}: ${CALLS[n]}`)
  else dialog('📞 Bia: "Ai, tô ocupada, te ligo depois!" (nunca liga)')
}

function startCamera() {
  closePhone(true); camMode = true
  hint.style.display = 'block'; hint.textContent = '📷 Clique pra tirar a foto · P ou Esc pra sair'
}
function shoot() {
  state.photoReq = (url) => {
    const id = defineItem(`Foto ${timeStr()}-${Math.floor(Math.random() * 1000)}`); ITEMS[id].img = url; ITEMS[id].icon = '🖼️'; ITEMS[id].use = () => viewPhoto(url, ITEMS[id].name)
    flash.style.opacity = '1'; setTimeout(() => (flash.style.opacity = '0'), 120)
    if (give(id)) toast('📸 Foto tirada! Ficou na mochila.')
  }
}
// clique esquerdo com a foto na mão: abre em tela cheia (clique ou Esc fecha)
let viewer: HTMLDivElement | null = null
function viewPhoto(url: string, title: string) {
  if (!viewer) {
    viewer = document.createElement('div')
    viewer.style.cssText = 'position:fixed;inset:0;z-index:45;background:#000d;display:none;place-items:center;cursor:zoom-out'
    viewer.innerHTML = '<div style="background:#fff;padding:10px 10px 28px;border-radius:4px;box-shadow:0 10px 40px #000;text-align:center;font:14px sans-serif;color:#333"><img style="max-width:80vw;max-height:72vh;display:block"><div class="t" style="margin-top:8px"></div></div>'
    document.body.appendChild(viewer)
    const close = () => { viewer!.style.display = 'none'; state.editing = false; document.querySelector('canvas')?.requestPointerLock?.() }
    viewer.addEventListener('click', close)
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && viewer!.style.display === 'grid') { viewer!.style.display = 'none'; state.editing = false } })
  }
  viewer.querySelector('img')!.src = url; viewer.querySelector('.t')!.textContent = title
  document.exitPointerLock?.(); state.editing = true; viewer.style.display = 'grid'
}
function exitCamera() { camMode = false; hint.style.display = 'none' }

function toggleLight() { lightOn = !lightOn; spot.intensity = lightOn ? 14 : 0; toast(lightOn ? '🔦 Lanterna ligada' : 'Lanterna desligada') }

function pickApp(id: string) {
  if (id === 'lanterna') { toggleLight(); return }
  page = id; sel = 0; render()
  if (id === 'internet') { const inp = screen.querySelector('input')!; inp.focus() }
}

export function openPhone() {
  if (root.classList.contains('on')) return
  page = 'home'; sel = 0; render(); battery = Math.max(5, battery - 1)
  const bat = root.querySelector('.st span:last-child'); if (bat) bat.textContent = `🔋 ${battery}%`
  document.exitPointerLock?.(); state.editing = true; root.classList.add('on')
}
export function closePhone(relock = true) {
  clearInterval(mapTimer); root.classList.remove('on'); state.editing = false
  if (relock) document.querySelector('canvas')?.requestPointerLock?.()
}

export function initPhone(camera: THREE.Camera, p: { x: number; z: number; yaw: number }) {
  player = p
  root = document.createElement('div'); root.id = 'phone'
  root.innerHTML = '<div class="st"><b></b><span>📶 Smoll_5G &nbsp; 🔋 74%</span></div><div class="scr"></div>'
  screen = root.querySelector('.scr') as HTMLDivElement
  hint = document.createElement('div'); hint.id = 'camhint'; flash = document.createElement('div'); flash.id = 'camflash'
  document.body.append(root, hint, flash)
  spot = new THREE.SpotLight(0xfff4e0, 0, 16, 0.55, 0.5, 1.2); spot.position.set(0.1, -0.1, 0); spot.target.position.set(0, 0, -6); camera.add(spot, spot.target)
  screen.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const app = t.closest('[data-app]') as HTMLElement | null, callEl = t.closest('[data-call]') as HTMLElement | null
    if (app) pickApp(app.dataset.app!)
    else if (callEl) call(+callEl.dataset.call!)
    else if (t.dataset.cam) startCamera()
    else if (t.dataset.reply) toast('Você respondeu: "tô ocupado kkk" 💬')
  })
  addEventListener('keydown', (e) => {
    const open = root.classList.contains('on')
    if (e.code === 'KeyP' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      if (camMode) { exitCamera(); return }
      if (open) { closePhone(); return }
      if (!state.editing && count(PHONE_ID) > 0) openPhone()
      return
    }
    if (camMode && e.code === 'Escape') { exitCamera(); return }
    if (!open) return
    if (e.code === 'Escape') { closePhone(false); return }
    if (e.target instanceof HTMLInputElement) {
      if (e.key === 'Enter') { // internet
        let u = (e.target as HTMLInputElement).value.trim(); if (!u) return
        if (!/^https?:\/\//.test(u)) u = /\.\w{2,}/.test(u) && !u.includes(' ') ? 'https://' + u : 'https://pt.wikipedia.org/w/index.php?search=' + encodeURIComponent(u)
        const f = screen.querySelector('iframe')!; f.src = `http://${location.hostname}:8080/proxy?url=${encodeURIComponent(u)}`
      }
      if (e.code === 'Escape') closePhone(false)
      return
    }
    if (e.code === 'Backspace') { page = 'home'; sel = 0; render(); return }
    const n = page === 'home' ? APPS.length : page === 'contatos' ? CONTACTS.length : 0
    if (!n) return
    const cols = page === 'home' ? 3 : 1
    if (e.code === 'ArrowRight') sel = (sel + 1) % n; else if (e.code === 'ArrowLeft') sel = (sel + n - 1) % n
    else if (e.code === 'ArrowDown') sel = (sel + cols) % n; else if (e.code === 'ArrowUp') sel = (sel + n - cols) % n
    else if (e.code === 'Enter') { if (page === 'home') pickApp(APPS[sel][0]); else call(sel); return }
    else return
    render()
  })
  addEventListener('mousedown', (e) => { if (camMode && e.button === 0 && document.pointerLockElement) shoot() }, true)
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && camMode) exitCamera() })
}
