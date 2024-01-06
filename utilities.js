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

module.exports = {createGameDesk, picsum};