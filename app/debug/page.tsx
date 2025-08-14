'use client';

import { useAuth } from '../../components/AuthContext';
import { useState } from 'react';

export default function DebugPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [testResult, setTestResult] = useState<string>('');

  const checkSession = async () => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (data.user) {
        setTokenInfo({
          session: 'Active',
          user: data.user,
          timestamp: new Date().toISOString(),
          responseData: data,
        });
      } else {
        setTokenInfo({ error: 'No active session' });
      }
    } catch (error) {
      setTokenInfo({ error: 'Failed to check session', details: error });
    }
  };

  const testApiGateway = async () => {
    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
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

  const debugToken = async () => {
    try {
      setTestResult(
        'Token debugging is not available with session-based auth. The token is only used temporarily during login.',
      );
    } catch (error) {
      setTestResult(`Error: ${error}`);
    }
  };

  const testCognitoUserInfo = async () => {
    try {
      setTestResult(
        'Cognito user info testing is not available with session-based auth. User info is fetched during session creation.',
      );
    } catch (error) {
      setTestResult(`Error: ${error}`);
    }
  };

  const testSessionCreation = async () => {
    try {
      setTestResult(
        'Testing session creation... Please sign out and sign in again to see the debug logs in your server console.',
      );
    } catch (error) {
      setTestResult(`Error: ${error}`);
    }
  };

  const testCognitoConfig = async () => {
    try {
      const response = await fetch('/api/auth/test-cognito-config');
      const result = await response.json();
      setTestResult(`Cognito Config Test:\n${JSON.stringify(result, null, 2)}`);
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
          <h2 className="text-xl font-semibold mb-4">Session Analysis</h2>
          <button
            onClick={checkSession}
            className="bg-blue-500 px-4 py-2 rounded mb-4"
          >
            Check Session
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
            className="bg-green-500 px-4 py-2 rounded mb-4 mr-2"
          >
            Test API Gateway
          </button>
          <button
            onClick={debugToken}
            className="bg-purple-500 px-4 py-2 rounded mb-4 mr-2"
          >
            Debug Token
          </button>
          <button
            onClick={testCognitoUserInfo}
            className="bg-orange-500 px-4 py-2 rounded mb-4 mr-2"
          >
            Test Cognito User Info
          </button>
          <button
            onClick={testSessionCreation}
            className="bg-blue-500 px-4 py-2 rounded mb-4 mr-2"
          >
            Test Session Creation
          </button>
          <button
            onClick={testCognitoConfig}
            className="bg-green-500 px-4 py-2 rounded mb-4"
          >
            Test Cognito Config
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
