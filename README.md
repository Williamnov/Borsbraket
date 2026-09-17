# BörsBråket

En månadslig för aktieplock. Varje månad väljer alla i gänget ett antal innehav,
kurserna matas in, och avkastningen avgör vem som tar poängen. Tabell, historik,
rekordbok och profiler ingår.

## Så funkar det

- **En omgång per månad.** Omgången är öppen för val fram till stängningsdatumet,
  sedan mäts den från startdag till slutdag.
- **Lika vikt.** Avkastningen per portfölj är medelvärdet av innehavens
  `slutkurs / startkurs − 1`, i lokal valuta, utan utdelningar och utan växelkurs.
- **Poäng per månad:** 10 / 7 / 5 / 4 / 3 / 2, och 1 poäng till alla därefter som
  lämnat in val.
- **Säsongstabellen** kan sorteras på poäng, ackumulerad avkastning, snitt per
  månad eller antal månadssegrar.
- **OMXS30** ligger med som referensrad i varje omgång men tävlar inte.

Andras val döljs i gränssnittet fram till stängning. Det är en hederskodex, inte
ett valv — den som verkligen vill kan läsa dem i sidans data.

## Kurser

Kurser matas in manuellt under fliken **Kurser**, antingen fält för fält eller
genom att klistra in flera rader på formen:

```
ERIC B  92,40  98,10
VOLV B;278,5;265,2
OMXS30 2540 2611
```

Tabb, semikolon, komma eller mellanslag fungerar som avgränsare, och både punkt
och komma går bra som decimaltecken.

## Köra sidan

`index.html` är hela applikationen — ingen byggkedja, inga beroenden utöver
Google Fonts. Sidan är byggd för att publiceras som en Claude Artifact, där den
får tillgång till tre körtidsfunktioner:

| Funktion    | Används till                                              |
|-------------|-----------------------------------------------------------|
| `db`        | delad lagring av omgångar, val, profiler och snack        |
| `user`      | vem som tittar, så val och profiler hamnar på rätt spelare |
| `downloads` | CSV-export av säsongen                                    |

Öppnad som en vanlig lokal fil saknas de funktionerna. Sidan faller då tillbaka
på inbyggd **exempeldata** — påhittade spelare och kurser, tydligt märkta som
sådana — så att gränssnittet går att titta på ändå. Ingenting sparas i det läget.

## Data

All speldata ligger i artefaktens egna databas, inte i det här repot:

```
meta/league          ligans inställningar
rounds/<ÅÅÅÅ-MM>     omgång, datum, kurser, status
entries/<spelare>    en post per spelare med alla månaders val
profiles/<spelare>   alias, emoji, färg, stridsrop
chatter/<id>         snacket
```

Skrivrätten är låst per spelare: du kan bara ändra din egen profil och dina egna
val. Omgångar och kurser får alla i ligan redigera.

**Inga riktiga spelardata, kurser eller exporter hör hemma i det här repot.**
`.gitignore` blockerar `.env`-filer, nycklar, databasdumpar och CSV-exporter —
lägg till mer där innan du committar något nytt.
