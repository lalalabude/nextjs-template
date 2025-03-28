import { LarkRecord } from '@/types';

// 飞书API基础URL
const FEISHU_BASE_URL = 'https://base-api.feishu.cn';

// 从环境变量获取Personal Base Token
const PERSONAL_BASE_TOKEN = process.env.LARK_PERSONAL_BASE_TOKEN;

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

// 从飞书多维表格获取记录信息
export async function getLarkRecords(appId: string, tableId: string, recordIds: string[]): Promise<LarkRecord[]> {
  try {
    console.log('获取飞书记录:', { appId, tableId, recordIds });

    // 验证参数
    if (!appId || !tableId) {
      console.error('缺少必要参数: appId或tableId');
      throw new Error('缺少必要参数');
    }
    
    // 验证记录ID数组
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      console.warn('未提供有效的记录ID数组');
      return [];
    }

    // 开发环境下直接使用模拟数据
    if (process.env.NODE_ENV === 'development' && recordIds.length === 0) {
      console.log('开发环境: 生成模拟记录数据');
      return [
        {
          record_id: 'mock_record_1',
          fields: {
            '标题': '测试项目招标',
            '描述': '这是一个测试项目的招标记录',
            '创建日期': new Date().toISOString(),
            '状态': '进行中',
            '报名登记日期': new Date().toLocaleDateString(),
            '项目名称': '测试工程建设项目',
            '报名标段号': 'BID-2023-001',
            '报名单位名称': '测试建筑有限公司',
            '联合体信息': '无',
            '联系人': '张三',
            '联系电话': '13800138000',
            '电子邮箱': 'test@example.com',
            '报名单位地址': '测试市测试区测试路123号'
          }
        }
      ];
    }

    // 使用ensureFullUrl构建完整URL
    const apiUrl = ensureFullUrl('/api/lark/records');
    console.log('请求URL:', apiUrl);

    // 调用服务端API获取记录
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appId,
        tableId,
        recordIds
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('获取飞书记录失败:', errorData);
      
      // 开发环境下使用模拟数据
      if (process.env.NODE_ENV === 'development') {
        console.log('开发环境: 返回模拟记录数据(响应错误)');
        return recordIds.map(id => ({
          record_id: id,
          fields: {
            '标题': `测试记录 ${id}`,
            '描述': '这是一个测试记录',
            '创建日期': new Date().toISOString(),
            '状态': '进行中',
            '报名登记日期': new Date().toLocaleDateString(),
            '项目名称': '测试工程建设项目',
            '报名标段号': 'BID-2023-001',
            '报名单位名称': '测试建筑有限公司',
            '联合体信息': '无',
            '联系人': '张三',
            '联系电话': '13800138000',
            '电子邮箱': 'test@example.com',
            '报名单位地址': '测试市测试区测试路123号'
          }
        }));
      }
      
      throw new Error(`获取记录失败: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('飞书API返回记录数据:', data);
    
    if (!data.records || !Array.isArray(data.records)) {
      console.error('飞书API返回数据格式不符合预期:', data);
      
      // 开发环境下使用模拟数据
      if (process.env.NODE_ENV === 'development') {
        console.log('开发环境: 返回模拟记录数据(格式错误)');
        return recordIds.map(id => ({
          record_id: id,
          fields: {
            '标题': `测试记录 ${id}`,
            '描述': '这是一个测试记录',
            '创建日期': new Date().toISOString(),
            '状态': '进行中',
            '报名登记日期': new Date().toLocaleDateString(),
            '项目名称': '测试工程建设项目',
            '报名标段号': 'BID-2023-001',
            '报名单位名称': '测试建筑有限公司',
            '联合体信息': '无',
            '联系人': '张三',
            '联系电话': '13800138000',
            '电子邮箱': 'test@example.com',
            '报名单位地址': '测试市测试区测试路123号'
          }
        }));
      }
      
      throw new Error('API返回数据格式错误');
    }

    return data.records;
  } catch (error) {
    console.error('获取飞书记录失败:', error);
    
    // 开发环境下使用模拟数据
    if (process.env.NODE_ENV === 'development') {
      console.log('开发环境: 返回模拟记录数据(捕获错误)');
      return recordIds.map(id => ({
        record_id: id,
        fields: {
          '标题': `测试记录 ${id}`,
          '描述': '这是一个测试记录',
          '创建日期': new Date().toISOString(),
          '状态': '进行中',
          '报名登记日期': new Date().toLocaleDateString(),
          '项目名称': '测试工程建设项目',
          '报名标段号': 'BID-2023-001',
          '报名单位名称': '测试建筑有限公司',
          '联合体信息': '无',
          '联系人': '张三',
          '联系电话': '13800138000',
          '电子邮箱': 'test@example.com',
          '报名单位地址': '测试市测试区测试路123号'
        }
      }));
    }
    
    throw error;
  }
}

// 更新飞书多维表格记录
export async function updateLarkRecord(
  appId: string,
  tableId: string,
  recordId: string,
  fields: Record<string, any>
) {
  try {
    console.log('更新飞书记录:', { appId, tableId, recordId, fields });

    // 验证参数
    if (!appId || !tableId || !recordId || !fields) {
      console.error('缺少必要参数');
      throw new Error('缺少必要参数');
    }

    // 使用环境变量中的应用ID，如果有的话
    const effectiveAppId = process.env.NEXT_PUBLIC_LARK_APP_ID || appId;
    
    // 使用ensureFullUrl构建完整URL
    const apiUrl = ensureFullUrl('/api/lark/update-record');
    console.log('请求URL:', apiUrl);

    // 调用服务端API更新记录
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appId: effectiveAppId,
        tableId,
        recordId,
        fields
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`更新记录失败: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('更新记录响应:', data);

    return data;
  } catch (error: any) {
    console.error('更新飞书记录失败:', error);
    
    // 在开发环境中模拟成功
    if (process.env.NODE_ENV === 'development') {
      console.log('开发环境: 模拟更新记录成功');
      return { success: true };
    }
    
    throw error;
  }
} 