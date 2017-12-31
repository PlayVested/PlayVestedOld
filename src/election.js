function authenticateElection(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        reportError(res, 'Manipulating election data requires an active user!');
        res.redirect('/');
    }
}

function refreshElectionCache(req, res) {
    if (!req.session.user) {
        res.redirect('/');
    }

    runQuery(`SELECT * FROM election WHERE user_id = '${req.session.user.id}'`).then(
        (electionResults) => {
            req.session.user.election = electionResults;
            console.log(`electionResults`);
            res.redirect('/user');
        },
        defaultErrorHandler
    );
}

function registerElectionEndpoints(app) {
    // hitting it without an ID will load all valid elections for the active user
    app.get('/election', authenticateElection, (req, res) => {
        refreshElectionCache(req, res);
    });

    app.post('/election', authenticateElection, (req, res) => {
        clearStatusMessages();

        var updates = [];
        if (req.body.id instanceof Array) {
            for (i in req.body.id) {
                updates.push(runQuery(`UPDATE election SET invest_id ='${req.body.invest_id[i]}', percentage ='${req.body.percentage[i]}' WHERE id='${req.body.id[i]}'`));
            }
        } else {
            updates.push(runQuery(`UPDATE election SET invest_id ='${req.body.invest_id}', percentage ='${req.body.percentage}' WHERE id='${req.body.id}'`));
        }

        Promise.all(updates).then(
            (allResults) => {
                reportSuccess(res, `Successfully updated election data`);
                res.redirect('/election');
            },
            defaultErrorHandler
        );
    });

    app.post('/create_election', authenticateElection, (req, res) => {
        const election = {
            id: uuidv4(),
            user_id: req.session.user.id,
            invest_id: null,
            percentage: 0,
        };

        runQuery(`INSERT INTO election (id, user_id, invest_id, percentage) VALUES ('${election.id}', '${election.user_id}', '${election.invest_id}', '${election.percentage}')`).then(
            (createResults) => {
                refreshElectionCache(req, res);
            },
            defaultErrorHandler
        );
    });

    app.put('/election', authenticateElection, (req, res) => {
        // console.log(`Got a request to update a election`);
    });

    // these are duplicates
    // correct RESTful way is to use 'delete' as a verb, but HTML links can't do that, so I'm cheating for now
    // remove the second version once the front end is in better shape
    app.delete('/election/:id', authenticateElection, (req, res) => {
        runQuery(`DELETE FROM election WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/election');
            },
            defaultErrorHandler
        );
    });

    app.get('/delete_election/:id', authenticateElection, (req, res) => {
        runQuery(`DELETE FROM election WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/election');
            },
            defaultErrorHandler
        );
    });
}
