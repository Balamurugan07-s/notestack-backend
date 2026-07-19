import mongoose from 'mongoose';

let mongod = null;

export const connectDB = async () => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';

    let dbUrl = isTest ? null : process.env.MONGODB_URI;

    if (!dbUrl) {
      if (isProduction) {
        throw new Error(
          '❌ MONGODB_URI is missing in production. Set it in your host\'s environment variables.'
        );
      }

      console.log('⚠️ No MONGODB_URI found in env. Initializing local In-Memory MongoDB Server...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
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