const cacheUtils = require('./cacheUtils');
const DBUtils = require('./DBUtils');
const hash = require('pbkdf2-password')();
const messageUtils = require('./messageUtils');

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
            messageUtils.clearStatusMessages();

            if (err) {
                // 'err' should either be an Error or a string message about what went wrong
                if (err instanceof Error) {
                    throw err;
                } else if (typeof err === 'string') {
                    messageUtils.reportError(res, err);
                } else {
                    messageUtils.reportError(res, 'Authentication failed, please check your username and password');
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
                    promises.push(cacheUtils.cacheUserPermissions(user, 'invest'));
                    promises.push(cacheUtils.cacheUserPermissions(user, 'game'));
                    promises.push(cacheUtils.cacheUserPermissions(user, 'goal'));
                    promises.push(cacheUtils.cacheTable(req, 'invest'));
                    promises.push(cacheUtils.cacheTable(req, 'game'));
                    promises.push(cacheUtils.cacheUserGoals(user));
                    promises.push(cacheUtils.cacheTable(req, 'goal', `JOIN permission ON (permission.other_id = goal.id AND (goal.private = '0' OR permission.user_id = '${user.id}'))`));
                    promises.push(cacheUtils.cacheContributions(req));

                    Promise.all(promises).then(
                        (result) => { // success
                            // Store the user in the session store to be retrieved by other pages
                            messageUtils.reportSuccess(res, 'Authenticated as ' + user.name + ' click to <a href="/logout">logout</a>');
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