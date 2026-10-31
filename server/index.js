// Servidor mínimo do Smoll's Room: sala única, cada cliente manda sua posição, o servidor devolve todos a 15 Hz.
// Uso: npm run server   (porta 8080, PORT=xxxx pra trocar)
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { proxy } from './proxy.js'
import { num, cleanSm, CMD_RE, okShared } from './shared.js'

const PORT = +process.env.PORT || 8080
const server = http.createServer((req, res) => (req.url.startsWith('/proxy') ? proxy(req, res) : (res.writeHead(404), res.end())))
const wss = new WebSocketServer({ server })
server.listen(PORT)
const players = new Map()
let next = 0
const DAY_MS = 20 * 60 * 1000, START = Date.now() // dia de jogo = 20 min; começa às 8h
const hour = () => (8 + ((Date.now() - START) / DAY_MS) * 24) % 24
const conn = new Map(), sh = new Map()
let sm = null
const hostId = () => players.keys().next().value // anfitrião do Smoll = jogador mais antigo

wss.on('connection', (ws) => {
  const id = String(++next)
  players.set(id, { id, x: 15.5, z: 8.5, yaw: 0, name: 'Visitante' })
  conn.set(id, ws)
  ws.send(JSON.stringify({ t: 'hi', id, h: hour(), sh: Object.fromEntries(sh) }))
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw), p = players.get(id)
      if (m.cmd !== undefined) { const h = hostId(); if (h !== id && CMD_RE.test(m.cmd)) conn.get(h)?.send(JSON.stringify({ t: 'cmd', c: m.cmd })); return }
      if (m.sh) {
        if (okShared(m.sh.k, m.sh.v) && (sh.has(m.sh.k) || sh.size < 300)) { sh.set(m.sh.k, m.sh.v); const o = JSON.stringify({ t: 'sh', k: m.sh.k, v: m.sh.v }); for (const [i, s] of conn) if (i !== id && s.readyState === 1) s.send(o) }
        return
      }
      if (id === hostId() && m.sm) sm = cleanSm(m.sm)
      p.x = num(m.x, -110, 180, p.x); p.z = num(m.z, -120, 225, p.z); p.yaw = num(m.yaw, -10, 10, p.yaw)
      p.y = num(m.y, -2, 30, p.y ?? 0)
      p.name = String(m.name ?? 'Visitante').slice(0, 16)
      p.sit = /^[\d.]+_[\d.]+$/.test(String(m.sit ?? '')) ? String(m.sit).slice(0, 16) : '' // assento ocupado (chave x_z) ou vazio
      p.e = ['acenar', 'aplaudir', 'dancar', 'rir', 'apontar'].includes(m.e) ? m.e : ''
      p.en = num(m.en, 0, 1e9, p.en ?? 0)                                       // contador de gestos
      p.c = m.c ? 1 : 0                                                          // agachado (Shift)
    } catch { /* mensagem inválida: ignora */ }
  })
  ws.on('close', () => { if (id === hostId()) sm = null; players.delete(id); conn.delete(id); if (!players.size) sh.clear() })
})

setInterval(() => {
  const msg = JSON.stringify({ t: 's', p: [...players.values()], h: hour(), hid: hostId(), sm })
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg)
}, 66)

console.log(`servidor multiplayer em ws://localhost:${PORT}  (proxy do navegador em /proxy)`)
