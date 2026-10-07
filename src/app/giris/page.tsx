'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GirisPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/giris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError(json.error || 'Hatalı şifre');
      }
    } catch {
      setError('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-red-600 p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-sm w-full">
        <div className="text-center mb-6">
          <img src="/trlogo2.jpg" alt="TRGUNDEM" className="h-16 mx-auto mb-4 rounded" />
          <h1 className="text-xl font-bold text-gray-800">TRGUNDEM.NET</h1>
          <p className="text-sm text-gray-500 mt-1">Siteye erişim şifre korumalıdır</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Şifre"
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            autoFocus
          />
          {error && <p className="text-red-600 text-xs text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-red-600 text-white py-2 rounded-md font-medium hover:bg-red-700 transition disabled:opacity-50"
          >
            {loading ? 'Kontrol ediliyor...' : 'Giriş'}
          </button>
        </form>
      </div>
    </div>
  );
}
