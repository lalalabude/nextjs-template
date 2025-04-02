/**
 * API客户端工具
 * 封装了API请求方法，自动添加认证头
 */

// 检测是否在浏览器环境
const isBrowser = typeof window !== 'undefined';

// 从环境变量获取API基础URL和密钥
// 如果没有设置NEXT_PUBLIC_API_BASE_URL，则使用空字符串，表示使用相对URL
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
  headers?: Record<string, string>;
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
  // 确保endpoint以/开头
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // 如果API_BASE_URL为空，使用相对URL
  const baseUrl = API_BASE_URL || (isBrowser ? window.location.origin : '');
  const url = new URL(path, baseUrl || 'http://placeholder');
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });
  }
  
  // 如果baseUrl为空且在浏览器环境中，返回相对URL
  if (!baseUrl && isBrowser) {
    return url.pathname + url.search;
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
  const { params, data, headers = {}, ...fetchOptions } = options;
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
      let errorMessage = `HTTP错误: ${response.status}`;
      let errorData = null;
      
      try {
        errorData = await response.json();
        if (errorData?.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // 如果无法解析JSON，使用响应文本
        try {
          errorMessage = await response.text() || errorMessage;
        } catch (textError) {
          // 如果也无法获取文本，使用默认错误消息
        }
      }
      
      throw new ApiError(errorMessage, response.status, errorData);
    }
    
    // 尝试解析响应数据
    const responseData = await response.json().catch(() => null);
    
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