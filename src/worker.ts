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

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('Worker failed to start:', err);
    process.exit(1);
  });
}
