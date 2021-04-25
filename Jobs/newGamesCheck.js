const { SSL_OP_EPHEMERAL_RSA } = require('constants');
const dataBase = require('../DB'); //classe do banco de dados
const engine = require('../engine'); //principais funcoes
const Job = require('../Job'); //classe de schedule jobs
const { exit } = require('process');

//este script sera utilizado no heroku como um schedule job
//ou seja, a cada X horas estabelecidas sera executado
//e buscara novos jogos lancados para inserir no bd

var job = new Job('new_games_check');
job.start().then(async (e) => {
    if (e) {
        await engine.fetchNewGames()
            .then(async msg => {
                await job.finish(msg);
            })
            .catch(async (err) => {
                console.log(err);
                await job.finish(err.message, true);
            });
    }
    exit();
});