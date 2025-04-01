import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 定义需要进行API认证的路径前缀
const PROTECTED_API_ROUTES = ['/api/'];

// API密钥
const API_KEY = process.env.API_SECRET_KEY;

// 错误响应类型
interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * 创建错误响应
 */
function createErrorResponse(message: string, status: number = 401): NextResponse {
  const response: ErrorResponse = {
    success: false,
    error: message
  };
  
  return new NextResponse(
    JSON.stringify(response),
    { 
      status, 
      headers: { 'Content-Type': 'application/json' } 
    }
  );
}

export function middleware(request: NextRequest) {
  // 检查请求是否是API路径
  const isApiRoute = PROTECTED_API_ROUTES.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );

  // 只处理API请求
  if (isApiRoute) {
    // 如果未设置API密钥环境变量，则不进行认证
    if (!API_KEY) {
      return NextResponse.next();
    }

    // 获取请求中的Authorization头
    const authHeader = request.headers.get('Authorization');
    
    // 验证认证头格式: Bearer YOUR_API_KEY
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('认证失败: 缺少或格式错误的Authorization头');
    }

    const token = authHeader.substring(7);
    
    // 验证API密钥
    if (token !== API_KEY) {
      return createErrorResponse('认证失败: 无效的API密钥');
    }

    // 认证通过，继续处理请求
    return NextResponse.next();
  }

  // 非API路由请求，直接放行
  return NextResponse.next();
}

// 配置仅对API路由匹配
export const config = {
  matcher: ['/api/:path*'],
}; 