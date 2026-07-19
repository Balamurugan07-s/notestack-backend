import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod = null;

export const connectDB = async () => {
  try {
    let dbUrl = process.env.NODE_ENV === 'test' ? null : process.env.MONGODB_URI;

    if (!dbUrl) {
      console.log('⚠️ No MONGODB_URI found in env. Initializing local In-Memory MongoDB Server...');
      mongod = await MongoMemoryServer.create();
      dbUrl = mongod.getUri();
      console.log(`🚀 In-Memory MongoDB Server started dynamically at: ${dbUrl}`);
    }

    const conn = await mongoose.connect(dbUrl);
    console.log(`📦 MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

export const closeDB = async () => {
  try {
    await mongoose.connection.close();
    if (mongod) {
      await mongod.stop();
      console.log('🛑 In-Memory MongoDB Server stopped.');
    }
  } catch (error) {
    console.error(`❌ Error closing database: ${error.message}`);
  }
};
