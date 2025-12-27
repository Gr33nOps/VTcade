// config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    
    if (!uri) {
      console.error("ERROR: MONGO_URI not set in environment variables");
      throw new Error("MONGO_URI not set in environment variables");
    }

    console.log("Attempting to connect to MongoDB...");
    
    await mongoose.connect(uri, {
      // These options help with connection reliability
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log("✓ MongoDB Connected successfully");
    console.log(`  Database: ${mongoose.connection.name}`);
    
  } catch (error) {
    console.error("✗ MongoDB connection error:", error.message);
    console.error("  Full error:", error);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

module.exports = connectDB;