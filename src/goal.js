function authenticateGoal(req, res, next) {
    if (req.session.user && req.session.goal) {
        next();
    } else {
        reportError(res, 'Access denied!');
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
        runQuery(sql).then(
            (goalResults) => {
                if (goalResults instanceof Array && goalResults.length === 1) {
                    // store the goal in the session
                    req.session.goal = goalResults[0];

                    // massage the dates to be a more readable format
                    req.session.goal.create_date = new Date(req.session.goal.create_date).toLocaleDateString('en');

                    // now render the goal info
                    res.redirect('/goal');
                } else {
                    reportError(res, 'Failed to find goal, please try again');
                    res.redirect('/');
                }
            }
        ).catch((error) => {
            defaultErrorHandler(error, res);
        });
    });

    // hitting it without an ID will assume there is a goal loaded already
    app.get('/goal', authenticateGoal, (req, res) => {
        res.render('goal');
    });

    app.post('/goal', authenticateGoal, (req, res) => {
        if (req.body.goal_id !== req.session.goal.id) {
            reportError(res, `Request to update goal doesn't match active goal`);
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
        runQuery(sql).then(
            (updateResults) => {
                // update the list of goals stored in the session
                cacheUserList(req.session.user, 'goal').then(
                    (cacheResult) => {
                        reportSuccess(res, `Updated ${req.body.name}`);
                        res.redirect(`/goal/${req.body.id}`);
                    }
                ).catch((error) => {
                    defaultErrorHandler(error, res);
                });
            }
        ).catch((error) => {
            defaultErrorHandler(error, res);
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
            reportError(res, 'Invalid name');
            res.redirect('back');
            return;
        }

        // check if the goal name is already in use
        runQuery(`SELECT * FROM goal WHERE name = '${goalName}'`).then(
            (goalResults) => {
                clearStatusMessages();

                if (goalResults && goalResults.length > 0) {
                    reportError(res, 'Name already taken');
                    res.redirect('back');
                    return;
                }

                const goal = {
                    id: uuidv4(),
                    owner_id: req.session.user.id,
                    invest_id: req.body.invest_id,
                    amount: req.body.amount,
                    name: goalName,
                    zip_code: req.body.zip_code,
                    private: (req.body.visibility === 'Private' ? 1 : 0),
                };

                // wait for all DB entries to be made before moving on to the next page
                const sql = `
                    INSERT INTO goal (
                        id,
                        owner_id,
                        invest_id,
                        amount,
                        name,
                        create_date,
                        zip_code,
                        private
                    ) VALUES (
                        '${goal.id}',
                        '${goal.owner_id}',
                        '${goal.invest_id}',
                        '${goal.amount}',
                        '${goal.name}',
                        CURRENT_TIMESTAMP,
                        '${goal.zip_code}',
                        '${goal.private}'
                    )`;
                runQuery(sql).then(
                    (allResults) => {
                        // update the list of goals stored in the session
                        cacheTable(req, 'goal', `WHERE private = '0'`).then(
                            (cacheResult) => {
                                // let them know it worked
                                reportSuccess(res, `Successfully created goal ${goalName}`);

                                // send them to the goal page so they can join the group immediately
                                res.redirect(`/goal/${goal.id}`);
                            }
                        ).catch((error) => {
                            defaultErrorHandler(error, res);
                        });
                    },
                    (err) => {
                        reportError(res, `Error creating goal: ${err}`);

                        // if either fails, delete them both
                        runQuery(`DELETE FROM goal WHERE id = '${goal.id}'`).then(
                            (result) => {
                                console.log(`successfully deleted goal: ${result}`)
                                res.redirect('back');
                            }
                        ).catch((error) => {
                            defaultErrorHandler(error, res);
                        });
                    }
                );
            }
        ).catch((error) => {
            defaultErrorHandler(error, res);
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

        const promises = [runQuery(user_sql), runQuery(goal_sql)];
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
                runQuery(join_sql).then(
                    (response) => {
                        reportSuccess(res, 'Successfully joined goal');
                        cacheUserGoals(user);
                        res.redirect('find_goals');
                    }
                ).catch((error) => {
                    defaultErrorHandler(error, res);
                });
            }
        ).catch((error) => {
            defaultErrorHandler(error, res);
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

        const promises = [runQuery(user_sql), runQuery(goal_sql)];
        Promise.all(promises).then(
            (allResults) => {
                const join_sql = `
                    DELETE FROM
                        connection
                    WHERE
                        user_id = '${req.body.user_id}' AND
                        connection_id = '${req.body.goal_id}'`;
                runQuery(join_sql).then(
                    (response) => {
                        reportSuccess('Successfully left goal');
                        cacheUserGoals(user);
                        res.redirect('user');
                    }
                ).catch((error) => {
                    defaultErrorHandler(error, res);
                });
            }
        ).catch((error) => {
            defaultErrorHandler(error, res);
        });
    });

    // display all goals that are active
    app.get('/find_goals', (req, res) => {
        res.render('find_goals');
    });
}