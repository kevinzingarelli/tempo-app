# Boschetto v10 — Guida per l'aggiornamento

Ciao Kesiuz. Questa versione porta il nuovo report Esplora, il calendario ferie
rifatto, le ferie residue per persona, le note sulle voci e Google Calendar.
Segui i passi **in ordine**. I tuoi dati NON si perdono: restano su Supabase.

---

## PARTE 1 — Database (obbligatoria, 2 minuti)

Serve per: monte ferie per persona, note sulle voci, Google Calendar.

1. Apri **supabase.com** ed entra nel tuo progetto Boschetto
2. Menu a sinistra → **SQL Editor** → **New query**
3. Apri il file `supabase-setup.sql` (dentro lo zip), **seleziona tutto** e **copia**
4. **Incolla** nel riquadro e premi **Run** (in basso a destra)
5. Deve comparire **"Success. No rows returned"**

È sicuro rieseguirlo: aggiunge solo ciò che manca, non cancella niente.

---

## PARTE 2 — Codice su GitHub (3 minuti)

1. Vai su **github.com/kevinzingarelli** → repository **tempo-app**
2. **Add file** → **Upload files**
3. Apri la cartella dello zip e trascina **il CONTENUTO** della cartella
   (cioè `src`, `api`, `index.html`, `package.json`, ecc.)
   ⚠️ NON trascinare la cartella genitore: trascina quello che c'è DENTRO.
4. In basso scrivi un messaggio (es. "v10") e premi **Commit changes**
5. Vercel ricostruisce da solo. Aspetta 1-2 minuti.

Dopo: su computer premi **Cmd+Shift+R**. Su iPhone chiudi e riapri l'app.

**A questo punto tutto funziona TRANNE Google Calendar**, che richiede la Parte 3.
Se per ora non ti serve Google Calendar, puoi fermarti qui: il pulsante "Collega"
resterà semplicemente inattivo finché non completi la Parte 3.

---

## PARTE 3 — Google Calendar (facoltativa, più lunga)

Questa parte va fatta UNA volta sola, da te. Serve a dire a Google che
"Boschetto" può leggere i calendari di chi decide di collegarsi.

### 3A — Crea il progetto Google

1. Vai su **console.cloud.google.com** ed accedi
2. In alto, accanto al logo, clicca il menu dei progetti → **Nuovo progetto**
3. Nome: `Boschetto` → **Crea** → poi selezionalo dal menu in alto

### 3B — Attiva l'API del calendario

1. Menu ☰ → **API e servizi** → **Libreria**
2. Cerca **Google Calendar API** → aprila → **Abilita**

### 3C — Schermata di consenso

1. Menu ☰ → **API e servizi** → **Schermata consenso OAuth**
2. Tipo utente: **Esterno** → **Crea**
3. Compila:
   - Nome app: `Boschetto`
   - Email di assistenza: la tua
   - Email sviluppatore (in fondo): la tua
   → **Salva e continua**
4. **Ambiti** → **Aggiungi ambiti** → cerca e spunta
   `.../auth/calendar.readonly` → **Aggiorna** → **Salva e continua**
5. **Utenti di test** → **Add users** → aggiungi le email Google
   di chi userà il calendario (tu, Asia, ecc.) → **Salva e continua**

   ⚠️ Finché l'app è "in test", solo queste email potranno collegarsi.
   Per aprirla a tutti serve la verifica Google (vedi nota in fondo).

### 3D — Crea le credenziali

1. Menu ☰ → **API e servizi** → **Credenziali**
2. **Crea credenziali** → **ID client OAuth**
3. Tipo di applicazione: **Applicazione web**
4. Nome: `Boschetto web`
5. In **URI di reindirizzamento autorizzati** → **Aggiungi URI**:
   ```
   https://IL-TUO-SITO.vercel.app/api/google-callback
   ```
   (sostituisci con l'indirizzo vero della tua app Vercel)
6. **Crea**. Compaiono **ID client** e **Client secret**: tienili aperti.

### 3E — Metti le chiavi su Vercel

1. Vai su **vercel.com** → progetto tempo-app → **Settings** → **Environment Variables**
2. Aggiungi queste variabili (una alla volta, per **Production**):

   | Nome | Valore |
   |------|--------|
   | `GOOGLE_CLIENT_ID` | l'ID client copiato da Google |
   | `GOOGLE_CLIENT_SECRET` | il Client secret copiato da Google |
   | `GOOGLE_REDIRECT_URI` | `https://IL-TUO-SITO.vercel.app/api/google-callback` |
   | `SUPABASE_URL` | `https://gzzcftyrmwmyausdbssv.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | vedi sotto |

   Per la service role key: Supabase → **Project Settings** → **API** →
   copia **service_role** (la chiave "secret", NON quella publishable).
   ⚠️ Questa chiave è potente: sta solo qui su Vercel, mai nel codice.

3. Dopo aver aggiunto le variabili: Vercel → **Deployments** →
   sul più recente, menu **...** → **Redeploy** (così le legge).

### 3F — Prova

1. Apri Boschetto → nella schermata principale c'è il riquadro
   **Google Calendar** → **Collega**
2. Scegli il tuo account Google, accetta i permessi
3. Torni su Boschetto e vedi i tuoi prossimi impegni
4. Per scollegarti: icona profilo (in alto) → **Scollega Google Calendar**

**Nota sulla verifica Google:** finché l'app resta "in test", solo le email
messe negli utenti di test possono collegarsi (va benissimo per il team).
Se un giorno vorrai aprirla a chiunque, Google chiede una verifica che può
richiedere alcuni giorni. Per uso interno non serve.

---

## Cosa provare in questa versione

- **Admin → Esplora**: scegli il periodo in alto, poi entra in un cliente
  (vedi chi ci ha lavorato) o in una persona (torta clienti + giorno per giorno,
  con export CSV)
- **Ferie**: calendario più leggibile, salta gli anni con « e », festività di
  Vasto tra le proposte
- **Admin → Persone**: apri una persona e imposta il **Monte ferie annuo**;
  poi nella schermata Ferie compaiono i residui
- **Modifica una voce**: ora c'è il campo **Nota interna**
- **Admin → Dashboard**: in fondo, **ore per giorno della settimana** e
  **voci da sistemare prima di fatturare**

---

## Se qualcosa non va

- **Schermo bianco dopo l'aggiornamento**: Cmd+Shift+R sul computer; su iPhone
  togli l'app dalla Home e reinstallala dal browser
- **"Collega" Google non fa niente**: manca la Parte 3 (variabili su Vercel)
- **Google dice "accesso bloccato"**: la tua email non è tra gli utenti di test
  (Parte 3C punto 5)
- Per qualsiasi errore, mandami lo screenshot: lo leggiamo insieme.
