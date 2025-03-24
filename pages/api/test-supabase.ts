import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '../utils/supabase/server';
import { cookies } from 'next/headers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 注意：API路由不能直接使用服务器组件函数
    // 由于cookies()是一个服务器组件函数，此处将无法直接使用
    // 这是一个示例，实际上会失败，需要改用客户端方法
    
    // 以下代码在API路由中不会正常工作
    // const cookieStore = cookies();
    // const supabase = createClient(cookieStore);
    
    // 返回一个消息说明此问题
    res.status(200).json({ 
      message: '注意：API Routes不能使用服务器组件hooks如cookies()',
      info: '请使用App Router或客户端Supabase实例进行测试'
    });
  } catch (error) {
    console.error('Supabase测试失败:', error);
    res.status(500).json({ error: '连接Supabase失败', details: error instanceof Error ? error.message : String(error) });
  }
} 