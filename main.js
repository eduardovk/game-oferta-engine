const { DateTime } = require('luxon'); //biblioteca para manipulacao de datas

var currentDate = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data atual
console.log('Deployed on Heroku [' + currentDate + ']');