import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/apiRoutes.js';
import errorMiddleware from './middlewares/errorMiddleware.js';
import redisClient from './utils/redis.js';
import initConsumer from './consumer.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/', apiRoutes);

// Error Handling Middleware
app.use(errorMiddleware);

const port = process.env.PORT || 3000;
const host = process.env.HOST || 'localhost';

app.listen(port, host, async () => {
  // Inisialisasi koneksi Redis
  await redisClient.connect();
  console.log('Redis berhasil terkoneksi.');

  // Menjalankan Consumer di background
  initConsumer();
  
  console.log(`Server berjalan pada http://${host}:${port}`);
});