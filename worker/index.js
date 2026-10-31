// Worker do Smoll's Room na Cloudflare: serve o site (assets), o multiplayer (/ws → Durable Object "Room", sala única) e o proxy do navegador (/proxy).
// Equivale a server/index.js + server/proxy.js (que continuam servindo o desenvolvimento local).
const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d)
const DAY_MS = 20 * 60 * 1000 // dia de jogo = 20 min; começa às 8h

export class Room {
  constructor() { this.players = new Map(); this.socks = new Set(); this.next = 0; this.start = Date.now(); this.timer = 0 }
  hour() { return (8 + ((Date.now() - this.start) / DAY_MS) * 24) % 24 }
  fetch(req) {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('ws', { status: 426 })
    const [client, ws] = Object.values(new WebSocketPair())
    ws.accept()
    const id = String(++this.next)
    this.players.set(id, { id, x: 15.5, z: 8.5, yaw: 0, name: 'Visitante' })
    this.socks.add(ws)
    ws.send(JSON.stringify({ t: 'hi', id, h: this.hour() }))
    ws.addEventListener('message', (e) => {
      try {
        const m = JSON.parse(e.data), p = this.players.get(id)
        p.x = num(m.x, -110, 180, p.x); p.z = num(m.z, -120, 225, p.z); p.yaw = num(m.yaw, -10, 10, p.yaw)
        p.y = num(m.y, -2, 30, p.y ?? 0)
        p.name = String(m.name ?? 'Visitante').slice(0, 16)
        p.sit = /^[\d.]+_[\d.]+$/.test(String(m.sit ?? '')) ? String(m.sit).slice(0, 16) : ''
        p.e = ['acenar', 'aplaudir', 'dancar', 'rir', 'apontar'].includes(m.e) ? m.e : ''
        p.en = num(m.en, 0, 1e9, p.en ?? 0)
        p.c = m.c ? 1 : 0
      } catch { /* mensagem inválida: ignora */ }
    })
    const bye = () => { this.players.delete(id); this.socks.delete(ws); if (!this.socks.size) { clearInterval(this.timer); this.timer = 0 } }
    ws.addEventListener('close', bye); ws.addEventListener('error', bye)
    if (!this.timer) this.timer = setInterval(() => { // 15 Hz só enquanto houver gente na sala
      const msg = JSON.stringify({ t: 's', p: [...this.players.values()], h: this.hour() })
      for (const s of this.socks) try { s.send(msg) } catch { /* socket caiu */ }
    }, 66)
    return new Response(null, { status: 101, webSocket: client })
  }
}

// ---- proxy: busca a página, tira cabeçalhos que proíbem iframe e injeta um script que mantém links/formulários no proxy. Só GET http(s). ----
const INJECT = (url) => `<base href="${url.replace(/"/g, '&quot;')}"><script>
(function(){var go=function(u){parent.postMessage({smollGo:u},'*')};
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.href;if(!/^https?:/.test(h))return;e.preventDefault();go(h)},true);
document.addEventListener('submit',function(e){var f=e.target;if(f.method&&f.method.toLowerCase()==='post')return;e.preventDefault();var u=new URL(f.action||location.href);new FormData(f).forEach(function(v,k){if(typeof v==='string')u.searchParams.set(k,v)});go(u.href)},true);
})()</script>`
// Workers não alcançam a rede local, mas bloqueamos IP literal e nomes internos mesmo assim (ponytail: sem checagem de DNS, o runtime não tem resolvedor)
const allowed = (u) => (u.protocol === 'http:' || u.protocol === 'https:') && !/^[\d.]+$|:|^localhost$|\.(local|internal|localhost)$/i.test(u.hostname)

async function proxy(req) {
  const page = (code, msg) => new Response(`<body style="font:16px sans-serif;padding:24px"><h3>${msg}</h3>`, { status: code, headers: { 'content-type': 'text/html; charset=utf-8' } })
  try {
    let u = new URL(new URL(req.url).searchParams.get('url') ?? '')
    let r
    for (let hop = 0; hop < 6; hop++) {
      if (!allowed(u)) return page(403, 'Esse endereço não pode ser aberto aqui.')
      r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36', 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' } })
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue }
      break
    }
    const type = r.headers.get('content-type') ?? 'application/octet-stream'
    const buf = await r.arrayBuffer()
    if (buf.byteLength > 8e6) return page(413, 'Página grande demais.')
    const headers = { 'content-type': type, 'access-control-allow-origin': '*' }
    if (!/text\/html/i.test(type)) return new Response(buf, { status: r.status, headers })
    let html = new TextDecoder().decode(buf).replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + INJECT(u.href)) : INJECT(u.href) + html
    return new Response(html, { status: r.status, headers })
  } catch { return page(502, 'Não consegui abrir essa página.') }
}

export default {
  fetch(req, env) {
    const { pathname } = new URL(req.url)
    if (pathname === '/ws') return env.ROOM.get(env.ROOM.idFromName('main')).fetch(req)
    if (pathname === '/proxy') return proxy(req)
    return env.ASSETS.fetch(req)
  },
}
