// Authenticate using our plain-object database of doom!
function authenticate(name, pass, fn) {
    if (!module.parent) {
        console.log('authenticating %s: %s', name, pass);
    }

    runQuery(`SELECT * FROM user WHERE name = '${name}'`).then(
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
        defaultErrorHandler
    );
}

function cacheUserList(user, param) {
    if (!user) {
        throw new Error('user is required to be valid');
    }

    const sql =
        `SELECT ` +
            `${param}.id, ${param}.name ` +
        `FROM ` +
            `${param} ` +
        `JOIN ` +
            `permission ` +
        `ON ` +
            `permission.${param}_id = ${param}.id ` +
        `WHERE ` +
            `permission.user_id = '${user.id}' `;

    // always clear out the stored value so it doesn't remain stale if there is an issue retrieving the data
    const listName = `${param}List`;
    user[listName] = [];
    return runQuery(sql).then(
        (paramResults) => {
            user[listName] = paramResults;
        },
        defaultErrorHandler
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
            clearStatusMessages();

            if (err) {
                // 'err' should either be an Error or a string message about what went wrong
                if (err instanceof Error) {
                    throw err;
                } else if (typeof err === 'string') {
                    reportError(res, err);
                } else {
                    reportError(res, 'Authentication failed, please check your username and password');
                    throw new Error(`Unknown error: ${err}`);
                }
                res.redirect('/');
            } else if (user) {
                // Regenerate session when signing in
                // to prevent fixation
                req.session.regenerate(() => {
                    // pull info about which games/investments the user has rights to create/modify
                    var promises = [];
                    promises.push(cacheUserList(user, 'invest'));
                    promises.push(cacheUserList(user, 'game'));
                    promises.push(cacheInvestmentList(req));

                    Promise.all(promises).then(
                        (result) => { // success
                            // Store the user in the session store to be retrieved by other pages
                            req.session.user = user;
                            reportSuccess(res, 'Authenticated as ' + user.name + ' click to <a href="/logout">logout</a>');
                            res.redirect('/election'); // hit this endpoint to cache the user's election information
                        }, 
                        defaultErrorHandler
                    );
                });
            }
        });
    });
}