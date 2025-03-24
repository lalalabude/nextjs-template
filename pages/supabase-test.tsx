import React from 'react';
import Link from 'next/link';

export default function SupabaseTest() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Supabase 测试页面</h1>
      <p>这是一个简单的测试页面，用于确认路由工作正常。</p>
      <Link href="/" style={{ color: 'blue', textDecoration: 'underline' }}>
        返回首页
      </Link>
    </div>
  );
} 