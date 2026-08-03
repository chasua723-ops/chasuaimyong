'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.push('/');
    } else {
      setError('PIN이 올바르지 않습니다');
    }
  }

  return (
    <main style={{ maxWidth: 320, margin: '80px auto', textAlign: 'center' }}>
      <h1>임용고시 중국어</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN 입력"
          style={{ fontSize: 18, padding: 8, width: '100%' }}
        />
        <button type="submit" style={{ marginTop: 12, width: '100%', padding: 8 }}>
          입장
        </button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}
