# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (raiz do projeto)

```bash
npm run dev        # API em modo watch (tsx) na porta 3000
npm test           # Vitest — roda todos os testes uma vez
npm run test:watch # Vitest em modo watch
```

Rodar um único arquivo de teste:
```bash
npx vitest run src/validators/product.test.ts
```

### Frontend (`client/`)

```bash
cd client
npm run dev   # Vite dev server na porta 5173
npm run build # Build de produção
```

### Docker

```bash
docker compose up --build   # Sobe todos os 4 serviços
docker compose up api worker # Só backend + worker (sem UI)
```

## Arquitetura

### Visão geral

```
Upload CSV → POST /api/upload → products.queue (RabbitMQ)
                                      ↓
                               worker consome
                                      ↓
                           upsert no SQLite por SKU
                                      ↓ (falha)
                           retry até 3x → products.dlq
```

### Separação api / worker

`api` e `worker` usam a **mesma imagem Docker** (`Dockerfile`). O `docker-compose.yml` sobrescreve o command do worker para `npx tsx src/worker.ts`. Isso garante que `src/db/index.ts`, `src/validators/` e `src/services/queue.ts` são sempre compartilhados entre os dois processos.

`src/worker.ts` protege o bloco `start()` com `process.env.NODE_ENV !== 'test'` para não tentar conectar ao RabbitMQ durante os testes.

### Módulos do backend

| Módulo | Responsabilidade |
|--------|-----------------|
| `src/db/index.ts` | Conexão SQLite singleton (`better-sqlite3`), `initDb()`, `upsertProduct()` |
| `src/services/queue.ts` | Conexão amqplib singleton, declaração de filas, `publishProduct()`, `getChannel()` |
| `src/validators/product.ts` | `validateProduct()` — pura, sem I/O, exportada para reutilização nos testes do worker |
| `src/routes/upload.ts` | Recebe CSV via multer, valida, publica mensagens individuais na fila |
| `src/routes/products.ts` | `GET /api/products` — busca, sort, paginação via SQLite |
| `src/worker.ts` | Loop de consumo: valida → upsert → ACK / retry / NACK→DLQ |

### Filas RabbitMQ

`products.queue` é declarada com `x-dead-letter-exchange: ''` e `x-dead-letter-routing-key: products.dlq`. O retry é manual via header `x-retry-count`: o worker republica até `MAX_RETRIES` (3) antes de NACK sem requeue, o que aciona o dead-letter routing para `products.dlq`.

### Frontend

Vite proxia `/api/*` para `http://api:3000` (ver `client/vite.config.ts`). O alias `@/` aponta para `client/src/`. Não usa shadcn components — UI é feita com Tailwind direto.

### Variáveis de ambiente

| Variável | Padrão | Onde usada |
|----------|--------|------------|
| `PORT` | `3000` | `src/server.ts` |
| `DB_PATH` | `/data/products.db` | `src/db/index.ts` |
| `AMQP_URL` | `amqp://guest:guest@localhost:5672` | `src/services/queue.ts` |
