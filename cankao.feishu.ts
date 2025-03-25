import { bitable } from '@lark-base-open/js-sdk';
import { TableRecord } from '../types';

// 简单的错误处理包装器
const safeExecute = async <T>(
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

// 获取当前表格
export const getCurrentTable = async () => {
  return safeExecute(
    () => bitable.base.getActiveTable(),
    '获取当前表格失败',
    null
  );
};

// 获取基础数据表中的字段元数据列表
export const getFieldMetaList = async (): Promise<any[]> => {
  try {
    const table = await getCurrentTable();
    if (!table) {
      console.warn('无法获取当前表格，无法获取字段元数据');
      return [];
    }
    
    try {
      // 从飞书JS SDK直接获取字段元数据
      const fieldMetaList = await table.getFieldMetaList();
      
      // 处理字段元数据
      return fieldMetaList.map((field: any) => ({
        id: field.id, // 字段ID (如 fldxxxxx)
        name: field.name, // 字段名称 (如 "项目名称")
        type: field.type
      }));
    } catch (err) {
      console.error('获取字段元数据失败:', err);
      return [];
    }
  } catch (error) {
    console.error('获取字段元数据列表异常:', error);
    return [];
  }
};

// 获取数据表中的记录
export const getRecords = async (limit: number = 5000): Promise<any[]> => {
  try {
    const table = await getCurrentTable();
    if (!table) {
      console.warn('无法获取当前表格，无法获取记录');
      return [];
    }
    
    // 先获取字段元数据，用于映射字段ID到字段名称
    const fieldMetaList = await getFieldMetaList();
    
    // 创建字段ID到字段名的映射
    const fieldMap: {[key: string]: string} = {};
    fieldMetaList.forEach(field => {
      if (field.id && field.name) {
        fieldMap[field.id] = field.name;
      }
    });
    
    try {
      // 获取所有记录
      const allRecordsResponse = await table.getRecords({ pageSize: limit });
      const records = allRecordsResponse.records || [];
      
      // 如果记录数量为0，可能是表格为空
      if (records.length === 0) {
        return [];
      }
      
      // 处理记录，将字段ID替换为字段名称
      return records.map((record: any) => {
        // 提取原始字段
        const originalFields = record.fields || {};
        
        // 创建新的字段对象，使用字段名称作为键
        const processedFields: {[key: string]: any} = {};
        
        // 处理每个字段
        Object.keys(originalFields).forEach(fieldId => {
          const value = originalFields[fieldId];
          // 获取字段名称
          const fieldName = fieldMap[fieldId];
          
          if (fieldName) {
            processedFields[fieldName] = value;
          } else {
            // 如果找不到映射，使用原始ID
            processedFields[fieldId] = value;
          }
        });
        
        // 返回处理后的记录
        return {
          id: record.id || record.recordId,
          fields: processedFields,
          fieldNames: fieldMap,
          originalFields: originalFields // 保留原始字段，以便后续处理
        };
      });
    } catch (err) {
      console.error('获取记录时出错:', err);
      return [];
    }
  } catch (error) {
    console.error('获取记录失败:', error);
    return [];
  }
};

// 获取当前选中的记录
export const getSelectedRecord = async (): Promise<TableRecord | null> => {
  try {
    // 获取选择信息
    const selection = await bitable.base.getSelection();
    
    if (!selection || !selection.recordId) {
      console.warn('未获取有效的选择信息');
      return null;
    }

    // 获取当前表格
    const table = await getCurrentTable();
    if (!table) {
      console.warn('无法获取当前表格');
      return null;
    }
    
    // 获取字段元数据，用于映射
    const fieldMetaList = await getFieldMetaList();
    const fieldMap: {[key: string]: string} = {};
    fieldMetaList.forEach(field => {
      if (field.id && field.name) {
        fieldMap[field.id] = field.name;
      }
    });
    
    // 获取记录
    let record;
    try {
      record = await table.getRecordById(selection.recordId);
    } catch (err) {
      console.error('getRecordById 失败:', err);
      try {
        const records = await getRecords(500);
        record = records.find(r => r.id === selection.recordId);
      } catch (err2) {
        console.error('替代方法获取记录失败:', err2);
      }
    }
    
    if (!record) {
      console.warn('未找到指定recordId的记录');
      return null;
    }
    
    // 提取并处理字段
    const originalFields = record.fields || {};
    const processedFields: {[key: string]: any} = {};
    
    // 处理字段
    Object.keys(originalFields).forEach(fieldId => {
      const value = originalFields[fieldId];
      const fieldName = fieldMap[fieldId];
      
      if (fieldName) {
        processedFields[fieldName] = value;
      } else {
        processedFields[fieldId] = value;
      }
    });
    
    return {
      id: selection.recordId,
      fields: processedFields,
      fieldNames: fieldMap,
      summary: Object.entries(processedFields)
        .map(([key, value]) => `${key}: ${String(value || '')}`)
        .join(', ')
    };
  } catch (error) {
    console.error('获取选中记录失败:', error);
    return null;
  }
}; 