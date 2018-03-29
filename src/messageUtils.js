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
function clearStatusMessages(res) {
    if (res) {
        if (storedErrorMsg) {
            res.locals.message = storedErrorMsg;
        } else if (storedSuccessMsg) {
            res.locals.message = storedSuccessMsg;
        }
    }
    storedSuccessMsg = '';
    storedErrorMsg = '';
}

module.exports = {
    reportSuccess: reportSuccess,
    reportError: reportError,
    clearStatusMessages: clearStatusMessages
};
