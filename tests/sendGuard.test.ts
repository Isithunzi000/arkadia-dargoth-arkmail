/**
 * Sciezka wysylki (Fala UI-2 krok 5): advisory guard, nazwany blad
 * adresata, obsluga "Zaniechane." (~q w grze).
 *
 * Problem (zgloszenie 2026-11-03, konsola gracza):
 *  - przy jednym nieznanym imieniu serwer przerywa compose
 *    ("Nie ma takiego adresata (gracza, aliasu): X.") - plugin
 *    pokazywal ogolnik "Blad wysylki - sprawdz adresata." i gracz
 *    nie wiedzial, ktore imie zepsulo wysylke;
 *  - przy dlugiej liscie odbiorcow gracz czesto przerywa compose
 *    w grze klawiszem ~q - serwer odpowiada "Zaniechane." i plugin
 *    wisial do watchdog-timeoutu, po czym plul ogolnym bledem;
 *  - baza osob istnieje, ale plugin nie ostrzegal przed adresatami
 *    spoza niej - literowka wychodzila dopiero po wyslaniu listu.
 *
 * Kontrakt:
 *  - advisory guard (NIE blokuje wysylki): imiona spoza bazy osob
 *    (kontakty + zaimportowane osoby + aliasy pocztowe + czlonkowie
 *    grup) sa wypisane w ostrzezeniu, wysylka leci dalej;
 *  - serwerowe "Nie ma takiego adresata (gracza, aliasu): X." ->
 *    toast wskazuje sprawce: "Nie ma takiego adresata: X.";
 *  - serwerowe "Zaniechane." (~q) -> koniec sesji bez timeoutu,
 *    toast informacyjny "Przerwano wysylke listu.", formularz
 *    ZOSTAJE (gracz moze poprawic i wyslac jeszcze raz);
 *  - pomocnik czysty (core): splitRecipients + unknownRecipients.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitRecipients,
  unknownRecipients,
} from '../src/arkmail/core/composeValidation';
import { EditorSession } from '../src/arkmail/core/session/editor';
import { MockTransport } from '../src/arkmail/core/session/transport';
import {
  mountMailUi,
  type MailUiHandlers,
} from '../src/arkmail/ui/render';
import { notifyText, startHarness, stopHarness, waitRt } from './harness';

// --- pomocniki core ---------------------------------------------------------

test('core: splitRecipients dzieli po przecinkach, ucina odstepy', () => {
  assert.deepEqual(splitRecipients('Fred, Grault'), ['Fred', 'Grault']);
  assert.deepEqual(splitRecipients('  Fred ,  Grault ,,'), ['Fred', 'Grault']);
  assert.deepEqual(splitRecipients('Fred'), ['Fred']);
  assert.deepEqual(splitRecipients(''), []);
});

test('core: unknownRecipients wypisuje tylko obce imiona (case-insensitive)', () => {
  const known = new Set(['fred', 'grault']);
  assert.deepEqual(
    unknownRecipients({ adresat: 'Fred, Corge', dw: 'grault, Plugh' }, known),
    ['Corge', 'Plugh'],
  );
  assert.deepEqual(unknownRecipients({ adresat: 'Fred', dw: '' }, known), []);
  assert.deepEqual(unknownRecipients({ adresat: '', dw: '' }, known), []);
});

test('core: unknownRecipients deduplikuje i zachowuje oryginalna pisownie', () => {
  const known = new Set<string>();
  assert.deepEqual(
    unknownRecipients({ adresat: 'Corge, corge, Corge', dw: 'Corge' }, known),
    ['Corge'],
  );
});

// --- edytor: "Zaniechane." ---------------------------------------------------

test('edytor: "Zaniechane." konczy sesje wynikiem zaniechany', async () => {
  const t = new MockTransport();
  const editor = new EditorSession(t, { timeoutMs: 400 });
  const op = editor.send({ adresat: 'Thud', temat: 'Temat', linie: ['czesc'] });
  await waitRt(() => t.sent.length >= 2, 'start compose (napisz list + adresat)');
  // Adresat przyjety - serwer pyta o temat; odpowiadamy i gracz kasuje
  // compose w grze (~q) zanim poleci tresc.
  t.emit({ text: 'Temat: ', cls: 'mail' });
  await waitRt(() => t.sent.includes('Temat'), 'temat po prompcie');
  t.emit({ text: 'Zaniechane.', cls: 'mail' });
  const outcome = await op;
  assert.deepEqual(outcome, { result: 'zaniechany' });
  // Tresci nie wysylamy po aborcie - zero wycieku do gry.
  assert.ok(!t.sent.includes('**'));
  assert.ok(!t.sent.includes('czesc'));
});

// --- index.ts: advisory + nazwany blad + zaniechany ---------------------------

/** Przechwytuje prawdziwe handlery z index.ts (wzorca composeValidation). */
async function startWithCaptured() {
  const renderModule = require('../src/arkmail/ui/render') as {
    mountMailUi: typeof mountMailUi;
  };
  const originalMount = renderModule.mountMailUi;
  let captured: MailUiHandlers | null = null;
  renderModule.mountMailUi = (container, store, handlers) => {
    captured = handlers;
    return originalMount(container, store, handlers);
  };
  const h = await startHarness();
  assert.ok(captured, 'przechwycono prawdziwy handler z index.ts');
  const handlers = captured as unknown as MailUiHandlers;
  const restore = async () => {
    renderModule.mountMailUi = originalMount;
    await stopHarness();
  };
  return { h, handlers, restore };
}

const SEND_INPUT = {
  adresat: 'Thud',
  temat: 'Temat',
  dw: '',
  tresc: 'czesc',
  linie: ['czesc'],
};

test('handler: advisory guard wypisuje obce imiona, ale NIE blokuje wysylki', async () => {
  const { h, handlers, restore } = await startWithCaptured();
  try {
    handlers.onSendCompose(SEND_INPUT);
    await h.waitFor(() => h.f.sent.includes('napisz list'), 'wysylka rusza mimo advisory');
    assert.ok(
      notifyText(h.f, 'Odbiorcy spoza zapisanej bazy: Thud. Wysylka bedzie kontynuowana, a serwer zweryfikuje ich nazwy.'),
      'ostrzezenie wypisuje imie spoza bazy',
    );
  } finally {
    await restore();
  }
});

test('handler: brak ostrzezenia, gdy adresat jest w bazie (archiwum)', async () => {
  const { h, handlers, restore } = await startWithCaptured();
  try {
    handlers.onSaveGroups?.([{ name: 'Zgrupowanie', members: ['Fred'] }]);
    h.f.sent.length = 0;
    handlers.onSendCompose({ ...SEND_INPUT, adresat: 'Fred' });
    await h.waitFor(() => h.f.sent.includes('napisz list'), 'wysylka rusza');
    assert.ok(!notifyText(h.f, 'Odbiorcy spoza zapisanej bazy'), 'znane imie nie dostaje ostrzezenia');
  } finally {
    await restore();
  }
});

test('handler: serwerowe "Nie ma takiego adresata" wskazuje sprawce', async () => {
  const { h, handlers, restore } = await startWithCaptured();
  try {
    handlers.onSendCompose(SEND_INPUT);
    await h.waitFor(() => h.f.sent.includes('Thud'), 'adresat wyslany');
    h.f.fire('Adresat: Nie ma takiego adresata (gracza, aliasu): thud.', 'mail');
    await h.waitFor(
      () => notifyText(h.f, 'Nie ma takiego adresata: thud.'),
      'toast wskazuje sprawce',
    );
    assert.ok(
      !notifyText(h.f, 'Blad wysylki - sprawdz adresata.'),
      'ogolnik znika, gdy serwer wskazal sprawce',
    );
  } finally {
    await restore();
  }
});

test('handler: "Zaniechane." konczy wysylke bez timeoutu i bez bledu', async () => {
  const { h, handlers, restore } = await startWithCaptured();
  try {
    handlers.onSendCompose(SEND_INPUT);
    await h.waitFor(() => h.f.sent.includes('Thud'), 'adresat wyslany');
    h.f.fire('Zaniechane.', 'mail');
    await h.waitFor(
      () => notifyText(h.f, 'Przerwano wysylke listu.'),
      'toast informacyjny o przerwaniu',
    );
    assert.ok(!notifyText(h.f, 'Blad wysylki'), 'zero ogolnego bledu po ~q');
  } finally {
    await restore();
  }
});
