const contributionFuncs = require('./contribution');
const DBUtils = require('./DBUtils');
const hash = require('pbkdf2-password')();

// Authenticate using our plain-object database of doom!
function authenticate(name, pass, fn) {
    if (!module.parent) {
        console.log('authenticating %s: %s', name, pass);
    }

    DBUtils.runQuery(`SELECT * FROM user WHERE name = '${name}'`).then(
        (userResults) => {
            // we expect a single result, anything else is an error
            if (!(userResults instanceof Array) || userResults.length !== 1) {
                return fn('cannot find user');
            }

            const user = userResults[0];

            // apply the same algorithm to the POSTed password
            // applying the hash against the pass / salt
            // if there is a match we found the user
            hash({ password: pass, salt: user.salt }, (err, ret_pass, salt, hash) => {
                if (err) {
                    return fn(err);
                } else if (hash === user.hash) {
                    return fn(null, user);
                } else {
                    fn('invalid password');
                }
            });
        },
        DBUtils.defaultErrorHandler
    );
}

function cacheTable(req, tableName, custom_clause = '') {
    return DBUtils.runQuery(`SELECT ${tableName}.* FROM ${tableName} ${custom_clause}`).then(
        (tableResults) => {
            req.session.tables = req.session.tables || {};
            req.session.tables[tableName] = {};
            for (var inst of tableResults) {
                req.session.tables[tableName][inst.id] = inst;
            }
        },
        DBUtils.defaultErrorHandler
    );
}

function cacheUserPermissions(user, param) {
    if (!user) {
        throw new Error('user is required to be valid');
    }

    const sql = `
        SELECT
            ${param}.id, ${param}.name
        FROM
            ${param}
        JOIN
            permission
        ON
            permission.other_id = ${param}.id
        WHERE
            permission.user_id = '${user.id}'`;

    // always clear out the stored value so it doesn't remain stale if there is an issue retrieving the data
    const listName = `${param}List`;
    user[listName] = [];
    return DBUtils.runQuery(sql).then(
        (paramResults) => {
            user[listName] = paramResults;
        },
        DBUtils.defaultErrorHandler
    );
}

function cacheUserGoals(user) {
    if (!user) {
        throw new Error('user is required to be valid');
    }

    const selectSQL = `
        SELECT
            goal.name,
            goal.amount,
            goal.finish_date
        FROM
            goal
        `;

    const sql = 
        selectSQL + `
        JOIN
            connection ON goal.id = connection.connection_id AND
            connection.user_id = '${user.id}'
        UNION` +
        selectSQL + `
        JOIN
            permission ON goal.id = permission.other_id AND
            permission.user_id = '${user.id}' AND
            permission.is_admin = 1`;
        DBUtils.runQuery(sql).then(
            (results) => {
                console.log(`found ${results.length} goals`);
                user['goals'] = results;
                console.log(`user: ${user}`);
            },
            DBUtils.defaultErrorHandler
        );
}

function registerLoginEndpoints(app) {
    app.get('/logout', (req, res) => {
        // destroy the user's session to log them out
        // will be re-created next request
        req.session.destroy(() => {
            res.redirect('/');
        });
    });

    app.get('/login', (req, res) => {
        res.render('login');
    });

    app.post('/login', (req, res) => {
        authenticate(req.body.username, req.body.password, (err, user) => {
            DBUtils.clearStatusMessages();

            if (err) {
                // 'err' should either be an Error or a string message about what went wrong
                if (err instanceof Error) {
                    throw err;
                } else if (typeof err === 'string') {
                    DBUtils.reportError(res, err);
                } else {
                    DBUtils.reportError(res, 'Authentication failed, please check your username and password');
                    throw new Error(`Unknown error: ${err}`);
                }
                res.redirect('/');
            } else if (user) {
                // Regenerate session when signing in
                // to prevent fixation
                req.session.regenerate(() => {
                    // set the user before we try to cache info
                    req.session.user = user;

                    // pull info about which games/investments the user has rights to create/modify
                    var promises = [];
                    promises.push(cacheUserPermissions(user, 'invest'));
                    promises.push(cacheUserPermissions(user, 'game'));
                    promises.push(cacheUserPermissions(user, 'goal'));
                    promises.push(cacheTable(req, 'invest'));
                    promises.push(cacheTable(req, 'game'));
                    promises.push(cacheUserGoals(user));
                    promises.push(cacheTable(req, 'goal', `JOIN permission ON (permission.other_id = goal.id AND (goal.private = '0' OR permission.user_id = '${user.id}'))`));
                    promises.push(contributionFuncs.refreshContributionCache(req));

                    Promise.all(promises).then(
                        (result) => { // success
                            // Store the user in the session store to be retrieved by other pages
                            DBUtils.reportSuccess(res, 'Authenticated as ' + user.name + ' click to <a href="/logout">logout</a>');
                            res.redirect('/user');
                        }, 
                        DBUtils.defaultErrorHandler
                    );
                });
            }
        });
    });
}

module.exports = {
    registerEndpoints: registerLoginEndpoints
};