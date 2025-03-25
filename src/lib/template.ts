import { Template, SerializedTemplate } from '../types';
import * as XLSX from 'xlsx';
import { Document, Packer, TextRun, Paragraph } from 'docx';
import { saveAs } from 'file-saver';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const TEMPLATE_STORAGE_KEY = 'template_history';

export const extractPlaceholders = (content: string): string[] => {
  const regex = /\{([^}]+)\}/g;
  const matches = content.match(regex) || [];
  return matches.map(match => match.slice(1, -1));
};

export const saveTemplateToStorage = (template: Template): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      console.log('开始保存模板到本地存储:', template.name);
      
      // 我们需要先转换 File 对象以便可以存储
      const fileReader = new FileReader();
      fileReader.readAsArrayBuffer(template.file);
      
      fileReader.onload = () => {
        const arrayBuffer = fileReader.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 使用 btoa 只是为了存储，不涉及字符编码解析
        const base64String = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
        
        // 先获取现有的模板列表
        let existingTemplatesStr = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        console.log('从localStorage获取的现有模板数据:', existingTemplatesStr?.substring(0, 100) + '...');
        
        let existingTemplates: SerializedTemplate[] = [];
        if (existingTemplatesStr) {
          try {
            existingTemplates = JSON.parse(existingTemplatesStr);
            console.log('现有模板数量:', existingTemplates.length);
          } catch (err) {
            console.error('解析现有模板失败，将重置模板列表:', err);
            existingTemplates = [];
          }
        }
        
        const templateToSave: SerializedTemplate = {
          id: template.id,
          name: template.name,
          file: {
            name: template.file.name,
            type: template.file.type,
            dataUrl: `data:${template.file.type};base64,${base64String}`,
            lastModified: template.file.lastModified
          },
          placeholders: template.placeholders,
          type: template.type,
          createdAt: template.createdAt.toISOString()
        };
        
        // 添加到现有模板列表 - 不检查重复ID，直接添加
        existingTemplates.push(templateToSave);
        console.log('保存后的模板数量:', existingTemplates.length);
        
        // 将整个模板列表序列化并保存回本地存储
        const templatesJson = JSON.stringify(existingTemplates);
        console.log('序列化后的模板数据长度:', templatesJson.length);
        
        localStorage.setItem(TEMPLATE_STORAGE_KEY, templatesJson);
        console.log('模板已保存到本地存储');
        
        // 验证保存是否成功
        const verifyData = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        if (verifyData) {
          try {
            const parsed = JSON.parse(verifyData);
            console.log('验证: 已成功保存 ' + parsed.length + ' 个模板');
            resolve(); // 成功保存后解析Promise
          } catch (err) {
            console.error('验证: 保存的数据无法解析', err);
            reject(err); // 验证失败时拒绝Promise
          }
        } else {
          console.error('验证: 无法从localStorage获取保存的数据');
          reject(new Error('无法从localStorage获取保存的数据')); // 拒绝Promise
        }
      };
      
      fileReader.onerror = (error) => {
        console.error('读取文件失败:', error);
        reject(error); // 读取文件失败时拒绝Promise
      };
    } catch (error) {
      console.error('保存模板到本地存储失败:', error);
      reject(error); // 其他错误时拒绝Promise
    }
  });
};

export const getTemplatesFromStorage = (): Template[] => {
  try {
    console.log('开始获取模板列表');
    const templatesJson = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    
    if (!templatesJson) {
      console.log('localStorage中没有模板数据');
      return [];
    }
    
    console.log(`从localStorage获取了 ${templatesJson.length} 字节的模板数据`);
    
    try {
      const parsedTemplates = JSON.parse(templatesJson) as SerializedTemplate[];
      
      if (!Array.isArray(parsedTemplates)) {
        console.error('解析的模板不是数组格式，返回空数组');
        localStorage.removeItem(TEMPLATE_STORAGE_KEY); // 移除无效数据
        return [];
      }
      
      console.log('成功解析的模板数量:', parsedTemplates.length);
      
      // 将序列化的模板转换为实际的模板对象（包含File对象）
      const templates = parsedTemplates
        .map((template, index) => {
          try {
            console.log(`处理第 ${index+1}/${parsedTemplates.length} 个模板: ${template.name}`);
            
            // 基本数据验证
            if (!template.id || !template.name || !template.type) {
              console.error(`模板 #${index} 缺少基本属性`);
              return null;
            }
            
            // 创建File对象
            if (template.file && template.file.dataUrl) {
              // 从dataUrl提取MIME类型和base64数据
              const dataUrlRegex = /^data:(.+);base64,(.*)$/;
              const matches = template.file.dataUrl.match(dataUrlRegex);
              
              if (!matches) {
                console.error(`模板 ${template.name} 的数据URL格式无效`);
                return null;
              }
              
              const [_, mimeType, base64Data] = matches;
              
              if (!base64Data || base64Data.length === 0) {
                console.error(`模板 ${template.name} 的base64数据为空`);
                return null;
              }
              
              try {
                // 解码base64
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                
                if (bytes.length === 0) {
                  console.error(`模板 ${template.name} 解码后的二进制数据为空`);
                  return null;
                }
                
                // 创建Blob和File对象
                const blob = new Blob([bytes], { type: mimeType });
                
                if (blob.size === 0) {
                  console.error(`模板 ${template.name} 创建的Blob为空`);
                  return null;
                }
                
                const file = new File(
                  [blob], 
                  template.file.name, 
                  {
                    type: mimeType,
                    lastModified: template.file.lastModified || Date.now()
                  }
                );
                
                console.log(`成功为模板 ${template.name} 创建File对象，大小: ${file.size} 字节`);
                
                return {
                  id: template.id,
                  name: template.name,
                  file: file,
                  placeholders: template.placeholders || [],
                  type: template.type,
                  createdAt: new Date(template.createdAt)
                };
              } catch (decodeError) {
                console.error(`解码模板 ${template.name} 的base64数据失败:`, decodeError);
                return null;
              }
            } else {
              console.error(`模板 ${template.name} 缺少文件数据`);
              return null;
            }
          } catch (templateError) {
            console.error(`处理模板 #${index} 时出错:`, templateError);
            return null;
          }
        })
        .filter(Boolean) as Template[]; // 过滤掉null值
      
      console.log(`成功加载了 ${templates.length} 个模板`);
      return templates;
    } catch (parseError) {
      console.error('解析模板JSON数据失败:', parseError);
      localStorage.removeItem(TEMPLATE_STORAGE_KEY); // 移除无效数据
      return [];
    }
  } catch (error) {
    console.error('从localStorage获取模板失败:', error);
    return [];
  }
};

export const generateFileName = (templateName: string, templateType: 'docx' | 'xlsx'): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  // 使用模板类型作为文件扩展名
  return `${templateName}_${timestamp}.${templateType}`;
};

export const processTemplate = async (
  template: Template,
  record: { [key: string]: any }
): Promise<Blob> => {
  if (template.type === 'docx') {
    return await processDocxTemplate(template.file, record, template.name);
  } else {
    return await processXlsxTemplate(template, record);
  }
};

// 添加日期格式化函数
const formatFieldValue = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }
  
  // 处理日期类型（时间戳）
  if (typeof value === 'number' && value > 1000000000000) {
    try {
      // 尝试将毫秒时间戳转换为日期格式
      const date = new Date(value);
      // 检查是否是有效日期
      if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      }
    } catch (e) {
      // 转换失败，继续使用默认处理
    }
  }
  
  // 处理货币类型
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
  
  if (typeof value === 'object') {
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
  
  return String(value);
};

// 处理记录数据，对每个字段值进行格式化
const processRecordData = (record: Record<string, any>): Record<string, any> => {
  const processedRecord: Record<string, any> = {};
  
  Object.entries(record).forEach(([key, value]) => {
    // 使用formatFieldValue格式化字段值
    const displayValue = formatFieldValue(value);
    processedRecord[key] = displayValue;
  });
  
  return processedRecord;
};

function processDocxTemplate(templateFile: File, record: Record<string, any>, templateName: string): Promise<Blob> {
  return new Promise<Blob>(async (resolve, reject) => {
    try {
      console.log('开始处理Word模板:', templateName);
      console.log('原始记录数据:', record);
      
      // 处理记录数据，格式化特殊类型的字段值
      const processedRecord = processRecordData(record);
      console.log('处理后的记录数据:', processedRecord);

      if (!templateFile) {
        console.error('模板文件为空');
        return reject(new Error('模板文件为空'));
      }

      // 读取模板文件
      const arrayBuffer = await templateFile.arrayBuffer();
      console.log('已读取模板文件，大小:', arrayBuffer.byteLength, '字节');

      // 创建一个空的PizZip实例
      const zip = new PizZip();
      
      // 加载文档
      try {
        // 尝试加载文档
        zip.load(arrayBuffer);
        console.log('成功加载文档到PizZip');
      } catch (error: any) {
        console.error('PizZip加载文档失败:', error);
        return reject(new Error(`无法解析DocX文件格式: ${error.message || '未知错误'}`));
      }

      // 创建Docxtemplater实例
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        parser: function(tag) {
          // 用于解析标签的函数
          console.log('尝试解析标签:', tag);
          return {
            get: function(scope) {
              // 记录每次尝试获取的占位符值
              console.log(`尝试从作用域获取值 "${tag}"`, scope);
              
              // 直接匹配字段标题
              if (scope[tag] !== undefined) {
                console.log(`匹配成功: ${tag} =`, scope[tag]);
                return scope[tag];
              }
              
              console.log(`未找到值: ${tag}`);
              return '';
            }
          };
        },
        nullGetter: function(part) {
          // 当找不到占位符值时的处理
          console.log('找不到占位符值:', part);
          if (part.module === 'rawxml') {
            return '';
          }
          return '';
        }
      });

      // 设置数据到模板
      console.log('设置数据到模板:', processedRecord);
      doc.setData(processedRecord);

      try {
        // 渲染模板
        console.log('开始渲染模板');
        doc.render();
        console.log('模板渲染成功');

        // 生成输出
        const output = doc.getZip().generate({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        console.log('已生成Word文档');
        
        resolve(output);
      } catch (error: any) {
        console.error('模板渲染错误:', error);
        
        // 获取详细错误信息
        if (error.properties && error.properties.errors) {
          console.error('错误详情:', JSON.stringify(error.properties.errors));
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
}

// 创建错误报告工作簿的函数
async function createErrorReportWorkbook(record: Record<string, any>, error: any, templateName: string): Promise<Blob> {
  // 创建一个新的工作簿
  const workbook = XLSX.utils.book_new();
  
  // 创建一个包含错误信息的工作表
  const errorData = [
    ['错误报告'],
    [`模板名称: ${templateName}`],
    [`生成时间: ${new Date().toLocaleString('zh-CN')}`],
    [],
    ['发生错误:'],
    [error instanceof Error ? error.message : (typeof error === 'string' ? error : '未知错误')],
    [],
    ['使用说明:'],
    ['1. 确保您的模板是有效的Excel文件(.xlsx)格式'],
    ['2. 占位符应该使用 {字段名} 格式，其中字段名与下面列出的字段名称完全一致'],
    [],
    ['可用字段:']
  ];
  
  // 添加所有字段和值，使用格式化函数
  Object.entries(record)
    .filter(([key]) => key !== 'id') // 排除id字段
    .forEach(([key, value]) => {
      const displayValue = formatFieldValue(value);
      errorData.push([`${key}: ${displayValue}`]);
    });
  
  // 创建工作表
  const sheet = XLSX.utils.aoa_to_sheet(errorData);
  
  // 添加工作表到工作簿
  XLSX.utils.book_append_sheet(workbook, sheet, '错误报告');
  
  // 生成Excel文件
  const excelOutput = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelOutput], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const processXlsxTemplate = async (
  template: Template,
  record: { [key: string]: any }
): Promise<Blob> => {
  try {
    console.log('开始处理Excel模板:', template.name);
    console.log('原始记录数据:', record);
    
    // 处理记录数据，格式化特殊类型的字段值
    const processedRecord = processRecordData(record);
    console.log('处理后的记录数据:', processedRecord);

    // 读取Excel模板
    const arrayBuffer = await template.file.arrayBuffer();
    
    // 确保文件数据有效
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.error('Excel模板文件为空或无法读取');
      throw new Error('Excel模板文件为空或无法读取');
    }
    
    console.log('已读取Excel模板文件，大小:', arrayBuffer.byteLength, '字节');

    // 使用xlsx解析工作簿
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
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
              
              // 直接查找对应的字段值 - 使用处理后的记录数据
              let fieldValue = processedRecord[fieldName];
              
              if (fieldValue === undefined) {
                console.log(`未找到匹配: ${fieldName}`);
                fieldValue = `(未找到值: ${fieldName})`;
              } else {
                console.log(`匹配成功: ${fieldName} =`, fieldValue);
              }
              
              // 替换占位符 - 不需要额外处理，因为已经格式化过了
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
    console.log('创建错误报告工作簿');
    return createErrorReportWorkbook(record, error, template.name);
  }
};

export const downloadFile = (blob: Blob, fileName: string): void => {
  saveAs(blob, fileName);
};

// 创建错误报告文档的函数
async function createErrorReportDoc(record: Record<string, any>, error: any, templateName: string): Promise<Blob> {
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
              text: `生成时间: ${new Date().toLocaleString('zh-CN')}`,
              size: 20
            })
          ]
        }),
        new Paragraph({}),
        new Paragraph({
          children: [
            new TextRun({ 
              text: '处理模板时发生错误:', 
              bold: true,
              size: 20,
              color: 'ff0000'
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ 
              text: error instanceof Error ? error.message : (typeof error === 'string' ? error : '未知错误'),
              color: 'ff0000'
            })
          ]
        }),
        new Paragraph({}),
        new Paragraph({
          children: [
            new TextRun({ 
              text: '模板使用说明:', 
              bold: true,
              size: 20
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ 
              text: '1. 确保您的模板是有效的Word文档(.docx)格式', 
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ 
              text: '2. 占位符应该使用 {字段名} 格式，其中字段名与下方列出的字段名称完全一致', 
            })
          ]
        }),
        new Paragraph({}),
        new Paragraph({
          children: [
            new TextRun({ 
              text: '以下是您提供的字段值:', 
              bold: true,
              size: 20
            })
          ]
        }),
        ...Object.entries(record)
          .filter(([key]) => key !== 'id') // 排除id字段
          .map(([key, value]) => {
            // 使用相同的格式化函数
            const displayValue = formatFieldValue(value);
            
            return new Paragraph({
              children: [
                new TextRun({ 
                  text: `${key}: `, 
                  bold: true
                }),
                new TextRun({ 
                  text: displayValue,
                })
              ]
            });
          })
      ]
    }]
  });
  
  // 将文档打包为blob
  return await Packer.toBlob(doc);
} 