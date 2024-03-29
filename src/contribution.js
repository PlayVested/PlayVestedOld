const cacheUtils = require('./cacheUtils');
const DBUtils = require('./DBUtils');
const messageUtils = require('./messageUtils');
const uuidv4 = require('uuid/v4');

function authenticateContribution(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        messageUtils.reportError(res, 'Manipulating contribution data requires an active user!');
        res.redirect('/');
    }
}

function registerContributionEndpoints(app) {
    // hitting it without an ID will load all valid contributions for the active user
    app.get('/contribution', authenticateContribution, (req, res) => {
        cacheUtils.cacheContributions(req, res);
    });

    app.get('/create_contribution', authenticateContribution, (req, res) => {
        res.render('create_contribution');
    });

    app.post('/create_contribution', authenticateContribution, (req, res) => {
        const contribution = {
            id: uuidv4(),
            user_id: req.session.user.id,
            game_id: req.body.game_id,
            invest_id: req.body.invest_id,
            amount: req.body.amount,
        };

        const sql = `
            INSERT INTO
               contribution (id, user_id, game_id, invest_id, timestamp, amount)
            VALUES (
               '${contribution.id}',
               '${contribution.user_id}',
               '${contribution.game_id}',
               '${contribution.invest_id}',
               CURRENT_TIMESTAMP,
               '${contribution.amount}'
            )`;
        DBUtils.runQuery(sql).then(
            (createResults) => {
                cacheUtils.cacheContributions(req, res);
            },
            DBUtils.defaultErrorHandler
        );
    });

    // these are duplicates
    // correct RESTful way is to use 'delete' as a verb, but HTML links can't do that, so I'm cheating for now
    // remove the second version once the front end is in better shape
    app.delete('/contribution/:id', authenticateContribution, (req, res) => {
        DBUtils.runQuery(`DELETE FROM contribution WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/contribution');
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.get('/delete_contribution/:id', authenticateContribution, (req, res) => {
        DBUtils.runQuery(`DELETE FROM contribution WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/contribution');
            },
            DBUtils.defaultErrorHandler
        );
    });
}

module.exports = {
    registerEndpoints: registerContributionEndpoints
};
