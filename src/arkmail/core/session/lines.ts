/**
 * Tekstowa detekcja linii specjalnych - zywy PluginApi daje triggerom
 * sam tekst (bez klas gmcp_msgs), wiec maszyny stanow nie moga polegac
 * na klasach. Formaty zweryfikowane z logami gry:
 * - echo komendy: "→ <komenda>" (klient dokleja strzalke),
 * - prompt gry: "> " (ew. powielone ">").
 */

/** Echo komendy (naszej lub gracza) w strumieniu wyjscia. */
export function isEchoLine(text: string): boolean {
  return text.startsWith('→ ') || text === '→';
}

/** Prompt gry ("> ", ">> " itd.). */
export function isPromptLine(text: string): boolean {
  return /^>+\s*$/.test(text);
}
