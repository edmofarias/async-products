import { Routes, Route } from 'react-router';
import Layout from '@/components/Layout';
import Upload from '@/pages/Upload';
import Products from '@/pages/Products';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Upload />} />
        <Route path="/products" element={<Products />} />
      </Routes>
    </Layout>
  );
}
