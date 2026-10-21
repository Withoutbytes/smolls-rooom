// Desenho das páginas do navegador do Smoll nos monitores (o iframe do desktop é de outra origem, então não dá pra copiar a imagem de verdade).
const thumbs: Record<string, HTMLImageElement | 'fail'> = {}
// páginas do navegador do Smoll desenhadas no monitor (o iframe do desktop é de outra origem, então não dá pra copiar a imagem de verdade)
export function drawPage(c: CanvasRenderingContext2D, url: string, y: number, h: number, w: number, now: number) {
  c.fillStyle = '#fff'; c.fillRect(0, y, w, h)
  const skeleton = (x: number, yy: number, rows: number, wd: number) => { c.fillStyle = '#d7dadf'; for (let i = 0; i < rows; i++) c.fillRect(x, yy + i * 9, wd * (i % 3 === 2 ? 0.6 : 1), 5) }
  const yt = url.match(/youtube\.com\/embed\/([\w-]{11})/)
  if (yt) {
    c.fillStyle = '#000'; c.fillRect(0, y, w, h)
    const id = yt[1]
    if (!(id in thumbs)) { thumbs[id] = 'fail'; const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => (thumbs[id] = im); im.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } // miniatura se o servidor permitir CORS
    const t = thumbs[id]
    if (t && t !== 'fail') c.drawImage(t, 0, y, w, h)
    else { c.fillStyle = '#222'; c.fillRect(0, y, w, h); c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif'; c.fillText('▶ YouTube', w / 2 - 38, y + h / 2 - 4); c.font = '10px monospace'; c.fillStyle = '#aaa'; c.fillText(id, w / 2 - 30, y + h / 2 + 12) }
    c.fillStyle = '#ff0000'; c.fillRect(0, y + h - 5, ((now * 6) % 100) / 100 * w, 3)       // barra de progresso
  } else if (url.includes('wikipedia')) {
    c.fillStyle = '#f8f9fa'; c.fillRect(0, y, w, 26); c.fillStyle = '#000'; c.font = 'bold 14px serif'; c.fillText('WIKIPÉDIA', 40, y + 18); c.fillStyle = '#c8ccd1'; c.beginPath(); c.arc(22, y + 13, 9, 0, 7); c.fill()
    c.fillStyle = '#222'; c.font = '16px serif'; const q = decodeURIComponent((url.match(/search=([^&]+)/) ?? [])[1] ?? '').replace(/\+/g, ' '); c.fillText(q ? `Resultados para "${q.slice(0, 28)}"` : 'Boas-vindas à Wikipédia', 18, y + 52)
    skeleton(18, y + 64, 8, w - 150); c.fillStyle = '#eaf3ff'; c.fillRect(w - 120, y + 60, 100, 90)
  } else if (url.includes('openstreetmap')) {
    c.fillStyle = '#e8e0d0'; c.fillRect(0, y, w, h); c.strokeStyle = '#fff'; c.lineWidth = 5
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, y + 20 + i * 26); c.lineTo(w, y + 6 + i * 26 + (i % 2) * 14); c.stroke(); c.beginPath(); c.moveTo(40 + i * 70, y); c.lineTo(20 + i * 70, y + h); c.stroke() }
    c.fillStyle = '#e44'; c.beginPath(); c.arc(w / 2, y + h / 2, 6, 0, 7); c.fill()
  } else {
    const host = url.replace(/^https?:\/\//, '').split('/')[0]
    c.fillStyle = '#222'; c.font = 'bold 18px sans-serif'; c.fillText(host.slice(0, 30), 18, y + 40); skeleton(18, y + 56, 10, w - 60)
  }
}

