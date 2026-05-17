# M4 — RabbitMQ + Worker + Products UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o processamento de produtos assíncrono via RabbitMQ (queue + worker + DLQ) e completar a UI da página de Produtos com busca, ordenação por preço e paginação.

**Architecture:** A rota de upload para de inserir diretamente no SQLite e passa a publicar uma mensagem por linha CSV em `products.queue`. Um worker separado consome as mensagens, valida os campos e faz upsert no SQLite. Falhas são retentadas até 3 vezes; na 3ª falha a mensagem é morta para `products.dlq` via NACK. A página de Produtos ganha input de busca com debounce de 300ms, cabeçalho de preço clicável para ordenação e controles de paginação.

**Tech Stack:** amqplib (cliente RabbitMQ), Vitest + supertest (testes), React state para UI

---

## Mapa de arquivos

| Ação | Caminho | Responsabilidade |
|------|---------|-----------------|
| Criar | `src/validators/product.ts` | Valida campos de mensagem de produto |
| Criar | `src/services/queue.ts` | Conexão amqplib, declaração de filas, publish helper |
| Criar | `src/worker.ts` | Loop de consumo: valida → upsert → ACK/retry/DLQ |
| Criar | `vitest.config.ts` | Configuração do Vitest |
| Criar | `src/validators/product.test.ts` | Testes unitários do validador |
| Criar | `src/services/queue.test.ts` | Testes unitários do publishProduct |
| Criar | `src/worker.test.ts` | Testes unitários do processMessage |
| Criar | `src/routes/upload.test.ts` | Testes de integração da rota de upload |
| Modificar | `package.json` | Adicionar amqplib, @types/amqplib, vitest, supertest |
| Modificar | `src/routes/upload.ts` | Substituir upsertProduct por publishProduct |
| Modificar | `docker-compose.yml` | Adicionar serviços rabbitmq + worker |
| Modificar | `client/src/pages/Products.tsx` | Busca, toggle de ordenação, paginação |

---

### Task 1: Dependências e configuração de testes

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Instalar dependências**

```bash
npm install amqplib
npm install --save-dev @types/amqplib vitest supertest @types/supertest
```

- [ ] **Step 2: Adicionar script de teste ao package.json**

Editar a seção `scripts` em `package.json`:

```json
{
  "name": "async-products",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "amqplib": "^0.10.4",
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "csv-parse": "^5.6.0",
    "express": "^5.0.0",
    "multer": "^1.4.5-lts.2"
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.5",
    "@types/better-sqlite3": "^7.6.12",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Criar vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verificar que o Vitest executa**

```bash
npm test
```

Esperado: mensagem de "No test files found" ou similar — confirma que o Vitest está funcionando.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add amqplib, vitest and supertest"
```

---

### Task 2: Validador de produto

**Files:**
- Create: `src/validators/product.ts`
- Create: `src/validators/product.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// src/validators/product.test.ts
import { describe, it, expect } from 'vitest';
import { validateProduct } from './product.js';

describe('validateProduct', () => {
  it('retorna null para produto válido', () => {
    expect(validateProduct({ sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' })).toBeNull();
  });

  it('retorna erro quando sku está vazio', () => {
    expect(validateProduct({ sku: '', name: 'Camiseta', price: 49.9, category: 'Vestuário' }))
      .toBe('sku is required');
  });

  it('retorna erro quando name está em branco', () => {
    expect(validateProduct({ sku: 'A1', name: '   ', price: 49.9, category: 'Vestuário' }))
      .toBe('name is required');
  });

  it('retorna erro quando category está vazio', () => {
    expect(validateProduct({ sku: 'A1', name: 'Camiseta', price: 49.9, category: '' }))
      .toBe('category is required');
  });

  it('retorna erro quando price é negativo', () => {
    expect(validateProduct({ sku: 'A1', name: 'Camiseta', price: -1, category: 'Vestuário' }))
      .toBe('price must be a non-negative number');
  });

  it('retorna erro quando price é NaN', () => {
    expect(validateProduct({ sku: 'A1', name: 'Camiseta', price: NaN, category: 'Vestuário' }))
      .toBe('price must be a non-negative number');
  });

  it('aceita price igual a zero', () => {
    expect(validateProduct({ sku: 'A1', name: 'Camiseta', price: 0, category: 'Vestuário' })).toBeNull();
  });
});
```

- [ ] **Step 2: Executar para confirmar falha**

```bash
npm test
```

Esperado: FAIL — `Cannot find module './product.js'`

- [ ] **Step 3: Implementar o validador**

```typescript
// src/validators/product.ts
export interface ProductMessage {
  sku: string;
  name: string;
  price: number;
  category: string;
}

export function validateProduct(msg: ProductMessage): string | null {
  if (!msg.sku?.trim()) return 'sku is required';
  if (!msg.name?.trim()) return 'name is required';
  if (!msg.category?.trim()) return 'category is required';
  if (typeof msg.price !== 'number' || isNaN(msg.price) || msg.price < 0) {
    return 'price must be a non-negative number';
  }
  return null;
}
```

- [ ] **Step 4: Executar para confirmar que passa**

```bash
npm test
```

Esperado: 7 testes passando

- [ ] **Step 5: Commit**

```bash
git add src/validators/product.ts src/validators/product.test.ts
git commit -m "feat: add product message validator with tests"
```

---

### Task 3: Queue service

**Files:**
- Create: `src/services/queue.ts`
- Create: `src/services/queue.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// src/services/queue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('amqplib', () => ({
  default: { connect: vi.fn() },
}));

import { publishProduct, QUEUES, RETRY_HEADER } from './queue.js';

describe('publishProduct', () => {
  const mockSendToQueue = vi.fn();
  const mockCh = { sendToQueue: mockSendToQueue } as any;

  beforeEach(() => {
    mockSendToQueue.mockClear();
  });

  it('envia para a fila MAIN com o JSON correto', () => {
    const payload = { sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' };
    publishProduct(mockCh, payload);
    expect(mockSendToQueue).toHaveBeenCalledOnce();
    const [queue, buffer, opts] = mockSendToQueue.mock.calls[0];
    expect(queue).toBe(QUEUES.MAIN);
    expect(JSON.parse(buffer.toString())).toEqual(payload);
    expect(opts.persistent).toBe(true);
  });

  it('define retry count como 0 por padrão', () => {
    const payload = { sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' };
    publishProduct(mockCh, payload);
    const [, , opts] = mockSendToQueue.mock.calls[0];
    expect(opts.headers[RETRY_HEADER]).toBe(0);
  });

  it('passa retry count customizado no header', () => {
    const payload = { sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' };
    publishProduct(mockCh, payload, 2);
    const [, , opts] = mockSendToQueue.mock.calls[0];
    expect(opts.headers[RETRY_HEADER]).toBe(2);
  });
});
```

- [ ] **Step 2: Executar para confirmar falha**

```bash
npm test
```

Esperado: FAIL — `Cannot find module './queue.js'`

- [ ] **Step 3: Implementar o queue service**

```typescript
// src/services/queue.ts
import amqplib, { type Channel, type Connection } from 'amqplib';
import type { ProductMessage } from '../validators/product.js';

const AMQP_URL = process.env.AMQP_URL ?? 'amqp://guest:guest@localhost:5672';

export const QUEUES = {
  MAIN: 'products.queue',
  DLQ:  'products.dlq',
} as const;

export const RETRY_HEADER = 'x-retry-count';
export const MAX_RETRIES  = 3;

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function getChannel(): Promise<Channel> {
  if (channel) return channel;
  connection = await amqplib.connect(AMQP_URL);
  channel = await connection.createChannel();

  // DLQ deve ser declarada antes da fila principal que a referencia
  await channel.assertQueue(QUEUES.DLQ, { durable: true });
  await channel.assertQueue(QUEUES.MAIN, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange':    '',
      'x-dead-letter-routing-key': QUEUES.DLQ,
    },
  });

  return channel;
}

export function publishProduct(
  ch: Channel,
  payload: ProductMessage,
  retryCount = 0,
): void {
  ch.sendToQueue(
    QUEUES.MAIN,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,
      headers: { [RETRY_HEADER]: retryCount },
    },
  );
}

export async function closeConnection(): Promise<void> {
  await channel?.close();
  await connection?.close();
  channel = null;
  connection = null;
}
```

- [ ] **Step 4: Executar para confirmar que passa**

```bash
npm test
```

Esperado: 10 testes passando (7 validator + 3 queue)

- [ ] **Step 5: Commit**

```bash
git add src/services/queue.ts src/services/queue.test.ts
git commit -m "feat: add RabbitMQ queue service with tests"
```

---

### Task 4: Worker

**Files:**
- Create: `src/worker.ts`
- Create: `src/worker.test.ts`

A função `processMessage` é exportada para permitir testes unitários. O bloco `start()` que registra o consumer é isolado no final do arquivo.

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// src/worker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db/index.js', () => ({
  upsertProduct: vi.fn(),
}));

vi.mock('./services/queue.js', () => ({
  publishProduct: vi.fn(),
  QUEUES:       { MAIN: 'products.queue', DLQ: 'products.dlq' },
  RETRY_HEADER: 'x-retry-count',
  MAX_RETRIES:  3,
}));

import { processMessage } from './worker.js';
import { upsertProduct }  from './db/index.js';
import { publishProduct } from './services/queue.js';

const mockAck  = vi.fn();
const mockNack = vi.fn();
const mockCh = { ack: mockAck, nack: mockNack } as any;

function makeMsg(payload: object, retryCount = 0) {
  return {
    content: Buffer.from(JSON.stringify(payload)),
    properties: { headers: { 'x-retry-count': retryCount } },
  } as any;
}

describe('processMessage', () => {
  beforeEach(() => {
    mockAck.mockClear();
    mockNack.mockClear();
    vi.mocked(upsertProduct).mockClear();
    vi.mocked(publishProduct).mockClear();
  });

  it('ACK e upsert para produto válido', async () => {
    const msg = makeMsg({ sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' });
    await processMessage(mockCh, msg);
    expect(upsertProduct).toHaveBeenCalledWith('A1', 'Camiseta', 49.9, 'Vestuário');
    expect(mockAck).toHaveBeenCalledWith(msg);
    expect(mockNack).not.toHaveBeenCalled();
  });

  it('NACK para DLQ em JSON inválido', async () => {
    const msg = {
      content: Buffer.from('not-json'),
      properties: { headers: {} },
    } as any;
    await processMessage(mockCh, msg);
    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('NACK para DLQ em campos inválidos (sem retry)', async () => {
    const msg = makeMsg({ sku: '', name: 'Camiseta', price: 10, category: 'X' });
    await processMessage(mockCh, msg);
    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
    expect(upsertProduct).not.toHaveBeenCalled();
  });

  it('republica com retryCount + 1 em falha de DB (retryCount < MAX_RETRIES - 1)', async () => {
    vi.mocked(upsertProduct).mockImplementationOnce(() => { throw new Error('DB error'); });
    const msg = makeMsg({ sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' }, 0);
    await processMessage(mockCh, msg);
    expect(publishProduct).toHaveBeenCalledWith(
      mockCh,
      { sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' },
      1,
    );
    expect(mockAck).toHaveBeenCalledWith(msg);
    expect(mockNack).not.toHaveBeenCalled();
  });

  it('NACK para DLQ quando retryCount atinge MAX_RETRIES - 1', async () => {
    vi.mocked(upsertProduct).mockImplementationOnce(() => { throw new Error('DB error'); });
    const msg = makeMsg({ sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' }, 2);
    await processMessage(mockCh, msg);
    expect(publishProduct).not.toHaveBeenCalled();
    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
  });
});
```

- [ ] **Step 2: Executar para confirmar falha**

```bash
npm test
```

Esperado: FAIL — `Cannot find module './worker.js'`

- [ ] **Step 3: Implementar o worker**

```typescript
// src/worker.ts
import type { Channel, ConsumeMessage } from 'amqplib';
import { getChannel, publishProduct, QUEUES, RETRY_HEADER, MAX_RETRIES } from './services/queue.js';
import { validateProduct, type ProductMessage } from './validators/product.js';
import { upsertProduct } from './db/index.js';

export async function processMessage(ch: Channel, msg: ConsumeMessage): Promise<void> {
  let payload: ProductMessage;
  try {
    payload = JSON.parse(msg.content.toString()) as ProductMessage;
  } catch {
    ch.nack(msg, false, false);
    return;
  }

  const error = validateProduct(payload);
  if (error) {
    console.error(`Validation failed: ${error}`, payload);
    ch.nack(msg, false, false);
    return;
  }

  try {
    upsertProduct(payload.sku, payload.name, payload.price, payload.category);
    ch.ack(msg);
  } catch (err) {
    const retryCount = (msg.properties.headers?.[RETRY_HEADER] ?? 0) as number;
    if (retryCount < MAX_RETRIES - 1) {
      publishProduct(ch, payload, retryCount + 1);
      ch.ack(msg);
      console.warn(`Retry ${retryCount + 1}/${MAX_RETRIES} for sku=${payload.sku}`);
    } else {
      ch.nack(msg, false, false);
      console.error(`Max retries reached for sku=${payload.sku}, sending to DLQ`);
    }
  }
}

async function start(): Promise<void> {
  const ch = await getChannel();
  ch.prefetch(1);

  await ch.consume(QUEUES.MAIN, (msg) => {
    if (!msg) return;
    processMessage(ch, msg).catch((err) => {
      console.error('Unexpected error processing message:', err);
      ch.nack(msg, false, false);
    });
  });

  console.log(`Worker started, consuming from ${QUEUES.MAIN}`);
}

start().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Executar para confirmar que passa**

```bash
npm test
```

Esperado: 15 testes passando (7 validator + 3 queue + 5 worker)

- [ ] **Step 5: Commit**

```bash
git add src/worker.ts src/worker.test.ts
git commit -m "feat: add RabbitMQ worker with retry and DLQ routing"
```

---

### Task 5: Atualizar rota de upload para publicar na fila

**Files:**
- Modify: `src/routes/upload.ts`
- Create: `src/routes/upload.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// src/routes/upload.test.ts
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
```

- [ ] **Step 2: Executar para confirmar falha**

```bash
npm test
```

Esperado: FAIL nos testes do upload — a rota ainda chama `upsertProduct` em vez de `publishProduct`

- [ ] **Step 3: Atualizar src/routes/upload.ts**

Substituir todo o conteúdo do arquivo:

```typescript
// src/routes/upload.ts
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { getChannel, publishProduct } from '../services/queue.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadRouter = Router();

const REQUIRED_HEADERS = ['sku', 'name', 'price', 'category'];

uploadRouter.post('/', upload.single('file'), async (req: Request, res: Response) => {
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

  let ch;
  try {
    ch = await getChannel();
  } catch {
    return res.status(503).json({ error: 'Serviço de mensageria indisponível' });
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

    publishProduct(ch, { sku, name, price, category });
    queued++;
  }

  return res.status(202).json({ queued, errors });
});
```

- [ ] **Step 4: Executar para confirmar que todos os testes passam**

```bash
npm test
```

Esperado: 20 testes passando (7 validator + 3 queue + 5 worker + 5 upload)

- [ ] **Step 5: Commit**

```bash
git add src/routes/upload.ts src/routes/upload.test.ts
git commit -m "feat: upload route publishes to RabbitMQ queue instead of direct DB insert"
```

---

### Task 6: Docker Compose — adicionar RabbitMQ e worker

**Files:**
- Modify: `docker-compose.yml`

Nenhum teste automatizado aqui; a verificação é manual via `docker compose up`.

- [ ] **Step 1: Substituir docker-compose.yml**

```yaml
services:
  rabbitmq:
    image: rabbitmq:3-management
    container_name: async-products-rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: async-products-api
    ports:
      - "3000:3000"
    volumes:
      - ./src:/app/src
      - /app/node_modules
      - ./data:/data
    environment:
      - NODE_ENV=development
      - PORT=3000
      - DB_PATH=/data/products.db
      - AMQP_URL=amqp://guest:guest@rabbitmq:5672
    depends_on:
      rabbitmq:
        condition: service_healthy

  worker:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: async-products-worker
    command: ["npx", "tsx", "src/worker.ts"]
    volumes:
      - ./src:/app/src
      - /app/node_modules
      - ./data:/data
    environment:
      - NODE_ENV=development
      - DB_PATH=/data/products.db
      - AMQP_URL=amqp://guest:guest@rabbitmq:5672
    depends_on:
      rabbitmq:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    container_name: async-products-web
    ports:
      - "5173:5173"
    volumes:
      - ./client/src:/app/src
      - ./client/index.html:/app/index.html
      - ./client/vite.config.ts:/app/vite.config.ts
      - /app/node_modules
    depends_on:
      - api
    environment:
      - NODE_ENV=development
```

- [ ] **Step 2: Subir o ambiente e verificar os logs**

```bash
docker compose up --build
```

Esperado nos logs:
- `async-products-rabbitmq`: "Server startup complete"
- `async-products-api`: "API listening on http://localhost:3000"
- `async-products-worker`: "Worker started, consuming from products.queue"
- Sem erros de conexão recusada

- [ ] **Step 3: Testar o fluxo completo via curl**

```bash
# Criar um CSV de teste
echo "sku,name,price,category
PROD-010,Jaqueta,299.90,Vestuário
PROD-011,Boné,59.90,Acessórios" > /tmp/test.csv

# Fazer upload
curl -s -X POST http://localhost:3000/api/upload \
  -F "file=@/tmp/test.csv" | jq .
```

Esperado: `{ "queued": 2, "errors": [] }`

```bash
# Aguardar ~1s e verificar que os produtos apareceram
curl -s "http://localhost:3000/api/products?search=Jaqueta" | jq .
```

Esperado: `{ "data": [{ "sku": "PROD-010", ... }], "total": 1, ... }`

- [ ] **Step 4: Verificar a Management UI do RabbitMQ**

Abrir `http://localhost:15672` (usuário: `guest`, senha: `guest`).

Confirmar em Queues:
- `products.queue` existe e está com 0 mensagens prontas (worker consumiu tudo)
- `products.dlq` existe

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add RabbitMQ and worker services to docker-compose"
```

---

### Task 7: Completar UI da página de Produtos

**Files:**
- Modify: `client/src/pages/Products.tsx`

- [ ] **Step 1: Substituir o conteúdo de Products.tsx**

```tsx
// client/src/pages/Products.tsx
import { useEffect, useState } from 'react';

interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  category: string;
}

interface ApiResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;

export default function Products() {
  const [products, setProducts]         = useState<Product[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState('');
  const [debouncedSearch, setDebounced] = useState('');
  const [sort, setSort]                 = useState<'price_asc' | 'price_desc'>('price_asc');
  const [loading, setLoading]           = useState(true);

  // Debounce 300ms
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset para página 1 quando busca ou ordenação muda
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sort]);

  // Buscar produtos
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search: debouncedSearch,
      sort,
      page:  String(page),
      limit: String(LIMIT),
    });
    fetch(`/api/products?${params}`)
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        setProducts(json.data);
        setTotal(json.total);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, sort, page]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <h1 className="text-2xl font-bold">Produtos</h1>

      <div className="mt-4 flex items-center gap-4">
        <input
          type="text"
          placeholder="Buscar por nome ou SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="whitespace-nowrap text-sm text-muted-foreground">
          {total} produto(s)
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Categoria</th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-medium hover:text-foreground"
                onClick={() =>
                  setSort((s) => (s === 'price_asc' ? 'price_desc' : 'price_asc'))
                }
              >
                Preço {sort === 'price_asc' ? '↑' : '↓'}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum produto encontrado
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-t transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">{p.category}</td>
                  <td className="px-4 py-3 text-right">
                    {p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border px-3 py-1.5 disabled:opacity-40 hover:bg-muted"
          >
            ← Anterior
          </button>
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md border px-3 py-1.5 disabled:opacity-40 hover:bg-muted"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar no browser (dev local)**

Com `docker compose up` rodando (ou `npm run dev` + `cd client && npm run dev`):

1. Abrir `http://localhost:5173/products`
2. Confirmar que a tabela carrega produtos
3. Digitar algo no campo de busca — a tabela deve filtrar após ~300ms
4. Clicar no cabeçalho "Preço ↑" — deve mudar para "Preço ↓" e reordenar
5. Se houver mais de 20 produtos, confirmar que os botões Anterior/Próxima aparecem e funcionam

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Products.tsx
git commit -m "feat: complete Products page with search, sort and pagination"
```

---

## Self-Review: Cobertura da Spec

| Requisito da Spec | Tarefa |
|-------------------|--------|
| Fila `products.queue` | Task 3 |
| Dead Letter Queue `products.dlq` via `x-dead-letter-exchange` | Task 3 |
| Retry até 3 tentativas + DLQ após 3ª falha | Task 4 |
| Upload publica mensagens individuais → `HTTP 202 { queued: N }` | Task 5 |
| `503` quando RabbitMQ indisponível | Task 5 |
| Worker valida campos, upsert por SKU | Task 4 |
| Worker ACK no sucesso, NACK no retry/DLQ | Task 4 |
| Serviços `rabbitmq` e `worker` no Compose | Task 6 |
| Mesma imagem para `api` e `worker` | Task 6 |
| Products: busca com debounce 300ms | Task 7 |
| Products: ordenação por preço (toggle asc/desc) | Task 7 |
| Products: paginação com controles anterior/próximo | Task 7 |
