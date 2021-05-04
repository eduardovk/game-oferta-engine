const { SSL_OP_EPHEMERAL_RSA } = require('constants');
const dataBase = require('../DB'); //classe do banco de dados
const engine = require('../engine'); //principais funcoes
const Job = require('../Job'); //classe de schedule jobs
const { exit } = require('process');

//este script sera utilizado no heroku como um schedule job
//ou seja, a cada X horas estabelecidas sera executado
//e verificara se eh necessario atualizar a contagem de avaliacoes de cada jogo
//(rating count), que eh utilizado para determinar a popularidade dos jogos

var job = new Job('new_ratings_check');
job.start().then(async (e) => {
    if (e) {
        await engine.fetchAllGameRatings()
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