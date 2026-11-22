# usage-band

Mod do Claude Code, który pokazuje w pasku nad polem wpisywania bieżące zużycie limitów subskrypcji: limitu 5-godzinnego i tygodniowego, każde na osobnym wykresie kołowym, z procentem i czasem do resetu.

- poniżej 80% wykres jest zielony,
- od 80% robi się czerwony i pulsuje,
- w terminalu, gdzie nie ma grafiki, zamiast wykresu jest kolorowy znak koła (○ ◔ ◑ ◕ ●).

Dane pochodzą z odczytów limitów, które Claude Code dostaje z każdą odpowiedzią API, więc pasek odświeża się po każdej turze. Bez subskrypcji (np. z kluczem API) tych danych nie ma i pasek pokazuje „brak danych”.

## Instalacja

W sesji Claude Code w terminalu:

```
/plugin install usage-band --marketplace robson761/usage-band
```

Z powłoki:

```
claude plugin install usage-band --marketplace robson761/usage-band
```

Na pytanie `Add marketplace?` odpowiedz `y`, a potem wybierz zakres (domyślnie użytkownik). Mod zainstalowany w zakresie użytkownika ładuje się w każdej kolejnej sesji, także w aplikacji desktopowej.

W aplikacji desktopowej, gdzie `/plugin` nie działa: kliknij + obok pola wpisywania, potem Plugins, Add marketplace z `robson761/usage-band`, a następnie Add plugin.

## Licencja

MIT
