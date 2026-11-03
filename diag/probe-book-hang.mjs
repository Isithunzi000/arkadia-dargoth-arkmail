// Diagnostyka 2026-11-04: sonda CI dla zawieszenia bookView
// 'usuwanie zaznaczonych' na agentach GitHub. Dokladna replika krokow
// testu (tests/bookView.test.ts) z punktami kontrolnymi na stderr.
// Uruchamiana tylko przez workflow; do usuniecia po diagnozie.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Window } = require('happy-dom');
const { mountMailUi } = require('../out-test/src/arkmail/ui/render.js');
const { MailUiStore } = require('../out-test/src/arkmail/ui/store.js');

const T0 = Date.now();
const mark = (label) => console.error(`[probe] ${label} t=+${Date.now() - T0}ms`);

// Jak w pliku testu: jeden wspoldzielony dokument na caly proces.
const window = new Window();
const document = window.document;

mark('start');
const store = new MailUiStore({ tab: 'kontakty', people: ['Fred', 'Grault', 'Corge'] });
const container = document.createElement('div');
const saves = [];
mountMailUi(container, store, {
  onOpenLetter: () => {},
  onSendCompose: () => {},
  onCloseLetter: () => {},
  onRefreshBox: () => {},
  onLoadOlder: () => {},
  onLoadAll: () => {},
  onSearch: () => {},
  onClearSearch: () => {},
  onDeleteLetter: () => {},
  onForwardLetter: () => {},
  onSavePeople: (people) => {
    saves.push([...people]);
    store.setPeople(people);
  },
});
mark('mounted');

const q = (sel) => container.querySelector(sel);
const qa = (sel) => Array.from(container.querySelectorAll(sel));
const click = (el) => el.click();

qa('.arkmail-subpill')[1].click();
mark('switched-to-ksiazka');

const checkAt = (i) => {
  const boxes = qa('[data-book-row] input[type=checkbox]');
  boxes[i].checked = true;
  boxes[i].dispatchEvent(new window.Event('change'));
};
checkAt(0);
mark('checkAt(0) done');
checkAt(2);
mark('checkAt(2) done');

const bulk = () => q('[data-book-delete-checked]');
console.error(`[probe] bulk disabled=${bulk().getAttribute('disabled')} t=+${Date.now() - T0}ms`);
click(bulk());
mark('arm-click done, label=' + bulk().textContent);
click(bulk());
mark('delete-click done');

console.error(`[probe] saves=${JSON.stringify(saves)} t=+${Date.now() - T0}ms`);
mark('DONE');
process.exit(0);
