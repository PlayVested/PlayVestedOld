function authenticateGame(req, res, next) {
    if (req.session.user && req.session.game) {
        next();
    } else {
        reportError(res, 'Access denied!');
        res.redirect('/');
    }
}

function registerGameEndpoints(app) {
    app.use((req, res, next) => {
        res.locals.game = {}
        if (req.session.game) {
            res.locals.game = req.session.game;

            // do some validation of the data
            if (req.session.game.tier instanceof Array) {
                var lastContribution = -1;
                for (var t of req.session.game.tier) {
                    if (lastContribution > t.contribution) {
                        console.warn(`Found an error with contribution`);
                        reportError(res, `Contribution does not appear to be ordered correctly, please double check`);
                    }
                    lastContribution = t.contribution;
                }
            }
        }

        next();
    });

    // hitting this endpoint with a specific ID will replace the game data stored in the session
    app.get('/game/:id', (req, res, next) => {
        const sql =
            `SELECT ` +
                `game.id, game.name, game.decay_rate, permission.is_admin ` +
            `FROM ` +
                `game ` +
            `JOIN ` +
                `permission ` +
            `ON ` +
                `permission.game_id = game.id ` +
            `WHERE ` +
                `permission.user_id = '${req.session.user.id}' AND ` +
                `game.id = '${req.params.id}'`;
        runQuery(sql).then(
            (gameResults) => {
                if (gameResults instanceof Array && gameResults.length === 1) {
                    // store the game in the session
                    req.session.game = gameResults[0];

                    // now load reward tier data for the given game
                    res.redirect('/tier');
                } else {
                    reportError(res, 'Failed to find game, please try again');
                    res.redirect('/');
                }
            },
            defaultErrorHandler
        );
    });

    // hitting it without an ID will assume there is a game loaded already
    app.get('/game', authenticateGame, (req, res) => {
        res.render('game');
    });

    app.post('/game', authenticateGame, (req, res) => {
        if (req.body.id !== req.session.game.id) {
            reportError(res, `Request to update game doesn't match active game`);
            req.redirect('back');
            return;
        }

        runQuery(`UPDATE game SET name = '${req.body.name}', decay_rate = '${req.body.decay_rate}' WHERE id = '${req.body.id}'`).then(
            (updateResults) => {
                // update the list of games stored in the session
                cacheUserList(req.session.user, 'game').then(
                    (cacheResult) => {
                        reportSuccess(res, `Updated ${req.body.name}`);
                        res.redirect(`/game/${req.body.id}`);
                    },
                    defaultErrorHandler
                );
            },
            defaultErrorHandler
        );
    });

    app.get('/create_game', (req, res) => {
        res.render('create_game');
    });

    app.post('/create_game', (req, res) => {
        const gameName = req.body.name;
        if (!module.parent) {
            console.log(`received request to create new game ${gameName}...`);
        }
    
        // validate the inputs
        if (!gameName) {
            reportError(res, 'Invalid name');
            res.redirect('back');
            return;
        }

        // check if the game name is already in use
        runQuery(`SELECT * FROM game WHERE name = '${gameName}'`).then(
            (gameResults) => {
                clearStatusMessages();

                if (gameResults && gameResults.length > 0) {
                    reportError(res, 'Name already taken');
                    res.redirect('back');
                    return;
                }

                var promises = [];
                const game = {
                    id: uuidv4(),
                    name: gameName,
                    decay_rate: req.body.decay_rate,
                };

                // wait for all DB entries to be made before moving on to the next page
                promises.push(runQuery(`INSERT INTO game (id, name, decay_rate) VALUES ('${game.id}', '${game.name}', '${game.decay_rate}')`));
                promises.push(runQuery(`INSERT INTO permission (id, user_id, game_id, is_admin) VALUES ('${uuidv4()}', '${req.session.user.id}', '${game.id}', '1')`));
                Promise.all(promises).then(
                    (allResults) => {
                        runQuery(`SELECT * FROM game WHERE id = '${game.id}'`).then(
                            (gameResults) => {
                                // we expect a single result, anything else is an error
                                if (!(gameResults instanceof Array) || gameResults.length !== 1) {
                                    throw new Error('Found too many games');
                                    return;
                                }

                                // update the list of games stored in the session
                                cacheUserList(req.session.user, 'game').then(
                                    (cacheResult) => {
                                        // let them know it worked
                                        reportSuccess(res, `Successfully created game ${gameName}`);

                                        // send them to the game page so they can edit tier info immediately
                                        req.session.game = gameResults[0];
                                        res.redirect('/game');
                                    },
                                    defaultErrorHandler
                                );
                            },
                            defaultErrorHandler
                        );
                    },
                    (err) => {
                        // if either fails, delete them both
                        promises = [];
                        promises.push(runQuery(`DELETE FROM game WHERE id = '${game.id}'`));
                        promises.push(runQuery(`DELETE FROM permission WHERE user_id = '${req.session.user.id}' AND game_id = '${game.id}'`));
                        Promise.all(promises).then(
                            defaultErrorHandler,
                            defaultErrorHandler
                        );
                    }
                );
            },
            defaultErrorHandler
        );
    });

    app.get('/games', (req, res) => {
        runQuery(`SELECT name FROM game`).then(
            (gameResults) => {
                var names = 'Current Games:<br>';
                for (var game of gameResults) {
                    names += game.name + '<br>';
                }
                res.send(names);
            },
            defaultErrorHandler
        );
    });
}
