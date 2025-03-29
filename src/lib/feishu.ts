/**
 * 飞书多维表格API实用工具
 */
import { bitable } from '@lark-base-open/js-sdk';
import { LarkRecord } from '@/types';

// 飞书多维表格选择类型
interface Selection {
  baseId: string | null;
  tableId: string | null;
  fieldId: string | null;
  viewId: string | null;
  recordId: string | null;
}

// 飞书多维表格选中记录事件
interface SelectionEvent {
  data: Selection;
}

// 全局飞书API类型
declare global {
  interface Window {
    bitable?: {
      base: {
        getSelection: () => Promise<any>;
        getActiveTable: () => Promise<any>;
        onSelectionChange: (callback: (selection: any) => void) => void;
      };
    };
  }
}

// 获取当前选中的记录
export async function getSelectedRecord() {
  try {
    // 获取选择状态
    const selection = await bitable.base.getSelection();
    
    // 检查是否选择了记录
    if (!selection || !selection.recordId) {
      return null;
    }
    
    // 获取当前活跃表格
    const table = await bitable.base.getActiveTable();
    if (!table) {
      console.error('无法获取当前表格');
      return null;
    }
    
    // 获取选中的记录ID
    const recordId = selection.recordId;
    
    // 获取记录详情
    const record = await table.getRecordById(recordId);
    if (!record) {
      console.error('无法获取记录详情');
      return null;
    }
    
    return {
      id: recordId,
      fields: record
    };
  } catch (error) {
    console.error('获取选中记录失败:', error);
    return null;
  }
}

// 获取所有选中的记录
export async function getSelectedRecords(): Promise<LarkRecord[]> {
  try {
    // 获取选择状态
    const selection = await bitable.base.getSelection();
    
    // 验证是否有选中记录
    if (!selection || !selection.recordId) {
      return [];
    }
    
    // 获取当前活跃表格
    const table = await bitable.base.getActiveTable();
    if (!table) {
      console.error('无法获取当前表格');
      return [];
    }
    
    // 注意：getSelection只能获取一条选中记录ID
    const recordId = selection.recordId;
    
    // 通过视图获取更多记录 (如果需要，当前只使用selection.recordId)
    const records: LarkRecord[] = [];
    
    try {
      const record = await table.getRecordById(recordId);
      if (record) {
        // 转换为LarkRecord格式
        records.push({
          record_id: recordId,
          fields: record
        });
      }
    } catch (err) {
      console.error(`获取记录 ${recordId} 失败:`, err);
    }
    
    return records;
  } catch (error) {
    console.error('获取选中记录失败:', error);
    return [];
  }
}

// 处理飞书字段值 - 提取可读文本
export function processFieldValue(value: any): any {
  // 如果值为null或undefined，返回空字符串
  if (value === null || value === undefined) {
    return '';
  }
  
  // 处理数组类型的值
  if (Array.isArray(value)) {
    return value.map(item => processFieldValue(item)).join(', ');
  }
  
  // 处理对象类型的值
  if (typeof value === 'object') {
    // 检查是否有text属性
    if ('text' in value) {
      return value.text;
    }
    
    // 尝试JSON序列化
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '[复杂对象]';
    }
  }
  
  // 其他类型直接返回
  return String(value);
}

/**
 * 检查当前是否在飞书环境中运行
 * @returns 是否在飞书环境中
 */
export function isInLarkEnvironment(): boolean {
  try {
    // 检查是否在浏览器环境
    if (typeof window === 'undefined') return false;
    
    // 检查是否在iframe中运行（大多数飞书应用都在iframe中）
    const isInIframe = window !== window.parent;
    
    // 检查URL中是否包含飞书相关参数
    const url = window.location.href.toLowerCase();
    const hasLarkParams = 
      url.includes('feishu') || 
      url.includes('lark') || 
      url.includes('urlscheme=bitable');
    
    // 检查是否有URL查询参数
    const urlParams = new URLSearchParams(window.location.search);
    const hasAppParams = urlParams.has('appId') || urlParams.has('tableId');
    
    // 检查导入的飞书SDK对象
    const hasImportedBitable = typeof bitable !== 'undefined' && 
                            typeof bitable.base !== 'undefined' && 
                            typeof bitable.base.getSelection === 'function';
    
    // 检查全局飞书对象
    const hasGlobalBitable = 
      typeof window.bitable !== 'undefined' && 
      typeof window.bitable.base !== 'undefined' &&
      typeof window.bitable.base.getSelection === 'function';
    
    // 综合判断环境
    return hasImportedBitable || hasGlobalBitable || (isInIframe && (hasLarkParams || hasAppParams));
  } catch (error) {
    console.error('检测飞书环境时出错:', error);
    return false;
  }
} 