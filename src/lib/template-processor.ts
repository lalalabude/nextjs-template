import * as XLSX from 'xlsx';
import { Packer, Document, Paragraph, TextRun } from 'docx';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { LarkRecord, TemplateType } from '@/types';
import { saveAs } from 'file-saver';

// 定义类型辅助函数
const hasProperty = <T extends object, K extends string>(obj: T, key: K): obj is T & Record<K, unknown> => {
  return key in obj;
};

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

// 提取占位符
export const extractPlaceholders = (content: string): string[] => {
  const regex = /\{([^}]+)\}/g;
  const matches = content.match(regex) || [];
  return matches.map(match => match.slice(1, -1));
};

// 格式化字段值
export const formatFieldValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  
  // 处理对象类型
  if (value !== null && typeof value === 'object') {
    // 检查是否是数组
    if (Array.isArray(value)) {
      // 处理飞书字段数组
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        // 尝试提取text属性
        const textValues = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            if ('text' in item && item.text !== undefined) {
              return typeof item.text === 'string' ? item.text : formatFieldValue(item.text);
            }
          }
          return formatFieldValue(item);
        });
        return textValues.join(', ');
      }
      return value.map(item => formatFieldValue(item)).join(', ');
    }
    
    const obj = value as Record<string, unknown>;
    
    // 处理飞书标准字段格式 {type: number, value: any}
    if ('type' in obj && 'value' in obj) {
      const fieldType = obj.type;
      const fieldValue = obj.value;
      
      // 处理文本类型 (type = 1)
      if (fieldType === 1) {
        if (Array.isArray(fieldValue)) {
          return fieldValue.map(item => {
            if (typeof item === 'object' && item !== null && 'text' in item) {
              return String(item.text);
            }
            return String(item);
          }).join('');
        }
        return String(fieldValue);
      }
      
      // 处理数字类型 (type = 2)
      if (fieldType === 2) {
        // 尝试将数字格式化为带有千位分隔符的货币格式
        try {
          const numValue = Number(fieldValue);
          if (!isNaN(numValue)) {
            return new Intl.NumberFormat('zh-CN', {
              style: 'currency',
              currency: 'CNY',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(numValue);
          }
        } catch (e) {
          // 转换失败，继续使用默认处理
        }
        return String(fieldValue);
      }
      
      // 处理日期类型 (type = 5 或 1003)
      if (fieldType === 5 || fieldType === 1003) {
        try {
          let timestamp: number;
          if (typeof fieldValue === 'number') {
            timestamp = fieldValue;
          } else if (typeof fieldValue === 'string') {
            if (/^\d+$/.test(fieldValue.trim())) {
              timestamp = parseInt(fieldValue.trim(), 10);
            } else if (fieldValue.includes('-') || fieldValue.includes('/')) {
              // 尝试解析标准日期字符串
              const date = new Date(fieldValue);
              if (!isNaN(date.getTime())) {
                return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              }
              return fieldValue;
            } else {
              return fieldValue;
            }
          } else if (typeof fieldValue === 'object' && fieldValue !== null && 'text' in fieldValue) {
            const textValue = String(fieldValue.text);
            if (/^\d+$/.test(textValue.trim())) {
              timestamp = parseInt(textValue.trim(), 10);
            } else {
              return textValue;
            }
          } else {
            return String(fieldValue);
          }
          
          // 处理时间戳
          if (timestamp > 1000000000000) {
            // 毫秒级时间戳
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
              console.log(`已将时间戳 ${timestamp} 转换为日期: ${date.toISOString()}`);
              return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            }
          } else if (timestamp > 1000000000) {
            // 秒级时间戳
            const date = new Date(timestamp * 1000);
            if (!isNaN(date.getTime())) {
              console.log(`已将秒级时间戳 ${timestamp} 转换为日期: ${date.toISOString()}`);
              return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            }
          }
        } catch (e) {
          console.error('处理日期字段失败:', e);
        }
        return String(fieldValue);
      }
      
      // 处理单选/多选类型 (type = 3 或 4)
      if (fieldType === 3 || fieldType === 4) {
        if (Array.isArray(fieldValue)) {
          return fieldValue.map(item => {
            if (typeof item === 'object' && item !== null && 'text' in item) {
              return String(item.text);
            }
            return String(item);
          }).join(', ');
        }
        return String(fieldValue);
      }
      
      // 处理人员类型字段(type=11)
      if (fieldType === 11 && Array.isArray(fieldValue)) {
        return fieldValue.map((person: any) => {
          if (typeof person === 'object' && person !== null) {
            if ('name' in person && typeof person.name === 'string') {
              return person.name;
            }
          }
          return '';
        }).filter(Boolean).join(', ');
      }
      
      // 其他类型，尝试直接获取值
      return formatFieldValue(fieldValue);
    }
    
    // 处理简单对象类型
    if ('text' in obj && obj.text !== undefined) {
      return String(obj.text);
    }
    
    // 检查是否是货币对象
    if ('type' in obj && obj.type === 'Currency' && 'value' in obj) {
      try {
        const currencyValue = obj.value;
        let amount: number;
        
        if (typeof currencyValue === 'string') {
          amount = parseFloat(currencyValue);
        } else if (typeof currencyValue === 'number') {
          amount = currencyValue;
        } else {
          amount = 0;
        }
        
        const currency = 'currency' in obj && typeof obj.currency === 'string' 
          ? obj.currency 
          : 'CNY';
        
        // 格式化为带有千位分隔符的货币格式
        return new Intl.NumberFormat('zh-CN', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount);
      } catch (e) {
        // 转换失败，继续使用默认处理
      }
    }
    
    // 如果是对象，尝试提取名称或标题
    if ('name' in obj && typeof obj.name === 'string') return obj.name;
    if ('title' in obj && typeof obj.title === 'string') return obj.title;
    if ('value' in obj && obj.value !== undefined) return formatFieldValue(obj.value);
    
    // 其他情况，转为JSON字符串
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return '[复杂对象]';
    }
  }
  
  // 处理数字类型
  if (typeof value === 'number') {
    // 尝试将数字格式化为带有千位分隔符的货币格式
    try {
      return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch (e) {
      // 转换失败，继续使用默认处理
    }
  }
  
  // 处理基本类型
  return String(value);
};

// 获取记录字段
const getRecordFields = (record: LarkRecord | Record<string, any>): Record<string, any> => {
  return 'fields' in record ? record.fields : record;
};

// 获取记录ID
const getRecordId = (record: any): string => {
  if (!record) return 'unknown';
  if (typeof record === 'string') return record;
  return record.record_id || record.recordId || 'unknown';
};

// 处理记录数据
const processRecordData = (record: any): Record<string, any> => {
  try {
    console.log('处理记录数据:', record);
    
    // 调试：输出记录结构
    console.log('记录ID:', record.record_id);
    console.log('字段结构：');
    if (record.fields) {
      Object.entries(record.fields).forEach(([key, value]) => {
        if (value !== null && typeof value === 'object') {
          console.log(`字段 ${key}:`, '类型:', typeof value, 
            'isArray:', Array.isArray(value), 
            '值类型:', (value as any).type || '未知', 
            '值示例:', JSON.stringify(value).slice(0, 100) + (JSON.stringify(value).length > 100 ? '...' : '')
          );
        } else {
          console.log(`字段 ${key}:`, '类型:', typeof value, '值:', value);
        }
      });
    }
    
    // 如果record是字符串（recordId），返回空对象
    if (typeof record === 'string') {
      console.warn('记录是字符串类型:', record);
      return {};
    }
    
    // 如果record是null或undefined
    if (!record) {
      console.warn('记录为空');
      return {};
    }
    
    // 如果record是对象但没有fields属性
    if (!record.fields) {
      console.warn('记录缺少fields属性:', record);
      // 尝试直接使用record作为fields
      return typeof record === 'object' ? record : {};
    }
    
    // 确保fields是对象类型
    if (typeof record.fields !== 'object') {
      console.warn('fields不是对象类型:', record.fields);
      return {};
    }
    
    // 预处理fields中的对象类型值，确保模板替换能正确处理
    const processedFields: Record<string, any> = {};
    
    Object.entries(record.fields).forEach(([key, value]) => {
      // 直接存储原始值
      processedFields[key] = value;
      
      // 尝试解析JSON字符串
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          const parsedValue = JSON.parse(value);
          processedFields[`${key}_parsed`] = parsedValue;
          processedFields[`${key}_text`] = formatFieldValue(parsedValue);
          console.log(`成功解析JSON字符串字段: ${key}`);
        } catch (e) {
          // 解析失败，保留原始字符串
          console.log(`无法解析JSON字符串字段: ${key}, 原因:`, e);
        }
      }
      // 为对象类型值添加额外的文本属性，方便模板引擎使用
      else if (value !== null && typeof value === 'object') {
        if ('text' in value) {
          // 如果对象有text属性，添加一个key_text属性，方便模板直接访问
          processedFields[`${key}_text`] = formatFieldValue(value);
        } else if (Array.isArray(value)) {
          // 如果是数组，提取所有项的文本形式
          processedFields[`${key}_text`] = value.map(item => formatFieldValue(item)).join(', ');
        } else {
          // 其他对象，转换为文本
          processedFields[`${key}_text`] = formatFieldValue(value);
        }
        
        // 对于特定类型的字段进行格式化处理
        if ('type' in value) {
          const typeValue = (value as any).type;
          // 保存类型信息，方便调试
          processedFields[`${key}_type`] = typeValue;
          
          // 对于日期类型，尝试提供额外的格式化版本
          if (typeValue === 5 || typeValue === 1003) {
            const formattedDate = formatFieldValue(value);
            processedFields[`${key}_formatted`] = formattedDate;
            console.log(`格式化日期字段 ${key}:`, formattedDate);
          }
        }
      }
    });
    
    console.log('成功处理记录数据:', processedFields);
    return processedFields;
  } catch (error) {
    console.error('处理记录数据时出错:', error);
    return {};
  }
};

// 创建错误报告文档
async function createErrorReportDoc(record: LarkRecord | Record<string, any>, error: unknown, templateName: string): Promise<Blob> {
  // 创建字段数组
  const fieldParagraphs: Paragraph[] = [];
  
  // 添加记录字段到段落数组
  const fields = getRecordFields(record);
  
  Object.entries(fields).forEach(([key, value]) => {
    const displayValue = formatFieldValue(value);
    
    fieldParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${key}: ${displayValue}`,
            size: 22
          })
        ]
      })
    );
  });
  
  // 创建一个新文档作为备用方案
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: `${templateName} - 处理失败`,
              bold: true,
              size: 28
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `错误信息: ${error instanceof Error ? error.message : '未知错误'}`,
              size: 24
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `记录ID: ${getRecordId(record)}`,
              size: 22
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '字段数据:',
              bold: true,
              size: 24
            })
          ]
        }),
        // 添加所有字段段落
        ...fieldParagraphs
      ]
    }]
  });
  
  return Packer.toBlob(doc);
}

// 创建错误报告工作簿
async function createErrorReportWorkbook(record: LarkRecord | Record<string, any>, error: unknown, templateName: string): Promise<Blob> {
  // 创建一个新工作簿
  const workbook = XLSX.utils.book_new();
  
  // 错误信息数据
  const errorData = [
    ['模板处理失败'],
    [`模板名称: ${templateName}`],
    [`错误信息: ${error instanceof Error ? error.message : '未知错误'}`],
    [`记录ID: ${getRecordId(record)}`],
    [''],
    ['字段数据:']
  ];
  
  // 添加记录字段到工作表
  const fields = getRecordFields(record);
  
  Object.entries(fields).forEach(([key, value]) => {
    const displayValue = formatFieldValue(value);
    errorData.push([`${key}:`, displayValue]);
  });
  
  // 创建工作表
  const worksheet = XLSX.utils.aoa_to_sheet(errorData);
  
  // 将工作表添加到工作簿
  XLSX.utils.book_append_sheet(workbook, worksheet, '错误报告');
  
  // 生成Excel文件
  const excelOutput = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  
  return new Blob([excelOutput], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// 处理Word模板 - 核心处理函数
export const processDocxTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  record: LarkRecord | Record<string, any>,
  templateName: string
): Promise<Blob> => {
  return new Promise<Blob>(async (resolve, reject) => {
    try {
      console.log('开始处理Word模板:', templateName);
      
      // 处理记录数据
      const processedRecord = processRecordData(record);
      
      // 创建一个空的PizZip实例
      const zip = new PizZip();
      
      // 加载文档
      try {
        zip.load(templateArrayBuffer);
      } catch (error: any) {
        console.error('PizZip加载文档失败:', error);
        return reject(new Error(`无法解析DocX文件格式: ${error.message || '未知错误'}`));
      }

      // 创建Docxtemplater实例
      try {
        // 最新的Docxtemplater API使用
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          parser: function(tag: string) {
            // 用于解析标签的函数
            console.log('尝试解析标签:', tag);
            return {
              get: function(scope: any) {
                // 记录每次尝试获取的占位符值
                console.log(`尝试从作用域获取值 "${tag}"`, scope);
                
                // 检查是否是"字段_text"格式的标签 - 这是我们为对象值预先处理的文本格式
                if (tag.endsWith('_text') && scope[tag] !== undefined) {
                  console.log(`匹配预处理文本字段: ${tag} =`, scope[tag]);
                  return scope[tag];
                }
                
                // 直接匹配字段标题
                if (scope[tag] !== undefined) {
                  console.log(`匹配成功: ${tag} =`, scope[tag]);
                  const value = scope[tag];
                  
                  // 对于对象类型的值，尝试转换为文本
                  if (value !== null && typeof value === 'object') {
                    console.log(`将对象值转换为文本: ${tag}`);
                    return formatFieldValue(value);
                  }
                  
                  return value === null || value === undefined ? '' : String(value);
                }
                
                // 尝试查找字段的变体（忽略大小写、空格等）
                const lowerTag = tag.toLowerCase();
                for (const [key, value] of Object.entries(scope)) {
                  if (key.toLowerCase() === lowerTag) {
                    console.log(`找到近似匹配: ${key} =`, value);
                    
                    // 对于对象类型的值，尝试转换为文本
                    if (value !== null && typeof value === 'object') {
                      console.log(`将对象值转换为文本: ${key}`);
                      return formatFieldValue(value);
                    }
                    
                    return value === null || value === undefined ? '' : String(value);
                  }
                }
                
                console.log(`未找到值: ${tag}`);
                // 返回占位符原来的文本，保留格式
                return `{${tag}}`;
              }
            };
          },
          nullGetter: function(part: any) {
            // 如果是标签为空，返回原始占位符而不是空字符串
            if (part.module === "rawxml") {
              return "";
            }
            
            // 提取标签名称
            let tagName = part.value || '';
            
            // 尝试查找对应的"_text"属性
            if (tagName && !tagName.endsWith('_text')) {
              const textTagName = `${tagName}_text`;
              console.log(`尝试查找文本格式字段: ${textTagName}`);
              return `{${textTagName}}`;
            }
            
            // 将所有未找到的值替换为原始占位符
            return part.value ? `{${part.value}}` : '';
          }
        });

        // 设置数据并渲染 - 使用新的API (render方法现在接受数据参数)
        doc.render(processedRecord);
        
        // 生成输出
        const output = doc.getZip().generate({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        
        resolve(output);
      } catch (error: any) {
        console.error('模板渲染错误:', error);
        
        if (error && error.properties && error.properties.errors) {
          console.log('详细错误信息:', error.properties.errors);
        }
        
        // 创建简单的错误报告文档
        createErrorReportDoc(record, error, templateName)
          .then(resolve)
          .catch((e: any) => {
            console.error('创建错误报告文档失败:', e);
            reject(new Error('处理模板失败，且无法创建错误报告'));
          });
      }
    } catch (error: any) {
      console.error('模板处理异常:', error);
      reject(new Error(`模板处理过程中发生错误: ${error.message || '未知错误'}`));
    }
  });
};

// 处理Excel模板 - 核心处理函数
export const processXlsxTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  record: LarkRecord | Record<string, any>,
  templateName: string
): Promise<Blob> => {
  try {
    console.log('开始处理Excel模板:', templateName);
    
    // 处理记录数据
    const processedRecord = processRecordData(record);
    console.log('处理后的记录数据:', {
      recordId: getRecordId(record),
      fieldCount: Object.keys(processedRecord).length
    });

    // 确保文件数据有效
    if (!templateArrayBuffer || templateArrayBuffer.byteLength === 0) {
      console.error('Excel模板文件为空或无法读取');
      throw new Error('Excel模板文件为空或无法读取');
    }
    
    console.log('已读取Excel模板文件，大小:', templateArrayBuffer.byteLength, '字节');

    // 使用xlsx解析工作簿
    const workbook = XLSX.read(templateArrayBuffer, { type: 'array' });
    
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      console.error('无法解析Excel工作簿或工作簿不包含工作表');
      throw new Error('无法解析Excel工作簿');
    }
    
    console.log('成功解析Excel工作簿，工作表:', workbook.SheetNames);

    // 遍历所有工作表
    for (const sheetName of workbook.SheetNames) {
      console.log(`处理工作表: ${sheetName}`);
      const worksheet = workbook.Sheets[sheetName];
      
      // 获取工作表范围
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      // 遍历工作表中的所有单元格
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddress = XLSX.utils.encode_cell({ r, c });
          const cell = worksheet[cellAddress];
          
          // 如果单元格存在且包含值
          if (cell && cell.v !== undefined && typeof cell.v === 'string') {
            // 使用正则表达式查找所有 {字段名} 格式的占位符
            const regex = /\{([^}]+)\}/g;
            let match;
            let cellValue = cell.v;
            let hasReplacement = false;
            
            // 保存原始单元格值用于比较
            const originalValue = cellValue;
            
            while ((match = regex.exec(originalValue)) !== null) {
              // 提取字段名
              const fieldName = match[1];
              console.log(`在单元格 ${cellAddress} 中找到占位符: {${fieldName}}`);
              
              // 查找对应的字段值 - 使用处理后的记录数据
              let fieldValue: string;
              
              // 直接查找完全匹配
              if (processedRecord[fieldName] !== undefined) {
                fieldValue = String(processedRecord[fieldName]);
                console.log(`匹配成功: ${fieldName} =`, fieldValue);
              } else {
                // 尝试查找字段的变体（忽略大小写、空格等）
                console.log(`未找到完全匹配: ${fieldName}`);
                const lowerFieldName = fieldName.toLowerCase();
                const fieldKeys = Object.keys(processedRecord);
                const matchedKey = fieldKeys.find(key => key.toLowerCase() === lowerFieldName);
                
                if (matchedKey) {
                  console.log(`找到近似匹配: ${matchedKey}`);
                  fieldValue = String(processedRecord[matchedKey]);
                } else {
                  console.log(`未找到值: ${fieldName}`);
                  fieldValue = `{${fieldName}}`;
                }
              }
              
              // 替换占位符
              cellValue = cellValue.replace(`{${fieldName}}`, fieldValue);
              hasReplacement = true;
            }
            
            // 如果有替换，更新单元格值
            if (hasReplacement && cellValue !== originalValue) {
              console.log(`更新单元格 ${cellAddress}: "${originalValue}" -> "${cellValue}"`);
              
              // 保留原始单元格格式
              const newCell = { ...cell, v: cellValue };
              
              // 如果是公式，更新公式结果但保留公式
              if (cell.f) {
                console.log(`保留公式: ${cell.f}`);
                newCell.w = cellValue; // 更新显示值
              }
              
              worksheet[cellAddress] = newCell;
            }
          }
        }
      }
    }
    
    // 生成处理后的Excel文件
    console.log('生成处理后的Excel文件');
    const excelOutput = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelOutput], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    return blob;
  } catch (error: any) {
    console.error('处理Excel模板失败:', error);
    
    // 创建一个错误报告工作簿作为备用方案
    return createErrorReportWorkbook(record, error, templateName);
  }
};

// 根据模板类型处理模板 - 统一入口
export const processTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  templateType: TemplateType,
  record: LarkRecord | Record<string, any>,
  templateName: string
): Promise<Blob> => {
  if (templateType === 'docx') {
    return processDocxTemplate(templateArrayBuffer, record, templateName);
  } else {
    return processXlsxTemplate(templateArrayBuffer, record, templateName);
  }
};

// 从File对象处理模板 - 便捷函数
export const processTemplateFromFile = async (
  templateFile: File,
  templateType: TemplateType,
  record: LarkRecord | Record<string, any>,
  templateName: string
): Promise<Blob> => {
  const arrayBuffer = await templateFile.arrayBuffer();
  return processTemplate(arrayBuffer, templateType, record, templateName);
};

// 生成文件名
export const generateFileName = (templateName: string, templateType: TemplateType): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${templateName}_${timestamp}.${templateType}`;
};

// 下载文件
export const downloadFile = (blob: Blob, fileName: string): void => {
  saveAs(blob, fileName);
};