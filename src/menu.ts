import { state, toast } from './state'
import { give, ITEMS, iconHtml } from './inventory'

// Painel genérico de interação (relógio de luz, caixa de correio…): título, corpo que se atualiza sozinho e botões. Solta o mouse e ignora as teclas do jogo enquanto aberto.
type Btn = { t: string; fn: () => void; keep?: boolean } // keep: não fecha o painel ao clicar
let el: HTMLDivElement | null = null, timer = 0, render: () => void = () => {}, onBody: ((e: HTMLElement) => void) | null = null

const build = () => {
  const css = document.createElement('style')
  css.textContent = `#panel{position:fixed;inset:0;display:none;place-items:center;z-index:24;background:#0006}#panel .box{background:#15171d;border:1px solid #444;border-radius:12px;padding:16px;color:#eee;font:14px sans-serif;width:min(460px,94vw)}
#panel h3{margin:0 0 8px}#panel .body{margin:8px 0;line-height:1.5}#panel button{background:#2d2d38;color:#eee;border:0;border-radius:6px;padding:7px 11px;cursor:pointer;margin:3px 4px 0 0}#panel button:hover{background:#2f6f3f}
#panel .it{display:inline-grid;place-items:center;width:78px;height:70px;margin:3px;background:#222;border:1px solid #444;border-radius:8px;font-size:26px;cursor:pointer;position:relative}#panel .it small{font-size:10px;text-align:center;line-height:1.1}#panel .it b{position:absolute;right:4px;top:2px;font-size:11px}#panel .it:hover{border-color:#8f8}`
  document.head.appendChild(css)
  el = document.createElement('div'); el.id = 'panel'; el.innerHTML = '<div class="box"><h3></h3><div class="body"></div><div class="btns"></div></div>'; document.body.appendChild(el)
  el.addEventListener('mousedown', (e) => { if (e.target === el) closePanel() })
  el.querySelector('.body')!.addEventListener('click', (e) => onBody?.(e.target as HTMLElement))
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && el!.style.display === 'grid') closePanel() })
}

export function openPanel(title: string, body: () => string, buttons: Btn[], bodyClick?: (e: HTMLElement) => void) {
  if (!el) build()
  const e = el!
  e.querySelector('h3')!.textContent = title
  render = () => { e.querySelector('.body')!.innerHTML = body() }; render(); onBody = bodyClick ?? null
  const btns = e.querySelector('.btns')!; btns.innerHTML = ''
  for (const b of [...buttons, { t: 'Fechar (Esc)', fn: () => {} }]) {
    const bt = document.createElement('button'); bt.textContent = b.t
    bt.onclick = () => { b.fn(); if ('keep' in b && b.keep) render(); else closePanel() }
    btns.appendChild(bt)
  }
  clearInterval(timer); timer = window.setInterval(render, 500)
  document.exitPointerLock?.(); state.editing = true; e.style.display = 'grid'
}
export function closePanel() {
  if (!el || el.style.display !== 'grid') return
  clearInterval(timer); el.style.display = 'none'; state.editing = false
  document.querySelector('canvas')?.requestPointerLock?.()
}

/** baú/caixa com itens que dá pra pegar: stock = lista mutável de pilhas (o clique tira 1 e manda pra mochila) */
export function openChest(title: string, stock: { id: string; n: number }[]) {
  const body = () => stock.length
    ? stock.map((s, i) => `<div class="it" data-i="${i}" title="${ITEMS[s.id].name}">${iconHtml(s.id)}${s.n > 1 ? `<b>×${s.n}</b>` : ''}<small>${ITEMS[s.id].name}</small></div>`).join('')
    : '<i>Vazio.</i>'
  const take = (i: number) => { const s = stock[i]; if (!s || !give(s.id)) return; toast(`Pegou: ${ITEMS[s.id].name}`); if (--s.n <= 0) stock.splice(i, 1) }
  openPanel(title, body, [{ t: 'Pegar tudo', fn: () => { for (let i = stock.length - 1; i >= 0; i--) while (stock[i] && stock[i].n > 0 && give(stock[i].id)) { if (--stock[i].n <= 0) { stock.splice(i, 1); break } } }, keep: true }],
    (t) => { const it = t.closest('.it') as HTMLElement | null; if (it) { take(+it.dataset.i!); render() } })
}
