import { useState, useRef, DragEvent, ChangeEvent } from 'react';

interface PreviewRow {
  sku: string;
  name: string;
  price: string;
  category: string;
}

const MAX_SIZE = 5 * 1024 * 1024;
const REQUIRED = ['sku', 'name', 'price', 'category'];

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validateAndSet(f: File) {
    setError('');
    setSuccess('');
    setPreview([]);
    setFile(null);

    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('O arquivo deve ter extensão .csv');
      return;
    }
    if (f.size > MAX_SIZE) {
      setError('O arquivo excede o tamanho máximo de 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(Boolean);
      if (lines.length < 2) {
        setError('O arquivo não contém linhas de dados');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const missing = REQUIRED.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        setError(`Colunas ausentes: ${missing.join(', ')}`);
        return;
      }
      const rows: PreviewRow[] = lines.slice(1, 6).map((line) => {
        const vals = line.split(',').map((v) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return obj as unknown as PreviewRow;
      });
      setPreview(rows);
      setFile(f);
    };
    reader.readAsText(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndSet(f);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) validateAndSet(f);
    e.target.value = '';
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError('');
    setSuccess('');
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao processar arquivo');
      setSuccess(`${json.queued} produto(s) importado(s) com sucesso`);
      setFile(null);
      setPreview([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Upload de Produtos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Importe produtos via CSV com colunas: <code>sku, name, price, category</code>. Máx 5MB.
      </p>

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors
          ${dragging ? 'border-primary bg-muted/40' : 'border-border hover:border-primary hover:bg-muted/20'}`}
      >
        <p className="text-sm text-muted-foreground">
          {file
            ? `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`
            : 'Arraste um arquivo .csv ou clique para selecionar'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onChange}
        />
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      )}
      {success && (
        <p className="mt-3 text-sm font-medium text-green-600">{success}</p>
      )}

      {preview.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            Pré-visualização — {preview.length} linha(s)
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-left">Nome</th>
                  <th className="px-4 py-2 text-left">Categoria</th>
                  <th className="px-4 py-2 text-right">Preço</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">{row.sku}</td>
                    <td className="px-4 py-2">{row.name}</td>
                    <td className="px-4 py-2">{row.category}</td>
                    <td className="px-4 py-2 text-right">{row.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {file && (
        <button
          onClick={handleUpload}
          disabled={loading}
          className="mt-6 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Importando...' : 'Importar'}
        </button>
      )}
    </div>
  );
}
