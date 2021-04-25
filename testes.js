const { SSL_OP_EPHEMERAL_RSA } = require('constants');
const dataBase = require('./DB'); //classe do banco de dados
const engine = require('./engine'); //principais funcoes

//atualiza o bd com novos jogos lancados
engine.fetchNewGames();

//---------------------------------------------
// 
//atualiza o bd com novas lojas inseridas
// engine.fetchNewStores();

//atualiza o bd com precos atuais de todos os jogos
// engine.fetchGamesPrices();

//---------------------------------------------

// busca e insere no bd o plain de jogos a partir do id informado
// var db = new dataBase();
// db.returnAllGames(158).then(async (games)=>{
//     await engine.fillGamePlains(games);
// }).catch(e=>console.log(e));

//---------------------------------------------

//busca e insere no bd o plain de todos jogos cujo plain = null
// engine.fillGamePlains();

//---------------------------------------------

//[ TODO ] busca e registra no bd os precos atuais de cada loja para cada jogo do bd
// engine.fetchGamesPrices();

//---------------------------------------------

//[ TODO ] - busca os precos das plains informadas abaixo
// var plains = 'thief,fallout,maxpayne,bioshock,mafia,deusex,overlord,portal,masseffect,witcher,lanoire,diabloiii,minecraft,diablo,doom,outlaws,pipemania,dig,mdk,simsii,starcraft,halflife,guildwars,myst,riven,unreal,tropico,crysis,farcry';
// var itad = require('./APIs/ITAD');
// var itadAPI = new itad();
// var games = itadAPI.paramEncode(plains);
// itadAPI.getPricesByPlain(games, null, 'br2', 'BR');
