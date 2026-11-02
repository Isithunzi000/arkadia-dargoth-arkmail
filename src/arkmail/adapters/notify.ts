/**
 * Powiadomienia ArkMail przez centrum powiadomien klienta
 * (api.notifications.show). Toast dostaje pogrubiony tytul i poziom,
 * wiec dlugi tekst nie lamie sie w waskiej karcie tostu (352 px).
 * Kontrakt: { text, title?, level, time } - level domyslnie 'info',
 * time [ms] domyslnie 8000.
 */

import type PluginApi from 'plugin-api';

const DEFAULT_NOTIFY_TIME_MS = 8000;

export type NotifyLevel = 'info' | 'success' | 'warning' | 'error';

export function notify(
  api: Pick<PluginApi, 'notifications'>,
  text: string,
  opts: { title?: string; level?: NotifyLevel; time?: number } = {},
): void {
  api.notifications.show({
    text,
    ...(opts.title !== undefined ? { title: opts.title } : {}),
    level: opts.level ?? 'info',
    time: opts.time ?? DEFAULT_NOTIFY_TIME_MS,
  });
}
