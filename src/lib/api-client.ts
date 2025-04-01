/**
 * API客户端工具
 * 封装了API请求方法，自动添加认证头
 */

// 从环境变量获取API基础URL和密钥
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

// API响应类型
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// API请求选项接口
interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string>;
  data?: unknown;
}

/**
 * API错误类
 */
class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 构建API请求URL
 * @param endpoint API端点路径
 * @param params 查询参数
 * @returns 完整的API URL
 */
function buildUrl(endpoint: string, params?: Record<string, string>): string {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });
  }
  
  return url.toString();
}

/**
 * 发送API请求
 * @param endpoint API端点
 * @param options 请求选项
 * @returns Promise对象
 */
async function fetchApi<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { params, data, headers, ...fetchOptions } = options;
  const url = buildUrl(endpoint, params);
  
  // 默认请求选项
  const requestOptions: RequestInit = {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  
  // 添加认证头
  if (API_KEY) {
    requestOptions.headers = {
      ...requestOptions.headers,
      'Authorization': `Bearer ${API_KEY}`,
    };
  }
  
  // 添加请求体数据
  if (data) {
    if (data instanceof FormData) {
      // 对于FormData不设置Content-Type，让浏览器自动设置
      delete (requestOptions.headers as Record<string, string>)['Content-Type'];
      requestOptions.body = data;
    } else {
      requestOptions.body = JSON.stringify(data);
    }
  }
  
  try {
    // 发送请求
    const response = await fetch(url, requestOptions);
    
    // 检查响应状态
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new ApiError(
        errorData?.error || `HTTP错误: ${response.status}`,
        response.status,
        errorData
      );
    }
    
    // 尝试解析响应数据
    const responseData = await response.json();
    
    // 检查响应数据格式
    if (responseData === null || responseData === undefined) {
      throw new ApiError('API返回空响应');
    }
    
    // 如果响应包含success字段，检查是否成功
    if ('success' in responseData && !responseData.success) {
      throw new ApiError(
        responseData.error || 'API请求失败',
        response.status,
        responseData
      );
    }
    
    return responseData;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : '请求失败',
      undefined,
      error
    );
  }
}

// 导出API方法
export const apiClient = {
  /**
   * 发送GET请求
   */
  get: <T = unknown>(endpoint: string, options?: ApiRequestOptions) => 
    fetchApi<T>(endpoint, { method: 'GET', ...options }),
  
  /**
   * 发送POST请求
   */
  post: <T = unknown>(endpoint: string, data?: unknown, options?: ApiRequestOptions) => 
    fetchApi<T>(endpoint, { method: 'POST', data, ...options }),
  
  /**
   * 发送PUT请求
   */
  put: <T = unknown>(endpoint: string, data?: unknown, options?: ApiRequestOptions) => 
    fetchApi<T>(endpoint, { method: 'PUT', data, ...options }),
  
  /**
   * 发送PATCH请求
   */
  patch: <T = unknown>(endpoint: string, data?: unknown, options?: ApiRequestOptions) => 
    fetchApi<T>(endpoint, { method: 'PATCH', data, ...options }),
  
  /**
   * 发送DELETE请求
   */
  delete: <T = unknown>(endpoint: string, options?: ApiRequestOptions) => 
    fetchApi<T>(endpoint, { method: 'DELETE', ...options }),
}; 