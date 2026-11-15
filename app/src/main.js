// =====================================================================
//  Garage 3D – progettazione riordino box
//  JavaScript vanilla + three.js (locale). Nessun framework.
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from '../lib/three/addons/controls/OrbitControls.js';
import { GLTFLoader } from '../lib/three/addons/loaders/GLTFLoader.js';
import { ROOM, DOOR, HOUSE_DOOR, PANEL, SOCKETS, GHOST_TF, LIBRARY, PRESETS, currentLayout, CAR_SLOTS } from './data.js';

const DEG = Math.PI / 180;
const $ = (s) => document.querySelector(s);
const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
const NON_SOLID = new Set(['zona', 'corridoio']);

// ---------------------------------------------------------------------
//  Stato
// ---------------------------------------------------------------------
const state = {
  objects: [],
  selected: null,
  view: '3d',
  mode: 'select',          // select | measure
  grid: 0.05,
  wallSnap: true,
  doorOpen: false,
  showDoorVolume: true,
  showLabels: true,
  checks: { doors: true, corridors: true, panel: true, collisions: true },
  scenario: false,
  carsOut: {},
  measures: [],
  pendingMeasure: null,
  ghostOpacity: 0.35,
  carConfig: 'ottimale',
  scanOnly: false,         // modalità "solo scansione"
  scanCut: 2.15,           // quota di taglio della scansione (toglie il soffitto)
  preset: 'Stato attuale (rilievo)',
};
let ghostLoaded = false;
const history = [];
let issues = [];
let reach = null;

// ---------------------------------------------------------------------
//  Renderer, scena, camere
// ---------------------------------------------------------------------
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const BG_PROJECT = new THREE.Color(0xe9edf2), BG_SCAN = new THREE.Color(0x14181f);
scene.background = BG_PROJECT.clone();
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), state.scanCut); // tiene y <= scanCut

const persp = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
persp.position.set(4.5, 9.5, 14.5);
const controls = new OrbitControls(persp, renderer.domElement);
controls.target.set(6.6, 0.5, 3.0);
controls.enableDamping = true;
controls.update();

const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
ortho.up.set(0, 0, -1);
const top = { cx: 6.66, cz: 3.0, half: 4.2 };

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 10, 6);
scene.add(sun);

const roomGroup = new THREE.Group();
const objGroup = new THREE.Group();
const checkGroup = new THREE.Group();
const measureGroup = new THREE.Group();
const doorGroup = new THREE.Group();
const ghostRoot = new THREE.Group();
scene.add(roomGroup, objGroup, checkGroup, measureGroup, doorGroup, ghostRoot);

// ---------------------------------------------------------------------
//  Geometria 2D
// ---------------------------------------------------------------------
const poly = ROOM.polygon;
function pointInPoly(x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function walls() {
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    const d = [dx / len, dz / len];
    return { i, p, q, len, d, n: [-d[1], d[0]] }; // n = normale interna
  });
}
const WALLS = walls();
function distToWalls(x, z) { // distanza (con segno, >0 dentro) dalla parete più vicina
  let best = Infinity;
  for (const w of WALLS) best = Math.min(best, (x - w.p[0]) * w.n[0] + (z - w.p[1]) * w.n[1]);
  return best;
}
function obb(o) {
  const c = Math.cos(o.rot * DEG), s = Math.sin(o.rot * DEG);
  return { cx: o.x, cz: o.z, hx: o.L / 2, hz: o.P / 2, ux: [c, s], uz: [-s, c] };
}
function corners(b) {
  const r = [];
  for (const [a, c] of [[1, 1], [1, -1], [-1, -1], [-1, 1]])
    r.push([b.cx + b.ux[0] * b.hx * a + b.uz[0] * b.hz * c, b.cz + b.ux[1] * b.hx * a + b.uz[1] * b.hz * c]);
  return r;
}
function satOverlap(a, b, eps = 0.003) {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  for (const ax of [a.ux, a.uz, b.ux, b.uz]) {
    const ra = a.hx * Math.abs(a.ux[0] * ax[0] + a.ux[1] * ax[1]) + a.hz * Math.abs(a.uz[0] * ax[0] + a.uz[1] * ax[1]);
    const rb = b.hx * Math.abs(b.ux[0] * ax[0] + b.ux[1] * ax[1]) + b.hz * Math.abs(b.uz[0] * ax[0] + b.uz[1] * ax[1]);
    if (Math.abs(dx * ax[0] + dz * ax[1]) >= ra + rb - eps) return false;
  }
  return true;
}
function inOBB(b, x, z, pad = 0) {
  const dx = x - b.cx, dz = z - b.cz;
  return Math.abs(dx * b.ux[0] + dz * b.ux[1]) <= b.hx + pad && Math.abs(dx * b.uz[0] + dz * b.uz[1]) <= b.hz + pad;
}
function outsideRoom(b) { return corners(b).some(([x, z]) => distToWalls(x, z) < -0.01); }
const vOverlap = (a0, a1, b0, b1) => a0 < b1 - 0.005 && b0 < a1 - 0.005;
const vRange = (o) => [o.elev || 0, (o.elev || 0) + o.H];
const inGarage = (o) => !(o.type === 'car' && state.carsOut[o.id]);
const solid = (o) => !NON_SOLID.has(o.kind) && inGarage(o);

// ---------------------------------------------------------------------
//  Stanza pulita (modello parametrico)
// ---------------------------------------------------------------------
const M = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.95 }),
  floor: new THREE.MeshStandardMaterial({ color: ROOM.floorColor, roughness: 0.9 }),
  ceil: new THREE.MeshStandardMaterial({ color: 0xdedcd6, side: THREE.BackSide, roughness: 1 }),
  cap: new THREE.MeshBasicMaterial({ color: 0x3d434b }),
};
function shapeFromXZ(pts) { return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))); }

function buildRoom() {
  roomGroup.clear();
  const fg = new THREE.ShapeGeometry(shapeFromXZ(poly)); fg.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(fg, M.floor); floor.name = 'floor'; roomGroup.add(floor);
  const ceil = new THREE.Mesh(fg.clone(), M.ceil); ceil.position.y = ROOM.height; ceil.name = 'ceiling'; roomGroup.add(ceil);

  // griglia 50 cm ritagliata sul trapezio
  const gp = [];
  const xw = (z) => poly[3][0] + (poly[0][0] - poly[3][0]) * (1 - z / 6.0);
  for (let x = 0.5; x < 13.33; x += 0.5) {
    const z0 = x < poly[0][0] ? 6.0 * (1 - x / poly[0][0]) : 0;
    gp.push(x, 0.003, z0, x, 0.003, 6.0);
  }
  for (let z = 0.5; z < 6.0; z += 0.5) gp.push(xw(z), 0.003, z, 13.33, 0.003, z);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  roomGroup.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x8d8a83, transparent: true, opacity: 0.35 })));

  // pareti con fori (portone e porta casa sulla parete nord)
  for (const w of WALLS) {
    const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(w.len, 0), new THREE.Vector2(w.len, ROOM.height), new THREE.Vector2(0, ROOM.height)]);
    if (w.i === 0) {
      for (const [a, b, h] of [[DOOR.openX[0], DOOR.openX[1], DOOR.openH], [HOUSE_DOOR.x[0], HOUSE_DOOR.x[1], HOUSE_DOOR.h]]) {
        const u0 = a - w.p[0], u1 = b - w.p[0];
        s.holes.push(new THREE.Path([new THREE.Vector2(u0, 0), new THREE.Vector2(u0, h), new THREE.Vector2(u1, h), new THREE.Vector2(u1, 0)]));
      }
    }
    const g = new THREE.ShapeGeometry(s);
    const m = new THREE.Mesh(g, M.wall);
    const X = new THREE.Vector3(w.d[0], 0, w.d[1]), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(w.n[0], 0, w.n[1]);
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(X, Y, Z).setPosition(w.p[0], 0, w.p[1]);
    m.name = 'wall'; m.userData.wall = w.i;
    roomGroup.add(m);
  }
  // spessore muri (visibile in pianta)
  const T = 0.25, outer = poly.map((p, i) => {
    const wa = WALLS[(i + poly.length - 1) % poly.length], wb = WALLS[i];
    const na = [-wa.n[0], -wa.n[1]], nb = [-wb.n[0], -wb.n[1]];
    const bis = [na[0] + nb[0], na[1] + nb[1]], k = T / (bis[0] * na[0] + bis[1] * na[1]);
    return [p[0] + bis[0] * k, p[1] + bis[1] * k];
  });
  const capS = shapeFromXZ(outer); capS.holes.push(new THREE.Path(poly.map(([x, z]) => new THREE.Vector2(x, -z))));
  const capG = new THREE.ShapeGeometry(capS); capG.rotateX(-Math.PI / 2);
  const cap = new THREE.Mesh(capG, M.cap); cap.position.y = ROOM.height + 0.001; cap.name = 'cap'; roomGroup.add(cap);
  const capF = cap.clone(); capF.position.y = 0.001; roomGroup.add(capF);

  // quadro elettrico + prese
  const pm = new THREE.Mesh(new THREE.BoxGeometry(PANEL.x[1] - PANEL.x[0], PANEL.y[1] - PANEL.y[0], PANEL.depth),
    new THREE.MeshStandardMaterial({ color: 0xf2f2e6, emissive: 0x303000 }));
  pm.position.set((PANEL.x[0] + PANEL.x[1]) / 2, (PANEL.y[0] + PANEL.y[1]) / 2, PANEL.depth / 2); pm.name = 'panel';
  roomGroup.add(pm);
  for (const so of SOCKETS) {
    const sm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    sm.position.set(so.x, so.y, 0.015); roomGroup.add(sm);
  }
  // telaio porta casa
  const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(HOUSE_DOOR.x[1] - HOUSE_DOOR.x[0], HOUSE_DOOR.h, 0.02)),
    new THREE.LineBasicMaterial({ color: 0x6b4f2a }));
  fr.position.set((HOUSE_DOOR.x[0] + HOUSE_DOOR.x[1]) / 2, HOUSE_DOOR.h / 2, 0.0); roomGroup.add(fr);
}

// ---------------------------------------------------------------------
//  Portone sezionale (chiuso / aperto) + volume occupato a soffitto
// ---------------------------------------------------------------------
const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 1 });
function buildDoor() {
  doorGroup.clear();
  const W = DOOR.leafX[1] - DOOR.leafX[0], cx = (DOOR.leafX[0] + DOOR.leafX[1]) / 2;
  const nSec = 5, secH = DOOR.leafH / nSec;
  const trackM = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 });
  // binari (sempre presenti)
  for (const x of [DOOR.leafX[0] + 0.03, DOOR.leafX[1] - 0.03]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, DOOR.trackDepth), trackM);
    t.position.set(x, DOOR.trackY, DOOR.trackDepth / 2); doorGroup.add(t);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, DOOR.trackY, 0.06), trackM);
    v.position.set(x, DOOR.trackY / 2, 0.06); doorGroup.add(v);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, DOOR.motorEnd), trackM);
  rail.position.set(DOOR.motorX, ROOM.height - 0.06, DOOR.motorEnd / 2); doorGroup.add(rail);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.35), new THREE.MeshStandardMaterial({ color: 0x444a50 }));
  motor.position.set(DOOR.motorX, ROOM.height - 0.1, DOOR.motorEnd - 0.17); doorGroup.add(motor);

  for (let k = 0; k < nSec; k++) {
    const g = new THREE.BoxGeometry(W, secH - 0.012, 0.04);
    const m = new THREE.Mesh(g, doorMat);
    if (!state.doorOpen) {
      m.position.set(cx, secH * k + secH / 2, 0.05);
    } else {
      m.rotation.x = Math.PI / 2;
      m.position.set(cx, DOOR.trackY - 0.06, 0.12 + secH * k + secH / 2);
    }
    m.name = 'door'; doorGroup.add(m);
  }
  doorMat.opacity = state.view === 'top' && state.doorOpen ? 0.35 : 1;

  if (state.doorOpen && state.showDoorVolume) {
    const yb = DOOR.clearUnderOpen, h = ROOM.height - yb;
    const vol = new THREE.Mesh(new THREE.BoxGeometry(W, h, DOOR.trackDepth),
      new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.18, depthWrite: false }));
    vol.position.set(cx, yb + h / 2, DOOR.trackDepth / 2); vol.name = 'doorVolume'; doorGroup.add(vol);
    const free = new THREE.Mesh(new THREE.BoxGeometry(W, yb, DOOR.trackDepth),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.06, depthWrite: false }));
    free.position.set(cx, yb / 2, DOOR.trackDepth / 2); free.name = 'doorFree'; doorGroup.add(free);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(free.geometry), new THREE.LineDashedMaterial({ color: 0x1e8449, dashSize: 0.1, gapSize: 0.06 }));
    e.position.copy(free.position); e.computeLineDistances(); doorGroup.add(e);
  }
}

// ---------------------------------------------------------------------
//  Modelli degli oggetti
// ---------------------------------------------------------------------
function std(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }); }

function carModel(o, mats) {
  const g = new THREE.Group();
  const L = o.L, W = o.P, H = o.H, gc = 0.13;
  const pts = [[-0.5, gc / H], [-0.5, 0.5], [-0.46, 0.63], [-0.24, 0.70], [-0.07, 0.97], [0.26, 1.0], [0.43, 0.93], [0.5, 0.70], [0.5, gc / H]];
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u * L, v * H)));
  const body = std(o.color, { metalness: 0.3, roughness: 0.45 }); mats.push(body);
  const eg = new THREE.ExtrudeGeometry(shape, { depth: W - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  eg.translate(0, 0, -(W - 0.06) / 2);
  g.add(new THREE.Mesh(eg, body));
  // vetri (fascia scura)
  const gl = new THREE.Shape([[-0.22, 0.715], [-0.075, 0.95], [0.25, 0.975], [0.415, 0.91], [0.46, 0.73]].map(([u, v]) => new THREE.Vector2(u * L, v * H)));
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2630, roughness: 0.2, metalness: 0.5 });
  const gg = new THREE.ExtrudeGeometry(gl, { depth: W + 0.005, bevelEnabled: false }); gg.translate(0, 0, -(W + 0.005) / 2);
  g.add(new THREE.Mesh(gg, glass));
  // ruote
  const wm = std(0x1b1b1b), oh = (L - o.wheelbase) / 2;
  for (const ax of [-L / 2 + oh, L / 2 - oh]) for (const sd of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.21, 20), wm);
    w.rotation.x = Math.PI / 2; w.position.set(ax, 0.31, sd * (W / 2 - 0.1)); g.add(w);
  }
  // specchietti
  const mw = (o.mirrors || W + 0.2) - W;
  for (const sd of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, mw / 2 + 0.02), body);
    m.position.set(-0.17 * L, 0.68 * H, sd * (W / 2 + mw / 4)); g.add(m);
  }
  // fari (indicano il muso)
  const hl = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0x555533 });
  for (const sd of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.28), hl); f.position.set(-L / 2 - 0.02, 0.55 * H, sd * (W / 2 - 0.25)); g.add(f); }
  return g;
}
function wheel(r, tube, mat) { return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 24), mat); }
function motoModel(o, mats) {
  const g = new THREE.Group(); const L = o.L, H = o.H;
  const tm = std(0x1a1a1a), bm = std(o.color); mats.push(bm);
  const wb = L * 0.68;
  for (const x of [-wb / 2, wb / 2]) { const w = wheel(0.3, 0.06, tm); w.position.set(x, 0.33, 0); g.add(w); }
  const b = new THREE.Mesh(new THREE.BoxGeometry(L * 0.55, 0.32, o.P * 0.38), bm); b.position.set(0, H * 0.62, 0); g.add(b);
  const s = new THREE.Mesh(new THREE.BoxGeometry(L * 0.32, 0.08, 0.28), tm); s.position.set(L * 0.12, H * 0.82, 0); g.add(s);
  const fk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, H * 0.8), std(0x888888)); fk.position.set(-wb / 2 + 0.12, H * 0.55, 0); fk.rotation.z = -0.4; g.add(fk);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, o.P), tm); hb.position.set(-wb / 2 + 0.25, H * 0.95, 0); g.add(hb);
  return g;
}
function bikeModel(L, H, P, color, mats) {
  const g = new THREE.Group(); const tm = std(0x202020), fm = std(color); mats.push(fm);
  const r = Math.min(0.36, H * 0.33);
  for (const x of [-L / 2 + r, L / 2 - r]) { const w = wheel(r, 0.03, tm); w.position.set(x, r, 0); g.add(w); }
  const f = new THREE.Mesh(new THREE.BoxGeometry(L - 2 * r, 0.05, 0.05), fm); f.position.set(0, r + 0.25, 0); g.add(f);
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, H - r, 0.05), fm); st.position.set(0.1, r + (H - r) / 2 - 0.1, 0); g.add(st);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, P), tm); hb.position.set(-L / 2 + r + 0.1, H - 0.05, 0); g.add(hb);
  return g;
}

function buildObjectMesh(o) {
  const g = new THREE.Group();
  const mats = [];
  const k = o.kind;
  const add = (geom, mat, x, y, z) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); g.add(m); return m; };
  if (k === 'car') g.add(carModel(o, mats));
  else if (k === 'moto') g.add(motoModel(o, mats));
  else if (k === 'bici') g.add(bikeModel(o.L, o.H, o.P, o.color, mats));
  else if (k === 'scaffale') {
    const fm = std(o.color, { metalness: 0.4 }); mats.push(fm);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.04, o.H, 0.04), fm, sx * (o.L / 2 - 0.02), o.H / 2, sz * (o.P / 2 - 0.02));
    const n = Math.max(2, Math.round(o.H / 0.45));
    for (let i = 0; i <= n; i++) add(new THREE.BoxGeometry(o.L, 0.025, o.P), fm, 0, Math.min(o.H - 0.02, 0.08 + i * (o.H - 0.1) / n), 0);
  } else if (k === 'mensola') {
    const fm = std(o.color); mats.push(fm);
    add(new THREE.BoxGeometry(o.L, o.H, o.P), fm, 0, o.H / 2, 0);
    const n = Math.max(2, Math.ceil(o.L / 0.8) + 1);
    for (let i = 0; i < n; i++) add(new THREE.BoxGeometry(0.03, 0.2, o.P * 0.8), std(0x555555), -o.L / 2 + 0.05 + i * (o.L - 0.1) / (n - 1), -0.1, -o.P * 0.1);
  } else if (k === 'armadio') {
    const fm = std(o.color, { metalness: 0.3 }); mats.push(fm);
    add(new THREE.BoxGeometry(o.L, o.H, o.P), fm, 0, o.H / 2, 0);
    const l = add(new THREE.BoxGeometry(0.01, o.H * 0.95, 0.01), std(0x222222), 0, o.H / 2, o.P / 2 + 0.005);
  } else if (k === 'gancio_v') {
    const fm = std(o.color, { transparent: true, opacity: 0.85 }); mats.push(fm);
    add(new THREE.BoxGeometry(0.05, 0.12, 0.12), std(0x333333), 0, o.H - 0.06, -o.P / 2 + 0.06);
    // bici appesa in verticale: lunghezza lungo Y, "altezza" della bici verso l'interno (+Z), manubrio lungo X
    const len = o.H - 0.1, b = bikeModel(len, o.P - 0.05, 0.7, o.color, mats);
    b.matrixAutoUpdate = false;
    b.matrix.makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)).setPosition(0, 0.1 + len / 2, -o.P / 2 + 0.02);
    g.add(b);
  } else if (k === 'gancio_o') {
    const b = bikeModel(o.L, o.H, o.P, o.color, mats); g.add(b);
    add(new THREE.BoxGeometry(0.05, 0.05, o.P), std(0x333333), -o.L / 4, o.H * 0.75, 0);
    add(new THREE.BoxGeometry(0.05, 0.05, o.P), std(0x333333), o.L / 4, o.H * 0.75, 0);
  } else if (k === 'rastrelliera') {
    const fm = std(o.color); mats.push(fm);
    add(new THREE.BoxGeometry(o.L, 0.04, 0.3), fm, 0, 0.02, -o.P / 2 + 0.15);
    const n = Math.max(1, Math.round(o.L / 0.37));
    for (let i = 0; i < n; i++) {
      const b = bikeModel(o.P, o.H, 0.6, '#555555', []); b.rotation.y = Math.PI / 2;
      b.position.set(-o.L / 2 + (i + 0.5) * o.L / n, 0, 0); g.add(b);
    }
  } else if (k === 'soppalco') {
    const fm = std(o.color, { metalness: 0.4, transparent: true, opacity: 0.85 }); mats.push(fm);
    add(new THREE.BoxGeometry(o.L, Math.max(o.H, 0.03), o.P), fm, 0, o.H / 2, 0);
    const hang = ROOM.height - (o.elev + o.H);
    if (hang > 0.01) for (const sx of [-1, 1]) for (const sz of [-1, 1])
      add(new THREE.BoxGeometry(0.03, hang, 0.03), std(0x555555), sx * (o.L / 2 - 0.05), o.H + hang / 2, sz * (o.P / 2 - 0.05));
  } else if (k === 'banco') {
    const fm = std(o.color); mats.push(fm);
    add(new THREE.BoxGeometry(o.L, 0.05, o.P), fm, 0, o.H - 0.025, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.05, o.H - 0.05, 0.05), std(0x555555), sx * (o.L / 2 - 0.05), (o.H - 0.05) / 2, sz * (o.P / 2 - 0.05));
    add(new THREE.BoxGeometry(o.L - 0.1, 0.03, o.P - 0.1), fm, 0, 0.2, 0);
  } else if (k === 'bidoni') {
    const n = Math.max(1, Math.round(o.L / 0.4)); const palette = ['#e0c020', '#2e8b57', '#3a6fd8', '#7f8c8d', '#e0c020', '#2e8b57', '#555555'];
    for (let i = 0; i < n; i++) {
      const m = std(i === 0 ? o.color : palette[i % palette.length]); mats.push(m);
      add(new THREE.BoxGeometry(o.L / n - 0.03, o.H, o.P - 0.04), m, -o.L / 2 + (i + 0.5) * o.L / n, o.H / 2, 0);
    }
  } else if (k === 'zona' || k === 'corridoio') {
    const fm = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: k === 'zona' ? 0.22 : 0.28, depthWrite: false });
    mats.push(fm);
    const m = add(new THREE.PlaneGeometry(o.L, o.P), fm, 0, 0.008 + (k === 'corridoio' ? 0.002 : 0), 0); m.rotation.x = -Math.PI / 2;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.L, 0.001, o.P)),
      new THREE.LineDashedMaterial({ color: o.color, dashSize: 0.12, gapSize: 0.08 }));
    e.position.y = 0.012; e.computeLineDistances(); g.add(e);
  } else { // box generico / pannello
    const fm = std(o.color, { transparent: o.kind === 'box', opacity: o.kind === 'box' ? 0.9 : 1 }); mats.push(fm);
    add(new THREE.BoxGeometry(o.L, o.H, o.P), fm, 0, o.H / 2, 0);
  }
  // contorno di ingombro (usato anche per evidenziare collisioni/selezione)
  if (!NON_SOLID.has(k)) {
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.L, o.H, o.P)), new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.25 }));
    outline.position.y = o.H / 2; outline.name = 'outline'; g.add(outline);
  }
  g.position.set(o.x, o.elev || 0, o.z);
  g.rotation.y = -o.rot * DEG;
  g.userData = { id: o.id, mats };
  g.traverse((c) => { c.userData.id = o.id; });
  if (o.type === 'car' && state.carsOut[o.id]) {
    g.traverse((c) => { if (c.material) { c.material = c.material.clone(); c.material.transparent = true; c.material.opacity = 0.12; c.material.depthWrite = false; } });
  }
  return g;
}

const meshes = new Map();
function rebuildObject(o) {
  const old = meshes.get(o.id); if (old) { objGroup.remove(old); disposeTree(old); }
  const m = buildObjectMesh(o); objGroup.add(m); meshes.set(o.id, m);
}
function rebuildAll() {
  for (const m of meshes.values()) { objGroup.remove(m); disposeTree(m); }
  meshes.clear();
  state.objects.forEach(rebuildObject);
}
function disposeTree(t) { t.traverse((c) => { c.geometry && c.geometry.dispose(); }); }
function syncTransform(o) {
  const m = meshes.get(o.id); if (!m) return;
  m.position.set(o.x, o.elev || 0, o.z); m.rotation.y = -o.rot * DEG;
}

// ---------------------------------------------------------------------
//  Controlli spazio: collisioni, portiere, corridoi, quadro, portone
// ---------------------------------------------------------------------
function carZones(c) {
  const b = obb(c), zones = [];
  const doorLen = c.doors === 3 ? 1.15 : 2.0, start = 0.85, w = 0.70;
  for (const side of [1, -1]) { // +1 = lato guida (sinistra, guida a sinistra)
    const lx = -c.L / 2 + start + doorLen / 2, lz = side * (c.P / 2 + w / 2);
    zones.push({ kind: 'porta', side, car: c, cx: b.cx + b.ux[0] * lx + b.uz[0] * lz, cz: b.cz + b.ux[1] * lx + b.uz[1] * lz, hx: doorLen / 2, hz: w / 2, ux: b.ux, uz: b.uz, v: [0.35, 1.25] });
  }
  const tl = 0.8, lx = c.L / 2 + tl / 2;
  zones.push({ kind: 'baule', car: c, cx: b.cx + b.ux[0] * lx, cz: b.cz + b.ux[1] * lx, hx: tl / 2, hz: c.P * 0.4, ux: b.ux, uz: b.uz, v: [0.5, 2.0] });
  return zones;
}
function zoneBlockers(z, excludeId) {
  const hits = [];
  for (const o of state.objects) {
    if (!solid(o) || o.id === excludeId) continue;
    const [a, b] = vRange(o);
    if (!vOverlap(a, b, z.v[0], z.v[1])) continue;
    if (satOverlap(z, obb(o))) hits.push(o.name);
  }
  if (outsideRoom(z)) hits.push('parete');
  return hits;
}

function computeChecks() {
  issues = [];
  checkGroup.clear();
  const solids = state.objects.filter(solid);
  const colliding = new Set();
  // collisioni
  if (state.checks.collisions) {
    for (let i = 0; i < solids.length; i++) {
      const a = solids[i], ba = obb(a), [a0, a1] = vRange(a);
      if (outsideRoom(ba)) { colliding.add(a.id); issues.push({ sev: 'err', msg: `${a.name}: esce dalla stanza / entra nel muro`, id: a.id }); }
      for (let j = i + 1; j < solids.length; j++) {
        const b = solids[j], [b0, b1] = vRange(b);
        if (!vOverlap(a0, a1, b0, b1)) continue;
        if (satOverlap(ba, obb(b))) { colliding.add(a.id); colliding.add(b.id); issues.push({ sev: 'err', msg: `Collisione: ${a.name} ↔ ${b.name}`, id: a.id }); }
      }
    }
  }
  // portiere e bagagliaio
  if (state.checks.doors) {
    for (const c of state.objects.filter((o) => o.type === 'car' && inGarage(o))) {
      for (const z of carZones(c)) {
        const hits = zoneBlockers(z, c.id);
        const ok = hits.length === 0;
        const label = z.kind === 'baule' ? 'bagagliaio' : z.side === 1 ? 'portiera lato guida' : 'portiera lato passeggero';
        if (!ok) issues.push({ sev: z.kind === 'porta' && z.side === 1 ? 'err' : 'warn', msg: `${c.name}: ${label} < ${z.kind === 'baule' ? '80' : '70'} cm (${[...new Set(hits)].join(', ')})`, id: c.id });
        addZoneMesh(z, ok ? 0x27ae60 : (z.kind === 'baule' ? 0xe67e22 : 0xe74c3c), z.kind === 'baule' ? 0.12 : 0.22);
      }
    }
  }
  // corridoi
  for (const o of state.objects.filter((x) => x.kind === 'corridoio')) {
    const z = { ...obb(o), v: [0, 1.9] };
    const hits = state.checks.corridors ? zoneBlockers(z, o.id) : [];
    const m = meshes.get(o.id);
    const blocked = hits.length > 0;
    if (m) m.userData.mats.forEach((mt) => mt.color.set(blocked ? 0xe74c3c : o.color));
    if (blocked) issues.push({ sev: 'warn', msg: `${o.name}: passaggio ${fmt(o.P * 100, 0)} cm ostruito da ${[...new Set(hits)].join(', ')}`, id: o.id });
  }
  // quadro elettrico
  if (state.checks.panel) {
    const pz = { cx: (PANEL.x[0] + PANEL.x[1]) / 2, cz: PANEL.access / 2 + 0.01, hx: (PANEL.x[1] - PANEL.x[0]) / 2 + 0.1, hz: PANEL.access / 2, ux: [1, 0], uz: [0, 1], v: [0, 2.0] };
    const hits = zoneBlockers(pz);
    addZoneMesh(pz, hits.length ? 0xe74c3c : 0x3498db, 0.28);
    if (hits.length) issues.push({ sev: 'err', msg: `Accesso quadro elettrico ostruito (${hits.join(', ')})` });
  }
  // portone: ingresso libero e volume a soffitto quando aperto
  const entry = { cx: (DOOR.openX[0] + DOOR.openX[1]) / 2, cz: 0.3, hx: (DOOR.openX[1] - DOOR.openX[0]) / 2, hz: 0.3, ux: [1, 0], uz: [0, 1], v: [0, 2.2] };
  for (const o of solids) if (o.type !== 'car' && satOverlap(entry, obb(o))) issues.push({ sev: 'warn', msg: `${o.name}: davanti al varco del portone`, id: o.id });
  const vol = { cx: (DOOR.leafX[0] + DOOR.leafX[1]) / 2, cz: DOOR.trackDepth / 2, hx: (DOOR.leafX[1] - DOOR.leafX[0]) / 2 + 0.05, hz: DOOR.trackDepth / 2, ux: [1, 0], uz: [0, 1] };
  for (const o of solids) {
    const [, t] = vRange(o);
    if (t > DOOR.clearUnderOpen - 0.02 && satOverlap(vol, obb(o)))
      issues.push({ sev: 'err', msg: `${o.name}: interferisce con il portone aperto (sopra ${fmt(DOOR.clearUnderOpen)} m)`, id: o.id });
  }
  // evidenziazione collisioni
  for (const [id, m] of meshes) {
    const ol = m.getObjectByName('outline');
    if (ol) {
      const sel = state.selected === id, col = colliding.has(id);
      ol.material.color.set(col ? 0xff0000 : sel ? 0xffb000 : 0x333333);
      ol.material.opacity = col || sel ? 1 : 0.25;
    }
  }
  if (state.scenario) computeReach(); else { reach = null; clearReachOverlay(); }
  applyTints();
  renderIssues();
}
function addZoneMesh(z, color, op) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(z.hx * 2, z.hz * 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(z.ux[1], z.ux[0]) * -1;
  m.position.set(z.cx, 0.006, z.cz); checkGroup.add(m);
}

// ---------------------------------------------------------------------
//  Modalità scenario: raggiungibilità (griglia 5 cm)
// ---------------------------------------------------------------------
const G = { cell: 0.05, x0: -0.1, z0: -1.0, nx: 0, nz: 0 };
G.nx = Math.ceil((13.5 - G.x0) / G.cell); G.nz = Math.ceil((6.1 - G.z0) / G.cell);
const walkBlock = (o) => solid(o) && (o.elev || 0) < 1.5; // ostacolo per chi cammina
function baseMask() {
  const n = G.nx * G.nz, mask = new Uint8Array(n), src = [], srcSez = [];
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
    const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell, k = j * G.nx + i;
    if (z < 0) {
      const inSez = x > DOOR.openX[0] && x < DOOR.openX[1], inCasa = x > HOUSE_DOOR.x[0] && x < HOUSE_DOOR.x[1];
      mask[k] = inSez || inCasa ? 0 : 1;
      if (j === 0 && inSez) { src.push(k); srcSez.push(k); }
      if (j === 0 && inCasa) src.push(k);
    } else mask[k] = pointInPoly(x, z) ? 0 : 1;
  }
  return { mask, src, srcSez };
}
function rasterOBB(b, cb, pad = 0) {
  const cs = corners(b); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of cs) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const i0 = Math.max(0, Math.floor((x0 - pad - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.floor((x1 + pad - G.x0) / G.cell));
  const j0 = Math.max(0, Math.floor((z0 - pad - G.z0) / G.cell)), j1 = Math.min(G.nz - 1, Math.floor((z1 + pad - G.z0) / G.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = G.x0 + (i + 0.5) * G.cell, z = G.z0 + (j + 0.5) * G.cell;
    if (inOBB(b, x, z, pad)) cb(j * G.nx + i);
  }
}
function distField(block) { // chamfer 3-4, ritorna metri
  const n = block.length, d = new Float32Array(n), INF = 1e9;
  for (let k = 0; k < n; k++) d[k] = block[k] ? 0 : INF;
  const W = G.nx, H = G.nz;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + 3);
    if (j > 0) { v = Math.min(v, d[k - W] + 3); if (i > 0) v = Math.min(v, d[k - W - 1] + 4); if (i < W - 1) v = Math.min(v, d[k - W + 1] + 4); }
    d[k] = v;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i; let v = d[k];
    if (i < W - 1) v = Math.min(v, d[k + 1] + 3);
    if (j < H - 1) { v = Math.min(v, d[k + W] + 3); if (i < W - 1) v = Math.min(v, d[k + W + 1] + 4); if (i > 0) v = Math.min(v, d[k + W - 1] + 4); }
    d[k] = v;
  }
  for (let k = 0; k < n; k++) d[k] = (d[k] / 3) * G.cell;
  return d;
}
function flood(dist, r, sources) {
  const n = dist.length, seen = new Uint8Array(n), q = new Int32Array(n); let h = 0, t = 0;
  for (const s of sources) if (dist[s] >= r && !seen[s]) { seen[s] = 1; q[t++] = s; }
  while (h < t) {
    const k = q[h++], i = k % G.nx, j = (k / G.nx) | 0;
    const nb = [i > 0 ? k - 1 : -1, i < G.nx - 1 ? k + 1 : -1, j > 0 ? k - G.nx : -1, j < G.nz - 1 ? k + G.nx : -1];
    for (const m of nb) if (m >= 0 && !seen[m] && dist[m] >= r) { seen[m] = 1; q[t++] = m; }
  }
  return seen;
}
function computeReach() {
  const { mask, src, srcSez } = baseMask();
  const owners = new Map(); // id -> celle
  const count = new Uint16Array(mask.length);
  for (const o of state.objects) {
    if (!walkBlock(o)) continue;
    const cells = []; rasterOBB(obb(o), (k) => { cells.push(k); count[k]++; });
    owners.set(o.id, cells);
  }
  const blockAll = new Uint8Array(mask.length);
  for (let k = 0; k < mask.length; k++) blockAll[k] = mask[k] || count[k] > 0 ? 1 : 0;
  const dAll = distField(blockAll);
  const RW = 0.25; // passaggio minimo a piedi: 50 cm
  const walk = flood(dAll, RW, src);
  const status = new Map();
  for (const o of state.objects) {
    if (!solid(o) || o.type === 'car') continue;
    // a piedi: esiste una cella percorribile entro 15 cm dal suo ingombro
    let onFoot = false;
    rasterOBB(obb(o), (k) => { if (walk[k]) onFoot = true; }, RW + 0.15);
    let extract = null;
    const movable = o.kind === 'moto' || o.kind === 'bici' || o.kind === 'gancio_v' || o.kind === 'gancio_o' || o.kind === 'rastrelliera';
    if (movable) {
      extract = false;
      if (o.kind === 'moto' || o.kind === 'bici') {
        // mezzo a terra: lo tolgo dagli ostacoli e cerco un percorso largo quanto il mezzo
        // dal suo ingombro fino al portone
        const cells = owners.get(o.id) || [];
        const blk = new Uint8Array(blockAll);
        for (const k of cells) if (count[k] === 1 && !mask[k]) blk[k] = 0;
        const r = o.kind === 'moto' ? Math.max(0.40, o.P / 2 + 0.05) : 0.38;
        const f = flood(distField(blk), r, srcSez);
        rasterOBB(obb(o), (k) => { if (f[k]) extract = true; });
      } else {
        // bici su gancio / rastrelliera: si sgancia dal davanti, serve un corridoio da 76 cm che arrivi lì
        const f = flood(dAll, 0.38, srcSez);
        rasterOBB(obb(o), (k) => { if (f[k]) extract = true; }, 0.38 + 0.15);
      }
    }
    status.set(o.id, { onFoot, extract });
  }
  reach = { walk, status };
  drawReachOverlay(walk);
}
let reachMesh = null;
function clearReachOverlay() { if (reachMesh) { scene.remove(reachMesh); reachMesh.material.map.dispose(); reachMesh = null; } }
function drawReachOverlay(walk) {
  clearReachOverlay();
  const c = document.createElement('canvas'); c.width = G.nx; c.height = G.nz;
  const ctx = c.getContext('2d'), img = ctx.createImageData(G.nx, G.nz);
  for (let k = 0; k < walk.length; k++) if (walk[k]) { img.data[4 * k] = 46; img.data[4 * k + 1] = 204; img.data[4 * k + 2] = 113; img.data[4 * k + 3] = 110; }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter;
  const W = G.nx * G.cell, H = G.nz * G.cell;
  reachMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  reachMesh.rotation.x = -Math.PI / 2; reachMesh.position.set(G.x0 + W / 2, 0.004, G.z0 + H / 2);
  scene.add(reachMesh);
}
function applyTints() {
  for (const o of state.objects) {
    const m = meshes.get(o.id); if (!m) continue;
    let em = 0x000000;
    if (state.scenario && reach && reach.status.has(o.id)) {
      const s = reach.status.get(o.id);
      em = s.extract === false ? (s.onFoot ? 0x7a4a00 : 0x7a0000) : s.onFoot ? 0x0a5a1a : 0x7a0000;
    }
    for (const mt of m.userData.mats) if (mt.emissive) mt.emissive.setHex(em);
  }
}

// ---------------------------------------------------------------------
//  Interfaccia: liste, proprietà, avvisi
// ---------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
function renderIssues() {
  const el = $('#issues');
  const daily = state.objects.filter((o) => o.daily && o.type !== 'car');
  const items = [...issues];
  if (state.scenario && reach) {
    for (const o of daily) { const s = reach.status.get(o.id); if (s && !s.onFoot) items.push({ sev: 'err', msg: `Uso quotidiano NON raggiungibile: ${o.name}`, id: o.id }); }
  }
  const nErr = items.filter((i) => i.sev === 'err').length, nWarn = items.length - nErr;
  const sev = nErr ? 'err' : items.length ? 'warn' : 'ok';
  $('#issuesCard').className = `card status ${sev}`;
  $('#issuesHead').innerHTML = `<span class="ico">${icon(sev === 'ok' ? 'check' : 'alert')}</span><div>` + (sev === 'ok'
    ? '<b>Nessun problema</b><small>Tutti i controlli dello spazio sono superati</small>'
    : `<b>${items.length} ${items.length === 1 ? 'avviso' : 'avvisi'}</b><small>${[nErr && `${nErr} ${nErr === 1 ? 'grave' : 'gravi'}`, nWarn && `${nWarn} da controllare`].filter(Boolean).join(' · ')}</small>`) + '</div>';
  el.innerHTML = items.map((i) => `<li class="${i.sev}" data-id="${i.id || ''}">${esc(i.msg)}</li>`).join('');
  el.querySelectorAll('li[data-id]').forEach((li) => li.addEventListener('click', () => li.dataset.id && select(li.dataset.id)));
  renderScenario();
  renderList();
}
function renderScenario() {
  const box = $('#scenarioCars');
  box.innerHTML = state.objects.filter((o) => o.type === 'car').map((c) =>
    `<label class="sw"><input type="checkbox" data-car="${c.id}" ${state.carsOut[c.id] ? 'checked' : ''}><i></i>${esc(c.name)} fuori</label>`).join('');
  box.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => {
    state.carsOut[i.dataset.car] = i.checked;
    const c = state.objects.find((o) => o.id === i.dataset.car); rebuildObject(c); computeChecks();
  }));
  const out = $('#scenarioResult');
  if (!state.scenario || !reach) { out.innerHTML = '<p class="hint">Attiva <b>Scenario</b> nella barra in basso per calcolare cosa è raggiungibile, anche con le auto fuori.</p>'; return; }
  const rows = state.objects.filter((o) => reach.status.has(o.id) && (o.kind === 'moto' || o.kind.startsWith('gancio') || o.kind === 'bici' || o.daily || o.kind === 'rastrelliera'));
  const yn = (v) => v === null ? '<span class="hint">—</span>' : v ? '<span class="yes">✓</span>' : '<span class="no">✕</span>';
  out.innerHTML = '<table><tr><th>Oggetto</th><th>A piedi</th><th>Estraibile</th></tr>' + rows.map((o) => {
    const s = reach.status.get(o.id);
    return `<tr data-id="${o.id}"><td>${esc(o.name)}${o.daily ? ' ★' : ''}</td><td>${yn(s.onFoot)}</td><td>${yn(s.extract)}</td></tr>`;
  }).join('') + '</table><p class="hint">★ uso quotidiano. Estraibile = c\'è un percorso largo quanto il mezzo (moto ≥ 80 cm, bici ≥ 76 cm) fino al portone, senza ruotare in spazi stretti.</p>';
  out.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => select(tr.dataset.id)));
}
function renderList() {
  const el = $('#objList');
  const q = ($('#objFilter').value || '').trim().toLowerCase();
  const list = state.objects.filter((o) => !q || o.name.toLowerCase().includes(q) || o.kind.includes(q));
  el.innerHTML = list.length ? list.map((o) => `<li data-id="${o.id}" class="${state.selected === o.id ? 'sel' : ''}"><span class="swatch" style="background:${esc(o.color)}"></span>${esc(o.name)}${o.fixed ? `<svg class="lock"><use href="#i-lock"/></svg>` : ''}</li>`).join('')
    : '<li class="hint">Nessun oggetto trovato</li>';
  el.querySelectorAll('li[data-id]').forEach((li) => li.addEventListener('click', () => select(li.dataset.id)));
}
const PROPS = [
  ['name', 'Nome', 'text'], ['color', 'Colore', 'color'], ['L', 'Lunghezza L (m)', 'num'], ['P', 'Profondità P (m)', 'num'], ['H', 'Altezza H (m)', 'num'],
  ['elev', 'Quota base (m)', 'num'], ['x', 'X (m)', 'num'], ['z', 'Z (m)', 'num'], ['rot', 'Rotazione (°)', 'num'], ['daily', 'Uso quotidiano', 'bool'], ['fixed', 'Ancorato (non trascinabile)', 'bool'], ['note', 'Note', 'text'],
];
const KIND_NAMES = { car: 'Auto', moto: 'Moto', bici: 'Bici', scaffale: 'Scaffale', armadio: 'Armadio', mensola: 'Mensola', gancio_v: 'Gancio bici', gancio_o: 'Supporto bici', rastrelliera: 'Rastrelliera', soppalco: 'Rack a soffitto', banco: 'Banco', pannello: 'Pannello', bidoni: 'Bidoni', box: 'Ingombro', zona: 'Zona', corridoio: 'Corridoio' };
function renderProps() {
  const el = $('#props');
  const o = state.objects.find((x) => x.id === state.selected);
  if (!o) { el.innerHTML = `<div class="empty-props">${icon('cube')}<span>Seleziona un oggetto nella vista<br>o nella scheda <b>Oggetti</b>.</span></div>`; return; }
  const num = (k, lab, step = 0.01, dec = 3) => `<label>${lab}<input type="number" step="${step}" data-k="${k}" value="${(+(o[k] ?? 0)).toFixed(dec)}"></label>`;
  const sw = (k, lab) => `<label class="sw"><input type="checkbox" data-k="${k}" ${o[k] ? 'checked' : ''}><i></i>${lab}</label>`;
  el.innerHTML = `
    <div class="prop-head"><span class="swatch" style="background:${esc(o.color)}"></span>
      <div><b>${esc(o.name)}</b><small>${KIND_NAMES[o.kind] || o.kind} · fonte ${esc(o.src || 'S')}${o.type === 'car' ? ` · specchietti ${fmt(o.mirrors)} m` : ''}</small></div>
      ${o.fixed ? `<span class="lockpill">${icon('lock')}Ancorato</span>` : ''}</div>
    <div class="pfull"><input type="text" data-k="name" value="${esc(o.name)}" aria-label="Nome"><input type="color" data-k="color" value="${esc(o.color)}" aria-label="Colore"></div>
    <div class="pgroup"><span>Dimensioni (m)</span><div class="pgrid g4">${num('L', 'Lungh.')}${num('P', 'Prof.')}${num('H', 'Altezza')}${num('elev', 'Da terra')}</div></div>
    <div class="pgroup"><span>Posizione</span><div class="pgrid">${num('x', 'X (m)')}${num('z', 'Z (m)')}${num('rot', 'Rotaz. °', 1, 1)}</div></div>
    <div class="pgroup">${sw('daily', 'Uso quotidiano')}${sw('fixed', 'Ancorato (non trascinabile)')}</div>
    <div class="pgroup"><span>Note</span><div class="pfull"><input type="text" data-k="note" value="${esc(o.note)}" placeholder="Aggiungi una nota…"></div></div>
    <div class="pactions"><button id="pDup" class="btn">${icon('copy')}Duplica</button><button id="pWall" class="btn">${icon('wall')}A parete</button><button id="pDel" class="btn danger">${icon('trash')}Elimina</button></div>`;
  el.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
    pushHistory();
    const k = inp.dataset.k, t = PROPS.find((p) => p[0] === k)[2];
    o[k] = t === 'bool' ? inp.checked : t === 'num' ? parseFloat(inp.value) || 0 : inp.value;
    rebuildObject(o); computeChecks(); renderList();
    if (k === 'name' || k === 'color' || k === 'fixed') renderProps();
  }));
  $('#pDup').onclick = () => duplicate(o);
  $('#pDel').onclick = () => removeObj(o);
  $('#pWall').onclick = () => { pushHistory(); snapToWall(o, true, 10); syncTransform(o); renderProps(); computeChecks(); };
}
function select(id) {
  state.selected = id;
  renderProps(); renderList(); computeChecks();
}

// ---------------------------------------------------------------------
//  Snap (griglia e pareti), aggiunta, duplicazione, rimozione, storico
// ---------------------------------------------------------------------
function snapToWall(o, align = false, dist = 0.12) {
  const b = obb(o);
  let best = null;
  for (const w of WALLS) {
    const cs = corners(b);
    const ds = cs.map(([x, z]) => (x - w.p[0]) * w.n[0] + (z - w.p[1]) * w.n[1]);
    const dmin = Math.min(...ds);
    // l'oggetto deve stare "davanti" al segmento di parete
    const t = ((o.x - w.p[0]) * w.d[0] + (o.z - w.p[1]) * w.d[1]);
    if (t < -0.3 || t > w.len + 0.3) continue;
    if (Math.abs(dmin) < dist && (!best || Math.abs(dmin) < Math.abs(best.dmin))) best = { w, dmin };
  }
  if (!best) return false;
  if (align) {
    o.rot = Math.atan2(-best.w.n[0], best.w.n[1]) / DEG;
    const b2 = obb(o);
    const ds = corners(b2).map(([x, z]) => (x - best.w.p[0]) * best.w.n[0] + (z - best.w.p[1]) * best.w.n[1]);
    best.dmin = Math.min(...ds);
  }
  o.x -= best.w.n[0] * best.dmin; o.z -= best.w.n[1] * best.dmin;
  return true;
}
function snapGrid(v) { return state.grid > 0 ? Math.round(v / state.grid) * state.grid : v; }
function addFromLibrary(item) {
  pushHistory();
  const t = state.view === 'top' ? { x: top.cx, z: top.cz } : { x: controls.target.x, z: controls.target.z };
  const o = { id: 'n' + Date.now().toString(36), name: item.name, kind: item.kind, type: item.kind === 'moto' ? 'moto' : undefined,
    x: Math.min(13, Math.max(0.5, t.x)), z: Math.min(5.5, Math.max(0.5, t.z)), rot: 0, L: item.L, P: item.P, H: item.H,
    elev: item.elev || 0, color: item.color, daily: false, fixed: false, src: 'nuovo', note: `Prezzo indicativo: ${item.price}` };
  if (item.wall) snapToWall(o, true, 10);
  state.objects.push(o); rebuildObject(o); select(o.id);
}
function duplicate(o) {
  pushHistory();
  const c = { ...JSON.parse(JSON.stringify(o)), id: 'n' + Date.now().toString(36), name: o.name + ' (copia)', fixed: false, x: o.x + 0.3, z: o.z + 0.3 };
  if (c.type === 'car') c.type = undefined, c.kind = 'box';
  state.objects.push(c); rebuildObject(c); select(c.id);
}
function removeObj(o) {
  pushHistory();
  state.objects = state.objects.filter((x) => x !== o);
  const m = meshes.get(o.id); if (m) { objGroup.remove(m); disposeTree(m); meshes.delete(o.id); }
  state.selected = null; renderProps(); computeChecks();
}
function pushHistory() { history.push(JSON.stringify(state.objects)); if (history.length > 60) history.shift(); }
function undo() {
  if (!history.length) return;
  state.objects = JSON.parse(history.pop()); rebuildAll(); renderProps(); computeChecks();
}

// ---------------------------------------------------------------------
//  Puntatore: selezione, trascinamento, misura
// ---------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null, downPos = null;
function cam() { return state.view === 'top' ? ortho : persp; }
function setRay(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cam());
}
function pickObject() {
  const hits = ray.intersectObjects(objGroup.children, true).filter((h) => h.object.visible && h.object.type !== 'LineSegments');
  // in pianta preferisci l'oggetto più alto ma escludi le zone se c'è altro
  for (const h of hits) { const o = state.objects.find((x) => x.id === h.object.userData.id); if (o && !NON_SOLID.has(o.kind)) return o; }
  return hits.length ? state.objects.find((x) => x.id === hits[0].object.userData.id) : null;
}
function floorHit() { const p = new THREE.Vector3(); return ray.ray.intersectPlane(floorPlane, p) ? p : null; }

renderer.domElement.addEventListener('pointerdown', (ev) => {
  setRay(ev); downPos = [ev.clientX, ev.clientY];
  if (ev.button !== 0) { if (state.view === 'top') startPan(ev); return; }
  if (state.mode === 'measure') {
    const targets = [roomGroup, objGroup, doorGroup, ghostRoot].filter((g) => g.visible);
    // le parti della scansione tagliate (sopra la quota di taglio) non si possono misurare
    const h = ray.intersectObjects(targets, true).find((x) => x.object.type === 'Mesh' && x.object.visible && !(x.object.userData.ghost && x.point.y > state.scanCut));
    if (h) addMeasurePoint(h.point.clone());
    return;
  }
  if (state.scanOnly) return; // in "solo scansione" il clic sinistro ruota soltanto la vista
  const o = pickObject();
  if (o) {
    if (state.selected !== o.id) select(o.id);
    if (!o.fixed) {
      const hp = floorHit(); // trascinamento sul piano del pavimento
      if (hp) { drag = { o, off: [o.x - hp.x, o.z - hp.z], moved: false }; controls.enabled = false; pushHistory(); }
    }
  } else if (state.view === 'top') startPan(ev);
});
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (pan) { doPan(ev); return; }
  if (!drag) return;
  setRay(ev); const hp = floorHit(); if (!hp) return;
  const o = drag.o;
  o.x = snapGrid(hp.x + drag.off[0]); o.z = snapGrid(hp.z + drag.off[1]);
  if (state.wallSnap && !ev.altKey) snapToWall(o, false, 0.12);
  drag.moved = true; syncTransform(o); scheduleChecks(); updatePropsXY(o);
});
window.addEventListener('pointerup', (ev) => {
  if (pan) { pan = null; return; }
  if (drag) { if (!drag.moved) history.pop(); drag = null; controls.enabled = state.view === '3d'; computeChecks(); renderProps(); return; }
  if (downPos && Math.hypot(ev.clientX - downPos[0], ev.clientY - downPos[1]) < 4 && ev.target === renderer.domElement && state.mode === 'select') {
    setRay(ev); if (!pickObject()) { state.selected = null; renderProps(); computeChecks(); }
  }
  downPos = null;
});
function updatePropsXY(o) {
  const ix = $('#props input[data-k="x"]'), iz = $('#props input[data-k="z"]');
  if (ix) ix.value = o.x.toFixed(3); if (iz) iz.value = o.z.toFixed(3);
}
let checkPending = false;
function scheduleChecks() { if (checkPending) return; checkPending = true; requestAnimationFrame(() => { checkPending = false; computeChecks(); }); }

window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.target.tagName === 'TEXTAREA') return;
  const o = state.objects.find((x) => x.id === state.selected);
  if (ev.ctrlKey && ev.key.toLowerCase() === 'z') { undo(); ev.preventDefault(); return; }
  if (ev.key === 'Escape') { state.pendingMeasure = null; setMode('select'); state.selected = null; renderProps(); computeChecks(); return; }
  if (!o) return;
  const rotate = (d) => { if (o.fixed) return; pushHistory(); o.rot = ((o.rot + d) % 360 + 360) % 360; if (o.rot > 180) o.rot -= 360; syncTransform(o); computeChecks(); renderProps(); };
  if (ev.key === 'r' || ev.key === 'R') rotate(90);
  if (ev.key === 'q' || ev.key === 'Q') rotate(ev.shiftKey ? -1 : -15);
  if (ev.key === 'e' || ev.key === 'E') rotate(ev.shiftKey ? 1 : 15);
  if (ev.key === 'Delete') removeObj(o);
  if (ev.ctrlKey && ev.key.toLowerCase() === 'd') { duplicate(o); ev.preventDefault(); }
  if (ev.key.startsWith('Arrow') && !o.fixed) {
    pushHistory(); const s = ev.shiftKey ? 0.1 : 0.01;
    if (ev.key === 'ArrowLeft') o.x -= s; if (ev.key === 'ArrowRight') o.x += s; if (ev.key === 'ArrowUp') o.z -= s; if (ev.key === 'ArrowDown') o.z += s;
    syncTransform(o); computeChecks(); updatePropsXY(o); ev.preventDefault();
  }
});

// pan / zoom vista dall'alto
let pan = null;
function startPan(ev) { if (state.view === 'top') pan = { x: ev.clientX, y: ev.clientY, cx: top.cx, cz: top.cz }; }
function doPan(ev) {
  const h = renderer.domElement.clientHeight, k = (2 * top.half) / h;
  top.cx = pan.cx - (ev.clientX - pan.x) * k; top.cz = pan.cz - (ev.clientY - pan.y) * k; updateOrtho();
}
renderer.domElement.addEventListener('wheel', (ev) => {
  if (state.view !== 'top') return;
  ev.preventDefault();
  const r = renderer.domElement.getBoundingClientRect(), asp = r.width / r.height;
  const mx = ((ev.clientX - r.left) / r.width) * 2 - 1, my = ((ev.clientY - r.top) / r.height) * 2 - 1;
  const wx = top.cx + mx * top.half * asp, wz = top.cz + my * top.half;
  const f = ev.deltaY > 0 ? 1.12 : 1 / 1.12; top.half = Math.min(12, Math.max(0.6, top.half * f));
  top.cx = wx - mx * top.half * asp; top.cz = wz - my * top.half; updateOrtho();
}, { passive: false });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
function updateOrtho() {
  const r = renderer.domElement.getBoundingClientRect(), asp = r.width / Math.max(1, r.height);
  ortho.left = -top.half * asp; ortho.right = top.half * asp; ortho.top = top.half; ortho.bottom = -top.half;
  ortho.position.set(top.cx, 30, top.cz); ortho.lookAt(top.cx, 0, top.cz); ortho.updateProjectionMatrix();
}

// ---------------------------------------------------------------------
//  Misura tra due punti
// ---------------------------------------------------------------------
function addMeasurePoint(p) {
  if (!state.pendingMeasure) {
    state.pendingMeasure = p;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: 0xd35400 })); dot.position.copy(p); dot.name = 'pending'; measureGroup.add(dot);
    return;
  }
  const a = state.pendingMeasure; state.pendingMeasure = null;
  const pend = measureGroup.getObjectByName('pending'); if (pend) measureGroup.remove(pend);
  state.measures.push({ a: a.toArray(), b: p.toArray() });
  drawMeasures();
}
function drawMeasures() {
  measureGroup.clear();
  state.measures.forEach((m, i) => {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd35400, depthTest: false })); l.renderOrder = 10; measureGroup.add(l);
    for (const p of [a, b]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.025), new THREE.MeshBasicMaterial({ color: 0xd35400, depthTest: false })); d.position.copy(p); d.renderOrder = 10; measureGroup.add(d); }
  });
  $('#measList').innerHTML = state.measures.map((m, i) => {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    return `<li>#${i + 1}: <b>${fmt(a.distanceTo(b))} m</b> <span class="muted">(ΔX ${fmt(Math.abs(b.x - a.x))} · ΔZ ${fmt(Math.abs(b.z - a.z))} · ΔY ${fmt(Math.abs(b.y - a.y))})</span></li>`;
  }).join('');
}

// ---------------------------------------------------------------------
//  Etichette HTML
// ---------------------------------------------------------------------
const labelLayer = $('#labels');
const tmpV = new THREE.Vector3();
function updateLabels() {
  let html = '';
  const c = cam(), w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const put = (x, y, z, text, cls) => {
    tmpV.set(x, y, z).project(c);
    if (tmpV.z > 1 || tmpV.z < -1) return;
    const sx = (tmpV.x * 0.5 + 0.5) * w, sy = (-tmpV.y * 0.5 + 0.5) * h;
    if (sx < -50 || sy < -20 || sx > w + 50 || sy > h + 20) return;
    html += `<div class="lbl ${cls || ''}" style="left:${sx}px;top:${sy}px">${text}</div>`;
  };
  if (state.showLabels && !state.scanOnly) {
    for (const o of state.objects) {
      if (o.kind === 'corridoio') continue;
      const y = state.view === 'top' ? 0 : (o.elev || 0) + o.H + 0.1;
      put(o.x, y, o.z, o.name, (o.kind === 'zona' ? 'zone' : '') + (o.id === state.selected ? ' sel' : ''));
    }
    put(2.43, state.view === 'top' ? 0 : 2.2, -0.35, state.doorOpen ? `Portone APERTO · luce libera ≈ ${fmt(DOOR.clearUnderOpen)} m` : 'Portone sezionale (chiuso)', 'door');
    put(4.85, state.view === 'top' ? 0 : 1.95, -0.3, 'Quadro el.', 'door');
    put(11.82, state.view === 'top' ? 0 : 2.15, -0.3, 'Porta casa', 'door');
    if (state.view === 'top') {
      put(6.8, 0, -0.75, 'Parete nord 13,02 m [P]', 'dim'); put(6.7, 0, 6.35, 'Parete sud 13,33 m [P]', 'dim');
      put(13.85, 0, 3.0, '6,00 m', 'dim'); put(-0.25, 0, 3.0, '6,01 m', 'dim');
    }
  }
  state.measures.forEach((m, i) => {
    const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
    put((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, `${fmt(a.distanceTo(b))} m`, 'meas');
  });
  labelLayer.innerHTML = html;
}

// ---------------------------------------------------------------------
//  GLB fantasma
// ---------------------------------------------------------------------
const loader = new GLTFLoader();
function setGhost(gltfScene) {
  ghostRoot.clear();
  const inner = new THREE.Group(); inner.rotation.y = GHOST_TF.rotYdeg * DEG; inner.add(gltfScene);
  const outer = new THREE.Group(); outer.scale.set(...GHOST_TF.scale); outer.position.set(...GHOST_TF.pos); outer.add(inner);
  gltfScene.traverse((c) => {
    if (c.isMesh) {
      c.material = c.material.clone();
      c.material.side = THREE.DoubleSide; c.material.clippingPlanes = [cutPlane];
      c.userData.ghost = true;
      c.renderOrder = 1;
    }
  });
  ghostRoot.add(outer);
  ghostLoaded = true;
  applyGhostLook();
  ghostRoot.visible = state.scanOnly || $('#ghostOn').checked;
  $('#scanEmpty').hidden = true;
  $('#ghostInfo').textContent = 'Scansione caricata ✓ · accendila con “Scansione” nella barra in basso.';
  setStatus(state.scanOnly ? 'Scansione caricata ✓' : 'Scansione caricata ✓ · accendila con “Scansione” o apri “Solo scansione”');
}
// trasparente sopra il progetto, piena (opaca) in modalità "solo scansione"
function applyGhostLook() {
  ghostRoot.traverse((c) => {
    if (!c.isMesh) return;
    const m = c.material, solidLook = state.scanOnly;
    m.transparent = !solidLook; m.opacity = solidLook ? 1 : state.ghostOpacity; m.depthWrite = solidLook; m.needsUpdate = true;
  });
}
function setGhostOpacity(v) { state.ghostOpacity = v; applyGhostLook(); }
function setScanCut(v) {
  state.scanCut = v; cutPlane.constant = v;
  $('#scanCut').value = v; $('#scanCutVal').textContent = `${fmt(v)} m`;
}
function loadGhostFromBuffer(buf) {
  setStatus('Lettura GLB…');
  loader.parse(buf, '', (g) => setGhost(g.scene), (e) => setStatus('Errore GLB: ' + e.message));
}
function tryAutoLoadGhost() {
  if (!location.protocol.startsWith('http')) { $('#ghostInfo').textContent = 'App aperta da file: carica garage.glb con il pulsante qui sopra (oppure avvia avvia.bat).'; return; }
  $('#ghostInfo').textContent = 'Caricamento della scansione…';
  const tryUrl = (urls) => {
    if (!urls.length) { $('#ghostInfo').textContent = 'garage.glb non trovato sul server: caricalo con il pulsante qui sopra.'; return; }
    loader.load(urls[0], (g) => setGhost(g.scene), undefined, () => tryUrl(urls.slice(1)));
  };
  tryUrl(['../garage.glb', './garage.glb']);
}
let toastTimer = 0;
function setStatus(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------------------------------------------------------------------
//  Salva / carica / screenshot / preset
// ---------------------------------------------------------------------
function download(name, blobOrUrl) {
  const a = document.createElement('a');
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function saveJSON() {
  const data = { app: 'garage3d', version: 1, carConfig: state.carConfig, saved: new Date().toISOString(), doorOpen: state.doorOpen, carsOut: state.carsOut, measures: state.measures, objects: state.objects };
  download('layout-garage.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}
function loadJSON(text) {
  try {
    const d = JSON.parse(text);
    if (!Array.isArray(d.objects)) throw new Error('campo "objects" mancante');
    pushHistory();
    state.objects = d.objects; state.measures = d.measures || []; state.carConfig = d.carConfig || 'abituale'; syncCarSeg(); state.carsOut = d.carsOut || {}; state.doorOpen = !!d.doorOpen;
    state.preset = null; renderPresets();
    $('#doorOpen').checked = state.doorOpen; buildDoor(); rebuildAll(); drawMeasures(); state.selected = null; renderProps(); computeChecks();
    setStatus('Layout caricato ✓');
  } catch (e) { alert('File non valido: ' + e.message); }
}
function screenshot() {
  renderer.render(scene, cam());
  const base = renderer.domElement;
  const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
  const ctx = c.getContext('2d'); ctx.drawImage(base, 0, 0);
  // etichette nello screenshot
  const dpr = base.width / base.clientWidth;
  ctx.font = `${12 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'center';
  labelLayer.querySelectorAll('.lbl').forEach((l) => {
    const x = parseFloat(l.style.left) * dpr, y = parseFloat(l.style.top) * dpr, t = l.textContent, w = ctx.measureText(t).width + 8 * dpr;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - w / 2, y - 9 * dpr, w, 16 * dpr);
    ctx.fillStyle = '#222'; ctx.fillText(t, x, y + 3 * dpr);
  });
  download(`garage-${state.view}-${Date.now()}.png`, c.toDataURL('image/png'));
}
const CAR_INFO = {
  abituale: ['Auto: disposizione abituale', 'Q2 davanti al portone, Mini e BMW affiancate come al solito.'],
  ottimale: ['Auto: disposizione ottimale', 'Q2 più vicina alle moto, Mini e BMW più distanziate (~86 cm tra le portiere).'],
  video: ['Auto: disposizione del video', 'Come nel video: Mini davanti al portone, Q2 nel posto lato nord.'],
};
function syncCarSeg() {
  document.querySelectorAll('#carSeg button').forEach((b) => b.classList.toggle('on', b.dataset.cfg === state.carConfig));
  $('#carDesc').textContent = (CAR_INFO[state.carConfig] || ['', ''])[1];
}
function setCarConfig(cfg) {
  pushHistory();
  state.carConfig = cfg; syncCarSeg();
  const sl = CAR_SLOTS[cfg];
  for (const o of state.objects) if (o.type === 'car' && sl[o.name]) { Object.assign(o, sl[o.name]); rebuildObject(o); }
  computeChecks(); renderProps();
  setStatus(CAR_INFO[cfg][0]);
}
const PRESET_INFO = {
  'Stato attuale (rilievo)': ['•', 'Stato attuale', 'Com\'è oggi il box, ricostruito dalla scansione.'],
  'Proposta vuota – Da zero': ['0', 'Da zero', 'Solo le tre auto: aggiungi tu tutto il resto dalla scheda Aggiungi.'],
  'Proposta A – Riordino economico': ['A', 'Riordino economico', 'Spesa minima: scaffali nuovi, bici appese al muro, rack a soffitto.'],
  'Proposta B – Officina vicino al portone': ['B', 'Officina vicino al portone', 'Banco da lavoro sul lato sud, bici e scaffali sul lato est.'],
  'Proposta C – Parete attrezzata + armadi chiusi': ['C', 'Parete attrezzata + armadi', 'Armadi chiusi sul lato sud, banco e attrezzi sulla parete est.'],
};
function renderPresets() {
  const el = $('#presetList');
  el.innerHTML = Object.keys(PRESETS).map((k) => {
    const [b, t, d] = PRESET_INFO[k] || ['•', k, ''];
    return `<button class="preset${state.preset === k ? ' on' : ''}" data-k="${esc(k)}"><span class="badge">${b}</span><b>${esc(t)}</b><span>${esc(d)}</span></button>`;
  }).join('');
  el.querySelectorAll('.preset').forEach((p) => p.onclick = () => loadPreset(p.dataset.k));
}
function loadPreset(name) {
  pushHistory();
  state.objects = PRESETS[name](state.carConfig); state.carsOut = {}; state.selected = null; state.preset = name;
  rebuildAll(); renderProps(); computeChecks(); renderPresets();
  setStatus(`Caricato: ${(PRESET_INFO[name] || [, name])[1]} · Ctrl+Z per tornare indietro`);
}

// ---------------------------------------------------------------------
//  Vista, modalità, wiring UI
// ---------------------------------------------------------------------
// v = '3d' | 'top' | 'scan'
function setView(v) {
  const wasScan = state.scanOnly;
  state.scanOnly = v === 'scan';
  state.view = v === 'top' ? 'top' : '3d';
  $('#v3d').classList.toggle('on', v === '3d'); $('#vTop').classList.toggle('on', v === 'top'); $('#vScan').classList.toggle('on', v === 'scan');
  document.body.classList.toggle('scan-mode', state.scanOnly);
  controls.enabled = state.view === '3d';
  roomGroup.visible = !state.scanOnly && $('#roomOn').checked;
  objGroup.visible = checkGroup.visible = doorGroup.visible = !state.scanOnly;
  ghostRoot.visible = state.scanOnly || $('#ghostOn').checked;
  roomGroup.getObjectByName('ceiling').visible = state.view === '3d';
  scene.background.copy(state.scanOnly ? BG_SCAN : BG_PROJECT);
  applyGhostLook();
  $('#scanEmpty').hidden = !(state.scanOnly && !ghostLoaded);
  if (state.scanOnly) { state.selected = null; renderProps(); }
  if (wasScan !== state.scanOnly) resize();
  if (state.view === 'top') fitTop();
  buildDoor(); updateOrtho();
  if (state.scanOnly && !wasScan) setStatus('Solo scansione: la scansione 3D reale, senza ricostruzione');
}
function resetView() {
  if (state.view === 'top') { fitTop(); updateOrtho(); return; }
  persp.position.set(4.5, 9.5, 14.5); controls.target.set(6.6, 0.5, 3.0); controls.update();
}
function fitTop() {
  const r = renderer.domElement.getBoundingClientRect(), asp = r.width / Math.max(1, r.height);
  top.cx = 6.66; top.cz = 3.0; top.half = Math.max(3.9, 7.6 / asp);
}
function setMode(m) {
  state.mode = m; $('#mMeasure').classList.toggle('on', m === 'measure');
  renderer.domElement.style.cursor = m === 'measure' ? 'crosshair' : 'default';
  if (m !== 'measure') { state.pendingMeasure = null; const p = measureGroup.getObjectByName('pending'); if (p) measureGroup.remove(p); }
}
function wireUI() {
  $('#v3d').onclick = () => setView('3d');
  $('#vTop').onclick = () => setView('top');
  $('#mMeasure').onclick = () => setMode(state.mode === 'measure' ? 'select' : 'measure');
  $('#measClear').onclick = () => { state.measures = []; drawMeasures(); };
  $('#grid').onchange = (e) => { state.grid = parseFloat(e.target.value); };
  $('#wallSnap').onchange = (e) => { state.wallSnap = e.target.checked; };
  $('#doorOpen').onchange = (e) => { state.doorOpen = e.target.checked; buildDoor(); computeChecks(); };
  $('#doorVol').onchange = (e) => { state.showDoorVolume = e.target.checked; buildDoor(); };
  $('#labelsOn').onchange = (e) => { state.showLabels = e.target.checked; };
  for (const k of ['doors', 'corridors', 'panel', 'collisions']) $('#chk_' + k).onchange = (e) => { state.checks[k] = e.target.checked; computeChecks(); };
  $('#scenarioOn').onchange = (e) => { state.scenario = e.target.checked; computeChecks(); setStatus(e.target.checked ? 'Scenario attivo: verde = raggiungibile, rosso = irraggiungibile' : 'Scenario disattivato'); };
  $('#ghostOn').onchange = (e) => {
    ghostRoot.visible = e.target.checked || state.scanOnly;
    if (e.target.checked && !ghostLoaded) setStatus('Scansione non ancora caricata: caricala dalla scheda Vista');
  };
  $('#ghostOp').oninput = (e) => setGhostOpacity(parseFloat(e.target.value));
  $('#roomOn').onchange = (e) => { roomGroup.visible = e.target.checked && !state.scanOnly; };
  document.querySelectorAll('.glbFile').forEach((inp) => inp.onchange = (e) => { const f = e.target.files[0]; if (f) f.arrayBuffer().then(loadGhostFromBuffer); e.target.value = ''; });
  $('#vScan').onclick = () => setView('scan');
  $('#scanBack').onclick = () => setView('3d');
  $('#scanCut').oninput = (e) => setScanCut(parseFloat(e.target.value));
  document.querySelectorAll('.resetView').forEach((b) => b.onclick = resetView);
  $('#save').onclick = () => { saveJSON(); setStatus('Layout salvato in layout-garage.json'); };
  $('#jsonFile').onchange = (e) => { const f = e.target.files[0]; if (f) f.text().then(loadJSON); e.target.value = ''; };
  $('#shot').onclick = () => { screenshot(); setStatus('Screenshot scaricato'); };
  document.querySelectorAll('#carSeg button').forEach((b) => b.onclick = () => { if (b.dataset.cfg !== state.carConfig) setCarConfig(b.dataset.cfg); });
  $('#undo').onclick = undo;
  renderPresets();
  $('#lib').innerHTML = LIBRARY.map((it, i) => `<button data-i="${i}" title="Aggiungi ${esc(it.name)}"><span class="swatch" style="background:${it.color}"></span><span><b>${esc(it.name)}</b><small>${fmt(it.L)} × ${fmt(it.P)} × ${fmt(it.H)} m</small></span>${it.price !== '—' ? `<em>${it.price}</em>` : '<span></span>'}</button>`).join('');
  $('#lib').querySelectorAll('button').forEach((b) => b.onclick = () => { addFromLibrary(LIBRARY[+b.dataset.i]); setStatus(`Aggiunto: ${LIBRARY[+b.dataset.i].name}`); });
  $('#objFilter').oninput = renderList;
  // schede del pannello sinistro
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
    document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('on', p.dataset.pane === t.dataset.tab));
  });
  document.querySelectorAll('.card.collapsible h3').forEach((h) => h.addEventListener('click', () => h.parentElement.classList.toggle('closed')));
  // aiuto comandi
  $('#helpBtn').onclick = (e) => { e.stopPropagation(); $('#help').hidden = !$('#help').hidden; };
  document.addEventListener('pointerdown', (e) => { if (!$('#help').hidden && !e.target.closest('#help, #helpBtn')) $('#help').hidden = true; });
  syncCarSeg();
  setScanCut(state.scanCut);
}

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h); persp.aspect = w / h; persp.updateProjectionMatrix(); updateOrtho();
}
window.addEventListener('resize', resize);

function loop() {
  requestAnimationFrame(loop);
  if (state.view === '3d') controls.update();
  if (reachMesh) reachMesh.visible = !state.scanOnly;
  renderer.render(scene, cam());
  updateLabels();
}

// ---------------------------------------------------------------------
//  Schermata con codice a 4 cifre. Protezione solo di facciata (il sito è
//  statico): serve a non mostrare il box a chi apre il link per caso.
// ---------------------------------------------------------------------
const PIN_HASH = '5d8b88ed';
function pinHash(pin) { let h = 0x811c9dc5; for (const c of 'garage3d:' + pin) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
function lockScreen(onUnlock) {
  const lock = $('#lock'), boxes = [...document.querySelectorAll('#pinBoxes input')], pinEl = $('#pinBoxes'), err = $('#lockErr');
  const open = () => { document.body.classList.remove('locked'); lock.classList.add('open'); setTimeout(() => lock.remove(), 400); onUnlock(); };
  let ok = false; try { ok = sessionStorage.getItem('garage3d-unlock') === PIN_HASH; } catch (e) { /* storage non disponibile */ }
  if (ok) { lock.remove(); document.body.classList.remove('locked'); onUnlock(); return; }
  const check = () => {
    const pin = boxes.map((b) => b.value).join('');
    if (pin.length < 4) return;
    if (pinHash(pin) === PIN_HASH) {
      pinEl.classList.add('good'); err.innerHTML = '&nbsp;';
      try { sessionStorage.setItem('garage3d-unlock', PIN_HASH); } catch (e) { /* ignora */ }
      setTimeout(open, 250);
    } else {
      pinEl.classList.remove('bad'); void pinEl.offsetWidth; pinEl.classList.add('bad');
      err.textContent = 'Codice errato, riprova';
      setTimeout(() => { boxes.forEach((b) => b.value = ''); boxes[0].focus(); }, 350);
    }
  };
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      b.value = b.value.replace(/D/g, '').slice(-1);
      pinEl.classList.remove('bad');
      if (b.value && i < 3) boxes[i + 1].focus();
      check();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].value = ''; boxes[i - 1].focus(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < 3) boxes[i + 1].focus();
      e.stopPropagation();
    });
    b.addEventListener('paste', (e) => {
      const t = (e.clipboardData.getData('text') || '').replace(/D/g, '').slice(0, 4);
      if (!t) return; e.preventDefault(); t.split('').forEach((c, k) => { boxes[k].value = c; }); boxes[Math.min(t.length, 3)].focus(); check();
    });
  });
  $('#lockForm').addEventListener('submit', (e) => { e.preventDefault(); check(); });
  boxes[0].focus();
}

// avvio
buildRoom();
buildDoor();
state.objects = currentLayout(state.carConfig);
rebuildAll();
wireUI();
resize();
setView('3d');
renderProps();
computeChecks();
drawMeasures();
lockScreen(tryAutoLoadGhost); // la scansione si scarica solo dopo il codice
loop();
window.garage = { state, computeChecks, loadPreset, objGroup, roomGroup, ghostRoot, setGhostOpacity, select, setView, persp, controls, setCarConfig, setScanCut };
