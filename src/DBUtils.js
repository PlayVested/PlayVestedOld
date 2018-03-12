const mysql = require('mysql')

// util function to recursively dump the contents of an object
function displayResults(name, result, prefix = '') {
    if (!module.parent) {
        console.log(`${prefix}${typeof result} ${name}: ${result instanceof Object ? '' : result}`);
        if (result instanceof Object) {
            for (var r in result) {
                displayResults(r, result[r], prefix + '  ');
            }
        }
    }
}

function defaultErrorHandler(err, res) {
    if (!module.parent) {
        console.warn(`defaultErrorHandler: ${typeof err} ${err.message}`);
    }

    if (res) {
        res.status(500).render('error', {error: err});
    } else {
        throw err;
    }
}

// wrapper function for talking with the database to do an SQL query
// handles boilerplate work of managing connection, error handling,
// and dumping debug info to the console when run locally
function runQuery(sql) {
    // shouldn't be hard coding the connection information...
    var connection = mysql.createConnection({
        host     : 'localhost',
        user     : 'root',
        password : 'Md6Ze*ZmR*87',
        database : 'playvested'
    });

    if (!connection) {
        reportError(res, 'Failed to connect to database');
        res.redirect('back');
        return Promise.reject('Failed to connect to database');
    }

    return new Promise((resolve, reject) => {
        connection.connect((err) => {
            if (err) reject(err);

            if (!module.parent) {
                console.log(`running query: ${sql}`);
            }

            connection.query(sql, (err, result, fields) => {
                if (err) reject(err);

                // when we are running locally, spit out the results of the query for easier debugging  
                try {
                    displayResults(`result`, result);
                } catch (err) {
                    console.log(`displayResults threw error ${typeof err} ${err.message}`);
                    reject(err);
                }

                // done with the connection at this point, go ahead and close it
                connection.end();

                // fulfill the promise and return the results
                resolve(result);
            });
        });
    });
}