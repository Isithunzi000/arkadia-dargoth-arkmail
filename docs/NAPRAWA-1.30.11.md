# Naprawa ArkMail 1.30.11

## Punkt wyjścia

- Bazą jest ArkMail 1.30.10, commit `7b7a609355d1da826a813fbe42022189bb8d96ea`.
- Kopia robocza została porównana z drzewem GitHub: 331 plików, zgodne rozmiary i identyfikatory blobów, drzewo bez obcięcia.
- Node 26.13.1. Ponowny pełny przebieg bazowy: 1200 testów, 1199 zaliczonych, 0 błędów, 1 warunkowe pominięcie strażnika komunikatu commita poza CI. Typowanie i build zakończyły się kodem 0.
- Pierwszy przebieg bazowy odrzucono jako dowód: trzy pliki testowe nie odczytały skompilowanych modułów. Po ponownym odczycie przeszły 16/16; dopiero drugi pełny przebieg potwierdził podstawę prac.

## Zatwierdzony zakres

1. **Listy:** pasek wyników wraz z przyciskiem czyszczenia pozostaje poza przewijaną listą we wszystkich czterech skrzynkach. Długi opis wyników zawija się zamiast wypychać przycisk.
2. **Kontakty → Książka adresowa:** filtr, przycisk czyszczenia i licznik pozostają poza przewijaną listą. Pisanie, zaznaczanie, kasowanie i odtwarzanie pozycji przewijania nie ulegają zmianie.
3. **Usuwanie:** filtry, podsumowanie, licznik zaznaczenia i operacje pozostają poza przewijanymi wynikami. Zaznaczanie, potwierdzanie i wysyłane komendy pozostają bez zmian.
4. **Archiwum → Archiwum listów:** karty, filtry, licznik i komunikaty pozostają poza przewijaną listą wyników.
5. **Archiwum, karty 1–3:** wieloczęściowe statusy są przedstawione jako osobne wiersze etykiet i wartości. Definicje liczników i warunki stanów pozostają bez zmian.
6. Wszystkie pozostałe zakładki i podwidoki objęte są kontrolą regresji. Bez potwierdzonego błędu nie są przebudowywane.

## Stałe elementy układu

- W normalnej wysokości przewija się właściwa lista. Przy rzeczywistym braku miejsca działa awaryjne przewijanie całego panelu; żadna poprawka nie zastępuje go globalnym `overflow: hidden`.
- Klucze `listy:<skrzynka>` i `kontakty:ksiazka` pozostają bez zmian.
- Usuwanie zachowuje `data-pane-key="usuwanie"` na panelu i otrzymuje `data-pane-key="usuwanie:wyniki"` na liście.
- Archiwum zachowuje `data-pane-key="archiwum"` na panelu i otrzymuje `data-pane-key="archiwum:listy"` na liście.
- Migawka i odtworzenie widoku obejmują oba poziomy przewijania.

## Poza zakresem

- Bez zmian logiki wyszukiwania, liczników, indeksacji, pobierania, eksportu, paginacji i wysyłanych komend.
- Bez zmian funkcji „Odpowiedz wszystkim”.
- Bez zmian gagowania importu osób.
- Bez modyfikacji źródeł klienta Dargoth i bez publikacji zewnętrznych.

## Procedura i dowody

- Każdy etap zaczyna się od testu, który pada lokalnie na starym kodzie. Test i poprawka trafiają do jednego commita dopiero po zaliczeniu pełnego lokalnego zestawu.
- Kontrole obejmują strukturę DOM, kontrakt CSS, zachowanie fokusu i karetki, zaznaczanie, czyszczenie filtrow oraz oba klucze pozycji przewijania.
- Końcowe scenariusze w prawdziwym buildzie Dargotha porównają prostokąty kontrolek przed i po przewinięciu długich list, także przy małym oknie i zwiększonej skali.
- Pełna macierz scenariuszowa zostanie uruchomiona dokładnie raz po ostatniej poprawce i przed wydaniem.
- Wydanie 1.30.11 obejmie pełne testy, typowanie, build, deterministyczną paczkę, tag `v1.30.11`, GitHub Release `ArkMail v1.30.11` i dokładnie jeden asset `arkmail_1_30_11.zip` z kontrolą odczytu i SHA-256.

## 1. Listy — wynik

- Przed poprawką dwa nowe testy padały na kodzie 1.30.10: 12 testów, 10 zaliczonych, 2 błędy. Test struktury wykazał pasek wewnątrz przewijanej listy, a test CSS brak nieruchomej reguły nagłówka.
- Po przeniesieniu paska i dodaniu zawijania kontrole ukierunkowane: 19/19, w tym wszystkie cztery skrzynki, czyszczenie wyników oraz pól filtrów.
- Pełny zestaw z docelowym komunikatem commita: 1202 testy, 1202 zaliczone, 0 błędów, 0 pominiętych. Typowanie i build zakończyły się kodem 0.

## 2. Książka adresowa — wynik

- Przed poprawką nowe kontrole wykazały filtr wewnątrz przewijanej listy, brak nieruchomej reguły nagłówka oraz zastępowanie elementu licznika podczas przeliczania.
- Po poprawce kontrole ukierunkowane: 48/48, w tym pełny plik `bookView`, fokus i karetka wszystkich pól Kontaktów, zaznaczanie, usuwanie i czyszczenie filtra.
- Pierwszy pełny przebieg tego etapu odrzucono: 1202 testy, 1198 zaliczone, 4 błędy. Trzy strażniki higieny nie miały lokalnego indeksu `git`, a czwarty błąd pochodził z historycznego zakazu selektora filtra, który w tej poprawce stał się aktywny. Po odtworzeniu indeksu i usunięciu wyłącznie przestarzałego zakazu kontrole strażników: 7/7.
- Ostateczny pełny zestaw z docelowym komunikatem commita: 1202 testy, 1202 zaliczone, 0 błędów, 0 pominiętych. Typowanie i build zakończyły się kodem 0.

Pozostałe wyniki zostaną dopisane do tego dokumentu w commitach zawierających odpowiadające im testy i poprawki.
