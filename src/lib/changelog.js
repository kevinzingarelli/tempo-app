// Novità dell'app, dalla più recente. short = etichetta versione.
export const CURRENT_VERSION = "5";

export const CHANGELOG = [
  {
    version: "5",
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
