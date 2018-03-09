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

                    // now render the goal info
                    res.redirect('/goal');
                } else {
                    reportError(res, 'Failed to find goal, please try again');
                    res.redirect('/');
                }
            },
            defaultErrorHandler
        );
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
            WHERE id =
                ${req.body.id}'`;
        runQuery(sql).then(
            (updateResults) => {
                // update the list of goals stored in the session
                cacheUserList(req.session.user, 'goal').then(
                    (cacheResult) => {
                        reportSuccess(res, `Updated ${req.body.name}`);
                        res.redirect(`/goal/${req.body.id}`);
                    },
                    defaultErrorHandler
                );
            },
            defaultErrorHandler
        );
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
                    name: goalName,
                    invest_id: 0,
                    amount: 0,
                    successful: false,
                };

                // wait for all DB entries to be made before moving on to the next page
                const sql = `
                    INSERT INTO goal (
                        id,
                        name,
                        invest_id,
                        amount,
                        create_date,
                        successful
                    ) VALUES (
                        '${goal.id}',
                        '${goal.name}',
                        '${goal.invest_id}'
                        '${goal.amount}'
                        CURRENT_TIMESTAMP
                        '${goal.successful}'
                    )`;
                runQuery(sql).then(
                    (allResults) => {
                        // update the list of goals stored in the session
                        cacheTable(req, 'goal').then(
                            (cacheResult) => {
                                // let them know it worked
                                reportSuccess(res, `Successfully created goal ${goalName}`);

                                // send them to the goal page so they can join the group immediately
                                res.redirect(`/goal/${goal.id}`);
                            },
                            defaultErrorHandler
                        );
                    },
                    (err) => {
                        // if either fails, delete them both
                        runQuery(`DELETE FROM goal WHERE id = '${goal.id}'`).then(
                            defaultErrorHandler,
                            defaultErrorHandler
                        );
                    }
                );
            },
            defaultErrorHandler
        );
    });

    // display all games that support PlayVested
    app.get('/find_goal', (req, res) => {
        res.render('find_goal');
    });
}