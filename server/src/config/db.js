import mongoose from 'mongoose';

let memServer = null;

function isPlaceholderUri(uri) {
  return !uri || uri.includes('<db_username>') || uri.includes('<db_password>');
}

export async function connectDatabase() {
  let uri = process.env.MONGODB_URI;

  if (isPlaceholderUri(uri) || process.env.USE_MEMORY_DB === 'true') {
    console.log('⚠️  No valid MONGODB_URI found — starting in-memory MongoDB for local development.');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    uri = memServer.getUri();
    console.log(`🗄️  In-memory MongoDB URI: ${uri}`);
  }

  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
}