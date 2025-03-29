// 检查是否在浏览器环境中执行
export const isBrowser = typeof window !== 'undefined';

// 创建API URL
export const createApiUrl = (path: string): string => {
  try {
    // 确保路径以 / 开头
    const apiPath = path.startsWith('/') ? path : `/${path}`;
    
    // 在浏览器环境中，使用window.location.origin
    if (isBrowser) {
      const origin = window.location.origin;
      return `${origin}${apiPath}`;
    }
    
    // 在服务器环境中，使用环境变量或默认值
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}${apiPath}`;
  } catch (error) {
    console.error('创建API URL失败:', error);
    return path; // 作为备用方案，返回原始路径
  }
};

// 确保URL是完整的绝对URL
export const ensureFullUrl = (url: string): string => {
  try {
    // 如果已经是绝对URL，直接返回
    if (url.startsWith('http')) {
      return url;
    }

    // 在浏览器环境中，使用window.location.origin获取当前URL包括端口
    if (isBrowser) {
      const origin = window.location.origin;
      const path = url.startsWith('/') ? url : `/${url}`;
      console.log(`使用浏览器环境URL: ${origin}${path}`);
      return `${origin}${path}`;
    }
    
    // 在服务器端环境中，更智能地处理URL
    // 添加相对路径支持，因为在相同进程中运行时，服务器可以直接访问自身的API
    if (url.startsWith('/api/')) {
      // 如果是在同一服务器上的API请求，直接使用相对路径
      console.log(`使用相对API路径: ${url}`);
      return url;
    }
    
    // 否则使用环境变量中的API基础URL
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    const path = url.startsWith('/') ? url : `/${url}`;
    console.log(`使用配置的API基础URL: ${baseUrl}${path}`);
    return `${baseUrl}${path}`;
  } catch (error) {
    console.error('构建完整URL失败:', error);
    // 作为备用方案，返回原始URL
    console.log(`使用原始URL作为备用: ${url}`);
    return url;
  }
}; 