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
