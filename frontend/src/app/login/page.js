'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/api';
import { setToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await login(email, password);
      setToken(token);
      router.push('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold text-slate-100 mb-6 text-center">Sign in</h1>
      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4"
      >
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-xs text-slate-500">
          No account?{' '}
          <Link href="/register" className="text-blue-400 hover:text-blue-300">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}

function Field({ label, type, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}
