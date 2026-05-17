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

  it('NACK para DLQ quando retryCount atinge MAX_RETRIES', async () => {
    vi.mocked(upsertProduct).mockImplementationOnce(() => { throw new Error('DB error'); });
    const msg = makeMsg({ sku: 'A1', name: 'Camiseta', price: 49.9, category: 'Vestuário' }, 3);
    await processMessage(mockCh, msg);
    expect(publishProduct).not.toHaveBeenCalled();
    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
  });
});
