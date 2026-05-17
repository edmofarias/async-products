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
