import { ITable } from '@lark-base-open/js-sdk';

// 扩展ITable接口
declare module '@lark-base-open/js-sdk' {
  interface ITable {
    onSelectionChange(callback: (selection: any) => void): Promise<() => void>;
  }
}

// 文件模板类型
export type TemplateType = 'docx' | 'xlsx';

// 序列化的文件模板
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

// 文件模板
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

// API请求体
export interface GenerateDocumentRequest {
  template_url: string;
  app_id: string;
  table_id: string;
  record_ids: string[];
}

// API响应体
export interface GenerateDocumentResponse {
  success: boolean;
  message: string;
  data: {
    document_urls: string[];
  };
}

// 存储在Supabase中的模板记录
export interface TemplateRecord {
  id: string;
  name: string;
  file_url: string;
  file_type: TemplateType;
  placeholders?: string[];
  created_at: string;
} 