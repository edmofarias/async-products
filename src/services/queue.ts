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
