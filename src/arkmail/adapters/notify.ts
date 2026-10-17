/**
 * Powiadomienia ArkMail przez centrum powiadomien klienta (tost).
 * Kontrakt typowany: NotificationPayload { text, time? } - time [ms]
 * kontroluje czas wyswietlania. (Wariant systemowy z dokumentacji
 * klienta nie ma pokrycia w typach - nie uzywamy.)
 */

import type PluginApi from 'plugin-api';

export function notify(
  api: Pick<PluginApi, 'events'>,
  text: string,
  opts: { time?: number } = {},
): void {
  api.events.emit('notify', opts.time !== undefined ? { text, time: opts.time } : { text });
}
