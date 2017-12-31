const hash = require('pbkdf2-password')();
const uuidv4 = require('uuid/v4');

function authenticateUser(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        reportError(res, 'Access denied!');
        res.redirect('/');
    }
}

function registerUserEndpoints(app) {
    app.use((req, res, next) => {
        res.locals.user = {}
        if (req.session.user) {
            res.locals.user = req.session.user;
        }

        res.locals.investments = [];
        if (req.session.investments) {
            res.locals.investments = req.session.investments;
        }

        next();
    });

    app.get('/user', authenticateUser, (req, res) => {
        res.render('user');
    });

    app.post('/user', (req, res) => {
    });

    app.get('/create_user', (req, res) => {
        res.render('create_user');
    });

    app.post('/create_user', (req, res) => {
        if (!module.parent) {
            console.log(`received request to create new user ${req.body.username} with password ${req.body.password}...`);
        }
    
        // validate the inputs
        if (!req.body.username) {
            reportError(res, 'Invalid user name');
            res.redirect('back');
            return;
        } else if (!req.body.password || !req.body.confirm_password) {
            reportError(res, 'Invalid password');
            res.redirect('back');
            return;
        } else if (req.body.password !== req.body.confirm_password) {
            reportError(res, 'Password does not match');
            res.redirect('back');
            return;
        }

        // check if the user name is already in use
        runQuery(`SELECT * FROM user WHERE name = '${req.body.username}'`).then(
            (userResults) => {
                clearStatusMessages();

                if (userResults && userResults.length > 0) {
                    reportError(res, 'User name already taken');
                    res.redirect('back');
                    return;
                }

                // when you create a user, generate a salt and hash the password
                hash({ password: req.body.password }, (err, pass, salt, hash) => {
                    if (err) throw err;

                    // store the salt & hash in the "db"
                    const uuid = uuidv4();
                    runQuery(`INSERT INTO users (id, name, password, hash, salt) VALUES ('${uuid}', '${req.body.username}', '${req.body.password}', '${hash}', '${salt}')`).then(
                        (insertResults) => {
                            if (!module.parent) {
                                console.log(`added user: ${req.body.username}`);
                            }

                            // let them know it worked
                            reportSuccess(res, `Successfully created user ${req.body.username}, now login with your new credentials`);

                            // send them to the login page
                            res.redirect('/login');
                        },
                        defaultErrorHandler
                    );
                });
            },
            defaultErrorHandler
        );
    });

    app.get('/users', (req, res) => {
        runQuery(`SELECT name FROM user`).then(
            (userResults) => {
                var user_names = 'Current Users:<br>';
                for (var user of userResults) {
                    user_names += user.name + '<br>';
                }
                res.send(user_names);
            },
            defaultErrorHandler
        );
    });
}
