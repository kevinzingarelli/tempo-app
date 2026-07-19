# Boschetto v11 — Guida per l'aggiornamento

Questa versione porta Google Calendar **accanto** alla tua giornata di lavoro,
con la possibilità di trasformare un impegno in una voce con un tocco.
I tuoi dati NON si perdono. Google è già configurato dalla v10: qui NON serve
toccare Google Cloud, solo un piccolo passo su Supabase.

---

## PARTE 1 — Database (obbligatoria, 1 minuto)

Serve per ricordare quali eventi Google hai già registrato.

1. Apri **supabase.com** → progetto Boschetto → **SQL Editor** → **New query**
2. Apri `supabase-setup.sql` (nello zip), **seleziona tutto**, **copia**
3. **Incolla** ed esegui con **Run** → deve dire **"Success"**

È sicuro rieseguirlo: aggiunge solo la tabella nuova, non tocca nulla di esistente.

---

## PARTE 2 — Codice su GitHub (3 minuti)

1. **github.com/kevinzingarelli** → repository **tempo-app**
2. **Add file** → **Upload files**
3. Trascina **il CONTENUTO** della cartella dello zip (`src`, `api`,
   `index.html`, ecc.)
   ⚠️ NON la cartella genitore: quello che c'è DENTRO.
4. Scrivi "v11" → **Commit changes**
5. Vercel ricostruisce da solo (1-2 min).

Poi: **Cmd+Shift+R** sul computer; su iPhone chiudi e riapri l'app.

Non serve toccare le variabili Vercel né Google: restano quelle della v10.

---

## Come funziona la nuova vista

Nella schermata **Timer** (home), a destra, ora trovi due calendari affiancati:
- **La tua giornata**: il lavoro registrato (come prima)
- **Google Calendar**: gli impegni dello stesso giorno

Le frecce in alto muovono **entrambi insieme**:
- `‹` `›` = giorno prima / dopo
- `«` `»` = settimana prima / dopo
- "torna a oggi" per rientrare velocemente

**Per registrare un impegno come lavoro:**
1. Sull'evento Google premi **+ Registra**
2. Si apre una finestra già compilata con nome e orario dell'evento
3. Boschetto **propone un progetto** (se trova un lavoro simile fatto prima);
   controlla che progetto e cliente siano giusti, oppure cambiali
4. **Salva voce**

L'evento resta lì ma segnato **"già registrato"** (verde, attenuato), così non
lo registri due volte per sbaglio.

Su iPhone i due calendari si impilano uno sotto l'altro per restare leggibili.

---

## Cose oneste da sapere

- **La proposta di progetto è "best effort"**: all'inizio proporrà poco perché
  non ha storico; migliora man mano che registri lavori. Non aspettarti che
  indovini sempre — per questo ti chiede conferma ogni volta.
- **La colonna "La tua giornata"** mostra bene gli ultimi ~70 giorni di lavoro.
  Se navighi molto indietro nel tempo, il lavoro vecchio potrebbe non comparire
  in quella colonna (gli eventi Google invece si vedono sempre). Per analisi
  storiche complete usa **Admin → Esplora**.
- Gli eventi "tutto il giorno" vengono registrati con un orario di default
  (9:00–10:00) che puoi correggere dopo toccando la voce.

---

## Se qualcosa non va

- **La colonna Google resta vuota o dice "Collega"**: apri il profilo (in alto)
  e verifica di essere collegato; eventualmente premi Collega di nuovo.
- **"Sessione Google scaduta"**: tocca "Ricollega".
- Per qualsiasi errore, mandami uno screenshot.
