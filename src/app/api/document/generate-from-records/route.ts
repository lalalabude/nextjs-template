import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getLarkRecordsWithMeta } from '@/lib/lark-api';
import { processTemplate, generateFileName } from '@/lib/template-processor';
import { updateLarkRecord } from '@/lib/lark-api';
import { TemplateType } from '@/types';
import JSZip from 'jszip';

// 从环境变量获取Personal Base Token
const PERSONAL_BASE_TOKEN = process.env.LARK_PERSONAL_BASE_TOKEN;

if (!PERSONAL_BASE_TOKEN) {
  console.error('未配置飞书Personal Base Token');
}

// 根据模板ID或名称获取模板信息
async function getTemplateByNameOrId(templateNameOrId: string): Promise<{id: string, name: string, file_url: string, file_type: TemplateType} | null> {
  try {
    // 先尝试按ID查找
    let { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateNameOrId)
      .single();
    
    // 如果没找到，尝试按名称查找
    if (error || !data) {
      ({ data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('name', templateNameOrId)
        .single());
    }
    
    if (error || !data) {
      console.error('未找到模板:', templateNameOrId);
      return null;
    }
    
    return {
      id: data.id,
      name: data.name,
      file_url: data.file_url,
      file_type: data.file_type
    };
  } catch (error) {
    console.error('获取模板信息失败:', error);
    return null;
  }
}

// 获取多个模板的信息
async function getMultipleTemplates(templateNames: string[]): Promise<Array<{id: string, name: string, file_url: string, file_type: TemplateType}>> {
  const templates = [];
  
  for (const name of templateNames) {
    const template = await getTemplateByNameOrId(name);
    if (template) {
      templates.push(template);
    } else {
      console.warn(`未找到模板: ${name}`);
    }
  }
  
  return templates;
}

// 辅助函数：从Supabase URL中提取存储桶和路径
function extractBucketAndPath(fileUrl: string): { bucket: string; path: string } | null {
  try {
    const url = new URL(fileUrl);
    
    // 检查是否是有效的URL
    if (!url.pathname) {
      return null;
    }
    
    // 正则表达式匹配模式
    // 1. /storage/v1/object/public/[bucket]/[path]
    // 2. /storage/v1/object/[bucket]/[path]
    const regexPatterns = [
      /\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/,
      /\/storage\/v1\/object\/([^\/]+)\/(.+)/
    ];
    
    // 尝试所有正则匹配模式
    for (const pattern of regexPatterns) {
      const match = url.pathname.match(pattern);
      if (match) {
        return {
          bucket: match[1],
          path: match[2]
        };
      }
    }
    
    // 特殊处理 templates 目录
    if (url.pathname.includes('/templates/')) {
      const pathParts = url.pathname.split('/templates/');
      if (pathParts.length === 2 && pathParts[1]) {
        return {
          bucket: 'templates',
          path: pathParts[1]
        };
      }
    }
    
    // 简化URL处理: /[bucket]/[path]
    const pathParts = url.pathname.split('/').filter(p => p);
    if (pathParts.length >= 2) {
      return {
        bucket: pathParts[0],
        path: pathParts.slice(1).join('/')
      };
    }
    
    console.error('无法从URL提取存储桶和路径:', url.pathname);
    return null;
  } catch (error) {
    console.error('解析文件URL时出错:', error);
    return null;
  }
}

// 从Supabase获取模板内容
async function getTemplateFromStorage(templateUrl: string): Promise<ArrayBuffer> {
  // 从URL中提取存储桶和文件路径
  const bucketInfo = extractBucketAndPath(templateUrl);
  
  if (!bucketInfo) {
    throw new Error('无效的模板URL格式');
  }
  
  const { bucket: bucketName, path: filePath } = bucketInfo;
  
  // 优先使用直接下载方式
  try {
    const response = await fetch(templateUrl);
    if (response.ok) {
      const blob = await response.blob();
      return await blob.arrayBuffer();
    }
  } catch (error) {
    // 直接下载失败，继续尝试使用Supabase客户端
  }
  
  // 使用Supabase客户端下载
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);
    
    if (error) {
      // 尝试使用带public的路径
      if (error.message?.includes('Not Found') || error.status === 404) {
        const { data: publicData, error: publicError } = await supabase.storage
          .from(bucketName)
          .download(`public/${filePath}`);
          
        if (!publicError && publicData) {
          return await publicData.arrayBuffer();
        }
      }
      throw error;
    }
    
    if (!data) {
      throw new Error('模板数据为空');
    }
    
    return await data.arrayBuffer();
  } catch (error) {
    console.error(`获取模板内容失败:`, error);
    throw new Error(`获取模板失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 验证模板数据
const validateTemplateData = (templateData: ArrayBuffer): boolean => {
  try {
    // 验证数据是否完整
    if (!templateData || templateData.byteLength < 100) {
      return false;
    }
    
    // 添加基本的zip文件头验证
    const header = new Uint8Array(templateData.slice(0, 4));
    // 检查ZIP文件头标记 (PK..)
    if (header[0] !== 0x50 || header[1] !== 0x4B) {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

// 确保存储桶存在
async function ensureBucketExists(bucketName: string): Promise<void> {
  try {
    // 假设存储桶已存在
    return;
  } catch (error) {
    // 即使出错也继续执行
  }
}

// 将文档保存到Supabase存储桶并获取URL
async function saveDocumentToStorage(content: Blob, fileName: string): Promise<string> {
  // 存储桶名称
  const bucketName = 'generated';
  
  // 确保存储桶存在
  await ensureBucketExists(bucketName);
  
  // 将Blob转换为ArrayBuffer
  const arrayBuffer = await content.arrayBuffer();
  
  // 上传文件到Supabase
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, arrayBuffer, {
      contentType: content.type,
      cacheControl: '3600',
      upsert: true
    });
  
  if (error) {
    // 如果是因为文件已存在而失败，尝试获取现有文件的URL
    if (error.message?.includes('already exists')) {
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);
        
      if (urlData?.publicUrl) {
        return urlData.publicUrl;
      }
    }
    
    throw error;
  }
  
  // 获取公共URL
  const { data: urlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(data?.path || fileName);
  
  return urlData?.publicUrl || '';
}

// 更新飞书记录，添加生成的文档URL
async function updateRecordWithDocumentUrl(appId: string, tableId: string, recordId: string, documentUrl: string): Promise<boolean> {
  try {
    // 始终使用文档链接字段
    const fieldName = '文档链接';
    
    const fields: Record<string, any> = {};
    fields[fieldName] = documentUrl;
    
    // 调用飞书API更新记录
    await updateLarkRecord(appId, tableId, recordId, fields);
    
    return true;
  } catch (error) {
    console.error(`更新记录 ${recordId} 失败:`, error);
    return false;
  }
}

/**
 * PUT请求 - 更新飞书记录
 * 端点: /api/document/generate-from-records
 * 直接更新飞书多维表格中的记录
 */
export async function PUT(request: NextRequest) {
  try {
    // 验证Token
    if (!PERSONAL_BASE_TOKEN) {
      return NextResponse.json(
        { 
          success: false,
          error: '服务器未正确配置Personal Base Token' 
        },
        { status: 500 }
      );
    }

    // 获取请求体
    const body = await request.json();
    const { appId, tableId, recordId, fields } = body;

    // 使用环境变量中的应用ID，如果有的话
    const effectiveAppId = process.env.NEXT_PUBLIC_LARK_APP_ID || appId;
    console.log('使用的应用ID:', effectiveAppId);

    // 验证必要参数
    if (!effectiveAppId || !tableId || !recordId || !fields) {
      return NextResponse.json(
        { 
          success: false,
          error: '缺少必要参数: appId, tableId, recordId, fields' 
        },
        { status: 400 }
      );
    }

    // 构建飞书API URL
    const baseUrl = 'https://base-api.feishu.cn';
    const apiPath = `/open-apis/bitable/v1/apps/${effectiveAppId}/tables/${tableId}/records/batch_update`;
    const apiUrl = `${baseUrl}${apiPath}`;
    
    console.log('调用飞书更新记录API:', apiUrl);

    // 准备请求体
    const requestBody = {
      records: [
        {
          record_id: recordId,
          fields: fields
        }
      ]
    };

    // 使用正确的认证头格式
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${PERSONAL_BASE_TOKEN.trim()}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    };
    
    console.log('请求头:', {
      Authorization: headers.Authorization?.substring(0, 15) + '***',
      Accept: headers.Accept,
      'Content-Type': headers['Content-Type']
    });
    
    // 调用飞书API
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('飞书API返回错误:', errorData);
      return NextResponse.json(
        { 
          success: false,
          error: '更新记录失败', 
          details: errorData 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('飞书API返回数据:', data);

    return NextResponse.json({
      success: true,
      ...data
    });
  } catch (error: any) {
    console.error('处理更新记录请求失败:', error);
    return NextResponse.json(
      { 
        success: false,
        error: '服务器内部错误', 
        message: error.message 
      },
      { status: 500 }
    );
  }
}

// POST请求 - 生成文档
export async function POST(request: NextRequest) {
  try {
    // 验证Token
    if (!PERSONAL_BASE_TOKEN) {
      return NextResponse.json(
        { 
          success: false,
          error: '服务器未正确配置Personal Base Token' 
        },
        { status: 500 }
      );
    }

    // 获取请求体
    const body = await request.json();
    const { template_name, app_id, table_id, record_ids } = body;

    // 验证必要参数
    if (!template_name || !app_id || !table_id || !record_ids || record_ids.length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: '缺少必要参数: template_name, app_id, table_id, record_ids',
        },
        { status: 400 }
      );
    }

    // 解析模板名称，可以是单个字符串或字符串数组
    let templateNames: string[] = [];
    if (typeof template_name === 'string') {
      templateNames = [template_name];
    } else if (Array.isArray(template_name)) {
      templateNames = template_name;
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: 'template_name参数格式错误，必须是字符串或字符串数组',
        },
        { status: 400 }
      );
    }

    // 判断是单一模板还是多模板处理
    const isMultiTemplate = templateNames.length > 1;
    console.log(`处理${isMultiTemplate ? '多个' : '单个'}模板: ${templateNames.join(', ')}`);

    // 获取模板信息
    let templates = [];
    if (isMultiTemplate) {
      templates = await getMultipleTemplates(templateNames);
      if (templates.length === 0) {
        return NextResponse.json(
          { 
            success: false,
            error: '未找到任何指定的模板',
          },
          { status: 404 }
        );
      }
    } else {
      const template = await getTemplateByNameOrId(templateNames[0]);
      if (!template) {
        return NextResponse.json(
          { 
            success: false,
            error: `未找到名为 "${templateNames[0]}" 的模板`,
          },
          { status: 404 }
        );
      }
      templates = [template];
    }

    console.log(`成功获取 ${templates.length} 个模板，模板数据:`, templates);

    // 获取飞书多维表格记录
    let records;
    try {
      console.log(`正在获取飞书记录: appId=${app_id}, tableId=${table_id}, 记录数=${record_ids.length}`);
      // 使用增强版API获取记录，包含字段元数据
      records = await getLarkRecordsWithMeta(app_id, table_id, record_ids);
      console.log(`成功获取 ${records.length} 条记录`);
    } catch (error: any) {
      console.error(`获取飞书记录失败:`, error);
      return NextResponse.json(
        { 
          success: false,
          error: `无法获取飞书记录: ${error.message || '未知错误'}`,
        },
        { status: 500 }
      );
    }

    // 处理每个记录
    console.log(`开始处理 ${records.length} 条记录的文档生成请求`);
    const allResults = await Promise.all(records.map(async (record: any) => {
      try {
        if (isMultiTemplate) {
          // 多模板处理 - 为每个记录创建一个ZIP文件
          console.log(`处理记录 ${record.record_id} 的多模板文档请求`);
          return await processMultiTemplatesForRecord(templates, record, app_id, table_id);
        } else {
          // 单模板处理 - 为每个记录生成单个文档
          console.log(`处理记录 ${record.record_id} 的单模板文档请求`);
          return await processSingleTemplateForRecord(templates[0], record, app_id, table_id);
        }
      } catch (err) {
        console.error(`处理记录 ${record.record_id} 时发生未捕获错误:`, err);
        return {
          record_id: record.record_id,
          error: err instanceof Error ? err.message : String(err),
          success: false
        };
      }
    }));

    console.log(`所有记录处理完成，结果:`, allResults);

    // 计算成功和失败数量
    const successCount = allResults.filter(r => r.success).length;
    const failureCount = allResults.length - successCount;

    return NextResponse.json({ 
      success: true,
      results: allResults,
      summary: {
        total: allResults.length,
        success: successCount,
        failure: failureCount
      },
      message: `处理了 ${allResults.length} 个记录，成功 ${successCount} 个，失败 ${failureCount} 个`,
      isMultiTemplate: isMultiTemplate
    });
  } catch (error: any) {
    console.error('生成文档时出错:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || '处理文档生成请求时发生未知错误',
      },
      { status: 500 }
    );
  }
}

// 处理单个模板的记录
async function processSingleTemplateForRecord(
  template: {id: string, name: string, file_url: string, file_type: TemplateType},
  record: any,
  appId: string,
  tableId: string
): Promise<any> {
  try {
    // 获取模板内容
    console.log(`开始处理模板: ${template.name} (${template.id}), 文件URL: ${template.file_url.substring(0, 50)}...`);
    
    // 使用原始模板名称
    const templateName = template.name || template.id;
    
    let templateContent;
    try {
      templateContent = await getTemplateFromStorage(template.file_url);
      console.log(`模板内容获取成功，大小: ${templateContent.byteLength} 字节`);
    } catch (error) {
      console.error(`获取模板内容失败: ${template.name}`, error);
      return {
        record_id: record.record_id,
        template_name: template.name,
        error: `获取模板内容失败: ${error instanceof Error ? error.message : String(error)}`,
        success: false
      };
    }
    
    // 验证模板内容
    if (!validateTemplateData(templateContent)) {
      console.error(`模板内容验证失败: ${template.name}`);
      return {
        record_id: record.record_id,
        template_name: template.name,
        error: '无法处理模板文件，文件可能已损坏或不是有效的文档模板',
        success: false
      };
    }
    
    // 处理模板
    let processedContent;
    try {
      console.log(`开始处理模板内容: ${template.name}, 类型: ${template.file_type}`);
      processedContent = await processTemplate(
        templateContent,
        template.file_type,
        record,
        record.record_id
      );
      console.log(`模板内容处理成功: ${template.name}, 大小: ${processedContent.size} 字节`);
    } catch (error) {
      console.error(`处理模板内容失败: ${template.name}`, error);
      return {
        record_id: record.record_id,
        template_name: template.name,
        error: `处理模板内容失败: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        success: false
      };
    }
    
    // 生成文件名 - 使用我们优化过的generateFileName函数
    const fileName = generateFileName(template.name, template.file_type);
    
    // 保存文档到Supabase并获取URL
    let documentUrl;
    try {
      console.log(`开始上传文档: ${fileName}`);
      documentUrl = await saveDocumentToStorage(processedContent, fileName);
      console.log(`文档上传成功，URL: ${documentUrl.substring(0, 50)}...`);
    } catch (error) {
      console.error(`上传文档失败: ${fileName}`, error);
      return {
        record_id: record.record_id,
        template_name: template.name,
        error: `上传文档失败: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        success: false
      };
    }
    
    // 更新飞书记录中的文档URL
    let updateSuccess;
    try {
      console.log(`开始更新记录 ${record.record_id} 的文档链接`);
      updateSuccess = await updateRecordWithDocumentUrl(appId, tableId, record.record_id, documentUrl);
      console.log(`记录更新${updateSuccess ? '成功' : '失败'}`);
    } catch (error) {
      console.error(`更新记录失败: ${record.record_id}`, error);
      updateSuccess = false;
    }
    
    return {
      record_id: record.record_id,
      template_name: template.name,
      url: documentUrl,
      fileName: fileName,
      size: processedContent.size,
      type: processedContent.type,
      recordUpdated: updateSuccess,
      success: true
    };
  } catch (err) {
    console.error(`处理单模板时出现未捕获的错误: ${template.name}`, err);
    return {
      record_id: record.record_id,
      template_name: template.name,
      error: err instanceof Error ? err.message : JSON.stringify(err),
      success: false
    };
  }
}

// 处理多个模板的记录 - 生成ZIP包
async function processMultiTemplatesForRecord(
  templates: Array<{id: string, name: string, file_url: string, file_type: TemplateType}>,
  record: any,
  appId: string,
  tableId: string
): Promise<any> {
  try {
    console.log(`处理记录 ${record.record_id} 的 ${templates.length} 个模板`);
    
    // 创建一个新的ZIP实例
    const zip = new JSZip();
    
    // 记录处理结果
    const processResults = [];
    
    // 处理每个模板并添加到ZIP
    for (const template of templates) {
      try {
        // 使用原始模板名称
        const templateName = template.name || template.id;
        
        console.log(`正在处理模板: ${templateName} (ID: ${template.id})`);
        
        // 获取模板内容
        let templateContent;
        try {
          templateContent = await getTemplateFromStorage(template.file_url);
          console.log(`获取模板 ${templateName} 内容成功，大小: ${templateContent.byteLength} 字节`);
        } catch (error) {
          console.error(`获取模板内容失败: ${template.name}`, error);
          processResults.push({
            template_name: template.name,
            error: `获取模板内容失败: ${error instanceof Error ? error.message : String(error)}`,
            success: false
          });
          continue;
        }
        
        // 验证模板内容
        if (!validateTemplateData(templateContent)) {
          console.error(`模板内容验证失败: ${template.name}`);
          processResults.push({
            template_name: template.name,
            error: '无法处理模板文件，文件可能已损坏或不是有效的文档模板',
            success: false
          });
          continue;
        }
        
        // 处理模板 - 确保传递完整的模板名称和ID
        let processedContent;
        try {
          console.log(`开始处理模板内容: ${templateName}, 类型: ${template.file_type}, ID: ${template.id}`);
          processedContent = await processTemplate(
            templateContent,
            template.file_type,
            record,
            `${templateName}_${template.id}` // 确保使用唯一标识符作为模板名称
          );
          console.log(`模板内容处理成功: ${templateName}, 大小: ${processedContent.size} 字节`);
        } catch (error) {
          console.error(`处理模板内容失败: ${template.name}`, error);
          processResults.push({
            template_name: template.name,
            error: `处理模板内容失败: ${error instanceof Error ? error.message : String(error)}`,
            success: false
          });
          continue;
        }
        
        // 生成ZIP内部的文件名 - 使用原始模板名并确保唯一性
        const fileName = `${templateName}_${template.id}.${template.file_type}`;
        
        // 将处理后的文档添加到ZIP
        try {
          const contentBuffer = await processedContent.arrayBuffer();
          console.log(`添加文件到ZIP: ${fileName}, 大小: ${contentBuffer.byteLength} 字节`);
          zip.file(fileName, contentBuffer);
        } catch (error) {
          console.error(`添加到ZIP失败: ${fileName}`, error);
          processResults.push({
            template_name: template.name,
            error: `添加到ZIP失败: ${error instanceof Error ? error.message : String(error)}`,
            success: false
          });
          continue;
        }
        
        processResults.push({
          template_name: template.name,
          fileName: fileName,
          size: processedContent.size,
          type: processedContent.type,
          success: true
        });
      } catch (err) {
        console.error(`处理模板时出现未捕获的错误: ${template.name}`, err);
        processResults.push({
          template_name: template.name,
          error: err instanceof Error ? err.message : String(err),
          success: false
        });
      }
    }
    
    // 如果没有成功生成任何文档，返回错误
    if (!processResults.some(r => r.success)) {
      console.error(`记录 ${record.record_id} 的所有模板处理都失败了`, processResults);
      return {
        record_id: record.record_id,
        error: '所有模板处理都失败了',
        templates: processResults,
        success: false
      };
    }
    
    // 生成ZIP文件
    let zipContent;
    try {
      zipContent = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6  // 压缩级别，1-9，9为最大压缩
        }
      });
    } catch (error) {
      console.error(`生成ZIP文件失败`, error);
      return {
        record_id: record.record_id,
        error: `生成ZIP文件失败: ${error instanceof Error ? error.message : String(error)}`,
        templates: processResults,
        success: false
      };
    }
    
    // 生成ZIP文件名 - 使用项目编号或记录ID，但避免使用中文字符
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
                   (now.getMonth() + 1).toString().padStart(2, '0') +
                   now.getDate().toString().padStart(2, '0');
    
    const timeStr = now.getHours().toString().padStart(2, '0') +
                   now.getMinutes().toString().padStart(2, '0') +
                   now.getSeconds().toString().padStart(2, '0');
    
    // 添加一个随机数以避免文件名冲突
    const randomId = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    // 使用记录ID作为文件名的一部分
    const zipFileName = `docs_${record.record_id}_${dateStr}_${timeStr}_${randomId}.zip`;
    
    // 保存ZIP到Supabase并获取URL
    let zipUrl;
    try {
      const zipBlob = new Blob([await zipContent.arrayBuffer()], { type: 'application/zip' });
      zipUrl = await saveDocumentToStorage(zipBlob, zipFileName);
    } catch (error) {
      console.error(`上传ZIP文件失败: ${zipFileName}`, error);
      return {
        record_id: record.record_id,
        error: `上传ZIP文件失败: ${error instanceof Error ? error.message : String(error)}`,
        templates: processResults,
        success: false
      };
    }
    
    // 更新飞书记录中的ZIP URL
    let updateSuccess;
    try {
      updateSuccess = await updateRecordWithDocumentUrl(appId, tableId, record.record_id, zipUrl);
    } catch (error) {
      console.error(`更新记录失败: ${record.record_id}`, error);
      // 虽然更新记录失败，但文件生成和上传已成功，所以仍返回成功
      updateSuccess = false;
    }
    
    return {
      record_id: record.record_id,
      url: zipUrl,
      fileName: zipFileName,
      size: zipContent.size,
      templates: processResults,
      recordUpdated: updateSuccess,
      success: true
    };
  } catch (err) {
    console.error(`处理记录 ${record.record_id} 的多模板文档时出错`, err);
    return {
      record_id: record.record_id,
      error: err instanceof Error ? err.message : String(err),
      success: false
    };
  }
} 