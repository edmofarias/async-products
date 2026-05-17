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
