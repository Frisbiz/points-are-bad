const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function getSession() {
  try {
    const data = await apiRequest('/auth/me');
    return data.user;
  } catch (err) {
    return null;
  }
}
