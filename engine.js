const dataBase = require('./DB'); //classe do banco de dados
const ITADApi = require('./APIs/ITAD') //classe da API do ITAD
const IGDBApi = require('./APIs/IGDB'); //classe da API do IGDB
const delay = require('delay'); //biblioteca para gerar atraso entre requests
const { exit } = require('process'); //para poder utilizar a funcao exit
const Stopwatch = require('./includes/Stopwatch'); //cronometro para fins de debug


//procura na API do IGDB por novos jogos e insere no bd
async function fetchNewGames() {
    var db = new dataBase();
    var lastInsertedGame = await db.returnLatestGames(1); //retorna o ultimo jogo inserido no bd
    var idIndex = lastInsertedGame ? lastInsertedGame[0].igdb_id : 1; //pega o id igdb do jogo
    var IGDBInstance = new IGDBApi();
    await IGDBInstance.getAllGames(idIndex + 1).then(async (games) => { //busca na API IGDB todos jogos a partir do id
        console.log("Games fetched: " + games.length);
        if (games.length > 0) { //caso hajam jogos novos
            var db = new dataBase();
            console.log('\nInserting into DB...\n');
            for (var game of games) { //para cada jogo novo
                let gameInDB = await db.returnGameByID(game.igdb_id, true); //verifica se game ja existe no db
                if (gameInDB.length > 0) console.log('GAME ALREADY IN DB!\n');
                else await db.insertGame(game); //insere no bd
            }
            var newInsertedGames = await db.returnLatestGames(games.length);
            await fillGamePlains(newInsertedGames); //procura pelo plain de cada jogo novo na api ITAD e insere no bd
            await db.checkDuplicatePlains(); //procura por plains duplicadas no bd e marca a flag duplicate_plain
        }
    });

}

//procura na API do ITAD por novas lojas e insere no bd
async function fetchNewStores() {
    var db = new dataBase();
    var ITADInstance = new ITADApi();
    var stores = await ITADInstance.getAllStores(); //faz request das lojas a API ITAD
    for (var store of stores) { //para cada loja encontrada
        var exists = await db.returnStore(store.id); //verifica se ja existe no bd
        if (!exists) { //caso nao exista
            await db.insertStore(store); //insere no bd
        }
    }
    return null;
}


//procura o plain dos jogos informados (ou jogos sem plain) na API ITAD e atualiza no bd
async function fillGamePlains(games = null) {
    var db = new dataBase();
    var ITADInstance = new ITADApi();
    if (games == null) { //caso os games nao tenham sido informados
        games = await db.returnAllGames(); //busca todos os games do bd
    }
    for (var game of games) { //para cada game
        if (!game.plain || game.plain == null || game.plain == '') { //se jogo nao possuir plain
            await delay(250); //aplica delay entre requests para nao abusar da API
            var plain = await ITADInstance.getPlainByTitle(game.name); //utiliza api ITAD para buscar o plain
            if (plain) {
                game.plain = plain;
                await db.updateGame(game); //atualiza o jogo no bd inserindo o plain
            }
        }
    }
    return null;
}


//busca o preco atual dos jogos informados (ou todos os jogos do bd caso plainsString == "")
//plainsString deve ser uma string de plains separadas por virgula (sem espaco)
async function fetchGamesPrices(plainsString = "") {
    var plainStringArr = []; //array de strings de plains limitadas pelo tamanho maximo de url
    var stopwatch = new Stopwatch();
    stopwatch.start(); //inicia cronometro, para fins de debug
    if (plainsString == "") { //caso string de plains nao tenha sido informada
        var db = new dataBase();
        var games = await db.returnAllGames(1, false, " plain ", "active = 1"); //retorna plains de todos jogos
        var tempString = "";
        for (var game of games) {
            if (game.plain != null && game.plain != "") {
                tempString = plainsString + escape(game.plain); //concatena a plain na string de plains
                if (tempString.length < 1500) plainsString = tempString + ','; //verifica limite 
                else {
                    plainStringArr.push(plainsString.slice(0, -1)); //remove a ultima virgula e adiciona string ao array
                    plainsString = game.plain + ','; //reinicia a string com nome do proximo jogo
                }
            }
        }
    }
    plainStringArr.push(plainsString); //adiciona string restante ao array
    var ITADInstance = new ITADApi();
    var totalGamesCount = 0;
    var gamesArray = [];
    for (var str of plainStringArr) { //para cada string no array de strings de plains
        gamesArray = await ITADInstance.getPricesByPlain(str); //busca os precos dos jogos contidos nesta string
        console.log("\n");
        for (var game of gamesArray) { //para cada objeto jogo retornado
            console.log("Game:  " + game.plain + " ---> " + game.list.length + " deal(s) found.");
        }
        console.log(gamesArray.length + " GAMES RETURNED. \n");
        totalGamesCount += gamesArray.length;
        for (var game of gamesArray) { //para cada objeto jogo retornado
            await db.insertDeals(game); //insere precos do jogo no bd
        }
    }
    console.log('\n\n' + totalGamesCount + ' TOTAL GAMES RETURNED.');
    console.log('Total execution time: ' + stopwatch.stop()); //para cronometro
}

module.exports = { fetchNewGames, fillGamePlains, fetchGamesPrices, fetchNewStores };