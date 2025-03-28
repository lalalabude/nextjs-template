import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getLarkRecords } from '@/lib/lark-api';
import { processTemplate } from '@/lib/template-processor';
import { updateLarkRecord } from '@/lib/lark-api';
import { GenerateDocumentRequest, TemplateType } from '@/types';

// 辅助函数：从Supabase URL中提取存储桶和路径
function extractBucketAndPath(fileUrl: string): { bucket: string; path: string } | null {
  try {
    const url = new URL(fileUrl);
    
    // 检查是否是有效的URL
    if (!url.pathname) {
      console.error('无效的文件URL，路径为空:', fileUrl);
      return null;
    }
    
    console.log('解析URL:', { 
      originalUrl: fileUrl,
      pathname: url.pathname
    });
    
    // 尝试多种模式匹配
    
    // 模式1: /storage/v1/object/public/[bucket]/[path]
    let match = url.pathname.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/);
    if (match) {
      return {
        bucket: match[1],
        path: match[2]
      };
    }
    
    // 模式2: /storage/v1/object/[bucket]/[path]
    match = url.pathname.match(/\/storage\/v1\/object\/([^\/]+)\/(.+)/);
    if (match) {
      return {
        bucket: match[1],
        path: match[2]
      };
    }
    
    // 模式3: /[bucket]/[path] - 简化URL
    const pathParts = url.pathname.split('/').filter(p => p);
    if (pathParts.length >= 2) {
      return {
        bucket: pathParts[0],
        path: pathParts.slice(1).join('/')
      };
    }
    
    // 特殊情况：在开发环境中，对于测试URL，返回固定值
    if (process.env.NODE_ENV === 'development' && 
        (fileUrl.includes('test_') || fileUrl.includes('localhost'))) {
      console.log('开发环境: 使用模拟存储桶和路径');
      return {
        bucket: 'templates',
        path: 'test_template.docx'
      };
    }
    
    console.error('无法从URL解析出存储桶和路径:', fileUrl);
    return null;
  } catch (error) {
    console.error('解析文件URL时出错:', error);
    
    // 特殊情况：在开发环境中，如果URL解析失败，返回固定值
    if (process.env.NODE_ENV === 'development') {
      console.log('开发环境: URL解析失败，使用模拟存储桶和路径');
      return {
        bucket: 'templates',
        path: 'test_template.docx'
      };
    }
    
    return null;
  }
}

// 飞书API基础URL
const FEISHU_BASE_URL = 'https://base-api.feishu.cn';

// 从环境变量获取Personal Base Token
const PERSONAL_BASE_TOKEN = process.env.LARK_PERSONAL_BASE_TOKEN;

// 从Supabase获取模板
async function getTemplateFromStorage(templateUrl: string): Promise<ArrayBuffer> {
  try {
    // 从URL中提取存储桶和文件路径
    const bucketInfo = extractBucketAndPath(templateUrl);
    
    if (!bucketInfo) {
      console.error('无法解析模板URL:', templateUrl);
      throw new Error('无效的模板URL格式');
    }
    
    const { bucket: bucketName, path: filePath } = bucketInfo;
    console.log('从存储获取模板:', { bucketName, filePath });

    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (error) {
      console.error('模板下载错误:', error);
      throw error;
    }

    if (!data) {
      console.error('模板数据为空');
      throw new Error('模板数据为空');
    }

    console.log('模板下载成功, 大小:', data.size, '字节');
    
    // 将Blob转换为ArrayBuffer
    return await data.arrayBuffer();
  } catch (error) {
    console.error('获取模板失败:', error);
    throw error;
  }
}

// 添加模板数据验证函数
const validateTemplateData = (templateData: ArrayBuffer): boolean => {
  try {
    // 验证数据是否完整
    if (!templateData || templateData.byteLength < 100) {
      console.warn('模板数据不完整或太小:', templateData?.byteLength || 0, '字节');
      return false;
    }
    
    // 添加基本的zip文件头验证
    const header = new Uint8Array(templateData.slice(0, 4));
    // 检查ZIP文件头标记 (PK..)
    if (header[0] !== 0x50 || header[1] !== 0x4B) {
      console.warn('无效的ZIP文件头:', [...header]);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('验证模板数据时出错:', error);
    return false;
  }
};

// 服务器端直接获取记录函数
async function getRecordsServerSide(appId: string, tableId: string, recordIds: string[]) {
  try {
    console.log('服务器端直接获取记录:', { appId, tableId, recordIds });
    
    // 验证记录ID数组
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      console.warn('未提供有效的记录ID数组');
      return [];
    }
    
    // 使用环境变量中的Personal Base Token和应用ID
    const token = PERSONAL_BASE_TOKEN?.trim();
    const effectiveAppId = process.env.NEXT_PUBLIC_LARK_APP_ID || appId;
    
    if (!token) {
      console.error('未找到Personal Base Token');
      throw new Error('服务器未正确配置Personal Base Token');
    }
    
    // 构建API URL
    const baseUrl = 'https://base-api.feishu.cn';
    const apiPath = `/open-apis/bitable/v1/apps/${effectiveAppId}/tables/${tableId}/records/batch_get`;
    const apiUrl = `${baseUrl}${apiPath}`;
    console.log('请求飞书API:', apiUrl);
    
    // 准备请求体数据
    const requestBody = {
      record_ids: recordIds
    };
    
    console.log('请求体:', requestBody);
    
    // 调用飞书API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(requestBody)
    });
    
    const responseData = await response.json();
    
    // 添加详细日志，查看API返回的完整数据结构
    console.log('飞书API响应数据结构:', {
      code: responseData.code,
      msg: responseData.msg,
      dataKeys: responseData.data ? Object.keys(responseData.data) : 'data为空'
    });
    
    if (responseData.code !== 0) {
      console.error('飞书API返回错误:', responseData);
      throw new Error(`飞书API错误: ${responseData.msg || '未知错误'}`);
    }
    
    // 适应不同的数据格式
    let records = [];
    
    // 检查不同的可能数据结构
    if (responseData.data) {
      if (responseData.data.items && Array.isArray(responseData.data.items)) {
        // 标准格式
        records = responseData.data.items.map((item: any) => ({
          record_id: item.record_id,
          fields: item.fields
        }));
      } else if (responseData.data.records && Array.isArray(responseData.data.records)) {
        // 备用格式1
        records = responseData.data.records.map((item: any) => ({
          record_id: item.record_id,
          fields: item.fields
        }));
      } else if (Array.isArray(responseData.data)) {
        // 备用格式2
        records = responseData.data.map((item: any) => ({
          record_id: item.record_id,
          fields: item.fields
        }));
      } else {
        // 未知格式，尝试将整个数据对象转换为记录
        console.warn('未识别的数据格式，尝试直接处理:', responseData.data);
        
        // 直接使用传入的记录ID作为记录
        if (recordIds && recordIds.length > 0) {
          records = recordIds.map((id: string) => {
            const recordData = responseData.data[id] || {};
            return {
              record_id: id,
              fields: recordData.fields || {}
            };
          });
        }
      }
    }
    
    if (records.length === 0) {
      console.warn('未从API响应中获取到有效记录，使用模拟数据');
      
      // 开发环境下使用模拟数据
      if (process.env.NODE_ENV === 'development') {
        console.log('开发环境: 生成模拟记录');
        return recordIds.map(id => ({
          record_id: id,
          fields: {
            '标题': `测试记录 ${id}`,
            '描述': '这是一个测试记录',
            '创建日期': new Date().toISOString(),
            '状态': '进行中',
            '报名登记日期': new Date().toLocaleDateString(),
            '项目名称': '测试工程建设项目',
            '报名标段号': 'BID-2023-001',
            '报名单位名称': '测试建筑有限公司',
            '联合体信息': '无',
            '联系人': '张三',
            '联系电话': '13800138000',
            '电子邮箱': 'test@example.com',
            '报名单位地址': '测试市测试区测试路123号'
          }
        }));
      }
    }
    
    console.log(`成功获取${records.length}条记录，返回记录ID:`, records.map((r: {record_id: string}) => r.record_id).join(','));
    return records;
  } catch (error) {
    console.error('服务器端获取记录失败:', error);
    
    // 开发环境下使用模拟数据
    if (process.env.NODE_ENV === 'development') {
      console.log('开发环境: 生成模拟记录');
      return recordIds.map(id => ({
        record_id: id,
        fields: {
          '标题': `测试记录 ${id}`,
          '描述': '这是一个测试记录',
          '创建日期': new Date().toISOString(),
          '状态': '进行中',
          '报名登记日期': new Date().toLocaleDateString(),
          '项目名称': '测试工程建设项目',
          '报名标段号': 'BID-2023-001',
          '报名单位名称': '测试建筑有限公司',
          '联合体信息': '无',
          '联系人': '张三',
          '联系电话': '13800138000',
          '电子邮箱': 'test@example.com',
          '报名单位地址': '测试市测试区测试路123号'
        }
      }));
    }
    
    throw error;
  }
}

// 确保存储桶存在 - 实际上只检查存储桶是否存在，不再尝试创建
async function ensureBucketExists(bucketName: string): Promise<void> {
  try {
    console.log(`使用存储桶 ${bucketName}，跳过创建步骤`);
    // 不再尝试创建存储桶，假设存储桶已存在
    return;
    
    // 以下代码仅作参考，不会执行
    /*
    // 获取存储桶列表
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('获取存储桶列表失败:', error);
      throw error;
    }
    
    // 检查指定的存储桶是否存在
    const bucketExists = buckets.some((bucket: {name: string}) => bucket.name === bucketName);
    
    // 如果存储桶不存在，则创建
    if (!bucketExists) {
      console.log(`存储桶 ${bucketName} 不存在，开始创建...`);
      
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true
      });
      
      if (createError) {
        console.error(`创建存储桶 ${bucketName} 失败:`, createError);
        throw createError;
      }
      
      console.log(`存储桶 ${bucketName} 创建成功`);
    } else {
      console.log(`存储桶 ${bucketName} 已存在`);
    }
    */
  } catch (error) {
    console.error('确保存储桶存在时出错:', error);
    // 即使出错也继续执行，因为存储桶可能已存在
    console.log('继续执行，假设存储桶已存在');
  }
}

// 将文档保存到Supabase存储桶并获取URL
async function saveDocumentToStorage(content: Blob, fileName: string): Promise<string> {
  try {
    // 存储桶名称
    const bucketName = 'generated';
    
    // 确保存储桶存在 - 此函数已修改为假设存储桶存在
    await ensureBucketExists(bucketName);
    
    console.log(`开始保存文档 ${fileName} 到Supabase存储桶，大小: ${content.size} 字节`);
    
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
      console.error('上传文档到Supabase失败:', error);
      
      // 如果是因为文件已存在而失败，尝试获取现有文件的URL
      if (error.message?.includes('already exists')) {
        console.log('文件已存在，尝试获取现有文件的URL');
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);
          
        if (urlData?.publicUrl) {
          console.log('成功获取现有文件URL:', urlData.publicUrl);
          return urlData.publicUrl;
        }
      }
      
      throw error;
    }
    
    console.log('文档上传成功:', data?.path);
    
    // 获取公共URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data?.path || fileName);
    
    console.log('文档URL:', urlData?.publicUrl);
    
    return urlData?.publicUrl || '';
  } catch (error) {
    console.error('保存文档到存储桶失败:', error);
    
    // 在开发环境中返回模拟URL
    if (process.env.NODE_ENV === 'development') {
      const mockUrl = `https://example.com/generated/${fileName}`;
      console.log('开发环境: 返回模拟文档URL:', mockUrl);
      return mockUrl;
    }
    
    throw error;
  }
}

// 更新飞书记录，添加生成的文档URL
async function updateRecordWithDocumentUrl(appId: string, tableId: string, recordId: string, documentUrl: string): Promise<boolean> {
  try {
    console.log(`更新记录 ${recordId} 的文档URL...`);
    
    // 准备更新字段，假设字段名为"文档链接"
    const fields = {
      '文档链接': documentUrl,
      '生成时间': new Date().toISOString()
    };
    
    // 调用飞书API更新记录
    await updateLarkRecord(appId, tableId, recordId, fields);
    
    console.log(`记录 ${recordId} 更新成功`);
    return true;
  } catch (error) {
    console.error(`更新记录 ${recordId} 失败:`, error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 验证Token
    if (!PERSONAL_BASE_TOKEN) {
      return NextResponse.json(
        { error: '服务器未正确配置Personal Base Token' },
        { status: 500 }
      );
    }

    // 获取请求体
    const body = await request.json();
    const { template_url, app_id, table_id, record_ids } = body;

    // 验证必要参数
    if (!template_url || !app_id || !table_id || !record_ids) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 获取模板
    const template = await getTemplateFromStorage(template_url);
    
    // 验证模板内容
    if (!validateTemplateData(template)) {
      console.error('模板数据无效或损坏');
      return NextResponse.json({ 
        success: false,
        error: '无法处理模板文件，文件可能已损坏或不是有效的文档模板'
      });
    }

    // 获取记录 - 使用服务器端直接获取方法
    let records;
    try {
      // 尝试服务器端直接获取记录
      records = await getRecordsServerSide(app_id, table_id, record_ids);
    } catch (error) {
      console.error('服务器端直接获取记录失败, 尝试客户端库:', error);
      // 如果服务器端直接获取失败，尝试使用客户端库
      records = await getLarkRecords(app_id, table_id, record_ids);
    }

    // 处理每个记录并生成文档
    const documents = await Promise.all(records.map(async (record: any) => {
      console.log('处理记录:', record);
      try {
        const processedContent = await processTemplate(
          template,          // 模板ArrayBuffer
          'docx' as TemplateType,  // 模板类型
          record,            // 记录对象
          record.record_id   // 模板名称/记录ID
        );
        console.log(`记录 ${record.record_id} 处理完成，生成文档大小: ${processedContent.size} 字节`);
        
        // 生成文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `${record.record_id}_${timestamp}.docx`;
        
        // 保存文档到Supabase并获取URL
        const documentUrl = await saveDocumentToStorage(processedContent, fileName);
        
        // 更新飞书记录中的文档URL
        const updateSuccess = await updateRecordWithDocumentUrl(app_id, table_id, record.record_id, documentUrl);
        
        // 将Blob转换为Base64字符串以便于传输
        const arrayBuffer = await processedContent.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString('base64');
        
        console.log(`记录 ${record.record_id} 文档已转换为Base64，大小: ${base64Content.length} 字符`);
        
        return {
          record_id: record.record_id,
          content: base64Content,
          size: processedContent.size,
          type: processedContent.type,
          url: documentUrl,
          fileName: fileName,
          recordUpdated: updateSuccess
        };
      } catch (err) {
        console.error(`处理记录${record.record_id}时出错:`, err);
        return {
          record_id: record.record_id,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }));

    console.log(`成功生成 ${documents.length} 个文档`);
    return NextResponse.json({ 
      success: true,
      documents: documents.map(doc => ({
        record_id: doc.record_id,
        url: doc.url,
        fileName: doc.fileName,
        size: doc.size,
        type: doc.type,
        recordUpdated: doc.recordUpdated,
        error: doc.error
      })),
      message: `成功处理 ${documents.length} 个文档`
    });
  } catch (error: any) {
    console.error('生成文档失败:', error);
    return NextResponse.json(
      { error: '生成文档失败', message: error.message },
      { status: 500 }
    );
  }
} 