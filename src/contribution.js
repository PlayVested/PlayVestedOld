function authenticateContribution(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        reportError(res, 'Manipulating contribution data requires an active user!');
        res.redirect('/');
    }
}

function refreshContributionCache(req, res) {
    if (!req.session.user) {
        if (res) {
            res.redirect('/');
        }
        console.log(`failed to refresh contributions`);
        return Promise.resolve([]);
    }

    return runQuery(`SELECT game_id, invest_id, timestamp, SUM(amount) AS amount FROM contribution WHERE user_id = '${req.session.user.id}' GROUP BY invest_id, game_id ORDER BY amount DESC`).then(
        (contributionResults) => {
            req.session.user.contribution = contributionResults;
            if (res) {
                res.redirect('/user');
            }
        },
        defaultErrorHandler
    );
}

function registerContributionEndpoints(app) {
    // hitting it without an ID will load all valid contributions for the active user
    app.get('/contribution', authenticateContribution, (req, res) => {
        refreshContributionCache(req, res);
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

        const sql = 
            `INSERT INTO ` +
            `   contribution (id, user_id, game_id, invest_id, timestamp, amount) `+
            `VALUES ( ` +
            `   '${contribution.id}', ` +
            `   '${contribution.user_id}', ` +
            `   '${contribution.game_id}', ` +
            `   '${contribution.invest_id}', ` +
            `   CURRENT_TIMESTAMP, ` +
            `   '${contribution.amount}' ` +
            `)`;
        runQuery(sql).then(
            (createResults) => {
                refreshContributionCache(req, res);
            },
            defaultErrorHandler
        );
    });

    // these are duplicates
    // correct RESTful way is to use 'delete' as a verb, but HTML links can't do that, so I'm cheating for now
    // remove the second version once the front end is in better shape
    app.delete('/contribution/:id', authenticateContribution, (req, res) => {
        runQuery(`DELETE FROM contribution WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/contribution');
            },
            defaultErrorHandler
        );
    });

    app.get('/delete_contribution/:id', authenticateContribution, (req, res) => {
        runQuery(`DELETE FROM contribution WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/contribution');
            },
            defaultErrorHandler
        );
    });
}
