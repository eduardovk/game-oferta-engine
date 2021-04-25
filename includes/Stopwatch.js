const { PerformanceObserver, performance } = require('perf_hooks'); //para utilizar metodos de cronometragem

class Stopwatch {

    constructor() {
        this.initialTime = 0;
    }

    //inicia cronometro
    start() {
        this.initialTime = performance.now(); //tempo inicial de execucao
    }

    //para cronometro
    stop(debug = false) {
        var finalTime = ((performance.now() - this.initialTime) / 1000).toFixed(2); //tempo total de execucao
        if (debug) console.log("Tempo de execução: " + finalTime + " segundos.");
        return finalTime;
    }



}

module.exports = Stopwatch; 