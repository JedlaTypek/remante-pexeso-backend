const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema(
  [{
  name: String,
  wins: Number,
  gamesPlayed: Number,
  pointsEarned: Number
}]);

const Stats = mongoose.model('Stats', statsSchema);
module.exports = Stats;