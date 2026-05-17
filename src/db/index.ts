import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/data/products.db';

export const db = new Database(DB_PATH);

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER  PRIMARY KEY AUTOINCREMENT,
      sku        TEXT     UNIQUE NOT NULL,
      name       TEXT     NOT NULL,
      price      REAL     NOT NULL,
      category   TEXT     NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const count = (db.prepare('SELECT COUNT(*) as n FROM products').get() as { n: number }).n;
  if (count === 0) {
    const insert = db.prepare(
      'INSERT INTO products (sku, name, price, category) VALUES (?, ?, ?, ?)'
    );
    insert.run('PROD-001', 'Camiseta Azul', 49.90, 'Vestuário');
    insert.run('PROD-002', 'Tênis Branco', 299.90, 'Calçados');
    insert.run('PROD-003', 'Mochila Preta', 189.90, 'Acessórios');
  }
}

export function upsertProduct(sku: string, name: string, price: number, category: string) {
  return db.prepare(`
    INSERT INTO products (sku, name, price, category, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(sku) DO UPDATE SET
      name       = excluded.name,
      price      = excluded.price,
      category   = excluded.category,
      updated_at = CURRENT_TIMESTAMP
  `).run(sku, name, price, category);
}
