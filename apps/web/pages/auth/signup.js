'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiRequest } from '../../lib/api';
import { useSession } from '../../components/SessionProvider';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const { refresh } = useSession();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName })
      });
      await refresh();
      router.push(displayName ? '/' : '/auth/display-name');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card stack" style={{ maxWidth: '420px' }}>
      <h2>Create account</h2>
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
        <div>
          <label>Display name (optional)</label>
          <input
            className="input"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="What should people call you?"
          />
        </div>
        <button className="button" type="submit">
          Sign up
        </button>
      </form>
      <p>
        Already have an account? <Link href="/auth/login">Log in</Link>
      </p>
    </div>
  );
}
