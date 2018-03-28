var userFuncs = require('./user');

function registerSupportEndpoints(app) {
    app.get('/support', userFuncs.authenticateUser, (req, res) => {
        res.render('support');
    });
}

module.exports = {
    registerEndpoints: registerSupportEndpoints
};