// Servidor mínimo do Smoll's Room: sala única, cada cliente manda sua posição, o servidor devolve todos a 15 Hz.
// Uso: npm run server   (porta 8080, PORT=xxxx pra trocar)
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { proxy } from './proxy.js'

const PORT = +process.env.PORT || 8080
const server = http.createServer((req, res) => (req.url.startsWith('/proxy') ? proxy(req, res) : (res.writeHead(404), res.end())))
const wss = new WebSocketServer({ server })
server.listen(PORT)
const players = new Map()
let next = 0
const DAY_MS = 20 * 60 * 1000, START = Date.now() // dia de jogo = 20 min; começa às 8h
const hour = () => (8 + ((Date.now() - START) / DAY_MS) * 24) % 24
const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d)

wss.on('connection', (ws) => {
  const id = String(++next)
  players.set(id, { id, x: 15.5, z: 8.5, yaw: 0, name: 'Visitante' })
  ws.send(JSON.stringify({ t: 'hi', id, h: hour() }))
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw), p = players.get(id)
      p.x = num(m.x, -110, 180, p.x); p.z = num(m.z, -120, 225, p.z); p.yaw = num(m.yaw, -10, 10, p.yaw)
      p.y = num(m.y, -2, 30, p.y ?? 0)
      p.name = String(m.name ?? 'Visitante').slice(0, 16)
      p.sit = /^[\d.]+_[\d.]+$/.test(String(m.sit ?? '')) ? String(m.sit).slice(0, 16) : '' // assento ocupado (chave x_z) ou vazio
      p.e = ['acenar', 'aplaudir', 'dancar', 'rir', 'apontar'].includes(m.e) ? m.e : ''
      p.en = num(m.en, 0, 1e9, p.en ?? 0)                                       // contador de gestos
    } catch { /* mensagem inválida: ignora */ }
  })
  ws.on('close', () => players.delete(id))
})

setInterval(() => {
  const msg = JSON.stringify({ t: 's', p: [...players.values()], h: hour() })
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg)
}, 66)

console.log(`servidor multiplayer em ws://localhost:${PORT}  (proxy do navegador em /proxy)`)
