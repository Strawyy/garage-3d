# Garage 3D – riordino del box

## Online
https://strawyy.github.io/garage-3d/ (GitHub Pages). All'apertura chiede un codice a 4 cifre: è solo una protezione di facciata, il sito è statico.

## Avvio
- **Consigliato:** doppio clic su `avvia.bat`. Avvia un server locale (Node, o Python se presente) e apre http://localhost:8000/app/ . La scansione `garage.glb` viene caricata automaticamente.
- **Manuale:** `node server.js` (oppure `python -m http.server 8000`) in questa cartella, poi apri http://localhost:8000/app/
- **Senza server:** apri `app/index.html` con un doppio clic e carica la scansione con “Carica GLB…”.

## Struttura
- `app/index.html`, `app/css/style.css`: interfaccia.
- `app/src/data.js`: rilievo (stanza, portone, quadro, auto, oggetti), libreria e proposte A/B/C. **Le misure si correggono qui.**
- `app/src/main.js`: logica (scena, trascinamento, collisioni, controlli, scenario, salvataggi).
- `app/lib/three/`: three.js r160 locale con GLTFLoader e OrbitControls.
- `app/dist/app.js`: bundle usato dalla pagina (funziona anche da file://).
- `analisi/rilievo_fase1.json`: misure e calibrazione della Fase 1.

## Ricompilare dopo aver modificato `src/`
```
npx esbuild app/src/main.js --bundle --format=iife --alias:three=./app/lib/three/three.module.js --outfile=app/dist/app.js
```

## Modalità
- **Progetto 3D / Pianta 2D:** il box ricostruito con auto, moto, mobili, proposte e controlli dello spazio.
- **Solo scansione:** solo la scansione 3D reale (garage.glb), senza ricostruzione. Il cursore “Taglio soffitto” toglie il soffitto per guardare dentro; la misura funziona anche sulla scansione.

## Comandi
- Mouse sinistro: seleziona e trascina (in 3D, sul vuoto ruota la vista).
- Mouse destro: sposta la vista. Rotella: zoom.
- R: ruota 90°. Q/E: ruota ±15° (con Shift ±1°).
- Frecce: sposta 1 cm (con Shift 10 cm). Alt durante il trascinamento: niente snap alle pareti.
- Ctrl+Z annulla, Ctrl+D duplica, Canc elimina, Esc deseleziona.
