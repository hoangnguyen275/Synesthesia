
const mongoose = require('mongoose');

async function connectDB() {
  try {
    const connectionString =
      process.env.MONGODB_CONNECTIONSTRING;

    if (!connectionString) {
      throw new Error(
        'MONGODB_CONNECTIONSTRING is missing from .env'
      );
    }

    await mongoose.connect(connectionString, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('MongoDB connected successfully!');
    console.log(`Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

module.exports = connectDB;
