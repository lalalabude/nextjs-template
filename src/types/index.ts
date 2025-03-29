import { FieldMeta } from '@/lib/lark-api';

// 飞书多维表格相关类型定义
export interface SelectionData {
  type: string;         // 选择类型: "cellSelection" | "fieldSelection" | "recordSelection" | "tableSelection" | "viewSelection"
  recordIds?: string[]; // 选择的记录ID列表
  fieldIds?: string[];  // 选择的字段ID列表
  viewId?: string;      // 视图ID
  tableId?: string;     // 表格ID
}

export interface SelectionEvent {
  data: SelectionData;
}

// 自定义接口用于扩展飞书表格功能
export interface ITableSelectionExtension {
  onSelectionChange(callback: (event: SelectionEvent) => void): Promise<() => void>;
  getSelection(): Promise<SelectionData>;
}

// 飞书表格选择状态
export interface LarkTableSelection {
  recordIds?: string[];
  fieldIds?: string[];
  type?: 'record' | 'field' | 'cell';
}

// 全局声明方式扩展ITable接口
declare global {
  namespace LarkBase {
    interface ITable extends ITableSelectionExtension {}
  }
}

// 文件类型
export type TemplateType = 'docx' | 'xlsx';

// 多维表格字段类型枚举
export enum LarkFieldType {
  TEXT = 1,
  NUMBER = 2,
  SINGLE_SELECT = 3,
  MULTI_SELECT = 4,
  DATE_TIME = 5,
  CHECKBOX = 7,
  USER = 11,
  PHONE = 13,
  CURRENCY = 16,
  FORMULA = 20,
}

// 序列化模板接口
export interface SerializedTemplate {
  id: string;
  name: string;
  file: {
    name: string;
    type: string;
    dataUrl: string;
    lastModified: number;
  };
  placeholders: string[];
  type: TemplateType;
  createdAt: string;
}

// 模板接口
export interface Template {
  id: string;
  name: string;
  file: File;
  placeholders: string[];
  type: TemplateType;
  createdAt: Date;
}

// 飞书多维表格记录
export interface LarkRecord {
  record_id: string;
  fields: Record<string, any>;
}

// 增强的飞书多维表格记录，包含字段元数据
export interface EnhancedLarkRecord extends LarkRecord {
  fieldMeta: Record<string, FieldMeta>;
}

// 生成文档请求体
export interface GenerateDocumentRequest {
  template_url: string;
  app_id: string;
  table_id: string;
  record_ids: string[];
}

// 生成文档响应体
export interface GenerateDocumentResponse {
  success: boolean;
  error?: string;
  data: {
    document_urls: string[];
  };
}

// 模板记录接口
export interface TemplateRecord {
  id: string;
  name: string;
  file_url: string;
  file_type: TemplateType;
  placeholders: string[];
  created_at: string;
} 