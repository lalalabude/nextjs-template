import * as XLSX from 'xlsx';
import { Packer, Document, Paragraph, TextRun } from 'docx';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { LarkRecord, TemplateType } from '@/types';
import { saveAs } from 'file-saver';
import { EnhancedLarkRecord } from '@/types';

// 日志收集器，用于延迟日志处理
class LogCollector {
  private logs: Array<{level: string, message: string, data?: any}> = [];
  private debugEnabled: boolean;

  constructor(debugEnabled = false) {
    this.debugEnabled = debugEnabled;
  }

  debug(message: string, data?: any) {
    if (this.debugEnabled) {
      this.logs.push({level: 'debug', message, data});
    }
  }

  info(message: string, data?: any) {
    this.logs.push({level: 'info', message, data});
  }

  warn(message: string, data?: any) {
    this.logs.push({level: 'warn', message, data});
  }

  error(message: string, data?: any) {
    this.logs.push({level: 'error', message, data});
    // 错误日志立即输出
    console.error(message, data);
  }

  flush() {
    if (this.logs.length === 0) return;

    // 输出所有收集的日志
    this.logs.forEach(log => {
      if (log.level === 'debug' && this.debugEnabled) {
        console.debug(log.message, log.data);
      } else if (log.level === 'info') {
        console.log(log.message, log.data);
      } else if (log.level === 'warn') {
        console.warn(log.message, log.data);
      }
      // 错误已经实时输出了
    });
    this.logs = [];
  }
}

// 提取占位符
export const extractPlaceholders = (content: string): string[] => {
  const regex = /\{([^}]+)\}/g;
  const matches = content.match(regex) || [];
  return matches.map(match => match.slice(1, -1));
};

// 格式化字段值 - 根据值类型进行格式化
function formatValueByType(value: any, fieldName: string): string | number {
  if (value === null || value === undefined) {
    return '';
  }
  
  // 对"报名单位计数"字段特殊处理，保持数字类型
  if (fieldName === "报名单位计数") {
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      return numValue; // 返回数字类型而非字符串
    }
  }
  
  // 处理数字（包括可能的时间戳）
  if (typeof value === 'number') {
    // 检查是否可能是时间戳
    if (value > 1000000000000) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        // 日期字段使用中文格式
        if (fieldName.toLowerCase().includes('日期') || 
            fieldName.toLowerCase().includes('date') || 
            fieldName.toLowerCase().includes('time')) {
          return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
        }
        // 其他情况使用标准格式
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }
    }
    return String(value);
  }
  
  // 处理对象
  if (typeof value === 'object' && value !== null) {
    // 数组处理
    if (Array.isArray(value)) {
      return value.map(item => formatValueByType(item, fieldName)).join(', ');
    }
    
    // 飞书标准字段格式 {type: number, value: any}
    if ('type' in value && 'value' in value) {
      const fieldType = value.type;
      const fieldValue = value.value;
      
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
        // 对"报名单位计数"字段特殊处理
        if (fieldName === "报名单位计数") {
          const numValue = Number(fieldValue);
          if (!isNaN(numValue)) {
            return numValue; // 返回数字类型
          }
        }
        
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
      
      // 其他类型，尝试直接获取值
      return formatValueByType(fieldValue, fieldName);
    }
    
    // 通用对象处理
    if ('text' in value && value.text !== undefined) {
      return String(value.text);
    }
    
    if ('value' in value && value.value !== undefined) {
      return formatValueByType(value.value, fieldName);
    }
    
    if ('name' in value && typeof value.name === 'string') {
      return value.name;
    }
    
    if ('title' in value && typeof value.title === 'string') {
      return value.title;
    }
    
    try {
      return JSON.stringify(value);
    } catch {
      return '[复杂对象]';
    }
  }
  
  // 字符串处理 - 可能是时间戳字符串
  if (typeof value === 'string') {
    // 对"报名单位计数"字段特殊处理
    if (fieldName === "报名单位计数" && /^\d+$/.test(value.trim())) {
      const numValue = parseInt(value.trim(), 10);
      if (!isNaN(numValue)) {
        return numValue; // 返回数字类型
      }
    }
    
    // 检查是否是纯数字字符串
    if (/^\d+$/.test(value.trim())) {
      const numValue = parseInt(value.trim(), 10);
      // 递归调用以处理数字时间戳
      return formatValueByType(numValue, fieldName);
    }
    
    // 检查是否是标准日期字符串
    if (value.includes('-') || value.includes('/')) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          if (fieldName.toLowerCase().includes('日期') || 
              fieldName.toLowerCase().includes('date') || 
              fieldName.toLowerCase().includes('time')) {
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
          }
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
      } catch (e) {
        // 日期解析失败，返回原始字符串
      }
    }
  }
  
  // 基本类型
  return String(value);
}

// 格式化字段值 - 兼容旧代码的接口
export const formatFieldValue = (value: unknown): string => {
  return formatValueByType(value, '') as string;
};

// 统一的占位符解析函数
function resolveFieldValue(fieldName: string, recordData: Record<string, any>, logger?: LogCollector): string {
  // 查找优先级：精确匹配 > 文本格式 > 日期特殊格式 > 模糊匹配
  
  // 1. 精确匹配
  if (recordData[fieldName] !== undefined) {
    const value = recordData[fieldName];
    logger?.debug(`精确匹配字段: ${fieldName}`);
    return formatValueByType(value, fieldName) as string;
  }
  
  // 2. 文本格式 (_text)
  const textKey = `${fieldName}_text`;
  if (recordData[textKey] !== undefined) {
    logger?.debug(`匹配文本格式: ${textKey}`);
    return String(recordData[textKey]);
  }
  
  // 3. 日期特殊格式
  if (fieldName.toLowerCase().includes('日期') || 
      fieldName.toLowerCase().includes('date') || 
      fieldName.toLowerCase().includes('time')) {
    
    // 中文日期格式
    const chineseKey = `${fieldName}_chinese`;
    if (recordData[chineseKey] !== undefined) {
      logger?.debug(`匹配中文日期格式: ${chineseKey}`);
      return String(recordData[chineseKey]);
    }
    
    // 标准日期格式
    const formattedKey = `${fieldName}_formatted`;
    if (recordData[formattedKey] !== undefined) {
      logger?.debug(`匹配标准日期格式: ${formattedKey}`);
      return String(recordData[formattedKey]);
    }
  }
  
  // 4. 模糊匹配（忽略大小写）
  const lowerFieldName = fieldName.toLowerCase();
  const fieldKeys = Object.keys(recordData);
  
  // 先尝试模糊匹配日期字段
  if (lowerFieldName.includes('日期') || 
      lowerFieldName.includes('date') || 
      lowerFieldName.includes('time')) {
    
    // 模糊匹配中文日期格式
    const chineseMatch = fieldKeys.find(key => 
      key.toLowerCase().includes(lowerFieldName) && 
      key.toLowerCase().includes('chinese'));
    
    if (chineseMatch) {
      logger?.debug(`模糊匹配中文日期: ${chineseMatch}`);
      return String(recordData[chineseMatch]);
    }
    
    // 模糊匹配标准日期格式
    const formattedMatch = fieldKeys.find(key => 
      key.toLowerCase().includes(lowerFieldName) && 
      key.toLowerCase().includes('formatted'));
    
    if (formattedMatch) {
      logger?.debug(`模糊匹配标准日期: ${formattedMatch}`);
      return String(recordData[formattedMatch]);
    }
  }
  
  // 模糊匹配文本字段
  const textMatch = fieldKeys.find(key => 
    key.toLowerCase() === `${lowerFieldName}_text`);
  
  if (textMatch) {
    logger?.debug(`模糊匹配文本字段: ${textMatch}`);
    return String(recordData[textMatch]);
  }
  
  // 最后尝试普通模糊匹配
  const match = fieldKeys.find(key => 
    key.toLowerCase() === lowerFieldName);
  
  if (match) {
    logger?.debug(`普通模糊匹配: ${match}`);
    return formatValueByType(recordData[match], match) as string;
  }
  
  logger?.debug(`未找到匹配: ${fieldName}`);
  // 没有找到匹配，返回空字符串
  return '';
}

// 优化的占位符替换处理
function replaceAllPlaceholders(template: string, recordData: Record<string, any>, logger?: LogCollector): string | number {
  const placeholderRegex = /\{([^}]+)\}/g;
  
  // 检查是否只有一个占位符，且整个模板就是这个占位符
  if (template.trim().match(/^\{([^}]+)\}$/)) {
    // 直接提取占位符名称
    const fieldName = template.trim().substring(1, template.trim().length - 1);
    
    // 如果是"报名单位计数"字段，直接返回解析结果（可能是数字）
    if (fieldName === "报名单位计数") {
      const value = resolveFieldValue(fieldName, recordData, logger);
      // 如果能转换为数字，则返回数字
      if (typeof value === 'string') {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          return numValue;
        }
      }
      return value;
    }
  }
  
  // 一般情况下，进行字符串替换
  return template.replace(placeholderRegex, (_match, fieldName) => {
    return String(resolveFieldValue(fieldName, recordData, logger));
  });
}

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

// 统一预处理记录数据
function enhanceRecordData(record: LarkRecord | EnhancedLarkRecord | Record<string, any>, logger?: LogCollector): Record<string, any> {
  logger?.info('开始预处理记录数据');
  
  // 创建基本记录对象
  const recordId = getRecordId(record);
  const fields = getRecordFields(record);
  const fieldMeta = 'fieldMeta' in record ? record.fieldMeta || {} : {};
  
  // 添加基本的日期和时间信息
  const now = new Date();
  const baseData = {
    _record_id: recordId,
    _currentDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    _currentDate_chinese: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
    _currentTime: now.toTimeString().split(' ')[0],
    _timestamp: now.getTime(),
    _year: now.getFullYear(),
    _month: now.getMonth() + 1,
    _day: now.getDate(),
    currentDate: `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`,
    currentDate_chinese: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
    recordId: recordId,
    generateTime: now.toISOString(),
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  };
  
  // 合并所有字段和元数据
  const result: Record<string, any> = {
    ...baseData,
    ...fields
  };
  
  // 遍历所有字段，为复杂类型添加预处理的文本版本
  Object.entries(fields).forEach(([key, value]) => {
    // 添加原始字段名和文本版本的映射
    if (fieldMeta[key]) {
      // 使用字段显示名称作为别名
      const displayName = fieldMeta[key].name;
      if (displayName && displayName !== key) {
        result[displayName] = value;
        logger?.debug(`添加字段显示名映射: ${key} -> ${displayName}`);
      }
    }
    
    // 为对象类型添加_text版本
    if (typeof value === 'object' && value !== null) {
      result[`${key}_text`] = formatValueByType(value, key) as string;
      logger?.debug(`添加字段文本版本: ${key}_text`);
    }
    
    // 为日期字段添加特殊格式
    const isDateField = key.toLowerCase().includes('日期') || 
                         key.toLowerCase().includes('date') || 
                         key.toLowerCase().includes('time');
    
    const isTimestamp = typeof value === 'number' && value > 1000000000000;
    
    if (isDateField || isTimestamp) {
      try {
        const dateValue = isTimestamp ? value : String(value);
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          result[`${key}_formatted`] = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          result[`${key}_chinese`] = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
          logger?.debug(`添加字段日期格式: ${key}_formatted, ${key}_chinese`);
        }
      } catch (e) {
        logger?.warn(`转换日期字段失败: ${key}`, e);
      }
    }
  });
  
  logger?.info('记录数据预处理完成', { fieldCount: Object.keys(result).length });
  return result;
}

// 创建错误报告文档
export async function createErrorReportDoc(
  record: any,
  error: any,
  templateName: string
): Promise<Blob> {
  try {
    // 创建错误报告文档
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: "错误报告", size: 40, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `模板: ${templateName}`, size: 24 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `记录ID: ${getRecordId(record)}`, size: 24 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `时间: ${new Date().toISOString()}`, size: 24 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "错误信息:", size: 28, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ 
                text: error instanceof Error 
                  ? `${error.name}: ${error.message}` 
                  : String(error),
                size: 24,
                color: "FF0000" 
              }),
            ],
          }),
        ],
      }],
    });

    // 将文档转换为blob
    const buffer = await Packer.toBuffer(doc);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return blob;
  } catch (innerError) {
    console.error('创建错误报告文档失败:', innerError);
    // 创建最简单的错误报告
    return new Blob(
      [`错误报告\n\n模板: ${templateName}\n记录ID: ${getRecordId(record)}\n时间: ${new Date().toISOString()}\n\n错误信息:\n${error instanceof Error ? error.message : String(error)}`], 
      { type: 'text/plain' }
    );
  }
}

// 创建错误报告工作簿
export async function createErrorReportWorkbook(
  record: any,
  error: any,
  templateName: string
): Promise<Blob> {
  try {
    // 创建新的工作簿
    const workbook = XLSX.utils.book_new();
    
    // 创建错误报告数据
    const wsData = [
      ["错误报告"],
      ["模板", templateName],
      ["记录ID", getRecordId(record)],
      ["时间", new Date().toISOString()],
      [""],
      ["错误信息"],
      [error instanceof Error ? `${error.name}: ${error.message}` : String(error)]
    ];
    
    // 创建工作表并添加到工作簿
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(workbook, ws, "错误报告");
    
    // 生成工作簿数据
    const excelOutput = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelOutput], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch (innerError) {
    console.error('创建错误报告工作簿失败:', innerError);
    // 创建简单的错误报告
    return new Blob(
      [`错误报告\n\n模板: ${templateName}\n记录ID: ${getRecordId(record)}\n时间: ${new Date().toISOString()}\n\n错误信息:\n${error instanceof Error ? error.message : String(error)}`], 
      { type: 'text/plain' }
    );
  }
}

// 处理DocX模板的缓存
const docxTemplateCache = new Map<string, any>();

// 处理Word文档模板
export const processDocxTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  record: LarkRecord | Record<string, any>,
  templateName: string
): Promise<Blob> => {
  const logger = new LogCollector(false);
  logger.info('开始处理Word模板:', templateName);
  
  try {
    // 预处理记录数据
    const processedRecord = enhanceRecordData(record, logger);
    logger.info('记录数据预处理完成', {
      recordId: getRecordId(record),
      fieldCount: Object.keys(processedRecord).length
    });
    
    // 计算缓存键 - 使用模板内容的哈希值确保不同模板有不同缓存键
    const templateHash = await generateTemplateHash(templateArrayBuffer);
    const cacheKey = `${templateName}_${templateHash}_${getRecordId(record)}`;
    
    // 检查缓存
    if (docxTemplateCache.has(cacheKey)) {
      logger.info('使用缓存的模板处理结果');
      return docxTemplateCache.get(cacheKey);
    }
    
    // 创建一个空的PizZip实例
    const zip = new PizZip();
    
    // 加载文档
    try {
      zip.load(templateArrayBuffer);
    } catch (error: any) {
      logger.error('PizZip加载文档失败:', error);
      throw new Error(`无法解析DocX文件格式: ${error.message || '未知错误'}`);
    }

    // 创建Docxtemplater实例
    try {
      // 最新的Docxtemplater API使用
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        parser: function(tag: string) {
          // 用于解析标签的函数
          logger.debug('解析标签:', tag);
          return {
            get: function(scope: any) {
              return resolveFieldValue(tag, scope, logger);
            }
          };
        },
        nullGetter: function() {
          // 如果是标签为空，返回空字符串而不是原始占位符
          return "";
        }
      });

      // 设置数据并渲染
      doc.render(processedRecord);
      
      // 生成输出
      const output = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      // 缓存结果
      if (output.size > 0) {
        docxTemplateCache.set(cacheKey, output);
      }
      
      logger.info('Word模板处理成功', { size: output.size });
      logger.flush();
      return output;
    } catch (error: any) {
      logger.error('模板渲染错误:', error);
      
      if (error && error.properties && error.properties.errors) {
        logger.error('详细错误信息:', error.properties.errors);
      }
      
      // 创建简单的错误报告文档
      const errorReport = await createErrorReportDoc(record, error, templateName);
      logger.flush();
      return errorReport;
    }
  } catch (error: any) {
    logger.error('模板处理异常:', error);
    logger.flush();
    throw new Error(`模板处理过程中发生错误: ${error.message || '未知错误'}`);
  }
};

// 处理Excel模板的缓存
const xlsxTemplateCache = new Map<string, any>();

// 处理Excel模板 - 核心处理函数
export const processXlsxTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  record: LarkRecord | Record<string, any>,
  templateName: string
): Promise<Blob> => {
  const logger = new LogCollector(false);
  logger.info('开始处理Excel模板:', templateName);
  
  try {
    // 预处理记录数据
    const processedRecord = enhanceRecordData(record, logger);
    logger.info('记录数据预处理完成', {
      recordId: getRecordId(record),
      fieldCount: Object.keys(processedRecord).length
    });
    
    // 计算缓存键 - 使用模板内容的哈希值确保不同模板有不同缓存键
    const templateHash = await generateTemplateHash(templateArrayBuffer);
    const cacheKey = `${templateName}_${templateHash}_${getRecordId(record)}`;
    
    // 检查缓存
    if (xlsxTemplateCache.has(cacheKey)) {
      logger.info('使用缓存的模板处理结果');
      return xlsxTemplateCache.get(cacheKey);
    }

    // 确保文件数据有效
    if (!templateArrayBuffer || templateArrayBuffer.byteLength === 0) {
      logger.error('Excel模板文件为空或无法读取');
      throw new Error('Excel模板文件为空或无法读取');
    }
    
    logger.info('已读取Excel模板文件', { size: templateArrayBuffer.byteLength });

    // 使用xlsx解析工作簿
    const workbook = XLSX.read(templateArrayBuffer, { type: 'array' });
    
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      logger.error('无法解析Excel工作簿或工作簿不包含工作表');
      throw new Error('无法解析Excel工作簿');
    }
    
    logger.info('成功解析Excel工作簿', { sheets: workbook.SheetNames });

    // 仅处理Sheet1工作表
    const sheet1Name = 'Sheet1';
    
    // 检查是否存在Sheet1
    if (workbook.SheetNames.includes(sheet1Name)) {
      logger.debug(`处理工作表: ${sheet1Name}`);
      const worksheet = workbook.Sheets[sheet1Name];
      
      // 获取工作表范围
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      // 增量处理 - 批量处理单元格
      const batchSize = 50; // 每批处理的单元格数量
      let processedCells = 0;
      
      for (let r = range.s.r; r <= range.e.r; r++) {
        // 处理一行中的所有单元格
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddress = XLSX.utils.encode_cell({ r, c });
          const cell = worksheet[cellAddress];
          
          // 如果单元格存在且包含值
          if (cell && cell.v !== undefined && typeof cell.v === 'string') {
            // 使用正则表达式查找所有 {字段名} 格式的占位符
            const regex = /\{([^}]+)\}/g;
            let cellValue = cell.v;
            
            // 保存原始单元格值用于比较
            const originalValue = cellValue;
            
            // 使用统一的占位符替换函数
            const newValue = replaceAllPlaceholders(originalValue, processedRecord, logger);
            
            // 如果有替换，更新单元格值
            if (newValue !== originalValue) {
              logger.debug(`更新单元格 ${cellAddress}`, {
                from: originalValue,
                to: newValue
              });
              
              // 保留原始单元格格式
              const newCell = { ...cell };
              
              // 处理不同类型的返回值
              if (typeof newValue === 'number') {
                // 数字类型直接使用
                newCell.v = newValue;
                newCell.t = 'n'; // 设置单元格类型为数字
                logger.debug(`单元格 ${cellAddress} 设置为数字类型: ${newValue}`);
              } else if (originalValue.includes('{报名单位计数}')) {
                // 特殊处理报名单位计数字段
                const numValue = Number(newValue);
                if (!isNaN(numValue)) {
                  // 使用数字类型替代字符串
                  newCell.v = numValue;
                  newCell.t = 'n'; // 设置单元格类型为数字
                  logger.debug(`报名单位计数字段转换为数字类型: ${numValue}`);
                } else {
                  newCell.v = newValue;
                }
              } else {
                // 其他情况使用字符串
                newCell.v = newValue;
              }
              
              // 如果是公式，更新公式结果但保留公式
              if (cell.f) {
                logger.debug(`保留公式: ${cell.f}`);
                newCell.w = String(newValue); // 更新显示值
              }
              
              worksheet[cellAddress] = newCell;
            }
          }
          
          processedCells++;
          
          // 每处理一定数量的单元格，释放一次事件循环
          if (processedCells % batchSize === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }
      logger.info(`完成工作表 ${sheet1Name} 的处理`);
    } else {
      logger.warn(`Excel模板中不存在 ${sheet1Name} 工作表，将不进行占位符替换`);
    }
    
    // 生成处理后的Excel文件
    logger.info('生成处理后的Excel文件');
    const excelOutput = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelOutput], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // 缓存结果
    if (blob.size > 0) {
      xlsxTemplateCache.set(cacheKey, blob);
    }
    
    logger.info('Excel模板处理成功', { size: blob.size });
    logger.flush();
    return blob;
  } catch (error: any) {
    logger.error('处理Excel模板失败:', error);
    logger.flush();
    
    // 创建一个错误报告工作簿作为备用方案
    return createErrorReportWorkbook(record, error, templateName);
  }
};

/**
 * 生成模板内容的哈希值，用于缓存键
 * @param templateBuffer 模板文件二进制数据
 * @returns 哈希字符串
 */
async function generateTemplateHash(templateBuffer: ArrayBuffer): Promise<string> {
  try {
    // 只使用模板的前100字节计算哈希，以提高性能
    const sampleSize = Math.min(templateBuffer.byteLength, 100);
    const sample = templateBuffer.slice(0, sampleSize);
    
    // 使用简单的哈希算法
    const dataView = new DataView(sample);
    let hash = 0;
    for (let i = 0; i < dataView.byteLength; i += 4) {
      if (i + 4 <= dataView.byteLength) {
        hash = (hash * 31) ^ dataView.getUint32(i, true);
      } else {
        // 处理剩余的不足4字节的数据
        let remainingHash = 0;
        for (let j = i; j < dataView.byteLength; j++) {
          remainingHash = (remainingHash * 31) ^ dataView.getUint8(j);
        }
        hash = (hash * 31) ^ remainingHash;
      }
    }
    
    return hash.toString(16);
  } catch (error) {
    console.error('生成模板哈希失败:', error);
    // 如果哈希生成失败，使用时间戳作为备用
    return Date.now().toString(16);
  }
}

// 处理模板的主函数
export async function processTemplate(
  templateArrayBuffer: ArrayBuffer,
  templateType: TemplateType,
  record: EnhancedLarkRecord | LarkRecord | Record<string, any>,
  templateName?: string
): Promise<Blob> {
  console.log(`开始处理模板，类型: ${templateType}, 记录ID: ${getRecordId(record)}`);
  
  try {
    // 验证参数
    if (!templateArrayBuffer || templateArrayBuffer.byteLength === 0) {
      console.error('模板内容为空');
      throw new Error('模板内容为空');
    }
    
    if (!templateType) {
      console.error('未指定模板类型');
      throw new Error('未指定模板类型');
    }
    
    if (!record) {
      console.error('记录数据为空');
      throw new Error('记录数据为空');
    }
    
    // 确保模板名称存在
    const effectiveTemplateName = templateName || `template-${Date.now()}`;
    
    // 根据模板类型选择不同的处理方法
    if (templateType === 'docx') {
      try {
        return await processDocxTemplate(templateArrayBuffer, record, effectiveTemplateName);
      } catch (error) {
        console.error(`处理Word文档模板失败:`, error);
        // 生成错误报告文档
        return await createErrorReportDoc(record, error, effectiveTemplateName);
      }
    } else if (templateType === 'xlsx') {
      try {
        return await processXlsxTemplate(templateArrayBuffer, record, effectiveTemplateName);
      } catch (error) {
        console.error(`处理Excel表格模板失败:`, error);
        // 生成错误报告电子表格
        return await createErrorReportWorkbook(record, error, effectiveTemplateName);
      }
    } else {
      const errorMessage = `不支持的模板类型: ${templateType}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error(`处理模板时出现未捕获的错误:`, error);
    // 这里是最后的错误处理，确保即使发生意外错误也能返回一个错误报告文档
    try {
      return await createErrorReportDoc(record, error, templateName || 'unknown');
    } catch (finalError) {
      console.error(`创建错误报告时也失败:`, finalError);
      // 创建一个最小的错误文档作为最后的回退
      const errorBlob = new Blob([`处理模板时出错: ${error instanceof Error ? error.message : String(error)}`], 
        { type: 'text/plain' });
      return errorBlob;
    }
  }
}

// 从File对象处理模板 - 便捷函数
export const processTemplateFromFile = async (
  templateFile: File,
  templateType: TemplateType,
  record: LarkRecord | Record<string, any>,
  templateName: string
): Promise<Blob> => {
  const arrayBuffer = await templateFile.arrayBuffer();
  // 放宽类型约束，接受LarkRecord或EnhancedLarkRecord
  return processTemplate(arrayBuffer, templateType, record as (LarkRecord | Record<string, any>), templateName);
};

// 生成文件名 - 不使用中文字符，仅使用日期和ID
export const generateFileName = (templateName: string, templateType: TemplateType): string => {
  // 生成基于时间的ID，格式为yyyyMMdd_HHmmss
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
                 (now.getMonth() + 1).toString().padStart(2, '0') +
                 now.getDate().toString().padStart(2, '0');
  
  const timeStr = now.getHours().toString().padStart(2, '0') +
                 now.getMinutes().toString().padStart(2, '0') +
                 now.getSeconds().toString().padStart(2, '0');
  
  // 添加一个随机数以避免文件名冲突
  const randomId = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  // 返回不包含中文字符的文件名
  return `doc_${dateStr}_${timeStr}_${randomId}.${templateType}`;
};

// 下载文件
export const downloadFile = (blob: Blob, fileName: string): void => {
  saveAs(blob, fileName);
};
