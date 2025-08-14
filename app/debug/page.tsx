'use client';

import { useAuth } from '../../components/AuthContext';
import { useState } from 'react';

export default function DebugPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [testResult, setTestResult] = useState<string>('');

  const checkToken = () => {
    const token = localStorage.getItem('cognito_token');
    if (!token) {
      setTokenInfo({ error: 'No token found' });
      return;
    }

    try {
      // Decode the JWT token (without verification) to see its contents
      const parts = token.split('.');
      if (parts.length !== 3) {
        setTokenInfo({ error: 'Invalid token format' });
        return;
      }

      const payload = JSON.parse(atob(parts[1]));
      setTokenInfo({
        token: token.substring(0, 50) + '...',
        payload,
        exp: new Date(payload.exp * 1000).toISOString(),
        now: new Date().toISOString(),
        isExpired: Date.now() > payload.exp * 1000,
      });
    } catch (error) {
      setTokenInfo({ error: 'Failed to decode token', details: error });
    }
  };

  const testApiGateway = async () => {
    const token = localStorage.getItem('cognito_token');
    if (!token) {
      setTestResult('No token found');
      return;
    }

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: 'Test video generation',
          totalDuration: 10,
          sceneCount: 1,
        }),
      });

      const result = await response.text();
      setTestResult(`Status: ${response.status}\nResponse: ${result}`);
    } catch (error) {
      setTestResult(`Error: ${error}`);
    }
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Authentication Debug</h1>

      <div className="space-y-6">
        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Auth Status</h2>
          <div className="space-y-2">
            <p>
              <strong>Loading:</strong> {isLoading ? 'Yes' : 'No'}
            </p>
            <p>
              <strong>Authenticated:</strong> {isAuthenticated ? 'Yes' : 'No'}
            </p>
            <p>
              <strong>User:</strong>{' '}
              {user ? JSON.stringify(user, null, 2) : 'None'}
            </p>
          </div>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Token Analysis</h2>
          <button
            onClick={checkToken}
            className="bg-blue-500 px-4 py-2 rounded mb-4"
          >
            Check Token
          </button>
          {tokenInfo && (
            <pre className="bg-slate-900 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(tokenInfo, null, 2)}
            </pre>
          )}
        </div>

        <div className="bg-slate-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">API Gateway Test</h2>
          <button
            onClick={testApiGateway}
            className="bg-green-500 px-4 py-2 rounded mb-4"
          >
            Test API Gateway
          </button>
          {testResult && (
            <pre className="bg-slate-900 p-4 rounded text-sm overflow-auto">
              {testResult}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
