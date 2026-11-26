# Analiza blednego numeru w wynikach wyszukiwania

## Zgloszenie z realnej gry

Wersja 1.30.22 nadal wysylala bledny numer po zawężeniu listy do dwoch
wynikow. Wybranie drugiego widocznego wyniku konczylo sie komenda
`przeczytaj list 3`, odpowiedzia serwera o blednym numerze i pojawieniem
sie listu numer 2 w konsoli klienta. Ten wynik uniewaznia wczesniejsze
rozstrzygniecie, ze wersja 1.30.22 naprawila zgloszona regresje.

Dokument opisuje wylacznie zanonimizowany mechanizm. Nie zawiera nazw
postaci, adresatow, tresci listow ani surowych ramek.

## Przyczyna w kodzie 1.30.22

Wynik wyszukiwania zachowywal liczbe wypisana przy wierszu jako
`MailboxEntry.number`. Szybka sciezka `resolveEntry()` zwracala taki wpis
bez zmiany, a `openWithResolve()` przekazywal te liczbe bezposrednio do
`pager.readLetter()`.

Dla dwoch wynikow oznaczonych na listingu `3` i `2` interfejs pokazuje
wlasne, kolejne numery `1` i `2`. Drugi widoczny wiersz odpowiada pierwszej
pozycji odpowiedzi serwera, ale komenda pagera wymaga numeru 2 w obrebie
selekcji. Uzycie surowej etykiety powodowalo `przeczytaj list 3`.

Ponowna kotwica nie naprawiala sytuacji. Ponawiala dokladnie ten sam filtr,
ponownie odczytywala etykiety `3` i `2`, a dodatkowa kontrola odrzucala je
jako nieciagla numeracje. W praktyce po pierwszej blednej komendzie nie
powstawala druga, poprawna proba odczytu.

Wersja 1.30.5 miala inna sciezke odzyskiwania po bledzie: wpis wyniku
wyszukiwania nie zachowywal pierwotnego filtra, wiec druga proba mogla
przejsc przez listing kotwicowy po dacie. To wyjasnia mozliwosc odzyskania
poprawnego odczytu w tamtej wersji, ale nie czyni pierwszej blednej komendy
prawidlowa. Szybka sciezka 1.30.5 rowniez zwracala surowy numer wpisu.

## Dowod RED na 1.30.22

Dodano dwa integracyjne scenariusze interfejsu z danymi syntetycznymi:

1. Wynik filtra ma etykiety `3, 2`; klikniecie drugiego widocznego wiersza
   ma wyslac dokladnie `przeczytaj list 2`, bez drugiego listingu.
2. Po bledzie numeru i ponowieniu filtra `3, 2` oba odczyty maja uzywac
   numeru 2, nigdy surowej etykiety 3.

Przed zmiana produktu typowanie zakonczylo sie poprawnie, a testy daly
**6 kontrolek: 4 zaliczone i 2 bledy**. Pierwszy scenariusz wykazal
rzeczywiste `['przeczytaj list 3']` zamiast `['przeczytaj list 2']`. Drugi
zakonczyl sie po pierwszej blednej komendzie, poniewaz ponowna kotwica
odrzucila etykiety `3, 2` jako nieciagle.

Dowod zapisano lokalnie przed zmiana implementacji. CI nie bylo uzywane do
wykazania RED.

## Zakres poprawki

Wynik filtra jest normalizowany natychmiast po odebraniu, przed zapisem w
archiwum, sprawdzeniami tozsamosci i wybraniem wpisu. Kolejnosc serwera jest
od najstarszego do najnowszego, wiec ostatni wpis dostaje numer 1,
przedostatni numer 2 itd. Ta sama funkcja obejmuje pierwotne wyszukiwanie i
kazde jego ponowienie.

Nie zmieniono stylow, ukladu interfejsu, parsera zwyklych listingow,
walidacji innych odpowiedzi, ochrony bliźniakow, zasad zamykania pagera ani
tlumienia linii. Usunieta kontrola ciaglosci surowych etykiet filtra byla
niezgodna z zaobserwowana odpowiedzia serwera; po normalizacji nie miala
tez niezaleznego warunku do sprawdzenia.

Jeden stary test wymagajacy przerwania dla etykiet `3, 2` zostal zastapiony
kontrola poprawnego odczytu numeru 2 po ponownej kotwicy. Osobne kontrole
niejednoznacznosci i braku zgadywania numeru pozostaly aktywne.

## Dowody GREEN

- Dokladne scenariusze zgloszenia: **6/6** po poprawce.
- Powiazany zestaw wyszukiwania, ponownej kotwicy, odczytu, archiwum i
  pagera: **55/55**.
- Pelny zestaw przed commitem naprawy: **1392/1392**, bez bledow,
  anulowanych i pominietych kontrolek.
- Osobne typowanie i budowanie zakonczyly sie sukcesem.
- Commit naprawy `0035c98578a71b457ff05dd32fefce93fab3380a` przeszedl
  zdalny `Build plugins` w przebiegu `45869052316`; zadania `build` i
  `deploy` zakonczyly sie sukcesem.

## Granice dowodu

Testy wykorzystuja syntetyczne odpowiedzi i prawdziwe sciezki interfejsu
pluginu. Nie sa dowodem nowego testu na realnej grze. Asystent nie wykonal
logowania, odczytu prawdziwych listow ani interakcji z graczami.
