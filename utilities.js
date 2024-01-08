function createGameDesk(width, heigh){
    
    let karty = []
    for(let i = 1; i <= width * heigh / 2; i++){
        karty.push({
            id: i,
            url: ""
        },{
            id: i,
            url: ""
        });
    }
    karty.sort(() => Math.random() - 0.5);
    return karty;
}

function picsum(karty){
    for(const element of karty){
        element.url = `https://picsum.photos/id/${element.id + 10}/200/300`;
    }
    return karty;
}

function playersCreate(lobby, socketNames){ // lobby je databáze, ze které to tahá
    const players = [];
      for (let i = 0; i < lobby.players.length; i++) { //do pole players uloží každého hráče jako objekt, který uchovává socketID (playerID), jeho ingame jméno a jeho body
        const playerId = lobby.players[i];
        players.push({
          id: playerId,
          name: socketNames[playerId],
          points: lobby.playerPoints[i]
      });
    }
    return players;
}

function endStats(lobby, socketNames){
    players = playersCreate(lobby, socketNames);
    players.sort((a, b) => b.points - a.points); //seřadí podle bodů
    const winners = players.filter((hrac) => hrac.points === players[0].points);
    console.log(winners, players);
    return winners
}

module.exports = {createGameDesk, picsum, playersCreate, endStats};