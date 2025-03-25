import { LarkRecord } from '@/types';

// 判断是否在浏览器环境
const isBrowser = typeof window !== 'undefined';

// 简单的错误处理包装器
const safeExecute = async <T,>(
  operation: () => Promise<T>,
  errorMessage: string,
  defaultValue?: T
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw error;
  }
};

// 确保URL是完整的绝对URL
const ensureFullUrl = (url: string): string => {
  // 如果已经是绝对URL，直接返回
  if (url.startsWith('http')) {
    return url;
  }
  
  // 在浏览器环境中，使用window.location.origin
  if (isBrowser && typeof window !== 'undefined') {
    // 确保url以/开头
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${window.location.origin}${path}`;
  }
  
  // 在服务器环境中，返回相对路径
  // 注意：这可能导致在某些服务器环境中调用fetch时出错
  console.warn('在非浏览器环境中使用相对URL可能导致错误:', url);
  return url;
};

// 统一创建URL的函数
const createApiUrl = (path: string, params?: Record<string, string>): string => {
  if (isBrowser) {
    try {
      // 在浏览器环境中使用完整URL
      const origin = window.location.origin;
      // 确保path以/开头
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const url = new URL(cleanPath, origin);
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value) url.searchParams.append(key, value);
        });
      }
      return url.toString();
    } catch (error) {
      console.error('创建URL失败:', error);
      // 如果失败，返回确保的完整URL路径
      return ensureFullUrl(path);
    }
  } else {
    // 在服务器环境中使用相对URL
    if (!params) return path;
    
    const queryString = Object.entries(params)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    
    return queryString ? `${path}?${queryString}` : path;
  }
};

// 从飞书多维表格获取记录信息
export const getLarkRecords = async (
  appId: string,
  tableId: string,
  recordIds: string[]
): Promise<LarkRecord[]> => {
  try {
    console.log('开始获取飞书记录数据', { appId, tableId, recordsCount: recordIds.length });
    
    // 这里应该调用飞书开放平台API获取记录
    // 在实际部署环境中，应该使用飞书SDK或者直接调用飞书API

    // 准备API URL
    const recordIdsStr = recordIds.join(',');
    const apiUrl = createApiUrl('/api/lark/records', {
      appId,
      tableId,
      recordIds: recordIdsStr
    });
    
    console.log('获取飞书记录的URL:', apiUrl);
    
    // 确保URL是完整的
    const fullUrl = ensureFullUrl(apiUrl);
    console.log('使用完整URL:', fullUrl);
    
    // 使用safeExecute包装API调用，提供更好的错误处理
    const response = await safeExecute(
      () => fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }),
      '获取飞书记录API调用失败'
    );
    
    if (!response || !response.ok) {
      throw new Error(`获取飞书记录失败: ${response?.statusText || '未知错误'}`);
    }
    
    // 使用safeExecute包装响应解析，提供更好的错误处理
    const data = await safeExecute(
      () => response.json(),
      '解析飞书记录响应失败'
    );
    
    if (!data || !data.records || !Array.isArray(data.records)) {
      console.error('飞书API返回数据格式不正确:', data);
      throw new Error('飞书API返回数据格式不正确');
    }
    
    console.log(`成功获取 ${data.records.length} 条飞书记录`);
    return data.records;
  } catch (error) {
    console.error('获取飞书记录失败:', error);
    
    // 在开发环境中，如果出现错误，返回模拟数据
    if (process.env.NODE_ENV === 'development') {
      console.log('开发环境: 返回模拟数据');
      
      // 返回更完整的模拟数据，确保有足够的字段
      return recordIds.map(recordId => ({
        record_id: recordId,
        fields: {
          '标题': `测试记录 ${recordId}`,
          '描述': `这是测试记录 ${recordId} 的详细描述，用于测试模板中的占位符替换。`,
          '申请人': '张三',
          '申请日期': new Date().toISOString().split('T')[0],
          '创建日期': new Date().toISOString(),
          '状态': '进行中',
          '部门': '研发部',
          '职位': '高级工程师',
          '申请理由': '业务需要',
          '负责人': {
            name: '李四',
            id: 'user_123456'
          },
          '金额': '5000',
          '数量': '10',
          '备注': '请尽快审批',
          '费用类型': '差旅费',
          '预算': '10000',
          '实际金额': '4800',
          '剩余金额': '5200',
          '单价': '500',
          '开始日期': new Date().toISOString().split('T')[0],
          '结束日期': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          '联系方式': '13800138000',
          '邮箱': 'test@example.com'
        }
      }));
    }
    
    throw error;
  }
};

// 更新飞书多维表格记录
export const updateLarkRecord = async (
  appId: string,
  tableId: string,
  recordId: string,
  fields: Record<string, any>
): Promise<void> => {
  try {
    console.log(`开始更新飞书记录 ${recordId}`, fields);
    
    // 开发环境模拟成功
    if (process.env.NODE_ENV === 'development') {
      console.log('开发环境: 模拟成功更新记录', { recordId, fields });
      return;
    }
    
    // 以下代码在生产环境中执行
    
    // 准备API URL
    const apiUrl = createApiUrl('/api/lark/update-record');
    
    console.log('更新飞书记录的URL:', apiUrl);
    
    // 确保URL是完整的
    const fullUrl = ensureFullUrl(apiUrl);
    console.log('使用完整URL:', fullUrl);
    
    // 使用safeExecute包装API调用，提供更好的错误处理
    const response = await safeExecute(
      () => fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appId,
          tableId,
          recordId,
          fields
        }),
      }),
      '更新飞书记录API调用失败'
    );
    
    if (!response || !response.ok) {
      throw new Error(`更新飞书记录失败: ${response?.statusText || '未知错误'}`);
    }
    
    console.log(`成功更新飞书记录 ${recordId}`);
  } catch (error) {
    console.error('更新飞书记录失败:', error);
    throw error;
  }
}; 