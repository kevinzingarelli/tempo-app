// Novità dell'app, dalla più recente.
// "items" = visibili a TUTTI. "adminItems" = visibili SOLO a Kevin e Asia
// (funzioni amministrative, costi, redditività, dati sensibili).
// Se "items" è vuoto, l'intera voce non compare per chi non è admin.
export const CURRENT_VERSION = "19";
export const APP_NAME = "Boschetto";

export const CHANGELOG = [
  {
    version: "19",
    date: "2026-07-20",
    time: "06:35",
    title: "Calendario Google in timeline, mini-timer e ferie precise",
    items: [
      "Gli impegni di Google Calendar ora sono una vera timeline oraria, allineata perfettamente a 'La tua giornata'",
      "Il secondo timer in parallelo è ora una mini-card col cronometro, come il timer principale ma più piccola",
    ],
    adminItems: [
      "Nuova sezione 'Situazione ferie e permessi': maturato, usato e residuo per ogni persona, in formato tipo '20g 2h'",
      "Nei profili puoi impostare ore ferie e permessi all'anno, per un calcolo più preciso del maturato",
      "Tu e Asia non vedete più il modulo di richiesta ferie (non vi serve)",
    ],
  },
  {
    version: "18",
    date: "2026-07-19",
    time: "23:24",
    title: "Novità visibili a tutti",
    items: [
      "Ora tutti possono vedere le novità dell'app, non solo gli amministratori",
      "Alcuni aggiornamenti che riguardano solo la gestione interna restano visibili a Kevin e Asia",
    ],
    adminItems: [],
  },
  {
    version: "17",
    date: "2026-07-19",
    time: "23:12",
    title: "Timer in parallelo",
    items: [
      "Puoi sempre aggiungere una voce passata (col pulsante +) senza fermare il timer in corso",
    ],
    adminItems: [
      "Tu e Asia potete avviare un secondo timer senza fermare quello già in corso",
      "Ogni timer parallelo si vede, si mette in pausa e si ferma separatamente",
    ],
  },
  {
    version: "16",
    date: "2026-07-19",
    time: "22:46",
    title: "Avviso ferie da smaltire",
    items: [],
    adminItems: [
      "In Ferie, tu e Asia vedete un avviso per chi ha ancora molte ferie non godute",
      "Le ferie vanno usate entro 18 mesi: l'avviso aiuta a pianificarle per tempo",
    ],
  },
  {
    version: "15",
    date: "2026-07-19",
    time: "22:48",
    title: "Novità con orario",
    items: [
      "Le voci di Novità ora mostrano anche l'orario, oltre alla data",
    ],
    adminItems: [],
  },
  {
    version: "14",
    date: "2026-07-19",
    title: "Integrazione con Zoho CRM",
    items: [],
    adminItems: [
      "Nuova sezione Opportunità: vedi le opportunità (Deal) create su Zoho CRM",
      "Importa un'opportunità collegandola a un cliente e creando il progetto/lavoro corrispondente",
      "Puoi impostare un margine-obiettivo per ogni opportunità",
      "Nel profilo cliente vedi ora tutte le sue opportunità, oltre ai progetti",
    ],
  },
  {
    version: "13",
    date: "2026-07-19",
    title: "Controllo di gestione: costi e redditività",
    items: [],
    adminItems: [
      "Per ogni persona puoi impostare il costo aziendale (diretto o dai componenti RAL/contributi/TFR)",
      "Sui progetti puoi indicare le ore pianificate, accanto a quelle stimate e a quelle effettive",
      "Nuova sezione Redditività: per ogni cliente vedi ricavi, costo del personale e margine di commessa",
      "I progetti interni/Studio raccolgono le ore generali, ribaltate come costo sui clienti",
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
      "Il calendario mostra icone stagionali sulle ferie (mare d'estate, albero a Natale…)",
    ],
    adminItems: [],
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
    adminItems: [],
  },
  {
    version: "10",
    date: "2026-07-19",
    title: "Ferie e Google Calendar",
    items: [
      "Calendario ferie rifatto: compatto, con pallini colorati e salto rapido per anno",
      "Aggiunta la festa patronale di Vasto (San Michele Arcangelo, 29 settembre)",
      "Ferie residue: l'app calcola quanto ti resta rispetto al monte annuo",
      "Collega Google Calendar e vedi i tuoi impegni nella schermata principale",
      "Note interne sulle singole voci di lavoro",
      "Rimosso l'avviso del timer aperto all'apertura (non affidabile come PWA)",
    ],
    adminItems: [
      "Nuovo report Esplora: entri dal cliente o dalla persona e vedi tutto nel dettaglio",
      "Torta ore per cliente e, per ogni persona, ripartizione tra i clienti",
      "Ore per giorno della settimana e voci da sistemare prima di fatturare",
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
      "Continua un lavoro recente con un tocco",
    ],
    adminItems: [
      "Report admin più ricchi: torta per progetto, andamento a linea, fatturabili vs no",
      "Tabella per persona con confronto onesto rispetto al periodo precedente",
      "Crea un progetto al volo mentre registri, e blocca i periodi già verificati",
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
    ],
    adminItems: [
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
      "Riepilogo di fine giornata con il totale e il dettaglio per progetto",
    ],
    adminItems: [
      "Griglia settimanale colorata per progetto, con legenda",
      "Correggi progetto e cliente sulle voci di chiunque, anche in blocco",
      "Sposta o unisci le ore di un progetto in un altro",
      "Esporta la fatturazione di un cliente in PDF",
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
    adminItems: [],
  },
  {
    version: "5",
    date: "2026-07-16",
    title: "La giornata sotto controllo",
    items: [
      "Vista Giornata: i tuoi lavori come blocchi sulle ore, anche mentre il timer corre",
      "Modifica il timer in corso: sposta l'orario di inizio senza fermarlo (matita sulla card)",
      "Retrodatare o postdatare le voci: cambia data e orari liberamente",
    ],
    adminItems: [
      "Cliente visibile accanto al progetto",
      "Pagina Clienti con progetti e ore, pagina Progetti con totali e persone",
    ],
  },
  {
    version: "4",
    date: "2026-07-15",
    title: "Settimana, tema scuro e obiettivi",
    items: [
      "Vista settimana nel Report personale: i tuoi giorni a colpo d'occhio",
      "Tema scuro (automatico o manuale, dal tuo profilo)",
      "Obiettivo settimanale personale, lo scegli tu",
      "Ricerca nello storico delle voci",
      "Avviso quando il timer resta acceso più di 4 ore",
    ],
    adminItems: [
      "Filtri liberi nel report, griglia settimanale per persona, copertura ore, budget per progetto",
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
    adminItems: [],
  },
  {
    version: "2",
    date: "2026-07-13",
    title: "Sicurezza",
    items: [
      "Protezioni rafforzate sui dati",
    ],
    adminItems: [
      "Dashboard admin: redditività, produttività, fatturazione",
      "Statistiche per attività con mediana e scostamenti",
    ],
  },
  {
    version: "1",
    title: "Prima versione",
    items: ["Timer, progetti, report e PWA per iPhone"],
    adminItems: [],
  },
];

const SEEN_KEY = "pomodoro_seen_version";

// Voci visibili per il ruolo indicato (solo quelle con almeno un item
// pertinente). Gli admin vedono tutto; gli altri solo le voci con "items".
export function visibleChangelog(isAdmin) {
  return CHANGELOG.filter((v) => {
    const hasGeneral = v.items && v.items.length > 0;
    const hasAdmin = isAdmin && v.adminItems && v.adminItems.length > 0;
    return hasGeneral || hasAdmin;
  });
}

export function hasUnseenNews(isAdmin) {
  const seen = Number(localStorage.getItem(SEEN_KEY) || 0);
  return visibleChangelog(isAdmin).some((v) => Number(v.version) > seen);
}
export function markNewsSeen() {
  localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
}
