'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../utils/supabase/client';

export default function SupabaseClientTest() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[] | null>(null);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from('test_connection').select('*').limit(5);
        
        if (error) {
          setStatus('error');
          setError(error.message);
        } else {
          setStatus('success');
          setData(data);
        }
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : '未知错误');
      }
    };

    testConnection();
  }, []);

  return (
    <div className="client-test-container" style={{ padding: '2rem', marginTop: '2rem', border: '1px solid #eaeaea', borderRadius: '8px' }}>
      <h2>客户端 Supabase 连接测试</h2>
      
      {status === 'loading' && <p>正在测试连接...</p>}
      
      {status === 'error' && (
        <div style={{ color: 'red', marginTop: '1rem' }}>
          <p>客户端连接失败: {error}</p>
        </div>
      )}
      
      {status === 'success' && (
        <div style={{ color: 'green', marginTop: '1rem' }}>
          <p>客户端连接成功！</p>
          <div style={{ marginTop: '1rem' }}>
            <h3>返回数据 (可能为空如果表不存在):</h3>
            <pre style={{ background: '#f0f0f0', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
} 