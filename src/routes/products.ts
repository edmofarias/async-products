import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';

export const productsRouter = Router();

productsRouter.get('/', (req: Request, res: Response) => {
  const search = String(req.query.search ?? '');
  const sort   = String(req.query.sort   ?? 'price_asc');
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const orderBy = sort === 'price_desc' ? 'price DESC' : 'price ASC';
  const pattern = `%${search}%`;

  const data = db.prepare(`
    SELECT id, sku, name, price, category, created_at, updated_at
    FROM products
    WHERE name LIKE ? OR sku LIKE ?
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(pattern, pattern, limit, offset);

  const { n: total } = db.prepare(`
    SELECT COUNT(*) as n FROM products
    WHERE name LIKE ? OR sku LIKE ?
  `).get(pattern, pattern) as { n: number };

  res.json({ data, total, page, limit });
});
