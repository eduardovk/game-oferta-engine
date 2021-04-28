const config = require('../config.js');
const axios = require('axios'); //biblioteca para requisicoes http
const { exit } = require('process'); //para poder usar o comando exit
const delay = require('delay'); //biblioteca para gerar atraso entre requests
const Stopwatch = require('../includes/Stopwatch'); //cronometro para fins de debug

//Classe da API IGDB
//documentacao: https://api-docs.igdb.com/
class IGDB {

    constructor(jobType) {
        //recebe vars de ambiente de chaves e tokens de API
        this.keys = (config.ambient === 'localhost') ? require('./keys_local.js') : require('./keys.js');
    }

    //retorna todos os jogos da plataforma PC
    //utiliza a funcao fetchAllGames para buscar 500 jogos de cada vez,
    //respeitando limite de requisicoes por segundo da API
    async getAllGames(idIndex = 1) {
        var games = await this.fetchAllGames(idIndex);
        return games;
    }


    //busca no IGDB todos os jogos da plataforma PC de 500 em 500,
    //atraves da funcao fetchGames()
    async fetchAllGames(idIndex, debug = true) {
        var gamesArray = [];
        var fetching = true;
        var stopwatch = new Stopwatch();
        stopwatch.start(); //inicia cronometro, para fins de debug
        while (fetching) {
            await delay(300); //impoe atraso de 300 ms a cada request para nao violar limite da API
            if (debug) console.log('Fetching games from ID ' + idIndex + ' to ' + (idIndex + 500));
            var games = await this.fetchGames(idIndex, (idIndex + 500));
            if (games.length > 0) { //se houverem resultados
                for (var game of games) {
                    gamesArray.push({
                        igdb_id: game.id, //id no bd da IGDB
                        category: game.category ? game.category : null, //0-jogo, 1-dlc, 2-expansao, 3-bundle, 4-expansao standalone, 5-mod, 6-episodio, 7-season
                        status: game.status ? game.status : null, //(pode ser null) 0-lancado, 2-alpha, 3-beta, 4-antecipado, 5-offline, 6-cancelado, 7-rumor
                        name: game.name,
                        slug: game.slug,
                        plain: null, //plain deve ser buscada posteriormente na API do ITAD
                        parent_game: game.parent_game ? game.parent_game : null, //se for dlc ou expansao, indica a qual jogo pertence
                        similar_games: this.stringifySimilarGames(game), //array de jogos similares (id do IGDB)
                        igdb_cover: game.cover ? game.cover.url : null //thumbnail do jogo no IGDB
                    });
                }
                idIndex += 500;
            } else { //caso nao hajam mais resultados
                fetching = false;
            }
        }
        stopwatch.stop(debug); //para cronometro
        return gamesArray;
    }


    //busca no IGDB os jogos da plataforma PC (de uma determinada faixa de IDs)
    //pois a API so permite ate 500 jogos por request
    //documentacao: https://api-docs.igdb.com/#game
    async fetchGames(minID, maxID) {
        var url = 'https://api.igdb.com/v4/games';
        //headers do request
        var requestOptions = {
            headers: {
                'Client-ID': this.keys.IGDBKeys.clientID,
                'Authorization': 'Bearer ' + this.keys.IGDBKeys.apiKey
            }
        };
        //corpo do request (post)
        //buscando jogos cuja plataforma seja PC e cujo status seja null ou diferente de cancelado/nao lancado
        var requestBody = `fields name, slug, category, status, parent_game, similar_games, cover.url;
        where release_dates.platform = (6) & id >= `+ minID + ` & id <= ` + maxID +
            ` & (status = null | (status != 5 & status != 6 & status != 7));
        limit 500;`;
        var games = await axios.post(url, requestBody, requestOptions)
            .then(function (response) {
                return response.data;
            })
            .catch(function (error) {
                console.log(error);
                exit();
            });
        return games;
    }


    //converte array de IDs de jogos similares para string
    stringifySimilarGames(game) {
        var similarGamesString = "";
        if (game.similar_games && game.similar_games.length > 0) {
            let qtd = 0;
            for (var similar of game.similar_games) {
                if (qtd < 5) similarGamesString += similar + ",";
                qtd++;
            }
            similarGamesString = similarGamesString.slice(0, -1); //remove virgula extra
        }
        return similarGamesString;
    }


}

module.exports = IGDB;