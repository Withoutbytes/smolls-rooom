// Servidor mínimo do Smoll's Room: sala única, cada cliente manda sua posição, o servidor devolve todos a 15 Hz.
// Uso: npm run server   (porta 8080, PORT=xxxx pra trocar)
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: +process.env.PORT || 8080 })
const players = new Map()
let next = 0
const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d)

wss.on('connection', (ws) => {
  const id = String(++next)
  players.set(id, { id, x: 15.5, z: 8.5, yaw: 0, name: 'Visitante' })
  ws.send(JSON.stringify({ t: 'hi', id }))
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw), p = players.get(id)
      p.x = num(m.x, -50, 100, p.x); p.z = num(m.z, -50, 100, p.z); p.yaw = num(m.yaw, -10, 10, p.yaw)
      p.name = String(m.name ?? 'Visitante').slice(0, 16)
    } catch { /* mensagem inválida: ignora */ }
  })
  ws.on('close', () => players.delete(id))
})

setInterval(() => {
  const msg = JSON.stringify({ t: 's', p: [...players.values()] })
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg)
}, 66)

console.log(`servidor multiplayer em ws://localhost:${wss.options.port}`)
