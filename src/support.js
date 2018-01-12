function registerSupportEndpoints(app) {
    app.get('/support', authenticateUser, (req, res) => {
        res.render('support');
    });
}
