const cacheUtils = require('./cacheUtils');
const DBUtils = require('./DBUtils');
const messageUtils = require('./messageUtils');
const uuidv4 = require('uuid/v4');

function authenticateInvestment(req, res, next) {
    if (req.session.user && req.session.invest) {
        next();
    } else {
        messageUtils.reportError(res, 'Access denied!');
        res.redirect('/');
    }
}

function registerInvestmentEndpoints(app) {
    // hitting this endpoint with a specific ID will replace the investment data stored in the session
    app.get('/invest/:id', (req, res, next) => {
        const sql = `
            SELECT
                invest.id, invest.name, permission.is_admin
            FROM
                invest
            JOIN
                permission
            ON
                permission.other_id = invest.id
            WHERE
                permission.user_id = '${req.session.user.id}' AND
                invest.id = '${req.params.id}'`;
        DBUtils.runQuery(sql).then(
            (investResults) => {
                if (investResults instanceof Array && investResults.length === 1) {
                    // store the investment in the session
                    req.session.invest = investResults[0];
                    res.redirect('/invest');
                } else {
                    messageUtils.reportError(res, 'Failed to find investment, please try again');
                    res.redirect('/');
                }
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.post('/invest', authenticateInvestment, (req, res) => {
        if (req.body.id !== req.session.invest.id) {
            messageUtils.reportError(res, `Request to update investment doesn't match active investment`);
            req.redirect('back');
            return;
        }

        DBUtils.runQuery(`UPDATE invest SET name = '${req.body.name}' WHERE id = '${req.body.id}'`).then(
            (updateResults) => {
                // update the list of investments stored in the session
                cacheUtils.cacheUserPermissions(req.session.user, 'invest').then(
                    (cacheResult) => {
                        messageUtils.reportSuccess(res, `Updated ${req.body.name}`);
                        res.redirect(`/invest/${req.body.id}`);
                    },
                    DBUtils.defaultErrorHandler
                );
            },
            DBUtils.defaultErrorHandler
        );
    });

    // hitting it without an ID will assume there is a investment loaded already
    app.get('/invest', authenticateInvestment, (req, res) => {
        res.render('invest');
    });

    app.get('/create_invest', (req, res) => {
        res.render('create_invest');
    });

    app.post('/create_invest', (req, res) => {
        const investName = req.body.name;
        if (!module.parent) {
            console.log(`received request to create new investment ${investName}...`);
        }
    
        // validate the inputs
        if (!investName) {
            messageUtils.reportError(res, 'Invalid name');
            res.redirect('back');
            return;
        }

        // check if the investment name is already in use
        DBUtils.runQuery(`SELECT * FROM invest WHERE name = '${investName}'`).then(
            (investResults) => {
                messageUtils.clearStatusMessages();

                if (investResults && investResults.length > 0) {
                    messageUtils.reportError(res, 'Name already taken');
                    res.redirect('back');
                    return;
                }

                var promises = [];
                const invest = {
                    id: uuidv4(),
                    name: investName,
                };

                // wait for all DB entries to be made before moving on to the next page
                promises.push(DBUtils.runQuery(`INSERT INTO invest (id, name) VALUES ('${invest.id}', '${invest.name}')`));
                promises.push(DBUtils.runQuery(`INSERT INTO permission (id, user_id, other_id, is_admin) VALUES ('${uuidv4()}', '${req.session.user.id}', '${invest.id}', '1')`));
                Promise.all(promises).then(
                    (allResults) => {
                        // update the list of investments stored in the session
                        promises = [];
                        promises.push(cacheUtils.cacheTable(req, 'invest'));
                        promises.push(cacheUtils.cacheUserPermissions(req.session.user, 'invest'));
                        Promise.all(promises).then(
                            (cacheResult) => {
                                // let them know it worked
                                messageUtils.reportSuccess(res, `Successfully created investment ${investName}`);

                                // send them to the investment page so they can edit the info immediately
                                req.session.invest = invest;
                                res.redirect('/invest');
                            },
                            DBUtils.defaultErrorHandler
                        );
                    },
                    (err) => {
                        // if either fails, delete them both
                        promises = [];
                        promises.push(DBUtils.runQuery(`DELETE FROM invest WHERE id = '${invest.id}'`));
                        promises.push(DBUtils.runQuery(`DELETE FROM permission WHERE user_id = '${req.session.user.id}' AND other_id = '${invest.id}'`));
                        Promise.all(promises).then(
                            DBUtils.defaultErrorHandler,
                            DBUtils.defaultErrorHandler
                        );
                    }
                );
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.get('/investments', (req, res) => {
        DBUtils.runQuery(`SELECT name FROM invest`).then(
            (investResults) => {
                var names = 'Current Investments:<br>';
                for (var invest of investResults) {
                    names += invest.name + '<br>';
                }
                res.send(names);
            },
            DBUtils.defaultErrorHandler
        );
    });
}

module.exports = {
    registerEndpoints: registerInvestmentEndpoints
};
