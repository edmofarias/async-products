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
