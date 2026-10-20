/**
 * Metadane pluginu ArkMail - pojedyncze zrodlo prawdy o wersji.
 * PLUGIN_VERSION musi byc rowne plugin.json metadata.version i nazwie
 * zipa w releases/ (straznik: tests/version.test.mjs, guard w build.js).
 * PLUGIN_BUILD_DATE nadpisuje scripts/stamp_build_date.py przy release.
 */

export const PLUGIN_VERSION = "1.11.0";
export const PLUGIN_BUILD_DATE = "20-10-2026";

export const PLUGIN_NAME = "ArkMail";
export const PLUGIN_AUTHOR = "Isithunzi000";
export const PLUGIN_DESCRIPTION =
  "ArkMail to kompleksowy system pocztowy dla klienta Dargoth: skrzynki, kontakty, archiwum i pisanie listow (alias /arkmail). Plugin w pelni zgodny z regulaminem gry - wszystkie komendy wysylane swiadomie przez gracza, bez automatyki.";
