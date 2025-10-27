// Load required packages
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// Define our user schema
var UserSchema = new Schema({
    name: {
        type: String,
        required: true // Validation: Users must have a name
    },
    email: {
        type: String,
        required: true, // Validation: Users must have an email
        unique: true    // Validation: Multiple users with the same email cannot exist
    },
    pendingTasks: {
        type: [String], // The _id fields of pending tasks
        default: []
    },
    dateCreated: {
        type: Date,
        default: Date.now // Should be set automatically by server
    }
});

// Export the Mongoose model
module.exports = mongoose.model('User', UserSchema);