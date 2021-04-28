const config = require('./config.js');
const { DateTime } = require('luxon'); //biblioteca para manipulacao de datas
const dataBase = require('./DB'); //classe do banco de dados

//classe para estabelecer e registrar no bd os schedule jobs do heroku
class Job {

    constructor(jobType) {
        this.jobType = jobType;
        this.ambient = config.ambient;
    }

    //registra no bd inicio do job caso ja nao exista algum em andamento
    async start() {
        this.startTime = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data e hora atual
        var db = new dataBase();
        var runningJobs = await db.checkRunningJobs(); //confere se ja existem jobs em andamento
        if (runningJobs) { //se ja houver job em andamento registrado no bd
            this.status = "failed";
            this.endTime = this.startTime;
            this.msg = runningJobs;
            await db.insertJob(this); //insere registro de job fail no bd
            return false;
        }
        //caso nao existam jobs em andamento
        this.status = "running";
        var result = await db.insertJob(this); //insere registro de job running no bd
        this.id = result[0].insertId;
        return true;
    }

    //atualiza o registro do job no bd informando o termino
    async finish(msg = "", crashed = false) {
        this.status = crashed ? "crashed" : "completed";
        this.endTime = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data e hora atual
        this.msg = msg;
        var db = new dataBase();
        await db.updateJob(this); //atualiza registro para status completed (ou crashed)
        return true;
    }

}

module.exports = Job;