# UNO Clone Multiplayer

Questo è un clone del gioco UNO realizzato con Node.js, Socket.io, Vue 3 e MySQL.

## Requisiti

- Node.js
- MySQL

## Setup Database

1. Assicurati di avere MySQL installato e in esecuzione sul tuo PC.
2. Controlla il file `server/.env` e assicurati che le credenziali siano corrette (di default usa `root` senza password).
3. Il database e le tabelle verranno creati automaticamente all'avvio del server.

## Installazione e Avvio

### Backend

```bash
cd server
npm install
node index.js
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Caratteristiche

- **Multiplayer in tempo reale**: Gioca con i tuoi amici utilizzando le stanze.
- **Nessun login richiesto**: Scegli un nickname e unisciti a una stanza.
- **Regole UNO complete**: Carte speciali (Salto, Inverti, Pesca 2, Cambio Colore, Pesca 4) implementate.
- **Gestione Stanze**: Più partite contemporanee in stanze diverse.
