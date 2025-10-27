// routes/users.js
var User = require('../models/user.js');
var mongoose = require('mongoose');

module.exports = function (router) {

    // --- /api/users (GET, POST) ---
    var usersRoute = router.route('/users');

    // GET /api/users
    // This handles all query parameters: where, sort, select, skip, limit, count
    usersRoute.get(function (req, res) {
        
        // --- Start of Query Parameter Logic ---
        // Based on README: where, sort, select, skip, limit, count

        // 1. Build query
        var query = User.find();

        // 2. where: filter results
        if (req.query.where) {
            try {
                query.where(JSON.parse(req.query.where));
            } catch (e) {
                return res.status(400).json({ // 400 bad request
                    message: "Invalid 'where' parameter. Must be valid JSON.",
                    data: e
                });
            }
        }

        // 3. sort: specify order
        if (req.query.sort) {
            try {
                query.sort(JSON.parse(req.query.sort));
            } catch (e) {
                return res.status(400).json({ // 400 bad request
                    message: "Invalid 'sort' parameter. Must be valid JSON.",
                    data: e
                });
            }
        }

        // 4. select: specify fields
        if (req.query.select) {
            try {
                query.select(JSON.parse(req.query.select));
            } catch (e) {
                return res.status(400).json({ // 400 bad request
                    message: "Invalid 'select' parameter. Must be valid JSON.",
                    data: e
                });
            }
        }

        // 5. skip: for pagination
        if (req.query.skip) {
            query.skip(parseInt(req.query.skip));
        }

        // 6. limit: for pagination (default unlimited for users)
        if (req.query.limit) {
            query.limit(parseInt(req.query.limit));
        }

        // 7. count: return count, not documents
        if (req.query.count === 'true') {
            query.countDocuments().exec()
                .then(count => {
                    res.status(200).json({ // 200 success
                        message: "OK",
                        data: count
                    });
                })
                .catch(err => {
                    res.status(500).json({ // 500 server error
                        message: "Error counting users.",
                        data: err
                    });
                });
            return; // Stop execution to not run the other query
        }

        // --- End of Query Parameter Logic ---

        // Execute the final query
        query.exec()
            .then(users => {
                res.status(200).json({ // 200 success
                    message: "OK",
                    data: users
                });
            })
            .catch(err => {
                res.status(500).json({ // 500 server error
                    message: "Error retrieving users.",
                    data: err
                });
            });
    });

    // POST /api/users
    usersRoute.post(function (req, res) {
        // Create new user
        var user = new User();

        // Validation: name and email are required
        if (!req.body.name || !req.body.email) {
            return res.status(400).json({ // 400 bad request
                message: "Validation Error: 'name' and 'email' are required fields.",
                data: {}
            });
        }

        // Set user properties from request
        user.name = req.body.name;
        user.email = req.body.email;
        if (req.body.pendingTasks) { // Handle optional pendingTasks
            user.pendingTasks = req.body.pendingTasks;
        }
        // dateCreated is set by default in the schema

        // Save the user
        user.save()
            .then(savedUser => {
                res.status(201).json({ // 201 created
                    message: "New user created successfully.",
                    data: savedUser
                });
            })
            .catch(err => {
                // Handle errors, e.g., duplicate email
                var errMsg = "Error saving user.";
                if (err.code === 11000) { // Mongo's duplicate key error
                    errMsg = "A user with this email already exists.";
                }
                res.status(500).json({ // 500 server error
                    message: errMsg,
                    data: err
                });
            });
    });


    // --- /api/users/:id (GET, PUT, DELETE) ---
    var userRoute = router.route('/users/:id');

    // GET /api/users/:id
    userRoute.get(function (req, res) {
        // Validation: Check for valid Mongoose ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ // 404 not found
                message: "User not found.",
                data: {}
            });
        }
        
        var query = User.findById(req.params.id);

        // Add 'select' parameter functionality for this route too
        if (req.query.select) {
            try {
                query.select(JSON.parse(req.query.select));
            } catch (e) {
                return res.status(400).json({ // 400 bad request
                    message: "Invalid 'select' parameter. Must be valid JSON.",
                    data: e
                });
            }
        }
        
        // ... (rest of the function is the same) ...
        query.exec()
            .then(user => {
                if (!user) {
                    return res.status(404).json({ // 404 not found
                        message: "User not found.",
                        data: {}
                    });
                }
                res.status(200).json({ // 200 success
                    message: "OK",
                    data: user
                });
            })
            .catch(err => {
                res.status(500).json({ // 500 server error
                    message: "Error retrieving user.",
                    data: err
                });
            });
    });

    // PUT /api/users/:id
    userRoute.put(async function (req, res) {
        // Validation: Check for valid Mongoose ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ // 404 not found
                message: "User not found.",
                data: {}
            });
        }

        // Validation: name and email are required for update
        if (!req.body.name || !req.body.email) {
            return res.status(400).json({ // 400 bad request
                message: "Validation Error: 'name' and 'email' are required fields for replacement.",
                data: {}
            });
        }
        
        // We need the Task model for the cascade update
        var Task = require('../models/task.js');

        try {
            var user = await User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ // 404 not found
                    message: "User not found.",
                    data: {}
                });
            }

            // --- Start Referential Integrity Logic ---
            // Requirement from FAQ: "If you PUT a User with pendingTasks... The tasks... should update"
            
            var oldPendingTasks = user.pendingTasks.map(t => t.toString());
            var newPendingTasks = req.body.pendingTasks ? req.body.pendingTasks.map(t => t.toString()) : [];
            
            // 1. Find tasks that were REMOVED from pendingTasks
            var tasksToUnassign = oldPendingTasks.filter(t => !newPendingTasks.includes(t));
            if (tasksToUnassign.length > 0) {
                await Task.updateMany(
                    { _id: { $in: tasksToUnassign }, assignedUser: user._id },
                    { $set: { assignedUser: "", assignedUserName: "unassigned" } }
                );
            }

            // 2. Find tasks that were ADDED to pendingTasks
            var tasksToAssign = newPendingTasks.filter(t => !oldPendingTasks.includes(t));
            if (tasksToAssign.length > 0) {
                // First, check if any of these tasks are already assigned to someone else
                var conflictingTasks = await Task.find({ _id: { $in: tasksToAssign }, assignedUser: { $ne: "", $ne: user._id } });
                if (conflictingTasks.length > 0) {
                    return res.status(400).json({ // 400 bad request
                        message: "Conflict: One or more tasks are already assigned to another user.",
                        data: conflictingTasks.map(t => t._id)
                    });
                }
                
                // If no conflict, assign them
                await Task.updateMany(
                    { _id: { $in: tasksToAssign } },
                    { $set: { assignedUser: user._id, assignedUserName: req.body.name, completed: false } } // A pending task cannot be completed
                );
            }
            // --- End Referential Integrity Logic ---

            // Update the user's fields
            user.name = req.body.name;
            user.email = req.body.email;
            user.pendingTasks = newPendingTasks;
            // dateCreated is not updated
            
            var savedUser = await user.save(); // Save the updated user

            res.status(200).json({ // 200 success
                message: "User updated successfully.",
                data: savedUser
            });
        } catch (err) {
            var errMsg = "Error updating user.";
            if (err.code === 11000) { // Handle duplicate email on update
                errMsg = "A user with this email already exists.";
            }
            res.status(500).json({ // 500 server error
                message: errMsg,
                data: err
            });
        }
    });

    // DELETE /api/users/:id
    userRoute.delete(async function (req, res) {
        // Validation: Check for valid Mongoose ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ // 404 not found
                message: "User not found.",
                data: {}
            });
        }
        
        // We need the Task model
        var Task = require('../models/task.js');

        try {
            var deletedUser = await User.findByIdAndDelete(req.params.id);
            
            if (!deletedUser) {
                return res.status(404).json({ // 404 not found
                    message: "User not found.",
                    data: {}
                });
            }

            // Requirement 7: DELETE a User - unassign their pending tasks
            await Task.updateMany(
                { assignedUser: deletedUser._id },
                { $set: { assignedUser: "", assignedUserName: "unassigned" } }
            );

            res.status(200).json({ // 200 success
                message: "User deleted successfully.",
                data: deletedUser
            });
        } catch (err) {
            res.status(500).json({ // 500 server error
                message: "Error deleting user or updating tasks.",
                data: err
            });
        }
    });

    return router;
};