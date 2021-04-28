const config = require('../config.js');
const axios = require('axios'); //biblioteca para requisicoes http
const pLimit = require('p-limit'); //biblioteca para estipular limite de requisicoes simultaneas
const { exit } = require('process'); //para poder usar o comando exit

//Classe da API ITAD
//documentacao: https://itad.docs.apiary.io/
class ITAD {

    constructor(jobType) {
        //recebe vars de ambiente de chaves e tokens de API
        this.keys = (config.ambient === 'localhost') ? require('./keys_local.js') : require('./keys.js');
    }

    //retorna todos os plains de uma determinada loja
    //plain = string identificadora do jogo na API do ITAD
    //documentacao: https://itad.docs.apiary.io/#reference/game/get-all-plains/get-all-plains
    async getAllPlains(loja) {
        var url = 'https://api.isthereanydeal.com/v01/game/plain/list/?key=' + this.keys.ITADKeys.apiKey + '&shops=' + loja;
        axios.get(url)
            .then(function (response) {
                return response.data.data[loja];
            })
            .catch(function (error) {
                console.log(error);
                exit();
            });
    }


    //busca e retorna o plain de um jogo atraves do seu titulo
    //documentacao: https://itad.docs.apiary.io/#reference/game/identifier/get-plain
    async getPlainByTitle(title, debug = true) {
        if (debug) process.stdout.write('\nSearching plain for \"' + title + '\" (' + this.paramEncode(title) + '): ');
        var plain = false;
        var url = 'https://api.isthereanydeal.com/v02/game/plain/?key='
            + this.keys.ITADKeys.apiKey + '&title=' + this.paramEncode(title); //codifica para parametro de url
        await axios.get(url)
            .then(function (res) {
                if (res.data.data.plain) {
                    plain = res.data.data.plain;
                    if (debug) process.stdout.write(plain + '\n');
                }
                else process.stdout.write("NOT FOUND.\n");
            })
            .catch(function (error) {
                console.log(error);
            });
        return plain;
    }


    //retorna precos de jogos com base na(s) plain(s) informada(s)
    //string de plains deve vir ja codificada (funcao paramEncode) e ter no max. 1400 caracteres
    async getPricesByPlain(plains, shops = null, region = null, country = null, debug = true) {
        var games = [];
        var url = 'https://api.isthereanydeal.com/v01/game/prices/?key='
            + this.keys.ITADKeys.apiKey + '&plains=' + plains;
        if (shops) url += '&shops=' + this.paramEncode(shops);
        if (region) url += '&region=' + this.paramEncode(region);
        if (country) url += '&country=' + this.paramEncode(country);
        await axios.get(url)
            .then(function (res) {
                if (res.data.data) {
                    var returnedGames = res.data.data;
                    var gamePlains = Object.keys(res.data.data);
                    for (var gamePlain of gamePlains) {
                        if (returnedGames[gamePlain].list.length > 0) {
                            games.push({
                                plain: gamePlain,
                                list: returnedGames[gamePlain].list
                            });
                        }
                    }
                }
            })
            .catch(function (error) {
                console.log(error);
            });
        return games;
    }


    //retorna todas as lojas cadastradas na api ITAD
    async getAllStores(debug = true) {
        if (debug) process.stdout.write('Fetching stores...  ');
        var url = 'https://api.isthereanydeal.com/v01/web/stores/all/';
        var stores = null;
        await axios.get(url)
            .then(function (res) {
                stores = res.data.data;
                if (debug) process.stdout.write(stores.length + ' stores fetched.\n');
            })
            .catch(function (error) {
                console.log(error);
            });
        return stores;
    }


    //codifica corretamente a string para utilizacao como
    ///parametro url das requisicoes da api ITAD
    paramEncode(str) {
        var encodedString = encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
            return '%' + c.charCodeAt(0).toString(16)
        });
        return encodedString;
    }



}

module.exports = ITAD;