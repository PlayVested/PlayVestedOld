// this creates a simple server that listens for 'get' requests on port 3000
const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');

// config for views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// middleware
app.use(express.urlencoded({
    extended: false
}));
app.use(session({
    resave: false, // don't save session if unmodified
    saveUninitialized: false, // don't create session until something stored
    secret: 'shhhh, very secret'
}));
app.use(express.static('../public'));

var storedSuccessMsg = '';
var storedErrorMsg = '';
function reportSuccess(res, msg) {
    storedSuccessMsg = '<p class="msg success">Status: ' + msg + '</p>';
    if (res && res.locals) {
        res.locals.message = storedSuccessMsg;
    }
}
function reportError(res, err) {
    storedErrorMsg = '<p class="msg error">Error: ' + err + '</p>';
    if (res && res.locals) {
        res.locals.message = storedErrorMsg;
    }
}
function clearStatusMessages() {
    storedSuccessMsg = '';
    storedErrorMsg = '';
}

// generic route used to populate the local copies of data used by HTML templating
app.use((req, res, next) => {
    res.locals.message = '';
    if (storedErrorMsg) {
        res.locals.message = storedErrorMsg;
    } else if (storedSuccessMsg) {
        res.locals.message = storedSuccessMsg;
    }
    clearStatusMessages();

    res.locals.game = req.session.game;
    res.locals.invest = req.session.invest;
    res.locals.tables = req.session.tables;
    res.locals.user = req.session.user;

    next();
});

// set up handlers for base routes
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/user');
    } else {
        res.redirect('/login');
    }
});

app.post('/', (req, res) => {
    res.send(`Got a post request ${req}...`);
});

app.put('/', (req, res) => {
    res.send(`Got a put request ${req}...`);
});

app.delete('/', (req, res) => {
    res.send(`Got a delete request ${req}...`);
});

app.get('/testing', (req, res) => {
    res.send('This is a test... this is just a test');
    if (!module.parent) {
        console.log(`${req}`);
    }
});

// register all endpoints from sub-systems
registerContributionEndpoints(app);
registerElectionEndpoints(app);
registerGameEndpoints(app);
registerInvestmentEndpoints(app);
registerLoginEndpoints(app);
registerSupportEndpoints(app);
registerTierEndpoints(app);
registerUserEndpoints(app);

// fallback 404 handling
// this needs to happen after all valid routes are defined
app.use((req, res, next) => {
    res.status(404).render('not_found');
});

// error handling
// this needs to happen last
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {error: err});
});

if (!module.parent) {
    // start the local server
    app.listen(3000, () => console.log('Example app listening on port 3000!'));
}