import * as XLSX from 'xlsx';
import { Packer, Document, Paragraph, TextRun } from 'docx';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { LarkRecord, TemplateType } from '@/types';

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
export const formatFieldValue = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }
  
  // 处理日期类型（时间戳）
  if (typeof value === 'number' && value > 1000000000000) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }
    } catch (e) {
      // 转换失败，继续使用默认处理
    }
  }
  
  // 处理对象类型
  if (typeof value === 'object') {
    // 检查是否包含日期对象
    if (value && value.type === 'DateTime' && value.value) {
      try {
        const date = new Date(value.value);
        if (!isNaN(date.getTime())) {
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }
      } catch (e) {
        // 转换失败，继续使用默认处理
      }
    }
    
    // 检查是否是货币对象
    if (value && typeof value === 'object' && value.type === 'Currency') {
      try {
        // 提取货币金额和货币类型
        const amount = parseFloat(value.value || 0);
        const currency = value.currency || 'CNY';
        
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
    if (value.name) return value.name;
    if (value.title) return value.title;
    if (value.text) return value.text;
    if (value.value) return value.value;
    
    // 如果是数组，映射每个项目并用逗号连接
    if (Array.isArray(value)) {
      return value.map(item => formatFieldValue(item)).join(', ');
    }
    
    // 其他情况，转为JSON字符串
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '[复杂对象]';
    }
  }
  
  // 处理货币数值
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
  
  return String(value);
};

// 处理记录数据
export const processRecordData = (record: LarkRecord): Record<string, any> => {
  const processedRecord: Record<string, any> = {};
  
  // 添加一个默认数据，避免空数据问题
  processedRecord['_docData'] = {
    currentDate: new Date().toLocaleDateString(),
    recordId: record.record_id,
    generateTime: new Date().toISOString(),
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate()
  };
  
  // 处理记录中的字段
  Object.entries(record.fields).forEach(([key, value]) => {
    try {
      // 使用formatFieldValue格式化字段值
      const displayValue = formatFieldValue(value);
      
      // 添加原始字段名映射
      processedRecord[key] = displayValue;
      
      // 同时添加无需字段名的变量，使模板中可以直接使用{fieldName}而不是{fields.fieldName}
      // 确保没有特殊字符的安全键名
      const safeKey = key.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      if (safeKey !== key) {
        processedRecord[safeKey] = displayValue;
      }
      
      // 为常见字段名添加更友好的别名
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('日期') || lowerKey.includes('时间') || lowerKey.includes('date') || lowerKey.includes('time')) {
        // 尝试解析为日期对象，添加更多格式的日期
        try {
          let dateVal;
          if (typeof value === 'string') {
            dateVal = new Date(value);
          } else if (typeof value === 'number') {
            dateVal = new Date(value);
          } else if (value && typeof value === 'object' && value.value) {
            dateVal = new Date(value.value);
          }
          
          if (dateVal && !isNaN(dateVal.getTime())) {
            const dateSuffix = safeKey !== key ? `_${safeKey}_` : `_${key.replace(/\s+/g, '_')}_`;
            processedRecord[`${dateSuffix}年`] = dateVal.getFullYear();
            processedRecord[`${dateSuffix}月`] = String(dateVal.getMonth() + 1).padStart(2, '0');
            processedRecord[`${dateSuffix}日`] = String(dateVal.getDate()).padStart(2, '0');
            processedRecord[`${dateSuffix}年月日`] = `${dateVal.getFullYear()}年${dateVal.getMonth() + 1}月${dateVal.getDate()}日`;
          }
        } catch (e) {
          // 日期解析失败，忽略
          console.warn(`日期字段 "${key}" 解析失败:`, e);
        }
      }
    } catch (e) {
      console.error(`处理字段 "${key}" 时出错:`, e);
      processedRecord[key] = String(value || '');
    }
  });
  
  // 添加调试信息
  console.log('处理后的记录数据:', {
    recordId: record.record_id,
    fieldCount: Object.keys(processedRecord).length
  });
  
  return processedRecord;
};

// 处理Word模板
export const processDocxTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  record: LarkRecord,
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
                
                // 直接匹配字段标题
                if (scope[tag] !== undefined) {
                  console.log(`匹配成功: ${tag} =`, scope[tag]);
                  return scope[tag];
                }
                
                // 尝试查找字段的变体（忽略大小写、空格等）
                const lowerTag = tag.toLowerCase();
                for (const [key, value] of Object.entries(scope)) {
                  if (key.toLowerCase() === lowerTag) {
                    console.log(`找到近似匹配: ${key} =`, value);
                    return value;
                  }
                }
                
                console.log(`未找到值: ${tag}`);
                return `[${tag}]`;
              }
            };
          },
          nullGetter: function(part: any) {
            // 如果是标签为空，显示占位符而不是空内容
            if (part.module === "rawxml") {
              return "";
            }
            return `[${part.value || "无内容"}]`;
          }
        });

        // 设置数据并渲染
        doc.setData(processedRecord);
        doc.render();
        
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

// 处理Excel模板
export const processXlsxTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  record: LarkRecord,
  templateName: string
): Promise<Blob> => {
  try {
    console.log('开始处理Excel模板:', templateName);
    
    // 处理记录数据
    const processedRecord = processRecordData(record);
    console.log('处理后的记录数据:', {
      recordId: record.record_id,
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
              let fieldValue = processedRecord[fieldName];
              
              if (fieldValue === undefined) {
                console.log(`未找到匹配: ${fieldName}`);
                // 尝试查找字段的变体
                const lowerFieldName = fieldName.toLowerCase();
                const fieldKeys = Object.keys(processedRecord);
                const matchedKey = fieldKeys.find(key => key.toLowerCase() === lowerFieldName);
                
                if (matchedKey) {
                  console.log(`找到近似匹配: ${matchedKey}`);
                  fieldValue = processedRecord[matchedKey];
                } else {
                  fieldValue = `[${fieldName}]`;
                }
              } else {
                console.log(`匹配成功: ${fieldName} =`, fieldValue);
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

// 根据模板类型处理模板
export const processTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  templateType: TemplateType,
  record: LarkRecord,
  templateName: string
): Promise<Blob> => {
  if (templateType === 'docx') {
    return processDocxTemplate(templateArrayBuffer, record, templateName);
  } else {
    return processXlsxTemplate(templateArrayBuffer, record, templateName);
  }
};

// 创建错误报告文档
async function createErrorReportDoc(record: LarkRecord, error: any, templateName: string): Promise<Blob> {
  // 创建字段数组
  const fieldParagraphs: Paragraph[] = [];
  
  // 添加记录字段到段落数组
  Object.entries(record.fields).forEach(([key, value]) => {
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
              text: `错误信息: ${error ? (error.message || '未知错误') : '未知错误'}`,
              size: 24
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `记录ID: ${record.record_id}`,
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
async function createErrorReportWorkbook(record: LarkRecord, error: any, templateName: string): Promise<Blob> {
  // 创建一个新工作簿
  const workbook = XLSX.utils.book_new();
  
  // 错误信息数据
  const errorData = [
    ['模板处理失败'],
    [`模板名称: ${templateName}`],
    [`错误信息: ${error ? (error.message || '未知错误') : '未知错误'}`],
    [`记录ID: ${record.record_id}`],
    [''],
    ['字段数据:']
  ];
  
  // 添加记录字段到工作表
  Object.entries(record.fields).forEach(([key, value]) => {
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