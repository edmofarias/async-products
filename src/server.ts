import express from 'express';
import cors from 'cors';
import { initDb } from './db/index.js';
import { uploadRouter } from './routes/upload.js';
import { productsRouter } from './routes/products.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

initDb();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: 'Async Products API', status: 'ok' });
});

app.use('/api/upload',   uploadRouter);
app.use('/api/products', productsRouter);

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
