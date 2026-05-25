import { createClient } from 'redis';

const redisClient = createClient({
  socket: { host: process.env.REDIS_HOST || 'localhost' }
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
// Koneksi akan diinisialisasi di server.js

export default redisClient;