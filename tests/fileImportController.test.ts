/** T14/T15: ostatni wybor pliku, snapshot trybu i swiadome zastapienie. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountMailUi } from '../src/arkmail/ui/render';
import { MailUiStore } from '../src/arkmail/ui/store';
import type { AddressBookExport, ImportMode } from '../src/arkmail/core/addressBook';

const window = new Window();
const document = window.document;
interface Call { data: AddressBookExport; mode: ImportMode | undefined }
interface Deferred { promise: Promise<string>; resolve(value: string): void; reject(error: Error): void }
const deferred = (): Deferred => {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const book = (name: string): string => JSON.stringify({
  format: 'arkmail-addressbook', version: 2,
  people: [name], groups: [{ name: `Grupa ${name}`, members: [name] }],
});
const tick = async (): Promise<void> => { await new Promise((resolve) => setImmediate(resolve)); };

function mount() {
  const store = new MailUiStore({ tab: 'kontakty' });
  const container = document.createElement('div');
  const calls: Call[] = [];
  mountMailUi(container as unknown as HTMLElement, store, {
    onOpenLetter: () => {}, onSendCompose: () => {}, onCloseLetter: () => {},
    onRefreshBox: () => {}, onLoadOlder: () => {}, onLoadAll: () => {},
    onSearch: () => {}, onClearSearch: () => {}, onDeleteLetter: () => {},
    onForwardLetter: () => {},
    onImportAddressBook: (data, mode) => calls.push({ data, mode }),
  });
  const pills = Array.from(container.querySelectorAll('.arkmail-subpill')) as unknown as HTMLElement[];
  pills.find((el) => el.textContent === 'Import i eksport')!.click();
  const input = container.querySelector('[data-book-import]') as unknown as HTMLInputElement;
  const radios = Array.from(container.querySelectorAll('[data-book-import-mode] input[type="radio"]')) as unknown as HTMLInputElement[];
  const select = (name: string, content: Deferred | string): void => {
    const file = {
      name,
      text: () => typeof content === 'string' ? Promise.resolve(content) : content.promise,
    };
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new window.Event('change') as unknown as Event);
  };
  return { container, calls, input, radios, select };
}
const q = (root: unknown, selector: string): HTMLElement | null =>
  (root as { querySelector(s: string): unknown }).querySelector(selector) as HTMLElement | null;

test('import: odwrotna kolejnosc odczytow stosuje wylacznie ostatni wybor', async () => {
  const { calls, select } = mount();
  const first = deferred(); const second = deferred();
  select('pierwszy.json', first); select('drugi.json', second);
  second.resolve(book('Drugi')); await tick(); await tick();
  first.resolve(book('Pierwszy')); await tick(); await tick();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.data.people, ['Drugi']);
});

test('import: tryb jest migawka z momentu wyboru pliku', async () => {
  const { container, calls, radios, select } = mount();
  radios[1]!.click();
  const read = deferred(); select('zastap.json', read);
  radios[0]!.click();
  read.resolve(book('Nowy')); await tick(); await tick();
  assert.equal(calls.length, 0, 'zastap czeka na potwierdzenie');
  assert.ok(q(container, '[data-book-replace-confirm]'));
  assert.match(q(container, '[data-book-replace-confirm]')!.textContent ?? '', /zastap\.json/);
  (q(container, '[data-book-replace-ok]') as HTMLElement).click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.mode, 'zastap');
});

test('import: zastap pokazuje rozmiar pliku, a Anuluj nie wykonuje mutacji', async () => {
  const { container, calls, radios, select } = mount();
  radios[1]!.click(); select('ksiazka.json', book('Fred')); await tick(); await tick();
  assert.equal(calls.length, 0);
  const panel = q(container, '[data-book-replace-confirm]')!;
  assert.match(panel.textContent ?? '', /1 imion/);
  assert.match(panel.textContent ?? '', /1 grup/);
  (q(container, '[data-book-replace-cancel]') as HTMLElement).click();
  assert.equal(calls.length, 0);
  assert.equal(q(container, '[data-book-replace-confirm]'), null);
});

test('import: nowy wybor uniewaznia stare potwierdzenie zastap', async () => {
  const { container, calls, radios, select } = mount();
  radios[1]!.click(); select('stary.json', book('Stary')); await tick(); await tick();
  assert.ok(q(container, '[data-book-replace-confirm]'));
  radios[0]!.click(); select('nowy.json', book('Nowy')); await tick(); await tick();
  assert.equal(q(container, '[data-book-replace-confirm]'), null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.data.people, ['Nowy']);
  assert.equal(calls[0]?.mode, 'dolacz');
});

test('import: blad nie zmienia danych, pole jest resetowane i ten sam plik dziala ponownie', async () => {
  const { container, calls, input, select } = mount();
  select('bledny.json', 'nie-json'); await tick(); await tick();
  assert.equal(calls.length, 0);
  assert.match(container.textContent ?? '', /Niepoprawny plik ksiazki adresowej/);
  assert.equal(input.value, '');
  select('poprawny.json', book('Fred')); await tick(); await tick();
  select('poprawny.json', book('Fred')); await tick(); await tick();
  assert.equal(calls.length, 2, 'ponowny wybor tego samego pliku nie jest blokowany');
  assert.equal(input.value, '');
});

test('import: odrzucenie odczytu pokazuje blad, czysci pole i nie wywoluje zapisu', async () => {
  const { container, calls, input, select } = mount();
  const read = deferred(); select('odrzucenie.json', read);
  read.reject(new Error('read failed')); await tick(); await tick();
  assert.equal(calls.length, 0);
  assert.match(container.textContent ?? '', /Nie udalo sie odczytac pliku/);
  assert.equal(input.value, '');
});
