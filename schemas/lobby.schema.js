const mongoose = require('mongoose');

const lobbySchema = new mongoose.Schema({
  lobbyCode: String,
  players: [String],
  gameDesk: [{id: Number, url: String}],
  maxPlayers: Number,
  playerOnMove: String,
  playerPoints: [Number],
  collumns: Number,
  sada: String
});
const Lobby = mongoose.model('Lobby', lobbySchema);
module.exports = Lobby;