// Load required packages
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// Define our task schema
var TaskSchema = new Schema({
    name: {
        type: String,
        required: true // Validation: Tasks must have a name
    },
    description: {
        type: String,
        default: ""
    },
    deadline: {
        type: Date,
        required: true // Validation: Tasks must have a deadline
    },
    completed: {
        type: Boolean,
        default: false
    },
    assignedUser: {
        type: String,
        default: "" // The _id field of the user
    },
    assignedUserName: {
        type: String,
        default: "unassigned" // The name field of the user
    },
    dateCreated: {
        type: Date,
        default: Date.now // Should be set automatically by server
    }
});

// Export the Mongoose model
module.exports = mongoose.model('Task', TaskSchema);