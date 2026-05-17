# Async Products — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

---

## Overview

Aplicação web para importação assíncrona de produtos via CSV. O usuário faz upload de um arquivo CSV, cada linha é publicada individualmente no RabbitMQ e processada em background por um worker dedicado. Os produtos são persistidos no SQLite com upsert por SKU. Uma segunda página permite listar, filtrar, ordenar e paginar os produtos importados.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Infraestrutura | Docker + Docker Compose |
| Framework | Express.js |
| UI | Shadcn UI + Tailwind CSS (Vite) |
| Mensageria | RabbitMQ |
| Banco de dados | SQLite |

---

## Arquitetura

```
Docker Compose
├── api       → Express + UI (porta 3000)
├── worker    → Consumidor RabbitMQ (mesmo código, entry point diferente)
├── rabbitmq  → Broker (porta 5672 AMQP + 15672 management UI)
└── volume    → SQLite em /data/products.db (compartilhado entre api e worker)
```

`api` e `worker` usam a **mesma imagem Docker**. O comando de start difere:
- `api`: `node src/server.js`
- `worker`: `node src/worker.js`

Isso garante que modelos, validações e utilitários permanecem sincronizados sem duplicação.

---

## Filas RabbitMQ

| Fila | Descrição |
|------|-----------|
| `products.queue` | Fila principal — recebe uma mensagem por linha do CSV |
| `products.dlq` | Dead Letter Queue — recebe mensagens após 3 tentativas falhas |

O roteamento para a DLQ é feito via `x-dead-letter-exchange` configurado na declaração da fila. O contador de tentativas é rastreado via header `x-death`.

---

## Fluxo de Dados

```
[Usuário] → Upload CSV (multipart/form-data)
    ↓
[API] Validações:
  - Extensão .csv
  - Tamanho máximo 5MB
  - Cabeçalho contém: name, price, category, sku
  - Pelo menos 1 linha de dados
    ↓
[API] Publica cada linha como mensagem individual → products.queue
[API] Retorna HTTP 202 { queued: N }
    ↓
[Worker] Para cada mensagem:
  - Valida campos (price numérico, campos obrigatórios não vazios)
  - Upsert no SQLite por SKU
  - Sucesso → ACK
    ↓ (falha)
  - NACK + requeue → até 3 tentativas
  - 3ª falha → roteado para products.dlq automaticamente
```

---

## API Endpoints

| Método | Rota | Descrição | Resposta |
|--------|------|-----------|----------|
| `POST` | `/api/upload` | Recebe CSV, valida, enfileira | `202 { queued: N }` |
| `GET` | `/api/products` | Lista produtos paginados | `200 { data: [], total, page, limit }` |

**Query params de `/api/products`:**
- `search` — filtra por nome ou SKU (LIKE)
- `sort` — `price_asc` ou `price_desc`
- `page` — número da página (default: 1)
- `limit` — itens por página (default: 20)

---

## Modelo de Dados

```sql
CREATE TABLE products (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  sku        TEXT     UNIQUE NOT NULL,
  name       TEXT     NOT NULL,
  price      REAL     NOT NULL,
  category   TEXT     NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Upsert por SKU: se o SKU já existe, atualiza `name`, `price`, `category` e `updated_at`.

---

## Schema do CSV

```
sku,name,price,category
PROD-001,Camiseta Azul,49.90,Vestuário
PROD-002,Tênis Branco,299.90,Calçados
```

Colunas obrigatórias e fixas: `sku`, `name`, `price`, `category`. Arquivos fora desse schema são rejeitados com HTTP 400.

---

## Páginas UI

### Upload (`/`)
- Dropzone: arrastar ou selecionar arquivo `.csv`
- Validação client-side: extensão `.csv`, tamanho ≤ 5MB
- Preview das primeiras linhas antes do envio (tabela com as 4 colunas)
- Botão "Importar" — estado de loading durante o request
- Toast de confirmação: "X produtos enfileirados para processamento"

### Produtos (`/products`)
- Tabela: SKU, Nome, Categoria, Preço
- Campo de busca com debounce 300ms (filtra nome ou SKU)
- Ordenação por preço clicando no cabeçalho da coluna (toggle asc/desc)
- Paginação: 20 itens por página, controles anterior/próximo + página atual

---

## Tratamento de Erros

| Cenário | Comportamento |
|---------|--------------|
| CSV com extensão inválida | `400` com mensagem descritiva |
| CSV com cabeçalho incorreto | `400` com colunas esperadas vs recebidas |
| Arquivo > 5MB | `400 "Arquivo excede o tamanho máximo de 5MB"` |
| CSV vazio (sem linhas de dados) | `400 "O arquivo não contém produtos"` |
| RabbitMQ indisponível | `503 "Serviço de mensageria indisponível"` |
| Campo inválido no worker | NACK → retry → DLQ após 3 falhas |

---

## Estrutura de Pastas (proposta)

```
async-products/
├── docker-compose.yml
├── Dockerfile
├── src/
│   ├── server.js          # Entry point da API
│   ├── worker.js          # Entry point do worker
│   ├── routes/
│   │   ├── upload.js
│   │   └── products.js
│   ├── services/
│   │   ├── queue.js       # Conexão e publish/consume RabbitMQ
│   │   └── db.js          # Conexão SQLite + queries
│   ├── validators/
│   │   └── csv.js         # Validação do arquivo e linhas
│   └── ui/                # Frontend Vite + Shadcn
│       ├── index.html
│       └── src/
│           ├── pages/
│           │   ├── Upload.jsx
│           │   └── Products.jsx
│           └── components/
├── data/                  # Montado como volume Docker
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-05-17-async-products-design.md
```
