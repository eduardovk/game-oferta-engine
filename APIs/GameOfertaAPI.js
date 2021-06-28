const config = require('../config.js');
const axios = require('axios'); //biblioteca para requisicoes http

//Classe da API GameOferta
class GameOfertaAPI {

    constructor() {
        //recebe vars de ambiente de chaves e tokens de API
        this.keys = (config.ambient === 'localhost') ? require('./keys_local.js') : require('./keys.js');
    }

    //envia solicitacao para API GameOferta notificar usuario de nova oferta
    async sendNotification(notificationInfo) {
        var gamesIDs = ""; //cria string de ids
        for (var newOffer of notificationInfo.new_offers) {
            gamesIDs += newOffer.id_game + ",";
        }
        //remove ultima virgula da string
        if (gamesIDs.slice(-1) == ',') gamesIDs = gamesIDs.slice(0, -1);
        console.log("Sending request for API Notification for user (" + notificationInfo.id_user + "), games (" + gamesIDs + ")");
        await axios.post('https://game-oferta-api.herokuapp.com/email', notificationInfo);
    }
}

module.exports = GameOfertaAPI;