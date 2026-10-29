/**
 * Powiadomienia ArkMail przez centrum powiadomien klienta (tost).
 * Kontrakt typowany: NotificationPayload { text, time? } - time [ms]
 * kontroluje czas wyswietlania. (Wariant systemowy z dokumentacji
 * klienta nie ma pokrycia w typach - nie uzywamy.)
 */

import type PluginApi from 'plugin-api';

const DEFAULT_NOTIFY_TIME_MS = 8000;

export function notify(
  api: Pick<PluginApi, 'events'>,
  text: string,
  opts: { time?: number } = {},
): void {
  api.events.emit('notify', { text, time: opts.time ?? DEFAULT_NOTIFY_TIME_MS });
}
