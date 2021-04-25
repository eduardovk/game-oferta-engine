const dataBase = require('./DB'); //classe do banco de dados
const readline = require('readline'); //biblioteca para ler input

//EXECUTAR VIA CONSOLE
//este script auxilia na resolucao de duplicatas
//printa url das imagens de capa de jogos com plain duplicada + o link do jogo no ITAD
//e pergunta qual devera ser o status de cada jogo (1 = ativo, 0 = inativo)

//funcao para aguardar inputs no console
function requestInput(text) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(text, ans => {
        rl.close();
        resolve(ans);
    }))
}

var db = new dataBase();
//duplicate_plain indica se possui plain repetida
//duplicate_checked indica se ja foi verificado anteriormente
var where = 'duplicate_plain = 1 AND duplicate_checked IS NULL ORDER BY plain';
db.returnAllGames(1, false, ' * ', where).then(async (games) => {
    var currentPlain = "";
    var gamesCollection = [];
    var samePlainCollection = [];
    //junta os jogos com plain duplicada em um array
    for (var game of games) {
        if (currentPlain != "" && currentPlain != game.plain) {
            gamesCollection.push(samePlainCollection);
            samePlainCollection = [];
        }
        currentPlain = game.plain;
        samePlainCollection.push(game);
    }
    for (var collection of gamesCollection) { //para cada array de jogos duplicados
        console.log('\n----------------------------------\n');
        var index = 1;
        for (var game of collection) { //para cada jogo de plain duplicada
            //printa nome, plain e url da imagem de capa
            console.log(index + '. [ID] ' + game.id + ' ' + game.name + ' [' + game.plain + ']  COVER: https:' + game.igdb_cover);
            index++;
        }
        //printa o link do jogo na loja, para comparar com as imagens de capa
        console.log('\nCompare with -> https://isthereanydeal.com/game/' + game.plain + '/info/\n');
        index = 1;
        //aguarda input do console para definir o status do jogo
        //1 = ativo, 0 = inativo
        for (var game of collection) {
            var resp = await requestInput(index + '. [ID] ' + game.id + ' ' + game.name + ' -> SET ACTIVE: ');
            if (resp == "1") game.active = 1;
            else game.active = null;
            game.duplicate_checked = 1; //indica que o jogo foi verificado
            await db.updateGame(game); //atualiza no bd
            index++;
        }

    }
}).catch(e => console.log(e));