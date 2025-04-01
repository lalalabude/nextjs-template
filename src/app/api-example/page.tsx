'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

// 模板类型定义
interface Template {
  id: string;
  name: string;
  file_url: string;
  file_type: string;
  created_at: string;
}

// API响应类型
interface ApiResponse<T> {
  success: boolean;
  templates?: T[];
  error?: string;
}

export default function ApiExamplePage() {
  const [apiKey, setApiKey] = useState('');
  const [response, setResponse] = useState<ApiResponse<Template> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 处理API调用
  const handleApiCall = async (endpoint: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.get<ApiResponse<Template>>(endpoint, { apiKey });
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">API认证示例</h1>
      
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          API密钥
          <span className="text-gray-500 ml-2 text-xs">
            (在.env.local中配置的API_SECRET_KEY)
          </span>
        </label>
        <input
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
          placeholder="输入API密钥..."
        />
      </div>
      
      <div className="flex space-x-4 mb-8">
        <button
          onClick={() => handleApiCall('/api/templates')}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          获取模板列表
        </button>
      </div>
      
      {loading && (
        <div className="mb-4 text-gray-600">加载中...</div>
      )}
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <p className="font-bold">错误</p>
          <p>{error}</p>
        </div>
      )}
      
      {response && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">API响应</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
      
      <div className="mt-8 p-4 bg-gray-100 rounded">
        <h2 className="text-lg font-semibold mb-2">如何使用</h2>
        <p className="mb-2">1. 在.env.local中设置<code className="bg-gray-200 px-1 rounded">API_SECRET_KEY</code>作为您的API密钥</p>
        <p className="mb-2">2. 在API请求中添加Authorization头：<code className="bg-gray-200 px-1 rounded">Authorization: Bearer YOUR_API_KEY</code></p>
        <p className="mb-2">3. 或者使用apiClient工具：</p>
        <pre className="bg-gray-200 p-2 rounded text-sm">
{`import { apiClient } from '@/lib/api-client';

// 使用API密钥调用
const result = await apiClient.get('/api/your-endpoint', { 
  apiKey: 'your-api-key-here' 
});`}
        </pre>
      </div>
    </div>
  );
} 