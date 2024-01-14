// npm run dev - zapnutí serveru
// screen -r backendConsole

const express = require("express");
const { createServer } = require("node:http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const cors = require("cors");
const app = express();
app.use(express.json());
const port = 3006;
const Lobby = require("./schemas/lobby.schema");
const Stats = require("./schemas/stats.schema");
const { createGameDesk, picsum, playersCreate, endStats } = require("./utilities");
app.use(cors({ origin: ["http://pexeso.lol"] }));
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "http://pexeso.lol" },
});

let socketNames = [];

main().catch((err) => console.log(err));

async function main() {
  await mongoose.connect(
    "mongodb://myUserAdmin:RemantE*it2_2023@localhost:27017/pexeso?authMechanism=DEFAULT",
    { authSource: "admin" }
  );
  await Stats.findOneAndUpdate(
    {},
    { $setOnInsert: { name: 'stats', stats: [] } },
    { upsert: true, new: true }
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
    if (lobby.players.length < 2){
      for (const playerId of lobby.players) {
        io.to(playerId).emit("notEnoughPlayers");
      }
      return;
    }
    if(lobby.playerPoints.length > 0) return;
    lobby.playerPoints=lobby.players.map((x) => 0);
    const players = playersCreate(lobby, socketNames);
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
  const sadaFolder = req.body.sadaFolder;
  const sadaName = req.body.sadaName;
  const gameDesk = createGameDesk(width, heigh, sadaFolder);
  const createdLobby = await Lobby.create({
    lobbyCode: code,
    maxPlayers: req.body.maxPlayers || 2,
    collumns: req.body.width,
    gameDesk: gameDesk /*může být jenom gamedesk*/,
    players: [req.body.socketId],
    sada: sadaName
  });

  const playerNames = [socketNames[req.body.socketId]];
  res.send({ ...createdLobby.toObject(), playerNames });
});

app.post("/lobbyJoin", async (req, res) => {
  const lobbyCode = req.body.lobbyCode;
  const foundLobby = await Lobby.findOne({ lobbyCode }).exec();
  const playerAlreadyInLobby = await Lobby.findOne({players: req.body.socketId}).exec();
  if (playerAlreadyInLobby != null){
    res.send();
    return;
  }
  if (foundLobby == null) {
    res.status(404).send();
    return;
  }
  if (foundLobby.players.length >= foundLobby.maxPlayers) {
    res.status(403).send();
    return;
  }
  if(foundLobby.playerPoints.length > 0){
    res.status(402).send();
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

app.post("/stats", async (req, res) => {
  const statsDoc = await Stats.findOne({});
  const wins = (statsDoc.stats.toSorted((a, b) => b.wins - a.wins).filter((a) => a.wins != 0)).slice(0, 10);
  const gamesPlayed = (statsDoc.stats.toSorted((a, b) => b.gamesPlayed - a.gamesPlayed).filter((a) => a.gamesPlayed != 0)).slice(0, 10);
  const pointsEarned = (statsDoc.stats.toSorted((a, b) => b.pointsEarned - a.pointsEarned).filter((a) => a.pointsEarned != 0)).slice(0, 10);
  res.send({wins, gamesPlayed, pointsEarned});
});

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);
  socket.on("jmenoHrace", async (jmeno) => {
    socketNames[socket.id] = jmeno;
    const statsDoc = await Stats.findOne({});
    if(statsDoc.stats.find((stat) => stat.name === socketNames[socket.id]) === undefined){
      statsDoc.stats.push({
        name: socketNames[socket.id],
        wins: 0,
        gamesPlayed: 0,
        pointsEarned: 0
      })
    }
    statsDoc.save();
  });
  socket.on("disconnect", async () => {
    const lobby = await Lobby.findOne({ players: socket.id });
    if (lobby == null) {
      return;
    }
    if(socket.id === lobby.playerOnMove){
      lobby.playerOnMove = lobby.players[(lobby.players.indexOf(lobby.playerOnMove) + 1) % lobby.players.length];
    }
    lobby.playerPoints = lobby.playerPoints.splice(lobby.players.indexOf(socket.id), 1);
    lobby.players = lobby.players.filter((socketId) => socket.id != socketId);
    await lobby.save();
    const playerNames = [];
    for (const playerId of lobby.players) {
      playerNames.push(socketNames[playerId]);
    }
    const players = playersCreate(lobby, socketNames);
    for (const playerId of lobby.players) { // na frontendu
      console.log(players, lobby.playerOnMove);
      io.to(playerId).emit("playerListChange", players, lobby.playerOnMove);
    }
    console.log("user disconnected", socket.id);
    //smazání lobby, když je prázdné
    if(lobby.players.length === 0){
      await lobby.deleteOne();
    }
  });

  socket.on("turn", async (card) =>{
    const foundLobby = await Lobby.findOne({players: socket.id}).exec();
    const statsDoc = await Stats.findOne({});

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
        const players = playersCreate(foundLobby, socketNames);
        for (const playerId of foundLobby.players) { //přičítaní bodů na frontendu
            io.to(playerId).emit("playerListChange", players, foundLobby.playerOnMove);
        }    
        // přičítání bodů ve stats databázi
        statsDoc.stats[statsDoc.stats.findIndex((stat) => stat.name === socketNames[foundLobby.playerOnMove])].pointsEarned++;
        const cardUrl = foundLobby.gameDesk[card].url;
        const cardsToHide = foundLobby.gameDesk.filter((element) => element.url === cardUrl); //vytvoří pole karet, které se mají skrýt
        // nalezení indexu karet, které se mají skrýt, v poli všech karet
        const card1 = foundLobby.gameDesk.indexOf(cardsToHide[0]);
        const card2 = foundLobby.gameDesk.indexOf(cardsToHide[1]);
        // nastavení id na nulu, protože karta už na hracím poli neexistuje
        foundLobby.gameDesk[card1].id = 0;
        foundLobby.gameDesk[card2].id = 0;
        // skrytí karet na frontendu
        for (const playerId of foundLobby.players) {
            io.to(playerId).emit("hideCards", card1, card2);
        }
        // zjistí, jestli hra už nemá skončit, když ano, pošle to na frontend
        if(foundLobby.gameDesk.filter((element) => element.id === 0).length === foundLobby.gameDesk.length){
          const winners = endStats(foundLobby, socketNames);
          for (const playerId of foundLobby.players) { // na frontendu
            io.to(playerId).emit("end", players, winners);    
          }
          for(const player of foundLobby.players){ // připočtení dohrané hry do statistik
            statsDoc.stats[statsDoc.stats.findIndex((stat) => stat.name === socketNames[player])].gamesPlayed++;
          }
          for(const player of winners){ // připočtení výhry do statistik
            statsDoc.stats[statsDoc.stats.findIndex((stat) => stat.name === player.name)].wins++;
          }
          await statsDoc.save();
          await foundLobby.deleteOne();
          return;
        }

      } else{ // nastaví dalšího hráče na řadě
        foundLobby.playerOnMove = foundLobby.players[(foundLobby.players.indexOf(foundLobby.playerOnMove) + 1) % foundLobby.players.length]; // v backendu
        const players = playersCreate(foundLobby, socketNames);
        for (const playerId of foundLobby.players) { // na frontendu
            io.to(playerId).emit("playerListChange", players, foundLobby.playerOnMove);
        }
      }
    }
    await foundLobby.save();
  })

});

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
