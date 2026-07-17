# Pomodoro — il tuo tempo, dalla tua parte

App per registrare le ore di lavoro di un piccolo team. Timer + inserimento
manuale, progetti, preferiti, report personali e report admin, installabile
su iPhone come app (PWA).

Tecnologie: Vite + React + Supabase.

---

## Cosa serve

- Un account Supabase (gratuito): https://supabase.com
- Un account Vercel (gratuito): https://vercel.com
- Un account GitHub: https://github.com

---

## Passi (in ordine)

### 1. Database su Supabase
1. Crea un nuovo progetto su Supabase.
2. Apri **SQL Editor**, incolla tutto il contenuto del file
   `supabase-setup.sql` e premi **RUN**.
3. Crea il tuo account: **Authentication → Users → Add user**
   (spunta **Auto Confirm User**).
4. Nel SQL Editor esegui (con la tua email):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'TUA-EMAIL@esempio.it');
   ```

### 2. Chiavi
In Supabase: **Project Settings → API**. Ti servono due valori:
- **Project URL** → sarà `VITE_SUPABASE_URL`
- **anon public key** → sarà `VITE_SUPABASE_ANON_KEY`

### 3. Codice su GitHub
1. Crea un nuovo repository vuoto.
2. Carica **il contenuto** di questa cartella (i file `package.json`,
   `index.html`, la cartella `src`, ecc.), non la cartella stessa.

### 4. Deploy su Vercel
1. **Add New → Project**, importa il repository.
2. Framework: **Vite** (di solito rilevato in automatico).
3. In **Environment Variables** aggiungi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy**.

### 5. Installa su iPhone
Apri il link Vercel in **Safari** → tasto **Condividi** →
**Aggiungi alla schermata Home**.

### 6. Aggiungi le altre persone
Supabase → **Authentication → Users → Add user** (con Auto Confirm).
Compariranno nell'app nella sezione **Admin → Persone**.

---

## Sviluppo locale (facoltativo)
```bash
npm install
cp .env.example .env   # inserisci i tuoi valori
npm run dev
```
