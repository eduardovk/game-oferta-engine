const config = require('./config.js');
const { DateTime } = require('luxon'); //biblioteca para manipulacao de datas
const { exit } = require('process');
const { resourceLimits } = require('worker_threads');


//classe de conexao e manipulacao do banco de dados
class DB {

    //inicia nova conexao com bd ou retorna conexao ativa
    async connect(debug = false) {
        //dados de conexao com o bd
        var dbConfig;
        if (config.ambient === 'localhost') {
            dbConfig = require('./db_config_local');
        } else {
            dbConfig = require('./db_config');
        }
        //retorna a conexao ativa, caso ja exista
        if (global.connection && global.connection.state !== 'disconnected')
            return global.connection;
        //cria uma conexao nova caso nao exista conexao ativa
        const mysql = require("mysql2/promise");
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            database: dbConfig.database
        });
        if (debug) console.log("Connected to the DB!");
        global.connection = connection;
        return connection;
    }


    //insere registro de game no bd
    async insertGame(game, debug = true) {
        var currentDate = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data atual
        const conn = await this.connect();
        var sql = 'INSERT into games(igdb_id, name, slug, plain, rating_count, category, status, parent_game, '
            + 'similar_games, igdb_cover, inserted_at, updated_at, active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?);';
        var values = [game.igdb_id, game.name, game.slug, game.plain, game.rating_count, game.category, game.status,
        game.parent_game, game.similar_games, game.igdb_cover, currentDate, currentDate, 1];
        return await conn.query(sql, values).then(() => {
            if (debug) console.log('Inserted game [' + game.name + '] into database!');
        });
    }


    //compara com deals informadas e insere no bd caso haja mudancas
    async compareAndInsertDeals(game, previousDeals, storesFilter, debug = true) {
        //informacoes sobre qtd de deals atualizadas ou inseridas
        var operationInfo = {
            gameID: null,
            new: 0,
            replaced: 0,
            updated: 0,
            unreachable: 0,
            newOffers: []
        };
        if (debug) console.log("\n");
        if (game.plain != null && game.plain.trim() != '') {
            var currentDate = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data atual
            var currentDeals = [];
            var gameID = previousDeals[0].gameID; //pega id do jogo
            operationInfo.gameID = gameID;
            //cria array com as deals anteriores
            for (var i = 0; i < previousDeals.length; i++) {
                if (i !== 0) currentDeals.push(previousDeals[i]); //ignora o primeiro item do array, que eh apenas a plain do jogo 
            }
            var fetchedDeals = [];
            for (var deal of game.list) { //cria um array com precos de cada loja
                let storePlain = deal.shop.id;
                if (storesFilter.includes(storePlain)) { //caso a loja conste no filtro de lojas permitidas
                    if (fetchedDeals[storePlain] != undefined) { //caso ja tenha esta loja do array de precos (duplicata)
                        //sinaliza no bd o jogo como preco duplicado e retorna booleano se o preco gratuito deve ou nao ser o preco escolhido
                        var notFree = await this.flagDuplicatePrice(gameID);
                        if (deal.price_cut != 100 || !notFree) //caso o preco seja maior que 0 ou notFree seja false
                            fetchedDeals[storePlain] = deal; //substitui a deal duplicada
                    } else
                        fetchedDeals[storePlain] = deal;
                }
            }
            for (var currentDeal of currentDeals) { //para cada deal atual no BD
                if (fetchedDeals[currentDeal.id_itad] != undefined) { //caso esta deal conste nas deals atuais
                    var fetchedDeal = fetchedDeals[currentDeal.id_itad];
                    if (fetchedDeal.price_new != currentDeal.price_new && fetchedDeal.price_cut != currentDeal.price_cut) {
                        //Case 2 (Alterar current_deal = 0 no BD, Inserir nova deal com novos valores e current_deal = 1)
                        operationInfo.replaced++;
                        //caso desconto seja maior que anteriormente, adiciona a array de novas ofertas
                        if (fetchedDeal.price_cut > currentDeal.price_cut)
                            operationInfo.newOffers.push(fetchedDeal);
                        if (debug) console.log('Case 2-> CHANGE Deal from ' + currentDeal.id_itad + ' (game ' + game.plain + ') NEW PRICE and PRICE CUT. ');
                        currentDeal.current_deal = 0;
                        await this.updateDeal(currentDeal);
                        var newDeal = currentDeal;
                        newDeal.price_new = fetchedDeal.price_new;
                        newDeal.price_old = fetchedDeal.price_old;
                        newDeal.price_cut = fetchedDeal.price_cut;
                        newDeal.current_deal = 1;
                        newDeal.url = fetchedDeal.url;
                        await this.insertDeal(newDeal);
                    }
                    else if (fetchedDeal.price_new != currentDeal.price_new && (Math.abs(fetchedDeal.price_new - currentDeal.price_new) > 0.1)) { //10 centavos de diferenca
                        //Case 3 (Alterar para novos pre??os no BD, manter resto)
                        operationInfo.updated++;
                        if (debug) console.log('Case 3 -> Price needs adjustment: ' + fetchedDeal.shop.id + ' (game ' + game.plain + ') '
                            + '[from ' + currentDeal.price_new + ' to ' + fetchedDeal.price_new + '] ');
                        currentDeal.price_new = fetchedDeal.price_new;
                        currentDeal.price_old = fetchedDeal.price_old;
                        currentDeal.url = fetchedDeal.url;
                        await this.updateDeal(currentDeal);
                    } else {
                        //Case 1.A (Nao faz nada, somente printa no console se debug for true)
                        if (currentDeal.url != null && debug) console.log('Case 1 -> Deal from ' + fetchedDeal.shop.id + ' (game ' + game.plain + ') didnt change. ');
                        //CASE 1.B (Aproveita para atualizar a url da deal, caso ainda nao esteja presente no bd)
                        else if (currentDeal.url == null) {
                            currentDeal.url = fetchedDeal.url;
                            await this.updateDeal(currentDeal);
                            if (debug) console.log('Case 1 -> Deal from ' + fetchedDeal.shop.id + ' (game ' + game.plain + ') updated only URL. ');
                        }
                    }
                } else { //caso esta deal nao conste mais nas deals atuais
                    //Case 4 (Alterar para current_deal = 0 e unreachable = 1 no BD)
                    operationInfo.unreachable++;
                    if (debug) console.log('Case 4 -> Deal from ' + currentDeal.id_itad + ' (game ' + game.plain + ') IS NOT AVAILABLE ANYMORE. ');
                    currentDeal.current_deal = 0;
                    currentDeal.unreachable = 1;
                    await this.updateDeal(currentDeal);
                }
            }
            for (var [shop, info] of Object.entries(fetchedDeals)) {
                var isNewStoreDeal = true;
                for (currentDeal of currentDeals) {
                    if (currentDeal.id_itad == shop) {
                        isNewStoreDeal = false;
                    }
                }
                if (isNewStoreDeal) {
                    //Case 5 (Inserir nova deal no BD)
                    operationInfo.new++;
                    //caso desconto seja maior que zero, adiciona a array de novas ofertas
                    if (info.price_cut > 0) operationInfo.newOffers.push(info);
                    if (debug) console.log('Case 5 -> GAME [' + game.plain + '] HAS NEW STORE DEAL (' + info.shop.id + ')! ');
                    var storeInfo = await this.returnStore(shop);
                    var newDeal = {
                        id_itad: shop,
                        id_game: gameID,
                        id_store: storeInfo['id'],
                        price_new: info.price_new,
                        price_old: info.price_old,
                        price_cut: info.price_cut,
                        url: info.url
                    };
                    await this.insertDeal(newDeal);
                }
            }
        } else {
            console.log('ERROR: EMPTY PLAIN! ');
        }
        return operationInfo; //retorna informacoes sobre as operacoes realizadas nas deals deste jogo
    }


    //sinaliza no bd o jogo como preco duplicado e retorna booleano se deve ou nao escolher o preco gratuito
    async flagDuplicatePrice(gameID, debug = true) {
        if (debug) console.log('Flagging duplicate price (GameID: ' + gameID + ')... ');
        const conn = await this.connect();
        //sinaliza como preco duplicado
        var sql = "UPDATE games SET duplicate_price = 1 WHERE id = ? LIMIT 1";
        await conn.query(sql, [gameID]);
        //verifica se o jogo deve aceitar o preco gratuito como preco correto
        sql = "SELECT not_free FROM games WHERE id = ? LIMIT 1";
        var notFree = await conn.query(sql, [gameID]);
        return notFree;
    }


    //insere um registro avulso de preco de jogo no bd
    async insertDeal(deal, debug = true) {
        if (debug) console.log('Inserting deal into database... ');
        var currentDate = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data atual
        const conn = await this.connect();
        var sql = "INSERT INTO deals(id_game, id_store, price_new, price_old, "
            + "price_cut, current_deal, url, inserted_at) VALUES(?,?,?,?,?,?,?,?)";
        var values = [deal.id_game, deal.id_store, deal.price_new, deal.price_old, deal.price_cut, 1, deal.url, currentDate];
        await conn.query(sql, values).then(() => {
            if (debug) console.log('Inserted deal [' + deal.id_itad + ' -> game_id ' + deal.id_game + '] into database!');
        });
    }


    //insere registro de loja no bd
    async insertStore(store, debug = true) {
        if (debug) console.log('Inserting store [' + store.title + '] into database... ');
        var currentDate = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data atual
        const conn = await this.connect();
        var sql = 'INSERT into stores(id_itad, title, color, inserted_at) VALUES(?,?,?,?);';
        var values = [store.id, store.title, store.color, currentDate];
        return await conn.query(sql, values).then(() => {
            if (debug) console.log('Inserted store [' + store.title + '] into database!');
        }).catch(e => {
            console.log('Error inserting store [' + store.title + '] into database: \n' + e);
            exit();
        });
    }


    //retorna precos de um jogo com base no id do jogo
    //caso currentDealsOnly = true, retorna apenas as ofertas atuais
    async returnGameDeals(gameID, currentDealsOnly = false, debug = true) {
        var where = currentDealsOnly ? 'AND current_deal = 1' : '';
        const conn = await this.connect();
        var sql = 'SELECT d.*, s.id_itad FROM deals AS d INNER JOIN stores AS s '
            + 'ON(d.id_store = s.id) WHERE id_game = ? AND id_store IN ('
            + config.storesFilter + ') ' + where + ' ORDER BY inserted_at DESC';
        const [rows] = await conn.query(sql, [gameID]).catch(e => console.log(e));
        return rows;
    }


    //retorna loja com base no id_itad (plain) informado
    async returnStore(idITAD, debug = true) {
        const conn = await this.connect();
        const [rows] = await conn.query('SELECT * FROM stores WHERE id_itad = ? LIMIT 1', [idITAD]);
        if (rows.length > 0) { //se ja houver a loja no bd
            return rows[0];
        }
        return false;
    }


    //retorna lsita de plains das lojas no filtro
    async returnStoreFilterPlains() {
        const conn = await this.connect();
        const [rows] = await conn.query('SELECT id_itad FROM stores WHERE id IN (' + config.storesFilter + ')');
        var storePlains = [];
        for (var row of rows) {
            storePlains.push(row.id_itad);
        }
        return storePlains;
    }


    //atualiza registro de game no bd
    async updateGame(game, debug = true) {
        var currentDate = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data atual
        const conn = await this.connect();
        var sql = 'UPDATE games SET igdb_id = ?, name = ?, slug = ?, plain = ?, '
            + 'duplicate_plain = ?, duplicate_checked = ?, category = ?, '
            + 'status = ?, parent_game = ?, similar_games = ?, igdb_cover = ?, updated_at = ?,'
            + 'active = ? WHERE id = ? LIMIT 1';
        var duplicate_plain = game.duplicate_plain ? game.duplicate_plain : null;
        var duplicate_checked = game.duplicate_checked ? game.duplicate_checked : null;
        var values = [game.igdb_id, game.name, game.slug, game.plain,
            duplicate_plain, duplicate_checked, game.category, game.status,
        game.parent_game, game.similar_games, game.igdb_cover, currentDate, game.active, game.id];
        return await conn.query(sql, values).then(() => {
            if (debug) console.log('UPDATED game [' + game.name + ']!');
        });
    }


    //atualiza o rating count do jogo no bd
    async updateGameRating(igdbID, ratingCount, debug = true) {
        var currentDate = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data atual
        const conn = await this.connect();
        var sql = 'UPDATE games SET rating_count = ?, updated_at = ? WHERE igdb_id = ? LIMIT 1';
        var values = [ratingCount, currentDate, igdbID];
        return await conn.query(sql, values).then(() => {
            if (debug) console.log('UPDATED game rating count [' + igdbID + ' -> ' + ratingCount + ']!');
        });
    }


    //atualiza registro de preco-loja no bd
    async updateDeal(deal, debug = true) {
        const conn = await this.connect();
        var sql = 'UPDATE deals SET price_new = ?, price_old = ?, price_cut = ?, '
            + 'current_deal = ?, url = ?, unreachable = ? WHERE id = ? LIMIT 1';
        var values = [deal.price_new, deal.price_old, deal.price_cut, deal.current_deal, deal.url, deal.unreachable, deal.id];
        return await conn.query(sql, values).then(() => {
            if (debug) console.log('UPDATED deal [' + deal.id_itad + ' -> game_id ' + deal.id_game + ']!');
        });
    }


    //retorna todos os games do bd a partir do id informado (por padrao 1)
    //cada jogo possui 2 tipos de identificador, id e igdb_id
    //id -> primary key utilizada pelo bd, igdb_id -> id utilizada pela api IGDB
    async returnAllGames(idIndex = 1, igdb_id = false, fields = ' * ', where = '', debug = true) {
        if (debug) process.stdout.write('Returning all games from database... ');
        const conn = await this.connect();
        let idType = igdb_id ? 'igdb_id' : 'id'; //define o tipo de id da query
        if (where != '') where = ' AND ' + where; //condicao where
        const [rows] = await conn.query('SELECT ' + fields + ' FROM games WHERE ' + idType + ' >= ?' + where, idIndex);
        if (debug) process.stdout.write('  -> ' + rows.length + ' games returned.\n');
        return rows;
    }


    //retorna todos jogos que estao em alguma wishlist (id do jogo e id do usuario)
    async returnAllGamesInWishlists(debug = true) {
        if (debug) process.stdout.write('Returning all games in wishlists from database... ');
        const conn = await this.connect();
        var sql = 'SELECT wg.id_game, u.id AS id_user FROM wishlist_games AS wg INNER JOIN wishlists '
            + 'AS w ON (wg.id_wishlist = w.id) INNER JOIN users AS u ON (w.id_user = u.id) ORDER BY id_game ASC'
        const [rows] = await conn.query(sql);
        if (debug) process.stdout.write('  -> ' + rows.length + ' games + wishlists returned.\n');
        return rows;
    }


    ////retorna do bd todos os games e suas deals atuais a partir do id informado (por padrao 1)
    //utilizado para comparar se ha novos precos (newDealsCheck)
    async returnAllGameDeals(idIndex = 1, fields = ' * ', debug = true) {
        if (debug) process.stdout.write('Returning all games+deals from database... ');
        const conn = await this.connect();
        const [rows] = await conn.query('SELECT ' + fields + ' FROM game_deals WHERE id_store IN (' +
            config.storesFilter + ') AND id_game >= ?', idIndex);
        if (debug) process.stdout.write('  -> ' + rows.length + ' games returned.\n');
        return rows;
    }


    //retorna game do bd de acordo com o id informado
    async returnGameByID(id, igdb_id = false, fields = ' * ', debug = true) {
        if (debug) process.stdout.write('Returning game with ID ' + id + ' from database...');
        const conn = await this.connect();
        let idType = igdb_id ? 'igdb_id' : 'id'; //tipo de id
        const [rows] = await conn.query('SELECT ' + fields + ' FROM games WHERE ' + idType + ' = ? LIMIT 1', [id]);
        if (rows.length > 0 && debug) process.stdout.write('  -> Returned game [' + rows[0].name + '].');
        else if (debug) process.stdout.write(' -> NOT FOUND.');
        return rows;
    }


    //retorna o id do jogo de acordo com a plain informada
    async returnIDByPlain(plain, igdb_id = false, debug = true) {
        if (debug) process.stdout.write('Returning ID with plain = \'' + plain + '\' from database...');
        const conn = await this.connect();
        let idType = igdb_id ? 'igdb_id' : 'id'; //tipo de id
        const [rows] = await conn.query('SELECT ' + idType + ' FROM games WHERE plain = ? && active = 1 LIMIT 1', [plain]);
        if (rows.length > 0 && debug) process.stdout.write('  -> Returned ID [' + rows[0].id + '].\n');
        else if (debug) process.stdout.write(' -> NOT FOUND.');
        return rows[0]['id'];
    }


    //retorna ultimos games inseridos no bd
    async returnLatestGames(limit, debug = true) {
        if (debug) process.stdout.write('Returning last game from database...');
        const conn = await this.connect();
        const [rows] = await conn.query('SELECT * FROM games ORDER BY id DESC LIMIT ' + limit);
        if (rows.length > 0) {
            if (rows.length > 1 && debug) process.stdout.write('  -> Returned [' + rows[0].name + '] and other '
                + (rows.length - 1) + ' games.\n');
            else if (debug) process.stdout.write('  -> Returned game [' + rows[0].name + '].\n');
            return rows;
        }
        if (debug) process.stdout.write(' -> NO GAMES FOUND.');
        return null;
    }


    //procura no bd por plains duplicadas, marca a flag e retorna os jogos correspondentes
    async checkDuplicatePlains(debug = true) {
        var newDuplicates = 0;
        if (debug) process.stdout.write('Checking for duplicate plains...');
        const conn = await this.connect();
        const [rows] = await conn.query('SELECT * FROM games GROUP BY plain HAVING COUNT(plain) > 1');
        if (rows.length > 0) { //se houverem jogos com plains duplicadas
            var currentDate = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss'); //formata data atual
            for (var game of rows) {//para cada jogo com plain duplicada
                if (!game.duplicate_plain) {//se a flag duplicate_plain ainda nao estiver marcada
                    await conn.query('UPDATE games SET duplicate_plain = 1, updated_at = ?  WHERE plain = ?',
                        [currentDate, game.plain]); //marca a flag duplicate_plain e atualiza
                    if (debug) console.log('UPDATED plain [' + game.plain + '] set duplicate_plain = true!');
                    newDuplicates++;
                }
            }
            if (debug) console.log('Finished updating games. (' + newDuplicates + ' new duplicate plains)');
        }
        else if (debug) process.stdout.write('  -> No duplicate plains found. \n');
        return newDuplicates;
    }


    //confere no bd se existem jobs em andamento
    async checkRunningJobs(debug = true) {
        if (debug) process.stdout.write('Checking for running jobs...');
        const conn = await this.connect();
        const [rows] = await conn.query('SELECT * FROM jobs WHERE status = "running" LIMIT 1');
        if (rows.length > 0) { //se houverem jobs com status 'running' (em andamento)
            if (debug) process.stdout.write('Running job found!\n');
            var msg = 'Job (ID: ' + rows[0].id + ') still running.';
            return msg; //retorna msg de erro de job ainda em andamento
        }
        return false;
    }


    //insere registro de schedule job no bd
    async insertJob(job, debug = true) {
        const conn = await this.connect();
        var sql = 'INSERT INTO jobs(job_type,start_time,end_time,status,msg,ambient) VALUES(?,?,?,?,?,?);';
        var values = [job.jobType, job.startTime, job.endTime, job.status, job.msg, job.ambient];
        return await conn.query(sql, values).then((result) => {
            if (debug) console.log('Inserted job [' + job.jobType + '] into database!');
            return result;
        }).catch(e => {
            console.log('Error inserting job [' + job.jobType + '] into database: \n' + e);
            exit();
        });
    }


    //atualiza registro de schedule job no bd
    async updateJob(job, debug = true) {
        const conn = await this.connect();
        var sql = 'UPDATE jobs SET job_type = ?, end_time = ?, status = ?, '
            + 'msg = ?, ambient = ? WHERE id = ? LIMIT 1';
        var values = [job.jobType, job.endTime, job.status, job.msg, job.ambient, job.id];
        return await conn.query(sql, values).then(() => {
            if (debug) console.log('UPDATED job [' + job.jobType + ' -> id ' + job.id + ']!');
        }).catch(e => {
            console.log('Error UPDATING job [' + job.jobType + ' -> id ' + job.id + ']: \n' + e);
            exit();
        });
    }




}

module.exports = DB;

