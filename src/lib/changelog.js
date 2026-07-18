// Novità dell'app, dalla più recente. short = etichetta versione.
export const CURRENT_VERSION = "8";
export const APP_NAME = "Kesia Time";

export const CHANGELOG = [
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
