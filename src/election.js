const DBUtils = require('./DBUtils');
const uuidv4 = require('uuid/v4');

function authenticateElection(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        DBUtils.reportError(res, 'Manipulating election data requires an active user!');
        res.redirect('/');
    }
}

function refreshElectionCache(req) {
    return DBUtils.runQuery(`SELECT * FROM election WHERE user_id = '${req.session.user.id}'`).then(
        (electionResults) => {
            req.session.user.election = electionResults;
        },
        DBUtils.defaultErrorHandler
    );
}

function registerElectionEndpoints(app) {
    // hitting it without an ID will load all valid elections for the active user
    app.get('/election', authenticateElection, (req, res) => {
        refreshElectionCache(req).then(
            (results) => {
                res.render('election');
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.post('/election', authenticateElection, (req, res) => {
        DBUtils.clearStatusMessages();

        var updates = [];
        if (req.body.id instanceof Array) {
            for (i in req.body.id) {
                updates.push(DBUtils.runQuery(`UPDATE election SET invest_id ='${req.body.invest_id[i]}', percentage ='${req.body.percentage[i]}' WHERE id='${req.body.id[i]}'`));
            }
        } else {
            updates.push(DBUtils.runQuery(`UPDATE election SET invest_id ='${req.body.invest_id}', percentage ='${req.body.percentage}' WHERE id='${req.body.id}'`));
        }

        Promise.all(updates).then(
            (allResults) => {
                DBUtils.reportSuccess(res, `Successfully updated election data`);
                res.redirect('/election');
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.post('/create_election', authenticateElection, (req, res) => {
        const election = {
            id: uuidv4(),
            user_id: req.session.user.id,
            invest_id: null,
            percentage: 0,
        };

        DBUtils.runQuery(`INSERT INTO election (id, user_id, invest_id, percentage) VALUES ('${election.id}', '${election.user_id}', '${election.invest_id}', '${election.percentage}')`).then(
            (createResults) => {
                refreshElectionCache(req, res);
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.put('/election', authenticateElection, (req, res) => {
        // console.log(`Got a request to update a election`);
    });

    // these are duplicates
    // correct RESTful way is to use 'delete' as a verb, but HTML links can't do that, so I'm cheating for now
    // remove the second version once the front end is in better shape
    app.delete('/election/:id', authenticateElection, (req, res) => {
        DBUtils.runQuery(`DELETE FROM election WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/election');
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.get('/delete_election/:id', authenticateElection, (req, res) => {
        DBUtils.runQuery(`DELETE FROM election WHERE id = '${req.params.id}'`).then(
            (deleteResults) => {
                res.redirect('/election');
            },
            DBUtils.defaultErrorHandler
        );
    });
}

module.exports = {
    registerEndpoints: registerElectionEndpoints
};
