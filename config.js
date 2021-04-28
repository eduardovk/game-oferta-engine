module.exports = {
    ambient: process.env.AMBIENT ? process.env.AMBIENT : "localhost",
    storesFilter: process.env.HEROKU_FILTER_STORES ? process.env.HEROKU_FILTER_STORES : '5,11,14,26,27,29,30,3,35,37,42,43'
}