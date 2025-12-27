'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiRequest } from '../../lib/api';
import { useSession } from '../../components/SessionProvider';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const { refresh } = useSession();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      await refresh();
      const needsDisplayName = !data.user.display_name;
      router.push(needsDisplayName ? '/auth/display-name' : '/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card stack" style={{ maxWidth: '420px' }}>
      <h2>Log in</h2>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <form className="stack" onSubmit={handleSubmit}>
        <div>
          <label>Email</label>
          <input className="input" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        <button className="button" type="submit">
          Continue
        </button>
      </form>
      <p>
        New here? <Link href="/auth/signup">Create an account</Link>
      </p>
    </div>
  );
}
