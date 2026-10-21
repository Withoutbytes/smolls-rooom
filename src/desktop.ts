import { state, toast } from './state'
import { codeState, runCode, DEFAULT_CODE, desk, pcState } from './code'
import { drawPage } from './screens'

// Desktop do PC do Smoll: tela cheia sobre o jogo, com janelas arrastáveis (VS Code, Navegador com iframe, Terminal) e barra de tarefas.
const css = document.createElement('style')
css.textContent = `
#desk{position:fixed;inset:0;z-index:30;display:none;font:13px 'Segoe UI',sans-serif;color:#e6edf3;background:radial-gradient(circle at 30% 20%,#2b5fb8,#14213d 60%,#0a0f1f)}
#desk .icons{position:absolute;left:14px;top:14px;display:grid;gap:14px}
#desk .ic{width:76px;text-align:center;cursor:pointer;user-select:none;text-shadow:0 1px 3px #000}#desk .ic i{display:block;font-size:34px;font-style:normal}#desk .ic:hover{background:#ffffff22;border-radius:6px}
#desk .win{position:absolute;display:none;flex-direction:column;background:#1e1e1e;border:1px solid #444;border-radius:8px;box-shadow:0 8px 30px #000a;overflow:hidden;min-width:360px;min-height:220px;resize:both}
#desk .tb{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#2d2d30;cursor:move;user-select:none}#desk .tb b{flex:1;font-weight:500}
#desk .tb button{background:none;border:0;color:#ddd;width:26px;height:22px;cursor:pointer;border-radius:4px}#desk .tb button:hover{background:#ffffff22}#desk .tb button.x:hover{background:#c42b1c}
#desk .task{position:absolute;left:0;right:0;bottom:0;height:40px;background:#101620f0;display:flex;align-items:center;gap:6px;padding:0 8px;border-top:1px solid #333}
#desk .task button{background:#ffffff14;color:#eee;border:0;border-radius:5px;padding:6px 10px;cursor:pointer}#desk .task button:hover{background:#ffffff30}#desk .task .sp{flex:1}
#desk textarea,#desk input{background:#1e1e1e;color:#e6edf3;border:0;outline:none;font:13px/1.5 Consolas,monospace}
#desk .vs{display:flex;flex:1;min-height:0}#desk .side{width:150px;background:#252526;padding:8px 0}#desk .side div{padding:3px 14px;cursor:pointer}#desk .side div:hover,#desk .side .on{background:#37373d}
#desk .ed{flex:1;display:flex;flex-direction:column;min-width:0}#desk .ed textarea{flex:1;padding:10px;resize:none;white-space:pre}
#desk .out{margin:0;padding:6px 10px;background:#181818;color:#79c0ff;font:12px Consolas,monospace;white-space:pre-wrap;max-height:90px;overflow:auto;border-top:1px solid #333}
#desk .stat{background:#007acc;color:#fff;padding:2px 10px;font-size:12px;display:flex;gap:14px}#desk .stat button{background:none;color:#fff;border:0;cursor:pointer}
#desk .nav{display:flex;gap:6px;padding:6px;background:#35363a}#desk .nav input{flex:1;border-radius:14px;padding:4px 12px;background:#202124}#desk .nav button{background:#ffffff14;color:#eee;border:0;border-radius:4px;cursor:pointer;padding:0 8px}
#desk .bm{display:flex;gap:10px;padding:3px 10px;background:#292a2d;font-size:12px}#desk .bm a{color:#9cc3ff;cursor:pointer}
#desk iframe{flex:1;border:0;background:#fff}
#desk .term{flex:1;display:flex;flex-direction:column;background:#0c0c0c;font:13px Consolas,monospace;min-height:0}#desk .term pre{flex:1;margin:0;padding:8px;overflow:auto;white-space:pre-wrap;color:#ccc}#desk .term input{background:#0c0c0c;padding:6px 8px;border-top:1px solid #333;color:#7ee787}
`
document.head.appendChild(css)

const root = document.createElement('div'); root.id = 'desk'
root.innerHTML = `
<div class="icons">
  <div class="ic" data-app="vs"><i>💻</i>VS Code</div><div class="ic" data-app="web"><i>🌐</i>Navegador</div><div class="ic" data-app="term"><i>⌨️</i>Terminal</div>
  <div class="ic" data-app="lixo"><i>🗑️</i>Lixeira</div>
</div>
<div class="win" id="w-vs" style="left:190px;top:40px;width:640px;height:420px"><div class="tb"><b>smoll.ts — Visual Studio Code</b><button class="x">✕</button></div>
  <div class="vs"><div class="side"><div class="on">smoll.ts</div><div data-f="readme">README.md</div><div data-f="bugs">bugs.txt</div><div data-f="senhas">senhas.txt</div></div>
  <div class="ed"><textarea spellcheck="false"></textarea><pre class="out">Ctrl+Enter executa. Comandos: smoll.sleep() · smoll.dance() · gate.open() · door.open() · player.speed = 3 · player.tp(34, 12)</pre></div></div>
  <div class="stat"><span>⎇ main</span><span>UTF-8</span><span>TypeScript</span><button class="run">▶ Executar</button><button class="rst">Restaurar</button></div></div>
<div class="win" id="w-web" style="left:260px;top:70px;width:760px;height:480px"><div class="tb"><b>Navegador</b><button class="x">✕</button></div>
  <div class="nav"><button class="go-back">◀</button><input value="https://pt.wikipedia.org/" spellcheck="false"><button class="go">Ir</button></div>
  <div class="bm"><a data-u="https://pt.wikipedia.org/">Wikipédia</a><a data-u="https://www.openstreetmap.org/export/embed.html?bbox=-63.12,-9.98,-63.02,-9.90">Mapa de Ariquemes</a><a data-u="https://www.youtube.com/embed/jNQXAC9IVRw">YouTube</a><a data-u="https://example.com/">example.com</a></div>
  <iframe></iframe></div>
<div class="win" id="w-term" style="left:330px;top:120px;width:520px;height:300px"><div class="tb"><b>Terminal — smoll@pc</b><button class="x">✕</button></div>
  <div class="term"><pre>Smoll OS 1.0 — digite comandos como smoll.dance() ou gate.open()\n</pre><input placeholder="smoll@pc:~$" spellcheck="false"></div></div>
<div class="task"><button class="exit">⏻ Sair do PC (Esc)</button><span class="sp"></span><span class="clock"></span></div>`
document.body.appendChild(root)

const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T
const wins = ['vs', 'web', 'term'].map((k) => $<HTMLDivElement>('#w-' + k))
let z = 1
const focus = (w: HTMLElement) => (w.style.zIndex = String(++z))
type Win = 'vs' | 'web' | 'term'
const show = (w: HTMLElement) => { w.style.display = 'flex'; focus(w); desk[w.id.slice(2) as Win] = true } // desk: o que está aberto aparece nos monitores do PC

// arrastar pela barra de título
wins.forEach((w) => {
  const bar = w.querySelector<HTMLElement>('.tb')!
  w.addEventListener('mousedown', () => focus(w))
  bar.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return
    const dx = e.clientX - w.offsetLeft, dy = e.clientY - w.offsetTop
    const mv = (m: MouseEvent) => { w.style.left = m.clientX - dx + 'px'; w.style.top = Math.max(0, m.clientY - dy) + 'px' }
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up) }
    addEventListener('mousemove', mv); addEventListener('mouseup', up)
  })
  w.querySelector('.x')!.addEventListener('click', () => { w.style.display = 'none'; desk[w.id.slice(2) as Win] = false })
})
const [wVs, wWeb, wTerm] = wins
root.querySelectorAll<HTMLElement>('.ic').forEach((ic) => ic.addEventListener('dblclick', () => open(ic.dataset.app!)))
root.querySelectorAll<HTMLElement>('.ic').forEach((ic) => ic.addEventListener('click', () => open(ic.dataset.app!))) // um clique já abre, mais prático
const open = (a: string) => { if (a === 'vs') show(wVs); else if (a === 'web') show(wWeb); else if (a === 'term') show(wTerm); else { show(wTerm); say('A lixeira tem 2.847 arquivos "teste_final_v3_AGORA_VAI.ts". Não mexe.') } }

// ---- VS Code ----
const FILES: Record<string, string> = {
  readme: '# smoll.ts\n\nJogo sobre mim mesmo, em primeira pessoa.\nTODO: terminar o jogo antes de morrer.\n',
  bugs: '1. A cadeira anda sozinha\n2. O quintal tem mais manga que o esperado\n3. O vizinho jura que o muro é dele\n4. Alguém mexeu no meu armário (?)\n',
  senhas: 'wifi: ariquemes1234\nbanco: não me faça rir\nnetflix: da minha prima (não conta)\n',
}
const ta = wVs.querySelector('textarea')!, out = wVs.querySelector<HTMLElement>('.out')!
let cur = 'smoll'
const NAMES: Record<string, string> = { smoll: 'smoll.ts', readme: 'README.md', bugs: 'bugs.txt', senhas: 'senhas.txt' }
// espelha o editor nos monitores: arquivo aberto, texto, linha e coluna do cursor
const syncView = () => {
  const before = ta.value.slice(0, ta.selectionStart).split('\n')
  desk.file = NAMES[cur]; desk.lines = ta.value.split('\n'); desk.cursor = before.length - 1; desk.col = before[before.length - 1].length
  if (cur === 'smoll') { codeState.lines = desk.lines; codeState.edited = true }
}
const side = [...wVs.querySelectorAll<HTMLElement>('.side div')]
const sel = (el: HTMLElement) => {
  if (cur === 'smoll') codeState.lines = ta.value.split('\n'); else FILES[cur] = ta.value
  cur = el.dataset.f ?? 'smoll'; ta.value = cur === 'smoll' ? codeState.lines.join('\n') : FILES[cur]
  side.forEach((s) => s.classList.toggle('on', s === el)); syncView()
}
side.forEach((el) => el.addEventListener('click', () => sel(el)))
const run = () => { if (cur !== 'smoll') { out.textContent = 'Só o smoll.ts executa.'; return } out.textContent = runCode(ta.value).join('\n') || 'ok' }
wVs.querySelector('.run')!.addEventListener('click', run)
wVs.querySelector('.rst')!.addEventListener('click', () => { if (cur === 'smoll') { ta.value = DEFAULT_CODE; syncView() } })
for (const ev of ['input', 'keyup', 'click']) ta.addEventListener(ev, syncView)
ta.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() }
  else if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end') }
})

// ---- navegador (iframe: sites que proíbem ser embutidos ficam em branco, aí é só trocar) ----
const url = wWeb.querySelector('input')!, frame = wWeb.querySelector('iframe')!
const hist: string[] = []
const go = (u: string, push = true) => {
  u = u.trim()
  if (!/^https?:\/\//.test(u)) u = /\.\w{2,}/.test(u) && !u.includes(' ') ? 'https://' + u : 'https://pt.wikipedia.org/w/index.php?search=' + encodeURIComponent(u)
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/); if (yt) u = 'https://www.youtube.com/embed/' + yt[1]
  if (push) hist.push(u)
  url.value = u; desk.url = u
  if (!state.internet) { frame.removeAttribute('src'); frame.srcdoc = '<body style="font:18px sans-serif;padding:40px;background:#fff"><h2>Sem conexão</h2>O roteador está reiniciando. Aguarde alguns segundos.'; return }
  // sites que deixam ser embutidos abrem direto; o resto passa pelo proxy do servidor (que tira o bloqueio de iframe)
  frame.src = /youtube\.com\/embed|openstreetmap\.org\/export\/embed|wikipedia\.org/.test(u) ? u : `http://${location.hostname}:8080/proxy?url=${encodeURIComponent(u)}`
}
wWeb.querySelector('.go')!.addEventListener('click', () => go(url.value))
wWeb.querySelector('.go-back')!.addEventListener('click', () => { hist.pop(); const u = hist.pop(); if (u) go(u) })
wWeb.querySelectorAll<HTMLElement>('.bm a').forEach((a) => a.addEventListener('click', () => go(a.dataset.u!)))
url.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(url.value) })
addEventListener('message', (e) => { if (e.source === frame.contentWindow && typeof e.data?.smollGo === 'string') go(e.data.smollGo) }) // clique em link dentro do site proxied

// ---- terminal ----
const tpre = wTerm.querySelector('pre')!, tin = wTerm.querySelector('input')!
const say = (t: string) => { tpre.textContent += t + '\n'; tpre.scrollTop = 1e9 }
tin.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key !== 'Enter' || !tin.value.trim()) return
  say('smoll@pc:~$ ' + tin.value)
  const keep = codeState.lines; say(runCode(tin.value).join('\n') || 'ok'); codeState.lines = keep; tin.value = ''
})

// ---- abrir / fechar ----
const tick = () => { $('.clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
export function openDesktop() {
  if (pcState.mode !== 'ok') { toast(pcState.mode === 'off' ? 'O PC está desligado. Liga pelo gabinete.' : 'O PC está reiniciando…'); return }
  state.editing = true; document.exitPointerLock?.(); root.style.display = 'block'; tick()
  if (cur === 'smoll') ta.value = codeState.lines.join('\n')
  desk.used = true; desk.vw = innerWidth; desk.vh = innerHeight; syncView()
  if (wVs.style.display !== 'flex') show(wVs)
  if (!frame.src) go('https://pt.wikipedia.org/', true)
}
export function closeDesktop() { if (cur === 'smoll') codeState.lines = ta.value.split('\n'); root.style.display = 'none'; state.editing = false }
root.querySelector('.exit')!.addEventListener('click', closeDesktop)
addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.style.display === 'block') closeDesktop() })

// ---- espelho nos monitores: o mesmo desktop (papel de parede, ícones, janelas na mesma posição e tamanho, conteúdo, barra de tarefas) desenhado em canvas ----
export function drawDesktop(c: CanvasRenderingContext2D, w: number, h: number, now: number) {
  const VW = desk.vw || 1568, VH = desk.vh || 772, k = w / VW, kv = h / VH
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2b5fb8'); g.addColorStop(0.6, '#14213d'); g.addColorStop(1, '#0a0f1f'); c.fillStyle = g; c.fillRect(0, 0, w, h)
  const f = (px: number) => `${Math.max(6, px * k * 1.7)}px sans-serif`
  c.textAlign = 'center'; c.fillStyle = '#fff'
  ;['💻 VS Code', '🌐 Navegador', '⌨️ Terminal', '🗑️ Lixeira'].forEach((t, i) => { const [ic, n] = t.split(' '); c.font = `${Math.max(14, 34 * k)}px sans-serif`; c.fillText(ic, 50 * k, (58 + i * 96) * kv); c.font = f(11); c.fillText(n, 50 * k, (82 + i * 96) * kv) })
  c.textAlign = 'left'
  const order: [keyof typeof desk, HTMLDivElement, string][] = [['vs', wVs, 'smoll.ts — Visual Studio Code'], ['web', wWeb, 'Navegador'], ['term', wTerm, 'Terminal — smoll@pc']]
  order.filter(([key]) => desk[key]).sort((a, b) => (+a[1].style.zIndex || 0) - (+b[1].style.zIndex || 0)).forEach(([key, el, title]) => {
    const x = parseFloat(el.style.left) * k, y = parseFloat(el.style.top) * kv, ww = el.offsetWidth ? el.offsetWidth * k : parseFloat(el.style.width) * k, hh = el.offsetHeight ? el.offsetHeight * kv : parseFloat(el.style.height) * kv
    const tb = Math.max(8, 30 * kv)
    c.fillStyle = '#1e1e1e'; c.fillRect(x, y, ww, hh); c.fillStyle = '#2d2d30'; c.fillRect(x, y, ww, tb)
    c.fillStyle = '#ddd'; c.font = f(12); c.fillText(key === 'vs' ? `${desk.file} — Visual Studio Code` : title, x + 8 * k, y + tb * 0.7); c.fillStyle = '#c42b1c'; c.fillRect(x + ww - 16 * k, y + 2, 14 * k, tb - 4)
    const by = y + tb, bh = hh - tb
    if (key === 'vs') {
      c.fillStyle = '#252526'; c.fillRect(x, by, 150 * k, bh); c.font = f(12)
      ;['smoll.ts', 'README.md', 'bugs.txt', 'senhas.txt'].forEach((n, i) => { c.fillStyle = n === desk.file ? '#fff' : '#aaa'; if (n === desk.file) { c.fillStyle = '#37373d'; c.fillRect(x, by + (6 + i * 22) * kv, 150 * k, 20 * kv); c.fillStyle = '#fff' } c.fillText(n, x + 14 * k, by + (22 + i * 22) * kv) })
      const L = desk.lines ?? codeState.lines, lh = 18 * kv, off = Math.max(0, desk.cursor - Math.floor((bh - 40 * kv) / lh) + 1)
      c.font = `${Math.max(6, 13 * k * 1.5)}px monospace`
      for (let i = 0; i + off < L.length && 30 * kv + i * lh < bh - 24 * kv; i++) { const ln = L[i + off]; c.fillStyle = ln.trim().startsWith('//') ? '#6a9955' : /\b(const|let|function|export|import|return|if|while|await|new)\b/.test(ln) ? '#9cdcfe' : '#d4d4d4'; c.fillText(ln.slice(0, 60), x + 160 * k, by + 30 * kv + i * lh) }
      if (Math.floor(now * 2) % 2) { c.fillStyle = '#fff'; c.fillRect(x + (160 + Math.min(desk.col, 60) * 7.8) * k, by + 18 * kv + (desk.cursor - off) * lh, 1.5, lh * 0.8) }
      c.fillStyle = '#007acc'; c.fillRect(x, y + hh - 20 * kv, ww, 20 * kv)
    } else if (key === 'web') {
      c.fillStyle = '#35363a'; c.fillRect(x, by, ww, 36 * kv); c.fillStyle = '#202124'; c.fillRect(x + 50 * k, by + 6 * kv, ww - 120 * k, 24 * kv)
      c.fillStyle = '#9aa0a6'; c.font = f(12); c.fillText(desk.url.replace(/^https?:\/\//, '').slice(0, 60), x + 62 * k, by + 23 * kv)
      const py = by + 64 * kv, ph = hh - tb - 64 * kv
      c.save(); c.beginPath(); c.rect(x, py, ww, ph); c.clip(); c.translate(x, py); c.scale(ww / 512, ph / 300); drawPage(c, desk.url, 0, 300, 512, now); c.restore()
    } else {
      c.fillStyle = '#0c0c0c'; c.fillRect(x, by, ww, bh); c.fillStyle = '#ccc'; c.font = `${Math.max(6, 13 * k * 1.5)}px monospace`
      const lines = (tpre.textContent ?? '').split('\n').slice(-Math.floor(bh / (16 * kv)) + 1)
      lines.forEach((ln, i) => c.fillText(ln.slice(0, 70), x + 6 * k, by + 16 * kv + i * 16 * kv))
    }
  })
  c.fillStyle = '#101620'; c.fillRect(0, h - 38 * kv, w, 38 * kv); c.fillStyle = '#ddd'; c.font = f(12); c.fillText('⏻ Sair do PC', 10 * k, h - 14 * kv)
  c.textAlign = 'right'; c.fillText(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), w - 10 * k, h - 14 * kv); c.textAlign = 'left'
}
