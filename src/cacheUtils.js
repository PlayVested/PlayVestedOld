const DBUtils = require('./DBUtils');

function cacheContributions(req, res) {
    if (!req.session.user) {
        if (res) {
            res.redirect('/');
        }
        console.log(`failed to refresh contributions`);
        return Promise.resolve([]);
    }

    return DBUtils.runQuery(`SELECT game_id, invest_id, timestamp, SUM(amount) AS amount FROM contribution WHERE user_id = '${req.session.user.id}' GROUP BY invest_id, game_id ORDER BY amount DESC`).then(
        (contributionResults) => {
            req.session.user.contribution = contributionResults;
            if (res) {
                res.redirect('/user');
            }
        },
        DBUtils.defaultErrorHandler
    );
}

function cacheElections(req) {
    return DBUtils.runQuery(`SELECT * FROM election WHERE user_id = '${req.session.user.id}'`).then(
        (electionResults) => {
            req.session.user.election = electionResults;
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

function cacheTiers(req, res) {
    if (!req.session.game) {
        return;
    }

    DBUtils.runQuery(`SELECT * FROM tier WHERE game_id = '${req.session.game.id}' ORDER BY reward`).then(
        (tierResults) => {
            req.session.game.tier = tierResults;
            res.redirect('/game');
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

module.exports = {
    cacheContributions: cacheContributions,
    cacheElections: cacheElections,
    cacheTable: cacheTable,
    cacheUserGoals: cacheUserGoals,
    cacheUserPermissions: cacheUserPermissions
};