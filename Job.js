const dbConfig = require('./db_config'); //dados de conexao com o bd
const { DateTime } = require('luxon'); //biblioteca para manipulacao de datas
const dataBase = require('./DB'); //classe do banco de dados

class Job {

    constructor(jobType) {
        this.jobType = jobType;
    }

    //registra inicio do job
    start() {
        this.startTime = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data e hora atual

        var db = new dataBase();
        var runningJobs = await db.checkRunningJobs(); //confere se ja existem jobs em andamento
        if (runningJobs) { //se ja houver job em andamento registrado no bd
            this.status = "failed";
            this.endTime = this.startTime;
            //TODO - inserir job fail no bd e devolver false
        }

        this.status = "running";
    }

}

module.exports = Job;