import { state, toast } from './state'
import { codeState, runCode, DEFAULT_CODE, desk, pcState } from './code'

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
  desk.used = true; syncView()
  if (wVs.style.display !== 'flex') show(wVs)
  if (!frame.src) go('https://pt.wikipedia.org/', true)
}
export function closeDesktop() { if (cur === 'smoll') codeState.lines = ta.value.split('\n'); root.style.display = 'none'; state.editing = false }
root.querySelector('.exit')!.addEventListener('click', closeDesktop)
addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.style.display === 'block') closeDesktop() })
