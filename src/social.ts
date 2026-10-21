import { state, toast } from './state'
import { openPanel } from './menu'

// Gestos do jogador (tecla B): aparecem no espelho (seu avatar) e pros outros jogadores (via servidor).
export const EMOTES: [string, string, string][] = [['acenar', '👋', 'Acenar'], ['aplaudir', '👏', 'Aplaudir'], ['dancar', '💃', 'Dançar'], ['rir', '😂', 'Rir'], ['apontar', '👉', 'Apontar']]
export function emote(id: string) { state.myEmote = { id, n: state.myEmote.n + 1 }; toast(`Você: ${EMOTES.find((e) => e[0] === id)?.[2] ?? id}`) }
addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && !state.editing) openPanel('🙌 Gestos', () => 'Escolha um gesto: aparece no espelho e pros outros jogadores.', EMOTES.map(([id, ic, n]) => ({ t: `${ic} ${n}`, fn: () => emote(id) })))
})
