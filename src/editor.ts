import { state } from './state'
import { codeState, runCode, DEFAULT_CODE } from './code'

const $ = (id: string) => document.getElementById(id)!
const box = $('editor'), ta = $('ta') as HTMLTextAreaElement, out = $('out')

export function openEditor() {
  state.editing = true
  ta.value = codeState.lines.join('\n'); out.textContent = 'Comandos: smoll.sleep() · smoll.dance() · smoll.say("oi") · gate.open() · door.open() · player.speed = 3 · player.height = 2.2 · player.tp(34, 12)'
  box.style.display = 'flex'; document.exitPointerLock(); setTimeout(() => ta.focus(), 50)
}
export function closeEditor() { box.style.display = 'none'; state.editing = false }

$('run').onclick = () => { out.textContent = runCode(ta.value).join('\n') }
$('reset').onclick = () => { ta.value = DEFAULT_CODE }
$('close').onclick = closeEditor
ta.addEventListener('keydown', (e) => {
  e.stopPropagation() // não deixa o jogo ler WASD/E enquanto digita
  if (e.key === 'Escape') closeEditor()
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); out.textContent = runCode(ta.value).join('\n') }
  else if (e.key === 'Tab') { e.preventDefault(); const i = ta.selectionStart; ta.setRangeText('  ', i, ta.selectionEnd, 'end') }
})
