// =====================================================================
//  DATI DEL RILIEVO – box (Fase 1/2)
//  Sistema locale: origine = angolo interno NORD-OVEST (parete portone /
//  parete moto). X verso EST (lato lungo), Z verso SUD (verso l'interno),
//  Y verso l'alto. Unità: metri.
//  Fonti: [P] planimetria geometra, [M] misurato su scan, [F] dato di
//  fabbrica, [S] stimato. Precisione indicata in "prec" (metri).
// =====================================================================

export const ROOM = {
  // trapezio: parete nord (lato casa) 13,02 [P], parete sud 13,33 [P],
  // larghezza 6,00 [P]; parete ovest obliqua (confermata dallo scan).
  polygon: [
    [0.31, 0.0],   // NO
    [13.33, 0.0],  // NE
    [13.33, 6.0],  // SE
    [0.0, 6.0],    // SO
  ],
  wallNames: ['Nord (portone / casa)', 'Est (banco)', 'Sud (esterno)', 'Ovest (moto)'],
  height: 2.31,          // [M] ±0.03
  floorColor: 0xb9b4aa,
};

// Portone sezionale sulla parete nord
export const DOOR = {
  leafX: [0.31, 4.56],   // manto 4,25 [M]
  openX: [0.38, 4.50],   // vano 4,12 [S] (coperto dal manto nello scan)
  openH: 2.18,           // vano altezza [S] ±0.04
  leafH: 2.25,           // [M]
  trackY: 2.27,          // binari orizzontali [M]
  trackDepth: 2.60,      // binari fino a Z=2,60 [M] (2,55 scan ×1,021)
  clearUnderOpen: 2.10,  // luce sotto pannelli aperti [S] ±0.05
  motorX: 2.43,          // guida motore in mezzeria [M]
  motorEnd: 2.95,        // ingombro motore [S]
};

export const HOUSE_DOOR = { x: [11.25, 12.40], h: 2.10 }; // [M]/[P]
export const PANEL = { x: [4.58, 5.12], y: [1.40, 1.87], depth: 0.14, access: 0.80 }; // [M]
export const SOCKETS = [ { x: 4.85, y: 1.10 }, { x: 4.85, y: 0.40 } ]; // [M]

// Trasformazione scan -> locale (vedi analisi/rilievo_fase1.json)
export const GHOST_TF = { rotYdeg: -1.1, scale: [1.0, 1.0, 1.0213], pos: [6.79, -0.008, 2.1447] };

// ---------------------------------------------------------------------
//  Oggetti. rot in gradi: asse L dell'oggetto ruotato da +X verso +Z.
//  Per auto/moto il muso è verso -L (rot 0 = muso a ovest).
//  elev = quota della base. daily = uso quotidiano. fixed = ancora.
// ---------------------------------------------------------------------
let _id = 0;
const o = (p) => ({ id: 'o' + (++_id), rot: 0, elev: 0, daily: false, fixed: false, src: 'S', ...p });

// Posti auto. 'video' = come nello scan/video (Mini davanti al portone).
// 'abituale' = Q2 davanti al portone e Mini nel posto della Q2 [ipotesi dichiarata:
// Q2 con lo stesso centro della Mini (muso a ~0,60 m dal portone); Mini entrata in avanti,
// muso a est verso la porta di casa, con il muso dove la Q2 del video aveva il posteriore (X = 9,42)].
// 'ottimale' = come 'abituale' ma parcheggiate meglio [proposta, da provare sul posto]:
//   Q2 18,5 cm più verso le moto (nelle proposte le moto stanno 4-6 cm più vicine al muro,
//   così restano ~74 cm per la portiera lato guida della Q2, che dà verso le moto);
//   Mini 4 cm verso nord (lato guida verso la parete nord: ~88 cm) e BMW 13 cm verso sud
//   (lato guida verso la parete sud: ~82 cm) -> varco tra Mini e BMW da ~69 a ~86 cm.
export const CAR_SLOTS = {
  video:    { 'Mini One R56': { x: 2.925, z: 2.691, rot: 87.75 }, 'Audi Q2': { x: 7.315, z: 1.757, rot: 0.25 }, 'BMW 118d F20': { x: 7.045, z: 4.168, rot: 0 } },
  abituale: { 'Audi Q2': { x: 2.925, z: 2.700, rot: 87.75 }, 'Mini One R56': { x: 7.563, z: 1.757, rot: -179.75 }, 'BMW 118d F20': { x: 7.045, z: 4.168, rot: 0 } },
  ottimale: { 'Audi Q2': { x: 2.740, z: 2.700, rot: 90 }, 'Mini One R56': { x: 7.563, z: 1.715, rot: 180 }, 'BMW 118d F20': { x: 7.045, z: 4.300, rot: 0 } },
};
export function carObjects(cfg = 'ottimale') {
  const sl = CAR_SLOTS[cfg] || CAR_SLOTS.ottimale;
  return [
    o({ name: 'Mini One R56', type: 'car', kind: 'car', ...sl['Mini One R56'],
        L: 3.714, P: 1.683, H: 1.407, mirrors: 1.913, wheelbase: 2.467, doors: 3,
        color: '#e8dcb5', fixed: true, daily: true, src: 'M+F', note: 'Posizione [M] ±5 cm; misure [F]. Specchietti [S].' }),
    o({ name: 'Audi Q2', type: 'car', kind: 'car', ...sl['Audi Q2'],
        L: 4.208, P: 1.794, H: 1.508, mirrors: 2.009, wheelbase: 2.601, doors: 5,
        color: '#9ea4aa', fixed: true, daily: true, src: 'M+F', note: 'Riferimento di calibrazione. Posizione [M] ±3 cm.' }),
    o({ name: 'BMW 118d F20', type: 'car', kind: 'car', ...sl['BMW 118d F20'],
        L: 4.324, P: 1.765, H: 1.421, mirrors: 1.984, wheelbase: 2.690, doors: 5,
        color: '#4b5059', fixed: true, daily: true, src: 'M+F', note: 'Posizione [M] ±5 cm, raddrizzata (nel video era ruotata di −4,5°). Misure F20 LCI [F, da verificare].' }),
  ];
}

export function currentLayout(cfg) {
  _id = 100;
  return [
    ...carObjects(cfg),
    o({ name: 'Rieju MRT 50', type: 'moto', kind: 'moto', x: 0.70, z: 1.74, rot: -90, L: 2.0, P: 0.80, H: 1.15, color: '#d0202a', src: 'M+S', note: 'Dimensioni stimate (tipo non noto).' }),
    o({ name: 'Kawasaki ER-6n', type: 'moto', kind: 'moto', x: 0.86, z: 3.82, rot: -90, L: 2.105, P: 0.76, H: 1.10, color: '#e9e9e9', src: 'M+F', note: 'Su cavalletto posteriore. Misure di fabbrica non verificate online.' }),
    o({ name: 'Scaffale metallico + mobiletti', kind: 'scaffale', x: 1.42, z: 5.72, L: 2.60, P: 0.55, H: 1.80, color: '#9aa3ad', src: 'M' }),
    o({ name: 'Idropulitrice, stendini, assi', kind: 'box', x: 4.24, z: 5.78, L: 2.90, P: 0.45, H: 1.20, color: '#c9a66b', src: 'S', note: 'Ingombro stimato, confidenza bassa.' }),
    o({ name: 'Bici da corsa (appesa)', kind: 'bici', x: 8.14, z: 5.82, L: 1.70, P: 0.35, H: 0.80, elev: 1.15, color: '#b03030', src: 'M' }),
    o({ name: 'Scala', kind: 'box', x: 9.24, z: 5.85, L: 0.50, P: 0.25, H: 1.80, color: '#c0c0c0', src: 'M' }),
    o({ name: 'Cumulo: gommone, materassi, scatole', kind: 'box', x: 11.15, z: 5.15, L: 3.20, P: 1.65, H: 1.90, color: '#7a8db3', src: 'M', note: 'Da smaltire/riordinare.' }),
    o({ name: 'MTB 1 (gialla)', kind: 'bici', x: 11.35, z: 2.70, L: 1.85, P: 0.75, H: 1.10, color: '#f2c200', daily: true, src: 'M' }),
    o({ name: 'MTB 2', kind: 'bici', x: 11.80, z: 1.95, L: 1.85, P: 0.75, H: 1.10, color: '#2c3e70', daily: true, src: 'M' }),
    o({ name: 'MTB 3', kind: 'bici', x: 11.75, z: 3.35, L: 1.85, P: 0.75, H: 1.10, color: '#222222', daily: true, src: 'M' }),
    o({ name: 'Bici 4 (poco usata)', kind: 'bici', x: 10.75, z: 4.25, L: 1.80, P: 0.70, H: 1.05, color: '#3aa58c', src: 'S' }),
    o({ name: 'Trasportini / borse', kind: 'box', x: 10.40, z: 3.45, L: 0.70, P: 0.90, H: 0.75, color: '#d23c78', src: 'M' }),
    o({ name: 'Scaffali parete est', kind: 'scaffale', x: 13.05, z: 3.42, rot: 90, L: 3.20, P: 0.55, H: 2.00, color: '#8e959c', src: 'M' }),
    o({ name: 'Banco da lavoro + pannello', kind: 'banco', x: 13.05, z: 0.92, rot: 90, L: 1.80, P: 0.55, H: 0.90, color: '#c89b5e', src: 'M' }),
    o({ name: 'Bidoni differenziata (7)', kind: 'bidoni', x: 10.05, z: 0.43, L: 2.25, P: 0.80, H: 1.0, color: '#e0c020', daily: true, src: 'M' }),
    o({ name: 'Ruota bici appesa', kind: 'box', x: 10.75, z: 0.10, L: 0.65, P: 0.15, H: 0.65, elev: 1.50, color: '#333333', src: 'M' }),
    ...defaultChecks(),
  ];
}

export function defaultChecks() {
  return [
    o({ name: 'Corridoio portone → casa', kind: 'corridoio', x: 8.20, z: 0.42, L: 6.40, P: 0.80, H: 0.01, color: '#2e86de', src: 'S' }),
    o({ name: 'Corridoio auto davanti ↔ frontali', kind: 'corridoio', x: 4.32, z: 2.90, rot: 90, L: 4.60, P: 0.80, H: 0.01, color: '#2e86de', src: 'S' }),
  ];
}

// ---------------------------------------------------------------------
//  Libreria elementi aggiungibili (misure personalizzabili)
// ---------------------------------------------------------------------
export const LIBRARY = [
  { kind: 'scaffale', name: 'Scaffale metallico', L: 1.00, P: 0.50, H: 2.00, color: '#8e959c', wall: true, price: '60–120 €' },
  { kind: 'mensola', name: 'Mensola a muro', L: 1.20, P: 0.30, H: 0.04, elev: 1.60, color: '#b5895a', wall: true, price: '25–40 €/m' },
  { kind: 'armadio', name: 'Armadio metallico', L: 0.80, P: 0.45, H: 1.80, color: '#6c7a89', wall: true, price: '150–250 €' },
  { kind: 'gancio_v', name: 'Gancio bici verticale', L: 0.45, P: 1.15, H: 1.90, elev: 0.0, color: '#2d8a4e', wall: true, price: '10–25 €' },
  { kind: 'gancio_o', name: 'Supporto bici orizzontale', L: 1.80, P: 0.40, H: 1.00, elev: 1.30, color: '#2d8a4e', wall: true, price: '20–40 €' },
  { kind: 'rastrelliera', name: 'Rastrelliera bici a terra (3)', L: 1.10, P: 1.80, H: 1.10, color: '#2d8a4e', wall: false, price: '40–80 €' },
  { kind: 'soppalco', name: 'Ripiano a soffitto (rack)', L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad', wall: false, price: '150–250 €' },
  { kind: 'banco', name: 'Banco da lavoro', L: 2.00, P: 0.60, H: 0.90, color: '#c89b5e', wall: true, price: '150–300 €' },
  { kind: 'pannello', name: 'Pannello forato', L: 1.20, P: 0.05, H: 0.80, elev: 1.05, color: '#7f8c8d', wall: true, price: '30–60 €' },
  { kind: 'bidoni', name: 'Bidoni (fila)', L: 1.60, P: 0.60, H: 1.0, color: '#e0c020', wall: true, price: '—' },
  { kind: 'box', name: 'Contenitore / scatola', L: 0.60, P: 0.40, H: 0.40, color: '#c9a66b', wall: false, price: '—' },
  { kind: 'moto', name: 'Moto (generica)', L: 2.05, P: 0.80, H: 1.15, color: '#d0202a', wall: false, price: '—' },
  { kind: 'bici', name: 'Bici (a terra)', L: 1.85, P: 0.75, H: 1.10, color: '#444444', wall: false, price: '—' },
  { kind: 'zona', name: 'Zona (etichetta a pavimento)', L: 2.0, P: 1.5, H: 0.01, color: '#f39c12', wall: false, price: '—' },
  { kind: 'corridoio', name: 'Corridoio da verificare (80 cm)', L: 3.0, P: 0.80, H: 0.01, color: '#2e86de', wall: false, price: '—' },
];

// ---------------------------------------------------------------------
//  FASE 4 – Proposte di riordino (auto e moto fisse come nello stato attuale)
// ---------------------------------------------------------------------
function motos() {
  return [
    o({ name: 'Rieju MRT 50', type: 'moto', kind: 'moto', x: 0.70, z: 1.70, rot: -90, L: 2.0, P: 0.80, H: 1.15, color: '#d0202a' }),
    o({ name: 'Kawasaki ER-6n', type: 'moto', kind: 'moto', x: 0.72, z: 3.88, rot: -90, L: 2.105, P: 0.76, H: 1.10, color: '#e9e9e9' }),
  ];
}
const zone = (name, x, z, L, P, color) => o({ name, kind: 'zona', x, z, L, P, H: 0.01, color });
const mtbV = (n, x, daily = true) => o({ name: n, kind: 'gancio_v', x, z: 5.42, L: 0.45, P: 1.15, H: 1.90, color: daily ? '#2d8a4e' : '#7fa88c', daily, note: 'Bici appesa in verticale (ruota anteriore al gancio).' });

export const PRESETS = {
  'Stato attuale (rilievo)': (cfg) => currentLayout(cfg),

  // Proposta vuota: solo le tre auto (nella disposizione scelta), tutto il resto da aggiungere a mano
  'Proposta vuota – Da zero': (cfg) => { _id = 500; return [...carObjects(cfg)]; },

  // Proposta D – costruita sulle risposte al questionario (domande disposizione.txt, 16/11/2026).
  // Ovest/sud-ovest (vicino al portone): moto, cose che vanno fuori o in auto.
  // Est (vicino alla porta di casa): bidoni, bici, banco. Soffitto: stagionali.
  'Proposta D – Su misura': (cfg) => { _id = 600; return [
    ...carObjects(cfg), ...motos(), ...defaultChecks(),
    o({ name: 'Corridoio casa → bici e banco', kind: 'corridoio', x: 10.80, z: 2.65, rot: 90, L: 3.60, P: 0.80, H: 0.01, color: '#2e86de' }),
    zone('Moto (primavera-estate)', 0.75, 2.80, 1.0, 4.4, '#e74c3c'),
    zone('Auto, giardino, esterno', 2.60, 5.80, 4.4, 0.4, '#9b59b6'),
    zone('Bici', 11.30, 4.20, 2.2, 3.2, '#27ae60'),
    zone('Spazio di lavoro', 12.25, 5.08, 1.0, 1.8, '#f39c12'),
    zone('Bidoni + scope', 12.90, 1.25, 0.85, 2.5, '#f1c40f'),

    // --- Sud-ovest, dietro l'auto davanti al portone: armadi poco profondi (36 cm) per non
    // togliere spazio al portellone. Vicino al portone: cose che si usano fuori o con le auto.
    o({ name: 'Gomme invernali (4) su carrello', kind: 'box', x: 0.45, z: 5.60, L: 0.65, P: 0.65, H: 0.95, color: '#333333', note: 'Pesanti e stagionali: in basso e vicino al portone, si portano fuori rotolando. Carrello/torre per gomme 30–60 €.' }),
    o({ name: 'Armadio auto (prodotti, aspirapolvere)', kind: 'armadio', x: 1.25, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89', note: 'Chiuso, prof. 36 cm. Prodotti auto, aspirapolvere, panni. In alto le scorte, ad altezza occhi quello che si usa.' }),
    o({ name: 'Armadio giardino + infiammabili', kind: 'armadio', x: 2.07, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89', note: 'Metallico chiuso. Giardinaggio; vernici, solventi e taniche nel ripiano in basso. Lontano dalle e-bike in carica (che stanno a est).' }),
    o({ name: 'Scaffale scatole etichettate', kind: 'scaffale', x: 2.98, z: 5.82, L: 1.0, P: 0.36, H: 2.0, color: '#8e959c', note: 'Scatoloni rimasti dopo la cernita, meglio in box di plastica trasparenti con etichetta (umidità). Primo ripiano a 10-15 cm da terra: in inverno le auto portano acqua.' }),
    o({ name: 'Armadio scope e pulizia garage', kind: 'armadio', x: 3.90, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89', note: 'Scope, secchi, tergipavimento per l\'acqua che portano le auto. Il rubinetto è vicino al quadro.' }),
    o({ name: 'Idropulitrice + portabici da gancio', kind: 'box', x: 4.57, z: 5.72, L: 0.50, P: 0.50, H: 1.0, color: '#c9a66b', note: 'Il portabici del gancio traino della Q2 sta proprio dietro al suo bagagliaio.' }),
    o({ name: 'Scala (appesa in orizzontale)', kind: 'box', x: 0.32, z: 2.60, rot: 90, L: 1.80, P: 0.15, H: 0.45, elev: 1.40, color: '#c0c0c0', note: 'Su due staffe a muro sopra le moto (cemento armato: tasselli ok). Si stacca senza spostare nulla.' }),

    // --- Est: bidoni e scope vicino alla porta di casa
    o({ name: 'Armadietto scope (vicino casa)', kind: 'armadio', x: 12.88, z: 0.25, L: 0.8, P: 0.45, H: 1.8, color: '#6c7a89', note: 'Nell\'angolo tra la porta di casa e la parete est: scope e paletta per tutti i giorni.' }),
    o({ name: 'Bidoni differenziata (7)', kind: 'bidoni', x: 12.98, z: 1.55, rot: 90, L: 2.0, P: 0.70, H: 1.0, color: '#e0c020', daily: true, note: 'A due passi dalla porta di casa per smistare; il giorno della raccolta escono lungo il corridoio nord fino al portone.' }),

    // --- Est: bici. E-bike pesanti -> a terra (niente sollevamento); bici leggere/poco usate -> ganci.
    o({ name: 'Rastrelliera 2 e-bike (a terra)', kind: 'rastrelliera', x: 12.405, z: 3.35, rot: 90, L: 1.40, P: 1.85, H: 1.10, color: '#2d8a4e', daily: true, note: 'E-bike 23-28 kg: a terra, si entra e si esce senza sollevarle. 40-80 €.' }),
    o({ name: 'Presa nuova per e-bike e banco', kind: 'pannello', x: 13.30, z: 4.12, rot: 90, L: 0.12, P: 0.05, H: 0.12, elev: 1.10, color: '#ffffff', note: 'Oggi le prese sono solo sotto il quadro. Elettricista: linea esterna in canalina fino a qui (circa 100-200 €). Serve per caricare le e-bike e per gli elettroutensili del banco.' }),
    o({ name: 'Bici da corsa (esposta)', kind: 'gancio_o', x: 13.13, z: 3.40, rot: 90, L: 1.70, P: 0.40, H: 0.80, elev: 1.45, color: '#b03030', note: 'Il cimelio, in vista ad altezza occhi sopra le e-bike. Supporto orizzontale 20-40 €.' }),
    o({ name: 'MTB (più usata) – gancio', kind: 'gancio_v', x: 10.40, z: 5.42, rot: 180, L: 0.45, P: 1.15, H: 1.90, color: '#2d8a4e', daily: true, note: 'Leggera: si appende per la ruota anteriore. Vicina all\'uscita verso il corridoio.' }),
    o({ name: 'MTB (meno usata) – gancio', kind: 'gancio_v', x: 10.95, z: 5.42, rot: 180, L: 0.45, P: 1.15, H: 1.90, color: '#7fa88c' }),
    o({ name: 'Graziella – gancio', kind: 'gancio_v', x: 11.50, z: 5.42, rot: 180, L: 0.45, P: 1.15, H: 1.90, color: '#7fa88c', note: 'Le altre bici da vendere/buttare non sono previste.' }),

    // --- Est: banco (poco usato ma con spazio intorno), con pompe e attrezzi bici
    o({ name: 'Banco da lavoro (esistente)', kind: 'banco', x: 13.055, z: 5.08, rot: 90, L: 1.80, P: 0.55, H: 0.90, color: '#c89b5e', note: 'Davanti resta circa 1 m libero per lavorare.' }),
    o({ name: 'Pannello forato (attrezzi + pompe bici)', kind: 'pannello', x: 13.30, z: 5.08, rot: 90, L: 1.50, P: 0.05, H: 0.80, elev: 1.05, color: '#7f8c8d', note: 'Attrezzi ordinati, le 2 pompe e gli attrezzi bici appesi qui: la zona bici è a un passo.' }),
    o({ name: 'Mensola sopra il banco', kind: 'mensola', x: 13.18, z: 5.18, rot: 90, L: 1.60, P: 0.30, H: 0.04, elev: 1.95, color: '#b5895a', note: 'Attrezzi moto (ne basta poco spazio, in una cassetta) e scorte del banco.' }),

    // --- In alto: cose rare e stagionali
    o({ name: 'Rack soffitto sopra posto nord', kind: 'soppalco', x: 7.60, z: 1.715, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad', note: 'Dondolo smontato, gommone sgonfio. Prima di forare verificare i tubi dei cavi sul soffitto.' }),
    o({ name: 'Rack soffitto sopra BMW', kind: 'soppalco', x: 6.60, z: 4.30, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad', note: 'Materassi gonfiabili, decorazioni, cose da tenere ma rare.' }),
    o({ name: 'Mensola alta corridoio (cose leggere)', kind: 'mensola', x: 7.30, z: 0.15, L: 3.6, P: 0.30, H: 0.04, elev: 1.95, color: '#b5895a', note: 'Sopra la testa, sul passaggio di tutti: solo scatole leggere e rare.' }),
  ]; },

  // Proposta E – variante della D su indicazione dell'utente (16/11/2026): il passaggio a piedi
  // è TRA Mini e BMW, la striscia tra la Mini e la parete nord non serve come corridoio.
  // Parete nord usata (tranne la portiera lato guida della Mini); bidoni al loro posto storico,
  // banco al suo posto originale (parete est, vicino casa), scaffale a L nell'angolo sud-est.
  'Proposta E – Su misura, parete nord usata': (cfg) => { _id = 700; return [
    ...carObjects(cfg), ...motos(),
    o({ name: 'Corridoio auto davanti ↔ frontali', kind: 'corridoio', x: 4.32, z: 2.90, rot: 90, L: 4.60, P: 0.80, H: 0.01, color: '#2e86de' }),
    o({ name: 'Corridoio tra Mini e BMW', kind: 'corridoio', x: 8.075, z: 2.987, L: 6.65, P: 0.80, H: 0.01, color: '#2e86de', note: 'Tra le carrozzerie ~86 cm; con gli specchietti aperti ~64 cm: meglio chiuderli.' }),
    o({ name: 'Corridoio verso porta di casa', kind: 'corridoio', x: 11.80, z: 1.31, rot: 90, L: 2.58, P: 0.80, H: 0.01, color: '#2e86de' }),
    zone('Moto (primavera-estate)', 0.75, 2.80, 1.0, 4.4, '#e74c3c'),
    zone('Giardino, esterno, scatole', 2.30, 5.80, 3.8, 0.4, '#9b59b6'),
    zone('Pulizia + prodotti auto', 6.20, 0.25, 1.9, 0.5, '#9b59b6'),
    zone('Bidoni', 10.125, 0.37, 2.15, 0.7, '#f1c40f'),
    zone('Officina', 12.30, 1.45, 0.9, 1.8, '#f39c12'),
    zone('Bici', 11.30, 4.20, 2.2, 3.2, '#27ae60'),
    zone('Scaffale a L', 12.70, 5.40, 1.2, 1.2, '#9b59b6'),

    // --- Sud-ovest, dietro l'auto davanti al portone (prof. 36 cm per il portellone)
    o({ name: 'Gomme invernali (4) su carrello', kind: 'box', x: 0.45, z: 5.60, L: 0.65, P: 0.65, H: 0.95, color: '#333333', note: 'Pesanti e stagionali: in basso e vicino al portone. Carrello/torre 30–60 €.' }),
    o({ name: 'Armadio giardinaggio', kind: 'armadio', x: 1.25, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89', note: 'Prof. 36 cm. Attrezzi da giardino: escono dal portone.' }),
    o({ name: 'Armadio infiammabili (metallico)', kind: 'armadio', x: 2.07, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89', note: 'Vernici, solventi, taniche: chiusi e lontani dalle e-bike in carica (che stanno a est).' }),
    o({ name: 'Scaffale esterno / sport / campeggio', kind: 'scaffale', x: 2.98, z: 5.82, L: 1.0, P: 0.36, H: 2.0, color: '#8e959c', note: 'Box trasparenti etichettati, primo ripiano a 10-15 cm da terra (acqua delle auto in inverno).' }),
    o({ name: 'Idropulitrice + portabici da gancio', kind: 'box', x: 4.57, z: 5.72, L: 0.50, P: 0.50, H: 1.0, color: '#c9a66b', note: 'Il portabici del gancio traino della Q2 sta dietro al suo bagagliaio.' }),
    o({ name: 'Scala (appesa in orizzontale)', kind: 'box', x: 0.32, z: 2.60, rot: 90, L: 1.80, P: 0.15, H: 0.45, elev: 1.40, color: '#c0c0c0', note: 'Su due staffe sopra le moto.' }),

    // --- Parete nord, tra quadro e portiera della Mini: vicino al rubinetto
    o({ name: 'Armadio pulizia (scope, secchi, aspirapolvere)', kind: 'armadio', x: 5.67, z: 0.20, L: 0.8, P: 0.36, H: 1.8, color: '#6c7a89', note: 'Accanto al rubinetto (vicino al quadro): tergipavimento per l\'acqua delle auto, secchi, aspirapolvere. Il quadro resta libero.' }),
    o({ name: 'Scaffale prodotti auto', kind: 'scaffale', x: 6.65, z: 0.17, L: 1.0, P: 0.30, H: 2.0, color: '#8e959c', note: 'Si raggiunge dal lato del bagagliaio della Mini. Oltre resta libera la portiera lato guida della Mini (~70 cm).' }),

    // --- Parete nord, oltre il muso della Mini: bidoni al loro posto, ordinati
    o({ name: 'Bidoni differenziata (7)', kind: 'bidoni', x: 10.125, z: 0.37, L: 2.15, P: 0.70, H: 1.0, color: '#e0c020', daily: true, note: 'Al posto di oggi ma in fila ordinata. Il primo bidone (x < 9,42) è accanto al muso dell\'auto: metterci quello usato meno (es. vetro). Davanti resta libero l\'accesso alla porta di casa.' }),
    o({ name: 'Armadietto scope (vicino casa)', kind: 'armadio', x: 12.88, z: 0.25, L: 0.8, P: 0.45, H: 1.8, color: '#6c7a89', note: 'Scope e paletta per tutti i giorni, subito oltre la porta di casa.' }),

    // --- Parete est: banco al posto originale, poi bici, poi scaffale a L
    o({ name: 'Banco da lavoro (posto originale)', kind: 'banco', x: 13.055, z: 1.45, rot: 90, L: 1.80, P: 0.55, H: 0.90, color: '#c89b5e', note: 'Davanti c\'è tutto lo spazio libero dell\'incrocio per lavorare.' }),
    o({ name: 'Pannello forato (attrezzi + pompe bici)', kind: 'pannello', x: 13.30, z: 1.45, rot: 90, L: 1.50, P: 0.05, H: 0.80, elev: 1.05, color: '#7f8c8d', note: 'Attrezzi, le 2 pompe e gli attrezzi bici.' }),
    o({ name: 'Mensola sopra il banco', kind: 'mensola', x: 13.18, z: 1.45, rot: 90, L: 1.60, P: 0.30, H: 0.04, elev: 1.95, color: '#b5895a', note: 'Attrezzi moto in una cassetta e scorte del banco.' }),
    o({ name: 'Presa nuova per e-bike e banco', kind: 'pannello', x: 13.30, z: 2.47, rot: 90, L: 0.12, P: 0.05, H: 0.12, elev: 1.10, color: '#ffffff', note: 'Elettricista: linea in canalina dal quadro (circa 100-200 €). Serve al banco e per caricare le e-bike.' }),
    o({ name: 'Rastrelliera 2 e-bike (a terra)', kind: 'rastrelliera', x: 12.405, z: 3.35, rot: 90, L: 1.40, P: 1.85, H: 1.10, color: '#2d8a4e', daily: true, note: 'E-bike 23-28 kg: a terra, senza sollevarle. 40-80 €.' }),
    o({ name: 'Bici da corsa (esposta)', kind: 'gancio_o', x: 13.13, z: 3.40, rot: 90, L: 1.70, P: 0.40, H: 0.80, elev: 1.45, color: '#b03030', note: 'Il cimelio, ad altezza occhi sopra le e-bike.' }),
    o({ name: 'MTB (più usata) – gancio', kind: 'gancio_v', x: 10.40, z: 5.42, rot: 180, L: 0.45, P: 1.15, H: 1.90, color: '#2d8a4e', daily: true }),
    o({ name: 'MTB (meno usata) – gancio', kind: 'gancio_v', x: 10.95, z: 5.42, rot: 180, L: 0.45, P: 1.15, H: 1.90, color: '#7fa88c' }),
    o({ name: 'Graziella – gancio', kind: 'gancio_v', x: 11.50, z: 5.42, rot: 180, L: 0.45, P: 1.15, H: 1.90, color: '#7fa88c' }),
    o({ name: 'Scaffale a L – lato est', kind: 'scaffale', x: 13.08, z: 5.10, rot: 90, L: 1.70, P: 0.50, H: 2.0, color: '#8e959c', note: 'Scatoloni rimasti dopo la cernita, in box etichettati.' }),
    o({ name: 'Scaffale a L – lato sud', kind: 'scaffale', x: 12.32, z: 5.75, L: 0.95, P: 0.50, H: 2.0, color: '#8e959c', note: 'Angolo: si raggiunge dallo spazio davanti ai ganci delle bici.' }),

    // --- In alto: stagionali
    o({ name: 'Rack soffitto sopra posto nord', kind: 'soppalco', x: 7.60, z: 1.715, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad', note: 'Dondolo smontato, gommone sgonfio. Verificare i tubi dei cavi sul soffitto.' }),
    o({ name: 'Rack soffitto sopra BMW', kind: 'soppalco', x: 6.60, z: 4.30, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad', note: 'Materassi gonfiabili, decorazioni, cose rare.' }),
  ]; },

  'Proposta A – Riordino economico': (cfg) => { _id = 200; return [
    ...carObjects(cfg), ...motos(), ...defaultChecks(),
    zone('Zona moto', 0.9, 2.7, 1.3, 4.6, '#e74c3c'),
    zone('Stoccaggio SO', 2.3, 5.75, 4.4, 0.5, '#9b59b6'),
    zone('Bici', 11.5, 5.4, 2.6, 1.2, '#27ae60'),
    zone('Officina', 12.8, 0.95, 1.1, 1.9, '#f39c12'),
    zone('Bidoni', 13.0, 2.95, 0.7, 2.0, '#f1c40f'),
    o({ name: 'Scaffale + mobiletti esistenti (accorciati)', kind: 'scaffale', x: 1.045, z: 5.72, L: 1.85, P: 0.55, H: 1.8, color: '#9aa3ad', note: 'Lasciare libero il bagagliaio dell\'auto davanti al portone.' }),
    o({ name: 'Scaffale nuovo 1 (prof. 36)', kind: 'scaffale', x: 2.75, z: 5.82, L: 1.0, P: 0.36, H: 2.0, color: '#8e959c', note: 'Profondità max 36 cm: dietro al portellone della Q2.' }),
    o({ name: 'Scaffale nuovo 2', kind: 'scaffale', x: 4.30, z: 5.75, L: 1.0, P: 0.50, H: 2.0, color: '#8e959c' }),
    o({ name: 'Banco da lavoro (esistente)', kind: 'banco', x: 13.05, z: 0.92, rot: 90, L: 1.80, P: 0.55, H: 0.90, color: '#c89b5e' }),
    o({ name: 'Pannello forato', kind: 'pannello', x: 13.30, z: 0.92, rot: 90, L: 1.6, P: 0.05, H: 0.8, elev: 1.05, color: '#7f8c8d' }),
    o({ name: 'Bidoni differenziata', kind: 'bidoni', x: 13.03, z: 2.95, rot: 90, L: 2.0, P: 0.60, H: 1.0, color: '#e0c020', daily: true }),
    o({ name: 'Scaffale SE 1', kind: 'scaffale', x: 13.08, z: 4.55, rot: 90, L: 1.0, P: 0.50, H: 2.0, color: '#8e959c' }),
    o({ name: 'Scaffale SE 2', kind: 'scaffale', x: 13.08, z: 5.55, rot: 90, L: 0.9, P: 0.50, H: 2.0, color: '#8e959c' }),
    mtbV('MTB 1 (gancio)', 10.55), mtbV('MTB 2 (gancio)', 11.15), mtbV('MTB 3 (gancio)', 11.75),
    mtbV('Bici 4 (gancio)', 12.35, false),
    o({ name: 'Bici corsa (orizz. alta)', kind: 'gancio_o', x: 7.10, z: 5.80, L: 1.8, P: 0.40, H: 1.0, elev: 1.45, color: '#b03030' }),
    o({ name: 'Rack soffitto posto nord', kind: 'soppalco', x: 6.95, z: 1.75, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad', note: 'Gommone, materassi, stagionali.' }),
    o({ name: 'Rack soffitto BMW', kind: 'soppalco', x: 6.45, z: 4.17, rot: 0, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad' }),
    o({ name: 'Scala (appesa a muro)', kind: 'box', x: 9.80, z: 5.88, L: 0.50, P: 0.20, H: 1.80, color: '#c0c0c0' }),
  ]; },

  'Proposta B – Officina vicino al portone': (cfg) => { _id = 300; return [
    ...carObjects(cfg), ...motos(), ...defaultChecks(),
    zone('Moto', 0.9, 2.8, 1.3, 4.6, '#e74c3c'),
    zone('Officina', 4.75, 5.55, 2.0, 0.9, '#f39c12'),
    zone('Bici', 11.35, 5.4, 2.8, 1.2, '#27ae60'),
    zone('Bidoni / ingresso casa', 12.95, 1.1, 0.75, 2.2, '#f1c40f'),
    zone('Stoccaggio est', 13.0, 3.9, 0.7, 2.6, '#9b59b6'),
    o({ name: 'Banco da lavoro (spostato)', kind: 'banco', x: 4.75, z: 5.70, L: 1.8, P: 0.60, H: 0.90, color: '#c89b5e', daily: false }),
    o({ name: 'Pannello forato', kind: 'pannello', x: 4.75, z: 5.97, L: 1.6, P: 0.05, H: 0.8, elev: 1.05, color: '#7f8c8d' }),
    o({ name: 'Mobiletti esistenti', kind: 'armadio', x: 0.675, z: 5.75, L: 1.05, P: 0.50, H: 0.9, color: '#e8e8e8' }),
    o({ name: 'Armadio attrezzi', kind: 'armadio', x: 1.61, z: 5.775, L: 0.8, P: 0.45, H: 1.8, color: '#6c7a89' }),
    o({ name: 'Bidoni differenziata', kind: 'bidoni', x: 13.03, z: 1.10, rot: 90, L: 2.0, P: 0.60, H: 1.0, color: '#e0c020', daily: true }),
    o({ name: 'Scaffale est 1', kind: 'scaffale', x: 13.08, z: 2.80, rot: 90, L: 1.0, P: 0.50, H: 2.0, color: '#8e959c' }),
    o({ name: 'Scaffale est 2', kind: 'scaffale', x: 13.08, z: 3.85, rot: 90, L: 1.0, P: 0.50, H: 2.0, color: '#8e959c' }),
    o({ name: 'Scaffale est 3', kind: 'scaffale', x: 13.08, z: 4.90, rot: 90, L: 1.0, P: 0.50, H: 2.0, color: '#8e959c' }),
    mtbV('MTB 1 (gancio)', 10.25), mtbV('MTB 2 (gancio)', 10.80), mtbV('MTB 3 (gancio)', 11.35),
    mtbV('Bici 4 (gancio)', 11.90, false), mtbV('Bici 5 (gancio)', 12.45, false),
    o({ name: 'Bici corsa (orizz. alta)', kind: 'gancio_o', x: 7.10, z: 5.80, L: 1.8, P: 0.40, H: 1.0, elev: 1.45, color: '#b03030' }),
    o({ name: 'Mensole alte lato Q2', kind: 'mensola', x: 7.30, z: 0.15, L: 3.6, P: 0.30, H: 0.04, elev: 1.90, color: '#b5895a' }),
    o({ name: 'Rack soffitto posto nord', kind: 'soppalco', x: 6.95, z: 1.75, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad' }),
    o({ name: 'Rack soffitto BMW', kind: 'soppalco', x: 6.45, z: 4.17, rot: 0, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad' }),
  ]; },

  'Proposta C – Parete attrezzata + armadi chiusi': (cfg) => { _id = 400; return [
    ...carObjects(cfg), ...motos(), ...defaultChecks(),
    zone('Moto', 0.9, 2.7, 1.3, 4.6, '#e74c3c'),
    zone('Armadi chiusi', 2.6, 5.78, 4.6, 0.45, '#9b59b6'),
    zone('Parete attrezzata', 12.95, 3.0, 0.75, 6.0, '#f39c12'),
    zone('Bici', 11.35, 5.4, 2.8, 1.2, '#27ae60'),
    o({ name: 'Armadio 1', kind: 'armadio', x: 0.75, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89' }),
    o({ name: 'Armadio 2', kind: 'armadio', x: 1.60, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89' }),
    o({ name: 'Armadio 3', kind: 'armadio', x: 2.45, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89' }),
    o({ name: 'Armadio 4', kind: 'armadio', x: 3.30, z: 5.82, L: 0.8, P: 0.36, H: 2.0, color: '#6c7a89' }),
    o({ name: 'Scaffale aperto', kind: 'scaffale', x: 4.30, z: 5.75, L: 1.0, P: 0.50, H: 2.0, color: '#8e959c' }),
    o({ name: 'Bidoni (sotto mensola)', kind: 'bidoni', x: 12.90, z: 0.75, L: 0.80, P: 0.60, H: 1.0, color: '#e0c020', daily: true, note: '2-3 bidoni vicino alla porta di casa' }),
    o({ name: 'Bidoni est', kind: 'bidoni', x: 13.03, z: 2.15, rot: 90, L: 1.2, P: 0.60, H: 1.0, color: '#e0c020', daily: true }),
    o({ name: 'Banco da lavoro', kind: 'banco', x: 13.03, z: 3.75, rot: 90, L: 2.0, P: 0.60, H: 0.90, color: '#c89b5e' }),
    o({ name: 'Pannello forato', kind: 'pannello', x: 13.30, z: 3.75, rot: 90, L: 2.0, P: 0.05, H: 0.8, elev: 1.05, color: '#7f8c8d' }),
    o({ name: 'Scaffale SE', kind: 'scaffale', x: 13.08, z: 5.40, rot: 90, L: 1.1, P: 0.50, H: 2.0, color: '#8e959c' }),
    o({ name: 'Mensole sopra banco', kind: 'mensola', x: 13.18, z: 3.75, rot: 90, L: 2.0, P: 0.30, H: 0.04, elev: 1.95, color: '#b5895a' }),
    mtbV('MTB 1 (gancio)', 10.25), mtbV('MTB 2 (gancio)', 10.80), mtbV('MTB 3 (gancio)', 11.35),
    mtbV('Bici 4 (gancio)', 11.90, false), mtbV('Bici 5 (gancio)', 12.45, false),
    o({ name: 'Mensole alte lato BMW', kind: 'mensola', x: 7.10, z: 5.85, L: 3.6, P: 0.30, H: 0.04, elev: 1.75, color: '#b5895a' }),
    o({ name: 'Mensole alte lato Q2', kind: 'mensola', x: 7.30, z: 0.15, L: 3.6, P: 0.30, H: 0.04, elev: 1.90, color: '#b5895a' }),
    o({ name: 'Rack soffitto posto nord', kind: 'soppalco', x: 6.95, z: 1.75, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad' }),
    o({ name: 'Rack soffitto BMW', kind: 'soppalco', x: 6.45, z: 4.17, rot: 0, L: 2.40, P: 1.20, H: 0.05, elev: 1.80, color: '#a0a6ad' }),
  ]; },
};
