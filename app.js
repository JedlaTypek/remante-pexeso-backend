// npm run dev - zapnutí serveru

const express = require("express");
const { createServer } = require("node:http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const cors = require("cors");
const app = express();
app.use(express.json());
const port = 3006;
const Lobby = require("./schemas/lobby.schema");
const { createGameDesk, picsum } = require("./utilities");
app.use(cors({ origin: ["http://138.2.144.241"] }));
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "http://138.2.144.241" },
});

main().catch((err) => console.log(err));

async function main() {
  await mongoose.connect(
    "mongodb://myUserAdmin:RemantE*it2_2023@localhost:27017/pexeso?authMechanism=DEFAULT",
    { authSource: "admin" }
  );
}

app.get("/", (req, res) => {
  res.send({ hello: "worlds" });
});

app.post("/gameStart", async (req, res) => {
  const lobby = await Lobby.findOne({ players: req.body.socketId });
    if (lobby == null) {
      return;
    }
    lobby.playerPoints=lobby.players.map((x) => 0);
    const players = [];
    for (let i=0;i<lobby.players.length;i++) {
      const playerId = lobby.players[i];
      players.push({
        id: playerId,
        name: socketNames[playerId],
        points: lobby.playerPoints[i]
      });
    }
    for (const playerId of lobby.players) {
      io.to(playerId).emit("hraZacala", {
        gameDesk: lobby.gameDesk.length,
        players,
        collumns: lobby.collumns,
        playerOnMove: players[0].id
      });
    }
    lobby.playerOnMove = players[0].id;
    await lobby.save();
    res.send();
})

app.post("/lobby", async (req, res) => {
  const foundLobby = await Lobby.findOne({players: req.body.socketId}).exec();
  if (foundLobby != null) {
    res.send();
    return;
  }
  const code = Math.floor(Math.random() * 9000 + 1000);
  console.log(code);
  const width = req.body.width;
  const heigh = req.body.height;
  const gameDesk = picsum(createGameDesk(width, heigh));
  const createdLobby = await Lobby.create({
    lobbyCode: code,
    maxPlayers: req.body.maxPlayers || 2,
    collumns: req.body.width,
    gameDesk: gameDesk /*může být jenom gamedesk*/,
    players: [req.body.socketId],
  });

  const playerNames = [socketNames[req.body.socketId]];
  res.send({ ...createdLobby.toObject(), playerNames });
});

app.post("/lobbyJoin", async (req, res) => {
  const lobbyCode = req.body.lobbyCode;
  const foundLobby = await Lobby.findOne({ lobbyCode }).exec();
  if (foundLobby == null) {
    res.status(404).send();
    return;
  }
  if (foundLobby.players.length >= foundLobby.maxPlayers) {
    res.status(403).send();
    return;
  }
  for (const playerId of foundLobby.players) {
    io.to(playerId).emit("idHrace", socketNames[req.body.socketId]);
  }
  foundLobby.players.push(req.body.socketId);
  await foundLobby.save();
  const playerNames = [];
  for (const playerId of foundLobby.players) {
    playerNames.push(socketNames[playerId]);
  }
  res.send({ ...foundLobby.toObject(), playerNames });
});

let socketNames = {};

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);
  socket.on("jmenoHrace", (jmeno) => {
    socketNames[socket.id] = jmeno;
  });
  socket.on("disconnect", async () => {
    const lobby = await Lobby.findOne({ players: socket.id });
    if (lobby == null) {
      return;
    }
    
    lobby.players = lobby.players.filter((socketId) => socket.id != socketId);
    console.log(lobby.players);
    await lobby.save();
    const playerNames = [];
    for (const playerId of lobby.players) {
      playerNames.push(socketNames[playerId]);
    }
    for (const playerId of lobby.players) {
      io.to(playerId).emit("updateHrace", playerNames);
    }
    console.log("user disconnected", socket.id);
  });

  socket.on("turn", async (card) =>{
    const foundLobby = await Lobby.findOne({players: socket.id}).exec();
    if (foundLobby == null || socket.id != foundLobby.playerOnMove || foundLobby.gameDesk[card].id <= 0 || foundLobby.gameDesk.filter((card) => card < 0).length > 2) return;
    foundLobby.gameDesk[card].id *= -1; // nastaví v databázi negativní id, což značí, že je karta otočená
    
    if(foundLobby.gameDesk.filter((card) => card.id < 0).length === 3){
      for(const index of foundLobby.gameDesk){
        if(foundLobby.gameDesk.indexOf(index) != card && index.id < 0){ // první podmínka vynechá aktuální kartu
          index.id *= -1; // nastaví v databázi karty z minulého kola na pozitivní id, což značí, že karty nejsou otočené
          for (const playerId of foundLobby.players) {
            io.to(playerId).emit("turnBack", foundLobby.gameDesk.indexOf(index)); // otočí karty zpět na frontendu
          }
        }
      }
    }
    const turnedCards = foundLobby.gameDesk.filter((card) => card.id < 0); // zjistí kolik je otočených karet
    for (const playerId of foundLobby.players) {
      io.to(playerId).emit("cardUrl", {id: card, url: foundLobby.gameDesk[card].url});
    }
    if(turnedCards.length === 2){
      if(turnedCards[0].id == turnedCards[1].id){
        foundLobby.playerPoints[foundLobby.players.indexOf(foundLobby.playerOnMove)]++; // přičítaní bodů
        const cardUrl = foundLobby.gameDesk[card].url;
        const cardsToHide = foundLobby.gameDesk.filter((element) => element.url === cardUrl); //vytvoří pole karet, které se mají skrýt
        console.log(cardsToHide);
        // nalezení indexu karet, které se mají skrýt, v poli všech karet
        const card1 = foundLobby.gameDesk.indexOf(cardsToHide[0]);
        const card2 = foundLobby.gameDesk.indexOf(cardsToHide[1]);
        console.log(card1, card2);
        // nastavení id na nulu, protože karta už na hracím poli neexistuje
        foundLobby.gameDesk[card1].id = 0;
        foundLobby.gameDesk[card2].id = 0;
        // skrytí karet na frontendu
        for (const playerId of foundLobby.players) {
          foundLobby.playerPoints=foundLobby.players.map((x) => 0);
          const players = [];
          for (let i=0;i<foundLobby.players.length;i++) {
            const playerId = foundLobby.players[i];
            players.push({
              id: playerId,
              name: socketNames[playerId],
              points: foundLobby.playerPoints[i]
            });
          
            io.to(playerId).emit("hideCards", card1, card2, {
              gameDesk: foundLobby.gameDesk.length,
              players,
              collumns: foundLobby.collumns,
              playerOnMove: players[0].id
            });
          }
          lobby.playerOnMove = players[0].id;
        }
      } else{ // nastaví dalšího hráče na řadě
        foundLobby.playerOnMove = foundLobby.players[(foundLobby.players.indexOf(foundLobby.playerOnMove) + 1) % foundLobby.players.length];
      }
    }

    await foundLobby.save();
  })

});


server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
