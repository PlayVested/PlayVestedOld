const DBUtils = require('./DBUtils');
const hash = require('pbkdf2-password')();
const messageUtils = require('./messageUtils');
const uuidv4 = require('uuid/v4');

function authenticateUser(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        messageUtils.reportError(res, 'Access denied!');
        res.redirect('/');
    }
}

function registerUserEndpoints(app) {
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
            messageUtils.reportError(res, 'Invalid user name');
            res.redirect('back');
            return;
        } else if (!req.body.password || !req.body.confirm_password) {
            messageUtils.reportError(res, 'Invalid password');
            res.redirect('back');
            return;
        } else if (req.body.password !== req.body.confirm_password) {
            messageUtils.reportError(res, 'Password does not match');
            res.redirect('back');
            return;
        }

        // check if the user name is already in use
        DBUtils.runQuery(`SELECT * FROM user WHERE name = '${req.body.username}'`).then(
            (userResults) => {
                messageUtils.clearStatusMessages();

                if (userResults && userResults.length > 0) {
                    messageUtils.reportError(res, 'User name already taken');
                    res.redirect('back');
                    return;
                }

                // when you create a user, generate a salt and hash the password
                hash({ password: req.body.password }, (err, pass, salt, hash) => {
                    if (err) throw err;

                    // store the salt & hash in the "db"
                    const uuid = uuidv4();
                    DBUtils.runQuery(`INSERT INTO user (id, name, password, salt, hash) VALUES ('${uuid}', '${req.body.username}', '${req.body.password}', '${salt}', '${hash}')`).then(
                        (insertResults) => {
                            if (!module.parent) {
                                console.log(`added user: ${req.body.username}`);
                            }

                            // let them know it worked
                            messageUtils.reportSuccess(res, `Successfully created user ${req.body.username}, now login with your new credentials`);

                            // send them to the login page
                            res.redirect('/login');
                        },
                        DBUtils.defaultErrorHandler
                    );
                });
            },
            DBUtils.defaultErrorHandler
        );
    });

    app.get('/settings', authenticateUser, (req, res) => {
        res.render('settings');
    });

    app.post('/settings', authenticateUser, (req, res) => {
        var hashInput = {};
        console.log(`posted settings`);

        if (req.body.current_password !== '' && req.body.current_password !== req.session.user.password) {
            messageUtils.reportError(res, `Current password is incorrect`);
            res.redirect('/');
            return;
        } else if (req.body.new_password !== '' && req.body.new_password !== req.body.confirm_password) {
            messageUtils.reportError(res, `New password does not match`);
            res.redirect('/');
            return;
        }
        console.log(`validated`);

        if (req.body.new_password !== '') {
            hashInput.password = req.body.new_password;
        } else {
            hashInput.password = req.session.user.password;
            hashInput.hash = req.session.user.hash;
            hashInput.salt = req.session.user.salt;
        };

        hash(hashInput, (err, ret_pass, salt, hash) => {
            console.log(`hashed`);
            if (err) {
                return messageUtils.reportError(res, err);
            } else if (hash === req.session.user.hash) {
                const sql = `
                    UPDATE user SET
                        name = '${req.body.username}',
                        display_name = '${req.body.display_name}',
                        email = '${req.body.email}',
                        zip_code = '${req.body.zip_code}',
                        password = '${ret_pass}',
                        salt = '${salt}',
                        hash = '${hash}'
                    WHERE
                        id ='${req.session.user.id}'`
                return DBUtils.runQuery(sql).then(
                        (results) => {
                            req.session.user.name = req.body.username;
                            req.session.user.display_name = req.body.display_name;
                            req.session.user.email = req.body.email;
                            req.session.user.zip_code = req.body.zip_code;
                            req.session.user.password = ret_pass;
                            req.session.user.salt = salt;
                            req.session.user.hash = hash;

                            messageUtils.reportSuccess(res, 'User info updated!');
                            res.redirect('back');
                        },
                        DBUtils.defaultErrorHandler
                    );
            } else {
                messageUtils.reportError(res, 'invalid password');
            }
        });
    });

    app.get('/users', (req, res) => {
        DBUtils.runQuery(`SELECT name FROM user`).then(
            (userResults) => {
                var user_names = 'Current Users:<br>';
                for (var user of userResults) {
                    user_names += user.name + '<br>';
                }
                res.send(user_names);
            },
            DBUtils.defaultErrorHandler
        );
    });
}

module.exports = {
    registerEndpoints: registerUserEndpoints,
    authenticateUser: authenticateUser
};
