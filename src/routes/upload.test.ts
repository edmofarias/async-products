import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/queue.js', () => ({
  getChannel:     vi.fn().mockResolvedValue({}),
  publishProduct: vi.fn(),
}));

import request from 'supertest';
import express from 'express';
import { getChannel, publishProduct } from '../services/queue.js';
import { uploadRouter } from './upload.js';

const app = express();
app.use('/api/upload', uploadRouter);

const VALID_CSV = Buffer.from(
  'sku,name,price,category\nA1,Camiseta,49.9,Vestuário\nA2,Calça,89.9,Vestuário',
);

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.mocked(publishProduct).mockClear();
    vi.mocked(getChannel).mockResolvedValue({} as any);
  });

  it('retorna 202 com queued count para CSV válido', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', VALID_CSV, { filename: 'products.csv', contentType: 'text/csv' });
    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(2);
    expect(publishProduct).toHaveBeenCalledTimes(2);
  });

  it('retorna 400 para arquivo sem extensão .csv', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.from('data'), { filename: 'file.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('retorna 400 para CSV sem linhas de dados', async () => {
    const emptyCsv = Buffer.from('sku,name,price,category\n');
    const res = await request(app)
      .post('/api/upload')
      .attach('file', emptyCsv, { filename: 'products.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('O arquivo não contém produtos');
  });

  it('retorna 400 para CSV com colunas ausentes', async () => {
    const badCsv = Buffer.from('name,price\nCamiseta,49.9');
    const res = await request(app)
      .post('/api/upload')
      .attach('file', badCsv, { filename: 'products.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
  });

  it('retorna 503 quando RabbitMQ está indisponível', async () => {
    vi.mocked(getChannel).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app)
      .post('/api/upload')
      .attach('file', VALID_CSV, { filename: 'products.csv', contentType: 'text/csv' });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Serviço de mensageria indisponível');
  });
});
