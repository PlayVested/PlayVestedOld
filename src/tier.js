const cacheUtils = require('./cacheUtils');
const DBUtils = require('./DBUtils');
const messageUtils = require('./messageUtils');
const uuidv4 = require('uuid/v4');

function authenticateTier(req, res, next) {
    if (req.session.game) {
        next();
    } else {
        messageUtils.reportError(res, 'Manipulating tier data requires an active game!');
        res.redirect('/game');
    }
}

function registerTierEndpoints(app) {
    // hitting it without an ID will load all valid tiers for the active game
    app.get('/tier', authenticateTier, (req, res) => {
        cacheUtils.cacheTiers(req, res);
    });

    app.post('/tier', authenticateTier, (req, res) => {
        messageUtils.clearStatusMessages();

        var updates = [];
        if (req.body.id instanceof Array) {
            for (i in req.body.id) {
                updates.push(DBUtils.runQuery(`UPDATE tier SET contribution ='${req.body.contribution[i]}', reward ='${req.body.reward[i]}' WHERE id='${req.body.id[i]}'`));
            }
        } else {
            updates.push(DBUtils.runQuery(`UPDATE tier SET contribution ='${req.body.contribution}', reward ='${req.body.reward}' WHERE id='${req.body.id}'`));
        }

        Promise.all(updates).then(
            (allResults) => {
                messageUtils.reportSuccess(res, `Successfully updated tier data`);
                res.redirect('/tier');
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.post('/create_tier', authenticateTier, (req, res) => {
        const tier = {
            id: uuidv4(),
            game_id: req.session.game.id,
            contribution: 0,
            reward: 0,
        };

        DBUtils.runQuery(`INSERT INTO tier (id, game_id, contribution, reward) VALUES ('${tier.id}', '${tier.game_id}', '${tier.contribution}', '${tier.reward}')`).then(
            (createResults) => {
                cacheUtils.cacheTiers(req, res);
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.put('/tier', authenticateTier, (req, res) => {
        // console.log(`Got a request to update a tier`);
    });

    // these are duplicates
    // correct RESTful way is to use 'delete' as a verb, but HTML links can't do that, so I'm cheating for now
    // remove the second version once the front end is in better shape
    app.delete('/tier/:id', authenticateTier, (req, res) => {
        DBUtils.runQuery(`DELETE FROM tier WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/tier');
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.get('/delete_tier/:id', authenticateTier, (req, res) => {
        DBUtils.runQuery(`DELETE FROM tier WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/tier');
            },
            DBUtils.defaultErrorHandler
        );
    });
}

module.exports = {
    registerEndpoints: registerTierEndpoints
};
