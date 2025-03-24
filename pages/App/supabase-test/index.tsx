import React from 'react';
import Link from 'next/link';

export default function SupabaseTestPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Supabase 测试页面 (App Router)</h1>
      <p>这是一个简化的测试页面，用于确认App Router路由工作正常。</p>
      <p>由于使用了App Router而不是标准的Pages Router，这个页面无法直接使用Supabase的服务器端组件功能。</p>
      <p>请参考 <code>/supabase-test</code> 页面来查看完整功能。</p>
      <Link href="/" style={{ color: 'blue', textDecoration: 'underline' }}>
        返回首页
      </Link>
    </div>
  );
} 