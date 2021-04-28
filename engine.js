const dataBase = require('./DB'); //classe do banco de dados
const ITADApi = require('./APIs/ITAD') //classe da API do ITAD
const IGDBApi = require('./APIs/IGDB'); //classe da API do IGDB
const delay = require('delay'); //biblioteca para gerar atraso entre requests
const { exit } = require('process'); //para poder utilizar a funcao exit
const Stopwatch = require('./includes/Stopwatch'); //cronometro para fins de debug
const config = require('./config.js');


//procura na API do IGDB por novos jogos e insere no bd
async function fetchNewGames() {
    var db = new dataBase();
    var lastInsertedGame = await db.returnLatestGames(1); //retorna o ultimo jogo inserido no bd
    var idIndex = lastInsertedGame ? lastInsertedGame[0].igdb_id : 1; //pega o id igdb do jogo
    var IGDBInstance = new IGDBApi();
    var newGames = 0;
    await IGDBInstance.getAllGames(idIndex + 1).then(async (games) => { //busca na API IGDB todos jogos a partir do id 
        console.log("Games fetched: " + games.length);
        if (games.length > 0) { //caso hajam jogos novos
            var db = new dataBase();
            console.log('\nInserting into DB...\n');
            for (var game of games) { //para cada jogo novo
                let gameInDB = await db.returnGameByID(game.igdb_id, true); //verifica se game ja existe no db
                if (gameInDB.length > 0) console.log('GAME ALREADY IN DB!\n');
                else {
                    newGames++;
                    await db.insertGame(game); //insere no bd
                }
            }
            var newInsertedGames = await db.returnLatestGames(games.length);
            await fillGamePlains(newInsertedGames); //procura pelo plain de cada jogo novo na api ITAD e insere no bd
            await db.checkDuplicatePlains(); //procura por plains duplicadas no bd e marca a flag duplicate_plain
        }
        return newGames;
    });
    if (newGames > 0) return "Found " + newGames + " new games.";
    return null;
}

//procura na API do ITAD por novas lojas e insere no bd
async function fetchNewStores() {
    var db = new dataBase();
    var ITADInstance = new ITADApi();
    var newStores = "";
    var stores = await ITADInstance.getAllStores(); //faz request das lojas a API ITAD
    for (var store of stores) { //para cada loja encontrada
        var exists = await db.returnStore(store.id); //verifica se ja existe no bd
        if (!exists) { //caso nao exista
            await db.insertStore(store); //insere no bd
            newStores += "[" + store.title + "]";
        }
    }
    if (newStores !== "") return "Found new store(s): " + newStores;
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


//busca o preco atual de todos os jogos do bd a partir do idIndex informado
//novo metodo otimizado (elimina busca individual de cada preco de jogo do bd)
async function fetchAllGamesPrices(idIndex = 1) {
    //informacoes sobre qtd de deals atualizadas ou inseridas
    var dealsOperationInfo = {
        new: 0,
        replaced: 0,
        updated: 0,
        unreachable: 0
    };
    var plainsString = "";
    var plainStringArr = []; //array de strings de plains limitadas pelo tamanho maximo de url
    var stopwatch = new Stopwatch();
    stopwatch.start(); //inicia cronometro, para fins de debug
    var db = new dataBase();
    var storesFilter = await db.returnStoreFilterPlains(); //recebe plain das listas contidas no filtro
    var gamePlainsList = await db.returnAllGames(idIndex, false, " id, plain ", "active = 1"); //retorna plains de todos jogos
    var gamesDeals = await db.returnAllGameDeals(idIndex); //retorna todos jogos e deals atuais
    var tempString = "";
    var groupedDeals = [];
    var totalGamesAnalyzed = 0;
    //cria um array de plains
    for (var game of gamePlainsList) {
        if (game.plain !== null && game.plain !== "") {
            //adicionado prefixo no inicio da string para nao haver conflito com palavras reservadas do js
            //arrays nao podem ter palavras reservadas como key
            let plainIndex = 'game_' + game.plain;
            groupedDeals[plainIndex] = [];
            groupedDeals[plainIndex].push({ plain: game.plain, gameID: game.id });
            totalGamesAnalyzed++;
        }
    }
    //agrupa as deals de acordo com o jogo a qual pertencem
    for (var gameDeal of gamesDeals) {
        if (gameDeal.game_plain !== null && gameDeal.game_plain !== "") {
            let plainIndex = 'game_' + gameDeal.game_plain;
            groupedDeals[plainIndex].push(gameDeal);
        }
    }
    //cria array de strings contendo varias plains (no maximo 1500 caracteres por string)
    for (var plainWithPrefix in groupedDeals) {
        var dealGamePlain = groupedDeals[plainWithPrefix][0].plain //pega a plain do jogo
        if (dealGamePlain !== null && dealGamePlain !== "") {
            tempString = plainsString + escape(dealGamePlain); //concatena a plain na string de plains
            if (tempString.length < 1500) plainsString = tempString + ','; //verifica limite 
            else {
                plainStringArr.push(plainsString.slice(0, -1)); //remove a ultima virgula e adiciona string ao array
                plainsString = dealGamePlain + ','; //reinicia a string com nome do proximo jogo
            }
        }
    }
    if (plainsString.slice(-1) === ',') plainsString = plainsString.slice(0, -1); //remove virgula extra caso exista
    plainStringArr.push(plainsString);
    var ITADInstance = new ITADApi();
    var gamesArray = [];
    for (var str of plainStringArr) { //para cada string no array de strings de plains
        gamesArray = await ITADInstance.getPricesByPlain(str); //busca os precos dos jogos contidos nesta string
        console.log("\n");
        for (var game of gamesArray) { //para cada objeto jogo retornado
            console.log("Game:  " + game.plain + " ---> " + game.list.length + " deal(s) found.");
        }
        console.log(gamesArray.length + " GAMES RETURNED. \n");
        for (var game of gamesArray) { //para cada objeto jogo retornado
            let plainIndex = 'game_' + game.plain;
            //insere precos do jogo no bd e recebe informacoes sobre as operacoes realizadas
            let operationInfo = await db.compareAndInsertDeals(game, groupedDeals[plainIndex], storesFilter);
            dealsOperationInfo.new += operationInfo.new;
            dealsOperationInfo.updated += operationInfo.updated;
            dealsOperationInfo.replaced += operationInfo.replaced;
            dealsOperationInfo.unreachable += operationInfo.unreachable;
        }
    }
    console.log('\n\n' + totalGamesAnalyzed + ' TOTAL GAMES ANALYZED.');
    console.log(dealsOperationInfo.new + ' new deals INSERTED.');
    console.log(dealsOperationInfo.updated + ' deals UPDATED.');
    console.log(dealsOperationInfo.replaced + ' deals REPLACED.');
    console.log(dealsOperationInfo.unreachable + ' deals UNREACHABLE.');
    console.log('Total execution time: ' + stopwatch.stop()); //para cronometro
    //cria mensagem de relatorio da operacao
    var finalMsg = totalGamesAnalyzed + " games analyzed, " + dealsOperationInfo.new + " new deals inserted, "
        + dealsOperationInfo.updated + " updated, " + dealsOperationInfo.replaced + " replaced, " + dealsOperationInfo.unreachable + " unreachable.";
    return finalMsg; //retorna msg de relatorio para salvar no job no bd
}

module.exports = { fetchNewGames, fillGamePlains, fetchAllGamesPrices, fetchNewStores };