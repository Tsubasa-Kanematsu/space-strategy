import { useState } from 'react';
import { signIn } from '../../utils/auth';

interface Props {
  onLogin: () => void;
}

/**
 * 共有パスワードによるアクセス制限。
 * プロトタイプのため email 等は不要。1つのパスワードで開く。
 */
export function LoginPage({ onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn('user', password);
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#f8f9fa',
    }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: '2.5rem',
        width: 360, boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.5rem' }}>
          <i className="bi bi-rocket-takeoff-fill text-primary" style={{ fontSize: 22 }} />
          <h5 style={{ margin: 0, fontWeight: 600 }}>space-strategy</h5>
        </div>
        <p className="text-muted small mb-3">
          ミッション解析共通基盤（運用版）。アクセスパスワードを入力してください。
        </p>

        {error && (
          <div className="alert alert-danger py-2 px-3" style={{ fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="form-label small">パスワード</label>
            <input
              type="password" className="form-control form-control-sm"
              value={password} onChange={(e) => setPassword(e.target.value)}
              required autoFocus
            />
          </div>
          <button className="btn btn-primary btn-sm w-100" type="submit" disabled={loading}>
            {loading ? <span className="spinner-border spinner-border-sm me-1" /> : null}
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}
