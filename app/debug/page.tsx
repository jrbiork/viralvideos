'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../components/AuthContext';

export default function DebugPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('cognito_token');
    setToken(storedToken);
  }, []);

  const testAuth = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      setTestResult({
        status: response.status,
        ok: response.ok,
        data,
      });
    } catch (error) {
      setTestResult({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const clearToken = () => {
    localStorage.removeItem('cognito_token');
    setToken(null);
    setTestResult(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">
          Authentication Debug
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Auth Context Status */}
          <div className="glass-effect rounded-2xl p-6">
            <h2 className="text-2xl font-bold text-white mb-4">
              Auth Context Status
            </h2>
            <div className="space-y-4">
              <div>
                <span className="text-slate-300">Loading:</span>
                <span
                  className={`ml-2 px-2 py-1 rounded text-sm ${
                    isLoading
                      ? 'bg-yellow-500 text-black'
                      : 'bg-green-500 text-white'
                  }`}
                >
                  {isLoading ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="text-slate-300">Authenticated:</span>
                <span
                  className={`ml-2 px-2 py-1 rounded text-sm ${
                    isAuthenticated
                      ? 'bg-green-500 text-white'
                      : 'bg-red-500 text-white'
                  }`}
                >
                  {isAuthenticated ? 'Yes' : 'No'}
                </span>
              </div>
              {user && (
                <div>
                  <span className="text-slate-300">User:</span>
                  <div className="ml-2 mt-2 p-3 bg-slate-800 rounded-lg">
                    <div>ID: {user.id}</div>
                    <div>Email: {user.email}</div>
                    <div>Name: {user.name}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Token Status */}
          <div className="glass-effect rounded-2xl p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Token Status</h2>
            <div className="space-y-4">
              <div>
                <span className="text-slate-300">Token Present:</span>
                <span
                  className={`ml-2 px-2 py-1 rounded text-sm ${
                    token ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                  }`}
                >
                  {token ? 'Yes' : 'No'}
                </span>
              </div>
              {token && (
                <div>
                  <span className="text-slate-300">Token Length:</span>
                  <span className="ml-2 px-2 py-1 rounded text-sm bg-blue-500 text-white">
                    {token.length}
                  </span>
                </div>
              )}
              {token && (
                <div>
                  <span className="text-slate-300">Token Preview:</span>
                  <div className="ml-2 mt-2 p-3 bg-slate-800 rounded-lg font-mono text-xs break-all">
                    {token.substring(0, 50)}...
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Environment Variables */}
          <div className="glass-effect rounded-2xl p-6">
            <h2 className="text-2xl font-bold text-white mb-4">
              Environment Variables
            </h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-300">COGNITO_REGION:</span>
                <span className="ml-2 text-white">
                  {process.env.NEXT_PUBLIC_COGNITO_REGION || 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-slate-300">COGNITO_USER_POOL_ID:</span>
                <span className="ml-2 text-white">
                  {process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
                    ? 'Set'
                    : 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-slate-300">COGNITO_CLIENT_ID:</span>
                <span className="ml-2 text-white">
                  {process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
                    ? 'Set'
                    : 'Not set'}
                </span>
              </div>
              <div>
                <span className="text-slate-300">COGNITO_DOMAIN:</span>
                <span className="ml-2 text-white">
                  {process.env.NEXT_PUBLIC_COGNITO_DOMAIN ? 'Set' : 'Not set'}
                </span>
              </div>
            </div>
          </div>

          {/* Test API */}
          <div className="glass-effect rounded-2xl p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Test API</h2>
            <div className="space-y-4">
              <button
                onClick={testAuth}
                disabled={!token || loading}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed"
              >
                {loading ? 'Testing...' : 'Test /api/user'}
              </button>

              <button
                onClick={clearToken}
                className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Clear Token
              </button>

              {testResult && (
                <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                  <h3 className="text-white font-bold mb-2">Test Result:</h3>
                  <pre className="text-xs text-slate-300 overflow-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 glass-effect rounded-2xl p-6">
          <h2 className="text-2xl font-bold text-white mb-4">
            Troubleshooting Steps
          </h2>
          <div className="space-y-2 text-slate-300">
            <p>
              1. Check if you're authenticated in the Auth Context Status
              section
            </p>
            <p>2. Verify that a token exists in localStorage</p>
            <p>3. Ensure all Cognito environment variables are set</p>
            <p>4. Test the API endpoint to see detailed error messages</p>
            <p>5. Check the browser console for JWT validation logs</p>
          </div>
        </div>
      </div>
    </div>
  );
}
