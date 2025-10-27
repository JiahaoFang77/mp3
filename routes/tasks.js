// routes/tasks.js
var Task = require('../models/task.js');
var User = require('../models/user.js');
var mongoose = require('mongoose');

module.exports = function (router) {

    // --- /api/tasks (GET, POST) ---
    var tasksRoute = router.route('/tasks');

    // GET /api/tasks
    // This handles all query parameters: where, sort, select, skip, limit, count
    tasksRoute.get(function (req, res) {
        
        // --- Start of Query Parameter Logic ---
        // Based on README: where, sort, select, skip, limit, count

        // 1. Build query
        var query = Task.find();

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

        // 6. limit: for pagination (default is 100 for tasks)
        var limit = req.query.limit ? parseInt(req.query.limit) : 100;
        query.limit(limit);

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
                        message: "Error counting tasks.",
                        data: err
                    });
                });
            return; // Stop execution
        }

        // --- End of Query Parameter Logic ---

        // Execute the final query
        query.exec()
            .then(tasks => {
                res.status(200).json({ // 200 success
                    message: "OK",
                    data: tasks
                });
            })
            .catch(err => {
                res.status(500).json({ // 500 server error
                    message: "Error retrieving tasks.",
                    data: err
                });
            });
    });

    // POST /api/tasks
    tasksRoute.post(async function (req, res) {
        // Validation: name and deadline are required
        if (!req.body.name || !req.body.deadline) {
            return res.status(400).json({ // 400 bad request
                message: "Validation Error: 'name' and 'deadline' are required fields.",
                data: {}
            });
        }
        
        // Create new task
        var task = new Task();
        task.name = req.body.name;
        task.description = req.body.description || "";
        task.deadline = req.body.deadline;
        task.completed = req.body.completed || false;
        task.assignedUser = req.body.assignedUser || "";
        task.assignedUserName = req.body.assignedUserName || "unassigned";
        // dateCreated is set by default in the schema

        try {
            // Save the task
            var savedTask = await task.save();

            // Requirement 7: Add task to user's pendingTasks if assigned and not completed
            // This also matches the logic in dbFill.py
            if (savedTask.assignedUser && !savedTask.completed) {
                await User.findByIdAndUpdate(
                    savedTask.assignedUser,
                    { $push: { pendingTasks: savedTask._id } }
                );
            }

            res.status(201).json({ // 201 created
                message: "New task created successfully.",
                data: savedTask
            });
        } catch (err) {
            res.status(500).json({ // 500 server error
                message: "Error saving task.",
                data: err
            });
        }
    });


    // --- /api/tasks/:id (GET, PUT, DELETE) ---
    var taskRoute = router.route('/tasks/:id');

    // GET /api/tasks/:id
    taskRoute.get(function (req, res) {
        // Validation: Check for valid Mongoose ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ // 404 not found
                message: "Task not found.",
                data: {}
            });
        }
        
        var query = Task.findById(req.params.id);

        // Add 'select' parameter functionality
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
            .then(task => {
                if (!task) {
                    return res.status(404).json({ // 404 not found
                        message: "Task not found.",
                        data: {}
                    });
                }
                res.status(200).json({ // 200 success
                    message: "OK",
                    data: task
                });
            })
            .catch(err => {
                res.status(500).json({ // 500 server error
                    message: "Error retrieving task.",
                    data: err
                });
            });
    });

    // PUT /api/tasks/:id
    taskRoute.put(async function (req, res) {
        // Validation: Check for valid Mongoose ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ // 404 not found
                message: "Task not found.",
                data: {}
            });
        }
        
        // Validation: name and deadline are required
        if (!req.body.name || !req.body.deadline) {
            return res.status(400).json({ // 400 bad request
                message: "Validation Error: 'name' and 'deadline' are required fields for replacement.",
                data: {}
            });
        }
        
        // ... (rest of the function is the same) ...
        try {
            // Find the task first
            var task = await Task.findById(req.params.id);
            if (!task) {
                return res.status(404).json({ // 404 not found
                    message: "Task not found.",
                    data: {}
                });
            }
            
            // --- Start Referential Integrity Logic ---
            // Requirement 7: PUT a Task
            var oldAssignee = task.assignedUser;
            var oldCompleted = task.completed;
            
            var newAssignee = req.body.assignedUser || "";
            var newCompleted = req.body.completed || false;
            
            // Case 1: Task is assigned to a NEW user
            if (newAssignee && newAssignee !== oldAssignee) {
                // Add to new user's pendingTasks if not completed
                if (!newCompleted) {
                    await User.findByIdAndUpdate(newAssignee, { $push: { pendingTasks: task._id } });
                }
                // Remove from old user's pendingTasks
                if (oldAssignee) {
                    await User.findByIdAndUpdate(oldAssignee, { $pull: { pendingTasks: task._id } });
                }
            }
            // Case 2: Task is UNASSIGNED
            else if (!newAssignee && oldAssignee) {
                // Remove from old user's pendingTasks
                await User.findByIdAndUpdate(oldAssignee, { $pull: { pendingTasks: task._id } });
            }
            // Case 3: Assignment unchanged, but completion status changed
            else if (newAssignee && newAssignee === oldAssignee) {
                // If newly COMPLETED, remove from user's pendingTasks
                if (newCompleted && !oldCompleted) {
                    await User.findByIdAndUpdate(newAssignee, { $pull: { pendingTasks: task._id } });
                }
                // If newly UN-COMPLETED, add to user's pendingTasks
                else if (!newCompleted && oldCompleted) {
                    await User.findByIdAndUpdate(newAssignee, { $push: { pendingTasks: task._id } });
                }
            }
            // --- End Referential Integrity Logic ---

            // Now, update the task fields
            task.name = req.body.name;
            task.description = req.body.description || "";
            task.deadline = req.body.deadline;
            task.completed = newCompleted;
            task.assignedUser = newAssignee;
            task.assignedUserName = req.body.assignedUserName || (newAssignee ? task.assignedUserName : "unassigned");
            // dateCreated is not updated

            var savedTask = await task.save();
            
            res.status(200).json({ // 200 success
                message: "Task updated successfully.",
                data: savedTask
            });
        } catch (err) {
            res.status(500).json({ // 500 server error
                message: "Error updating task.",
                data: err
            });
        }
    });

    // DELETE /api/tasks/:id
    taskRoute.delete(async function (req, res) {
        // Validation: Check for valid Mongoose ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(4404).json({ // 404 not found
                message: "Task not found.",
                data: {}
            });
        }
        
        // ... (rest of the function is the same) ...
        try {
            var deletedTask = await Task.findByIdAndDelete(req.params.id);
            
            if (!deletedTask) {
                return res.status(404).json({ // 404 not found
                    message: "Task not found.",
                    data: {}
                });
            }

            // Requirement 7: DELETE a Task - remove from assignedUser's pendingTasks
            if (deletedTask.assignedUser && !deletedTask.completed) {
                await User.findByIdAndUpdate(
                    deletedTask.assignedUser,
                    { $pull: { pendingTasks: deletedTask._id } }
                );
            }
            
            res.status(200).json({ // 200 success
                message: "Task deleted successfully.",
                data: deletedTask
            });
        } catch (err) {
            res.status(500).json({ // 500 server error
                message: "Error deleting task.",
                data: err
            });
        }
    });

    return router;
};