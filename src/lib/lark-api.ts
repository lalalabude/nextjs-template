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

// 飞书API调用的基础函数
async function callLarkAPI<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<T> {
  const token = PERSONAL_BASE_TOKEN?.trim();
  
  if (!token) {
    throw new Error('服务器未正确配置Personal Base Token');
  }
  
  // 构建API URL
  const apiUrl = `${FEISHU_BASE_URL}${endpoint}`;
  
  // 调用飞书API
  const response = await fetch(apiUrl, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  const responseData = await response.json();
  
  if (responseData.code !== 0) {
    // 对特定错误码进行处理
    if (responseData.code === 1254045) { // FieldNameNotFound
      throw new Error(`字段不存在错误: ${responseData.msg}`);
    }
    
    throw new Error(`飞书API错误: ${responseData.msg || '未知错误'} (错误码: ${responseData.code})`);
  }
  
  return responseData.data;
}

// 飞书字段元数据类型
export interface FieldMeta {
  field_id: string;
  field_name: string;
  type: number;
  property?: any;
  description?: string;
}

// 字段类型映射
export const FIELD_TYPES = {
  TEXT: 1,
  NUMBER: 2,
  SINGLE_SELECT: 3,
  MULTI_SELECT: 4,
  DATE_TIME: 5,
  CHECKBOX: 7,
  USER: 11,
  PHONE: 13,
  CURRENCY: 16,
  FORMULA: 20,
};

// 增强的飞书记录类型，包含字段元数据
interface EnhancedLarkRecord extends LarkRecord {
  fieldMeta: Record<string, FieldMeta>;
}

// 获取表格字段信息
export const getTableFields = async (appId: string, tableId: string): Promise<FieldMeta[]> => {
  try {
    const data = await callLarkAPI<{items: FieldMeta[]}>(
      `/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/fields`
    );
    
    if (!data || !data.items) {
      throw new Error('获取字段信息失败: 无效的响应');
    }
    
    return data.items;
  } catch (error) {
    console.error('获取表格字段信息失败:', error);
    throw error;
  }
};

// 获取飞书记录（包含字段元数据）
export const getLarkRecordsWithMeta = async (
  appId: string, 
  tableId: string, 
  recordIds: string[]
): Promise<EnhancedLarkRecord[]> => {
  try {
    // 先获取字段元数据
    const fields = await getTableFields(appId, tableId);
    const fieldMap: Record<string, FieldMeta> = {};
    fields.forEach(field => {
      fieldMap[field.field_id] = field;
      // 同时用字段名作为key，方便后续处理
      fieldMap[field.field_name] = field;
    });
    
    // 获取记录
    const data = await callLarkAPI<{records: any[]}>(
      `/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/records/batch_get`,
      'POST',
      { record_ids: recordIds }
    );
    
    if (!data || !data.records) {
      throw new Error('获取记录失败: 响应中没有records字段');
    }
    
    // 转换为增强的记录格式
    return data.records.map((record: any) => ({
      record_id: record.record_id,
      fields: record.fields,
      fieldMeta: fieldMap
    }));
  } catch (error) {
    console.error('获取飞书记录失败:', error);
    throw error;
  }
};

// 原有获取记录函数（保持向后兼容）
export const getLarkRecords = async (
  appId: string, 
  tableId: string, 
  recordIds: string[]
): Promise<LarkRecord[]> => {
  try {
    // 调用增强版函数
    const enhancedRecords = await getLarkRecordsWithMeta(appId, tableId, recordIds);
    
    // 移除fieldMeta，保持原有返回格式
    return enhancedRecords.map(({ record_id, fields }) => ({
      record_id,
      fields
    }));
  } catch (error) {
    console.error('获取飞书记录失败:', error);
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
    // 检查字段是否为空
    if (!fields || Object.keys(fields).length === 0) {
      throw new Error('无字段需要更新');
    }
    
    // 先获取表格字段元数据，检查字段是否存在
    try {
      const tableFields = await getTableFields(appId, tableId);
      const fieldNames = tableFields.map(f => f.field_name);
      
      // 检查请求的字段是否存在于表中
      const requestedFields = Object.keys(fields);
      const nonExistingFields = requestedFields.filter(f => !fieldNames.includes(f));
      
      if (nonExistingFields.length > 0) {
        // 仅保留有效字段
        const validFields: Record<string, any> = {};
        requestedFields.forEach(field => {
          if (fieldNames.includes(field)) {
            validFields[field] = fields[field];
          }
        });
        
        // 更新字段对象
        if (Object.keys(validFields).length === 0) {
          throw new Error(`无有效字段可更新，所有请求字段 [${requestedFields.join(', ')}] 在表中不存在`);
        }
        
        fields = validFields;
      }
    } catch (error) {
      // 获取字段失败继续尝试更新
    }
    
    // 调用飞书API更新记录
    await callLarkAPI(
      `/open-apis/bitable/v1/apps/${appId}/tables/${tableId}/records/${recordId}`,
      'PUT',
      { fields }
    );
  } catch (error) {
    console.error('更新飞书记录失败:', error);
    throw error;
  }
}; 