// Proxy de navegação pro navegador do PC do Smoll: busca a página, tira os cabeçalhos que proíbem iframe (X-Frame-Options / CSP) e injeta um script que
// faz os links e formulários continuarem passando pelo proxy. Só GET, só http(s), nada de rede local (SSRF). Sites muito dinâmicos (login, vídeo) podem não funcionar.
import dns from 'node:dns/promises'
import net from 'node:net'

const isPrivate = (ip) => {
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:') && isPrivate(l.slice(7)) }
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}
const allowed = async (u) => {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address)
  return ips.length > 0 && !ips.some(isPrivate)
}

const INJECT = (url) => `<base href="${url.replace(/"/g, '&quot;')}"><script>
(function(){var go=function(u){parent.postMessage({smollGo:u},'*')};
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.href;if(!/^https?:/.test(h))return;e.preventDefault();go(h)},true);
document.addEventListener('submit',function(e){var f=e.target;if(f.method&&f.method.toLowerCase()==='post')return;e.preventDefault();var u=new URL(f.action||location.href);new FormData(f).forEach(function(v,k){if(typeof v==='string')u.searchParams.set(k,v)});go(u.href)},true);
})()</script>`

export async function proxy(req, res) {
  const send = (code, msg) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<body style="font:16px sans-serif;padding:24px"><h3>${msg}</h3>`) }
  try {
    let u = new URL(new URL(req.url, 'http://x').searchParams.get('url') ?? '')
    let r
    for (let hop = 0; hop < 6; hop++) { // segue redirecionamentos na mão pra checar cada destino
      if (!(await allowed(u))) return send(403, 'Esse endereço não pode ser aberto aqui.')
      r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36', 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' } })
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue }
      break
    }
    const type = r.headers.get('content-type') ?? 'application/octet-stream'
    const body = Buffer.from(await r.arrayBuffer())
    if (body.length > 8e6) return send(413, 'Página grande demais.')
    const headers = { 'content-type': type, 'access-control-allow-origin': '*' }
    if (!/text\/html/i.test(type)) { res.writeHead(r.status, headers); return res.end(body) }
    let html = body.toString('utf8').replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + INJECT(u.href)) : INJECT(u.href) + html
    res.writeHead(r.status, headers); res.end(html)
  } catch (e) { send(502, 'Não consegui abrir essa página.') }
}
