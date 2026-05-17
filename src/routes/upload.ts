import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { upsertProduct } from '../db/index.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadRouter = Router();

const REQUIRED_HEADERS = ['sku', 'name', 'price', 'category'];

uploadRouter.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
    return res.status(400).json({ error: 'O arquivo deve ter extensão .csv' });
  }

  let records: Record<string, string>[];
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    return res.status(400).json({ error: 'O arquivo não é um CSV válido' });
  }

  if (records.length === 0) {
    return res.status(400).json({ error: 'O arquivo não contém produtos' });
  }

  const headers = Object.keys(records[0]).map((h) => h.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return res.status(400).json({
      error: `Colunas obrigatórias ausentes: ${missing.join(', ')}`,
    });
  }

  let queued = 0;
  const errors: string[] = [];

  for (const row of records) {
    const sku      = row.sku?.trim();
    const name     = row.name?.trim();
    const price    = parseFloat(row.price);
    const category = row.category?.trim();

    if (!sku || !name || !category) {
      errors.push(`Linha ignorada: campos vazios (sku="${sku}")`);
      continue;
    }
    if (isNaN(price) || price < 0) {
      errors.push(`Linha ignorada: preço inválido para sku="${sku}"`);
      continue;
    }

    upsertProduct(sku, name, price, category);
    queued++;
  }

  res.status(202).json({ queued, errors });
});
