import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
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
    // 仅在调试模式开启时收集调试日志
    if (this.debugEnabled) {
      this.logs.push({level: 'debug', message, data});
    }
  }

  info(message: string, data?: any) {
    // 精简信息日志，仅记录重要信息
    if (message.includes('开始处理') || message.includes('处理完成')) {
      this.logs.push({level: 'info', message, data});
    }
  }

  warn(message: string, data?: any) {
    // 收集警告日志
    this.logs.push({level: 'warn', message, data});
  }

  error(message: string, data?: any) {
    // 错误日志立即输出
    this.logs.push({level: 'error', message, data});
    console.error(message, data);
  }

  flush() {
    if (this.logs.length === 0) return;

    // 只输出警告和错误日志，减少控制台输出
    this.logs.forEach(log => {
      if (log.level === 'error') {
        // 错误已经实时输出了
      } else if (log.level === 'warn') {
        console.warn(log.message, log.data);
      } else if (this.debugEnabled) {
        // 调试模式时输出更多日志
        if (log.level === 'debug') {
          console.debug(log.message, log.data);
        } else if (log.level === 'info') {
          console.log(log.message, log.data);
        }
      }
    });
    this.logs = [];
  }
}

// 提取占位符 - 增加性能优化
export const extractPlaceholders = (content: string): string[] => {
  if (!content || typeof content !== 'string') return [];
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
      fieldName.includes('time')) {
    
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

// 创建错误报告工作簿 - 使用ExcelJS
export async function createErrorReportWorkbook(
  record: any,
  error: any,
  templateName: string
): Promise<Blob> {
  try {
    // 创建简洁的错误报告
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("错误报告");
    
    // 设置标题和内容
    ws.getCell('A1').value = "错误报告";
    ws.getCell('A1').font = { bold: true, size: 14 };
    
    ws.getCell('A2').value = "模板";
    ws.getCell('B2').value = templateName;
    
    ws.getCell('A3').value = "记录ID";
    ws.getCell('B3').value = getRecordId(record);
    
    ws.getCell('A4').value = "时间";
    ws.getCell('B4').value = new Date().toISOString();
    
    ws.getCell('A6').value = "错误信息";
    ws.getCell('A6').font = { bold: true };
    
    const errorMessage = error instanceof Error ? 
      `${error.name}: ${error.message}` : 
      String(error);
    ws.getCell('A7').value = errorMessage;
    ws.getCell('A7').font = { color: { argb: 'FFFF0000' } };
    
    // 自动调整列宽
    ws.getColumn('A').width = 15;
    ws.getColumn('B').width = 50;
    
    // 生成文件
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch {
    // 创建最小的错误报告
    return new Blob(
      [`错误报告\n模板: ${templateName}\n记录ID: ${getRecordId(record)}\n错误: ${error instanceof Error ? error.message : String(error)}`], 
      { type: 'text/plain' }
    );
  }
}

// 缓存管理 - 添加缓存大小限制，防止内存泄漏
const MAX_CACHE_SIZE = 50; // 限制缓存项数量

// 处理DocX模板的缓存
const docxTemplateCache = new Map<string, Blob>();
function addToDocxCache(key: string, blob: Blob): void {
  // 检查缓存是否达到大小限制
  if (docxTemplateCache.size >= MAX_CACHE_SIZE) {
    // 删除最早添加的项
    const firstKey = docxTemplateCache.keys().next().value;
    if (firstKey) docxTemplateCache.delete(firstKey);
  }
  docxTemplateCache.set(key, blob);
}

// 处理Excel模板的缓存
const xlsxTemplateCache = new Map<string, Blob>();
function addToXlsxCache(key: string, blob: Blob): void {
  // 检查缓存是否达到大小限制
  if (xlsxTemplateCache.size >= MAX_CACHE_SIZE) {
    // 删除最早添加的项
    const firstKey = xlsxTemplateCache.keys().next().value;
    if (firstKey) xlsxTemplateCache.delete(firstKey);
  }
  xlsxTemplateCache.set(key, blob);
}

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
      return docxTemplateCache.get(cacheKey) as Blob;
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
        addToDocxCache(cacheKey, output);
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

// 处理Excel模板 - 核心处理函数
export const processXlsxTemplate = async (
  templateArrayBuffer: ArrayBuffer,
  record: LarkRecord | Record<string, any>,
  templateName: string
): Promise<Blob> => {
  const logger = new LogCollector(false); // 关闭调试模式
  logger.info('开始处理Excel模板');
  
  try {
    // 预处理记录数据
    const processedRecord = enhanceRecordData(record, logger);
    
    // 计算缓存键
    const templateHash = await generateTemplateHash(templateArrayBuffer);
    const cacheKey = `${templateName}_${templateHash}_${getRecordId(record)}`;
    
    // 检查缓存
    if (xlsxTemplateCache.has(cacheKey)) {
      return xlsxTemplateCache.get(cacheKey) as Blob;
    }

    // 检查文件数据有效性
    if (!templateArrayBuffer || templateArrayBuffer.byteLength === 0) {
      throw new Error('Excel模板文件为空或无法读取');
    }
    
    // 使用ExcelJS读取工作簿
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateArrayBuffer);
    
    if (!workbook || workbook.worksheets.length === 0) {
      throw new Error('无法解析Excel工作簿');
    }
    
    // 查找Sheet1或第一个工作表
    const sheet1Name = 'Sheet1';
    const worksheet = workbook.getWorksheet(sheet1Name) || workbook.worksheets[0];
    
    if (worksheet) {
      let processedCells = 0;
      
      // 遍历所有包含文本的单元格，查找并替换占位符
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          try {
            // 获取单元格的值
            let cellValue: string | null = null;
            
            // 处理公式单元格
            if (cell.formula && cell.result && typeof cell.result === 'string') {
              cellValue = cell.result;
            } 
            // 处理普通文本和富文本
            else if (cell.value) {
              if (typeof cell.value === 'string') {
                cellValue = cell.value;
              } else if (typeof cell.value === 'object' && cell.value !== null) {
                // 处理富文本
                const richTextValue = cell.value as any;
                if (richTextValue.richText && Array.isArray(richTextValue.richText)) {
                  cellValue = richTextValue.richText.map((rt: any) => rt.text || '').join('');
                }
              }
            }
            
            // 检查是否有占位符并处理
            if (cellValue && cellValue.includes('{') && cellValue.includes('}')) {
              const newValue = replaceAllPlaceholders(cellValue, processedRecord, logger);
              
              // 如果有替换，更新单元格值
              if (newValue !== cellValue) {
                // 获取原始公式
                const originalFormula = cell.formula;
                const hasFormula = !!originalFormula;
                
                if (!hasFormula) {
                  // 只处理非公式单元格，直接更新值
                  if (typeof newValue === 'number') {
                    cell.value = newValue; // 数字类型
                  } else if (cellValue.includes('{报名单位计数}')) {
                    const numValue = Number(newValue);
                    if (!isNaN(numValue)) {
                      cell.value = numValue;
                    } else {
                      cell.value = newValue;
                    }
                  } else {
                    cell.value = newValue;
                  }
                  
                  processedCells++;
                }
                // 如果是公式单元格，不做任何处理，保持原样
              }
            }
          } catch (e) { /* 忽略单元格处理错误 */ }
        });
      });
      
      logger.info(`Excel模板处理完成，更新了 ${processedCells} 个单元格`);
    }
    
    // 生成Excel文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // 缓存结果
    if (blob.size > 0) {
      addToXlsxCache(cacheKey, blob);
    }
    
    logger.flush();
    return blob;
  } catch (error: any) {
    logger.error('处理Excel模板失败', error);
    logger.flush();
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
    // 只使用文件头部来计算哈希，提高性能
    const sampleSize = Math.min(templateBuffer.byteLength, 64);
    const sample = templateBuffer.slice(0, sampleSize);
    const dataView = new DataView(sample);
    
    // 简化哈希计算
    let hash = 5381;
    for (let i = 0; i < dataView.byteLength; i++) {
      hash = ((hash << 5) + hash) ^ dataView.getUint8(i); // djb2 算法变种
    }
    
    return Math.abs(hash).toString(16);
  } catch {
    // 如果计算失败，使用时间戳
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
  try {
    // 验证参数
    if (!templateArrayBuffer || templateArrayBuffer.byteLength === 0) {
      throw new Error('模板内容为空');
    }
    
    if (!templateType || !record) {
      throw new Error('缺少必要参数');
    }
    
    // 确保模板名称存在
    const effectiveTemplateName = templateName || `template-${Date.now()}`;
    
    // 根据模板类型选择不同的处理方法
    if (templateType === 'docx') {
      return await processDocxTemplate(templateArrayBuffer, record, effectiveTemplateName);
    } else if (templateType === 'xlsx') {
      return await processXlsxTemplate(templateArrayBuffer, record, effectiveTemplateName);
    } else {
      throw new Error(`不支持的模板类型: ${templateType}`);
    }
  } catch (error) {
    console.error(`处理模板时出现错误:`, error);
    
    try {
      if (templateType === 'xlsx') {
        return await createErrorReportWorkbook(record, error, templateName || 'unknown');
      } else {
        return await createErrorReportDoc(record, error, templateName || 'unknown');
      }
    } catch {
      // 创建最小的错误文档作为最后的回退
      return new Blob([`处理模板出错: ${error instanceof Error ? error.message : String(error)}`], { type: 'text/plain' });
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
  return processTemplate(arrayBuffer, templateType, record, templateName);
};

// 生成文件名 - 简洁版
export const generateFileName = (templateName: string, templateType: TemplateType): string => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const randomId = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  
  return `doc_${dateStr}_${timeStr}_${randomId}.${templateType}`;
}