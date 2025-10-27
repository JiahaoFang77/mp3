/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    // This handles /api
    app.use('/api', require('./home.js')(router));
    
    // This handles /api/users*
    app.use('/api', require('./users.js')(router));
    
    // Add this line to handle /api/tasks*
    app.use('/api', require('./tasks.js')(router));
};