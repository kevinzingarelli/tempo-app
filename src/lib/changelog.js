// Novità dell'app, dalla più recente. short = etichetta versione.
export const CURRENT_VERSION = "13";
export const APP_NAME = "Boschetto";

export const CHANGELOG = [
  {
    version: "13",
    date: "2026-07-19",
    title: "Controllo di gestione: costi e redditività",
    items: [
      "Per ogni persona puoi impostare il costo aziendale: come costo orario diretto, oppure dai componenti (RAL, contributi, TFR, altri costi)",
      "L'app calcola da sola il costo orario gestionale stimato e ne tiene lo storico nel tempo",
      "Sui progetti puoi indicare le ore pianificate, accanto a quelle stimate e a quelle effettive del timer",
      "Nuova sezione Redditività: per ogni cliente vedi ricavi, costo del personale e margine di commessa",
      "I progetti interni/Studio raccolgono le ore generali, ribaltate come costo sui clienti in base alle ore dirette",
      "Tutti i dati di costo sono visibili solo agli amministratori e sono sempre indicati come stima gestionale interna",
    ],
  },
  {
    version: "12",
    date: "2026-07-19",
    title: "Albero vivo, lavori a cavallo della notte e assenze",
    items: [
      "L'albero dei progressi ora cresce in tempo reale mentre il timer gira, non solo allo stop",
      "Grafica dell'albero rinnovata, con piccoli scatti di crescita e un leggero ondeggiamento quando lavori",
      "Ora puoi registrare lavori che iniziano un giorno e finiscono il successivo (es. 22:00 → 02:00)",
      "La giornata mostra chiaramente i lavori a cavallo della mezzanotte, con 'da ieri' e 'prosegue domani'",
      "Nelle richieste puoi scegliere il tipo di assenza: ferie, permesso o malattia",
      "Il calendario mostra icone stagionali sulle ferie (mare d'estate, albero a Natale…) e distingue le chiusure aziendali",
    ],
  },
  {
    version: "11",
    date: "2026-07-19",
    title: "Google Calendar accanto al lavoro",
    items: [
      "Nella home: la tua giornata e il calendario Google affiancati",
      "Naviga tra i giorni e le settimane: si spostano insieme entrambi",
      "Da un impegno Google crei una voce con un tocco, confermando progetto e cliente",
      "Boschetto propone un progetto in base ai lavori simili già registrati",
      "Gli eventi già registrati restano segnati come 'già registrato'",
      "Su iPhone i due calendari si impilano per restare leggibili",
    ],
  },
  {
    version: "10",
    date: "2026-07-19",
    title: "Report, ferie e Google Calendar",
    items: [
      "Nuovo report Esplora: entri dal cliente o dalla persona e vedi tutto nel dettaglio",
      "Torta ore per cliente e, per ogni persona, ripartizione tra i clienti",
      "Scegli il periodo: settimana, mese, anno, dall'inizio o personalizzato",
      "Calendario ferie rifatto: compatto, con pallini colorati e salto rapido per anno",
      "Aggiunta la festa patronale di Vasto (San Michele Arcangelo, 29 settembre)",
      "Ferie residue per persona: imposti il monte annuo, l'app calcola quanto resta",
      "Collega Google Calendar e vedi i tuoi impegni nella schermata principale",
      "Note interne sulle singole voci di lavoro",
      "Ore per giorno della settimana e voci da sistemare prima di fatturare",
      "Rimosso l'avviso del timer aperto all'apertura (non affidabile come PWA)",
    ],
  },
  {
    version: "9",
    date: "2026-07-18",
    title: "Boschetto",
    items: [
      "Nuovo nome e identità: Boschetto, con colori verde bosco",
      "Albero dei progressi personale sulla home (attivabile dal profilo)",
      "Ferie con calendario mensile, festività italiane pre-proposte e stati colorati",
      "Correzione del blocco schermo su iPhone: pulsante di chiusura su ogni pannello",
      "Zoom della pagina disattivato per un uso più stabile",
      "Avviso all'apertura se hai un timer ancora aperto",
      "Nota della settimana scritta dagli admin, visibile a tutti",
      "Report admin più ricchi: torta per progetto, andamento a linea, fatturabili vs no",
      "Tabella per persona con confronto onesto rispetto al periodo precedente",
      "Admin: crea un progetto al volo mentre registri, e blocca i periodi già verificati",
      "Continua un lavoro recente con un tocco",
    ],
  },
  {
    version: "8",
    date: "2026-07-18",
    title: "Kesia Time",
    items: [
      "Nuovo nome e nuova identità: Kesia Time, con look più professionale",
      "La tua giornata è ora sulla home: timeline con le ore che scorrono",
      "Ferie: richiedi i giorni, gli admin approvano; sabato, domenica e feste già segnati",
      "Novità con versione e data di rilascio, per ritrovare le modifiche",
      "Report a tutta larghezza su computer, senza testi tagliati e con più colore",
    ],
  },
  {
    version: "7",
    date: "2026-07-18",
    title: "Più veloce, più chiaro, più grande",
    items: [
      "Il timer ora si ferma all'istante, senza ritardi di sincronizzazione",
      "Dopo lo stop puoi scegliere subito il prossimo progetto",
      "Layout adattato al computer: più spazio, colonne affiancate",
      "Griglia settimanale admin colorata per progetto, con legenda",
      "Riepilogo di fine giornata con il totale e il dettaglio per progetto",
      "Admin: correggi progetto e cliente sulle voci di chiunque, anche in blocco",
      "Admin: sposta o unisci le ore di un progetto in un altro",
      "Admin: esporta la fatturazione di un cliente in PDF",
    ],
  },
  {
    version: "6",
    date: "2026-07-17",
    title: "Trovare le cose più in fretta",
    items: [
      "Ricerca nel selettore progetto: utile quando i progetti sono tanti",
      "I progetti usati di recente compaiono in cima alla lista",
    ],
  },
  {
    version: "5",
    date: "2026-07-16",
    title: "La giornata sotto controllo",
    items: [
      "Vista Giornata: i tuoi lavori come blocchi sulle ore, anche mentre il timer corre",
      "Modifica il timer in corso: sposta l'orario di inizio senza fermarlo (matita sulla card)",
      "Cliente visibile accanto al progetto (per chi amministra)",
      "Admin: pagina Clienti con progetti e ore, pagina Progetti con totali e persone",
      "Retrodatare o postdatare le voci: cambia data e orari liberamente",
    ],
  },
  {
    version: "4",
    date: "2026-07-15",
    title: "Settimana, tema scuro e obiettivi",
    items: [
      "Vista settimana nel Report: i tuoi giorni a colpo d'occhio",
      "Tema scuro (automatico o manuale, dal tuo profilo)",
      "Obiettivo settimanale personale, lo scegli tu",
      "Ricerca nello storico delle voci",
      "Avviso quando il timer resta acceso più di 4 ore",
      "Admin: filtri liberi nel report, griglia settimanale per persona, copertura ore, budget per progetto",
    ],
  },
  {
    version: "3",
    date: "2026-07-14",
    title: "Pomodoro 🍅",
    items: [
      "Nuovo nome e nuova icona",
      "Pausa vera sul timer (il tempo in pausa non conta)",
      "Sezione \"Per te\" con i tuoi progressi personali",
      "Suggerimenti automatici mentre scrivi",
      "Layout da app vera anche su computer",
    ],
  },
  {
    version: "2",
    date: "2026-07-13",
    title: "Dashboard e sicurezza",
    items: [
      "Dashboard admin: redditività, produttività, fatturazione",
      "Statistiche per attività con mediana e scostamenti",
      "Protezioni rafforzate sui dati",
    ],
  },
  { version: "1", title: "Prima versione", items: ["Timer, progetti, report e PWA per iPhone"] },
];

const SEEN_KEY = "pomodoro_seen_version";
export function hasUnseenNews() {
  return localStorage.getItem(SEEN_KEY) !== CURRENT_VERSION;
}
export function markNewsSeen() {
  localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
}
