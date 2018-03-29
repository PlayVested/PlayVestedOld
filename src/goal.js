const cacheUtils = require('./cacheUtils');
const DBUtils = require('./DBUtils');
const messageUtils = require('./messageUtils');
const uuidv4 = require('uuid/v4');

function authenticateGoal(req, res, next) {
    if (req.session.user && req.session.goal) {
        next();
    } else {
        messageUtils.reportError(res, 'Access denied!');
        res.redirect('/');
    }
}

function registerGoalEndpoints(app) {
    // hitting this endpoint with a specific ID will replace the goal data stored in the session
    app.get('/goal/:id', (req, res, next) => {
        const sql = `
            SELECT
                goal.id, goal.name, goal.amount, goal.create_date, goal.finish_date
            FROM
                goal
            WHERE
                goal.id = '${req.params.id}'`;
        DBUtils.runQuery(sql).then(
            (goalResults) => {
                if (goalResults instanceof Array && goalResults.length === 1) {
                    // store the goal in the session
                    req.session.goal = goalResults[0];

                    // massage the dates to be a more readable format
                    req.session.goal.create_date = new Date(req.session.goal.create_date).toLocaleDateString('en');

                    // now render the goal info
                    res.redirect('/goal');
                } else {
                    messageUtils.reportError(res, 'Failed to find goal, please try again');
                    res.redirect('/');
                }
            }
        ).catch((error) => {
            DBUtils.defaultErrorHandler(error, res);
        });
    });

    // hitting it without an ID will assume there is a goal loaded already
    app.get('/goal', authenticateGoal, (req, res) => {
        res.render('goal');
    });

    app.post('/goal', authenticateGoal, (req, res) => {
        if (req.body.goal_id !== req.session.goal.id) {
            messageUtils.reportError(res, `Request to update goal doesn't match active goal`);
            req.redirect('back');
            return;
        }

        const sql = `
            UPDATE goal SET
                name = '${req.body.name}',
                invest_id = '${req.body.invest_id}',
                amount = '${req.body.amount}',
                zip_code = '${req.body.zip_code}',
                private = '${req.body.visibility === 'Private' ? 1 : 0}'
            WHERE id =
                ${req.body.id}'`;
        DBUtils.runQuery(sql).then(
            (updateResults) => {
                // update the list of goals stored in the session
                cacheUtils.cacheUserPermissions(req.session.user, 'goal').then(
                    (cacheResult) => {
                        messageUtils.reportSuccess(res, `Updated ${req.body.name}`);
                        res.redirect(`/goal/${req.body.id}`);
                    }
                ).catch((error) => {
                    DBUtils.defaultErrorHandler(error, res);
                });
            }
        ).catch((error) => {
            DBUtils.defaultErrorHandler(error, res);
        });
    });

    app.get('/create_goal', (req, res) => {
        res.render('create_goal');
    });

    app.post('/create_goal', (req, res) => {
        const goalName = req.body.name;
        if (!module.parent) {
            console.log(`received request to create new goal ${goalName}...`);
        }
    
        // validate the inputs
        if (!goalName) {
            messageUtils.reportError(res, 'Invalid name');
            res.redirect('back');
            return;
        }

        // check if the goal name is already in use
        DBUtils.runQuery(`SELECT * FROM goal WHERE name = '${goalName}'`).then(
            (goalResults) => {
                messageUtils.clearStatusMessages();

                if (goalResults && goalResults.length > 0) {
                    messageUtils.reportError(res, 'Name already taken');
                    res.redirect('back');
                    return;
                }

                const goal = {
                    id: uuidv4(),
                    invest_id: req.body.invest_id,
                    amount: req.body.amount,
                    name: goalName,
                    zip_code: req.body.zip_code,
                    private: (req.body.visibility === 'Private' ? 1 : 0),
                };

                // wait for all DB entries to be made before moving on to the next page
                const goal_sql = `
                    INSERT INTO goal (
                        id,
                        invest_id,
                        amount,
                        name,
                        create_date,
                        zip_code,
                        private
                    ) VALUES (
                        '${goal.id}',
                        '${goal.invest_id}',
                        '${goal.amount}',
                        '${goal.name}',
                        CURRENT_TIMESTAMP,
                        '${goal.zip_code}',
                        '${goal.private}'
                    )`;
                const permission_sql = `
                    INSERT INTO permission (
                        id,
                        user_id,
                        other_id,
                        is_admin
                    ) VALUES (
                        '${uuidv4()}',
                        '${req.session.user.id}',
                        '${goal.id}',
                        '1'
                    )`;

                var promises = [];
                promises.push(DBUtils.runQuery(goal_sql));
                promises.push(DBUtils.runQuery(permission_sql));
                Promise.all(promises).then(
                    (allResults) => {
                        // update the list of goals stored in the session
                        promises = [];
                        promises.push(cacheUtils.cacheTable(req, 'goal', `JOIN permission ON (permission.other_id = goal.id AND (goal.private = '0' OR permission.user_id = '${req.session.user.id}'))`));
                        promises.push(cacheUtils.cacheUserPermissions(req.session.user, 'game'));
                        Promise.all(promises).then(
                            (cacheResult) => {
                                // let them know it worked
                                messageUtils.reportSuccess(res, `Successfully created goal ${goalName}`);

                                // send them to the goal page so they can join the group immediately
                                res.redirect(`/goal/${goal.id}`);
                            }
                        ).catch((error) => {
                            DBUtils.defaultErrorHandler(error, res);
                        });
                    },
                    (err) => {
                        messageUtils.reportError(res, `Error creating goal: ${err}`);

                        // if either fails, delete them both
                        promises = [];
                        promises.push(DBUtils.runQuery(`DELETE FROM goal WHERE id = '${goal.id}'`));
                        promises.push(DBUtils.runQuery(`DELETE FROM permission WHERE user_id = '${req.session.user.id}' AND other_id = '${goal.id}'`));
                        Promise.all(promises).then(
                            (result) => {
                                console.log(`successfully deleted goal: ${result}`)
                                res.redirect('back');
                            }
                        ).catch((error) => {
                            DBUtils.defaultErrorHandler(error, res);
                        });
                    }
                );
            }
        ).catch((error) => {
            DBUtils.defaultErrorHandler(error, res);
        });
    });

    app.post('/join_goal', (req, res) => {
        // make sure the user and goal are both valid before bothering to store them
        const user_sql = `
            SELECT * from user
            WHERE id = '${req.body.user_id}'`;
        const goal_sql = `
            SELECT * from goal
            WHERE id = '${req.body.goal_id}'`;

        const promises = [DBUtils.runQuery(user_sql), DBUtils.runQuery(goal_sql)];
        Promise.all(promises).then(
            (allResults) => {
                const join_sql = `
                    INSERT INTO connection (
                        user_id,
                        connection_id
                    ) VALUES (
                        '${req.body.user_id}',
                        '${req.body.goal_id}'
                    )`;
                DBUtils.runQuery(join_sql).then(
                    (response) => {
                        messageUtils.reportSuccess(res, 'Successfully joined goal');
                        cacheUtils.cacheUserGoals(req.session.user);
                        res.redirect('find_goals');
                    }
                ).catch((error) => {
                    DBUtils.defaultErrorHandler(error, res);
                });
            }
        ).catch((error) => {
            DBUtils.defaultErrorHandler(error, res);
        });
    });

    app.post('/leave_goal', (req, res) => {
        // make sure the user and goal are both valid before bothering to store them
        const user_sql = `
            SELECT * from user
            WHERE id = '${req.body.user_id}'`;
        const goal_sql = `
            SELECT * from goal
            WHERE id = '${req.body.goal_id}'`;

        const promises = [DBUtils.runQuery(user_sql), DBUtils.runQuery(goal_sql)];
        Promise.all(promises).then(
            (allResults) => {
                const join_sql = `
                    DELETE FROM
                        connection
                    WHERE
                        user_id = '${req.body.user_id}' AND
                        connection_id = '${req.body.goal_id}'`;
                DBUtils.runQuery(join_sql).then(
                    (response) => {
                        messageUtils.reportSuccess('Successfully left goal');
                        cacheUtils.cacheUserGoals(req.session.user);
                        res.redirect('user');
                    }
                ).catch((error) => {
                    DBUtils.defaultErrorHandler(error, res);
                });
            }
        ).catch((error) => {
            DBUtils.defaultErrorHandler(error, res);
        });
    });

    // display all goals that are active
    app.get('/find_goals', (req, res) => {
        res.render('find_goals');
    });
}

module.exports = {
    registerEndpoints: registerGoalEndpoints
};
