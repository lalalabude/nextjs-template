import { NextRequest, NextResponse } from 'next/server';
import { supabase, getFile, uploadFile, ensureBucketExists } from '@/lib/supabase';
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

export async function POST(request: NextRequest) {
  try {
    console.log('开始处理文档生成请求');
    const body = await request.json() as GenerateDocumentRequest;
    const { template_url, app_id, table_id, record_ids } = body;

    console.log('请求参数:', { template_url, app_id, table_id, record_ids_count: record_ids?.length || 0 });

    // 检查必要参数
    if (!template_url) {
      console.error('缺少模板URL参数');
      return NextResponse.json(
        { 
          success: false,
          error: '缺少模板URL参数',
          data: { document_urls: [] }
        },
        { status: 400 }
      );
    }

    // 在开发环境中，允许使用空的app_id
    const isDevelopment = process.env.NODE_ENV === 'development';
    const useTestData = isDevelopment && (!app_id || !table_id || !record_ids || record_ids.length === 0);
    
    if (!isDevelopment && (!app_id || !table_id || !record_ids || record_ids.length === 0)) {
      console.error('缺少必要参数');
      return NextResponse.json(
        { 
          success: false,
          error: '缺少必要参数：app_id, table_id, record_ids',
          data: { document_urls: [] }
        },
        { status: 400 }
      );
    }

    if (useTestData) {
      console.log('开发环境：使用测试数据替代缺少的参数');
    }

    // 步骤1: 从URL获取模板类型
    let templateType: TemplateType = 'docx';
    if (template_url.toLowerCase().endsWith('.xlsx')) {
      templateType = 'xlsx';
    }
    console.log('模板类型:', templateType);

    // 步骤2: 从URL提取存储桶和路径
    const bucketAndPath = extractBucketAndPath(template_url);
    
    if (!bucketAndPath) {
      console.error('无法从URL提取存储桶和路径:', template_url);
      return NextResponse.json(
        { 
          success: false,
          error: '无效的模板URL格式，无法提取存储桶和路径',
          data: { document_urls: [] } 
        },
        { status: 400 }
      );
    }
    
    const { bucket, path } = bucketAndPath;
    console.log('从URL提取的存储信息:', { bucket, path });
    
    // 确保存储桶存在
    try {
      if (process.env.NODE_ENV !== 'development') {
        await ensureBucketExists(bucket);
      }
    } catch (error) {
      console.warn(`确保存储桶 "${bucket}" 存在时出错，将继续尝试:`, error);
    }
    
    // 步骤3: 从Supabase获取模板文件
    console.log('从Supabase获取模板文件:', { bucket, path });
    let templateBlob;
    try {
      templateBlob = await getFile(path, bucket);
      console.log('模板文件获取成功, 文件大小:', templateBlob.size);
    } catch (error: any) {
      console.error('获取模板文件失败:', error);
      
      // 在开发环境中，使用模拟模板
      if (process.env.NODE_ENV === 'development') {
        console.log('开发环境: 使用模拟模板文件');
        templateBlob = new Blob(['测试模板内容'], { 
          type: templateType === 'docx' 
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
      } else {
        return NextResponse.json(
          { 
            success: false,
            error: `无法从Supabase获取模板文件: ${error.message || '未知错误'}`,
            data: { document_urls: [] }
          },
          { status: 500 }
        );
      }
    }
    
    // 步骤4: 获取飞书多维表格记录
    console.log('开始获取飞书记录');
    let records;
    
    // 确保开发环境下有有效参数
    let effectiveAppId = app_id;
    let effectiveTableId = table_id;
    let effectiveRecordIds = record_ids;
    
    if (useTestData) {
      console.log('开发环境: 使用测试参数');
      effectiveAppId = 'test_app_id';
      effectiveTableId = table_id || 'test_table_id';
      effectiveRecordIds = record_ids && record_ids.length > 0 ? record_ids : ['test_record_1', 'test_record_2'];
    }
    
    try {
      records = await getLarkRecords(effectiveAppId, effectiveTableId, effectiveRecordIds);
      console.log(`成功获取 ${records.length} 条飞书记录`);
    } catch (error: any) {
      console.error('获取飞书记录失败:', error);
      
      // 在开发环境中，使用模拟记录数据
      if (isDevelopment) {
        console.log('开发环境: 使用模拟记录数据');
        records = effectiveRecordIds.map(id => ({
          record_id: id,
          fields: {
            '标题': `测试记录 ${id}`,
            '描述': `这是测试记录 ${id} 的详细描述，用于测试模板中的占位符替换。`,
            '申请人': '张三',
            '申请日期': new Date().toISOString().split('T')[0],
            '创建日期': new Date().toISOString(),
            '状态': '进行中',
            '部门': '研发部',
            '职位': '高级工程师',
            '申请理由': '业务需要',
            '负责人': '李四',
            '金额': '5000',
            '数量': '10',
            '备注': '请尽快审批',
            '费用类型': '差旅费',
            '预算': '10000',
            '实际金额': '4800',
            '剩余金额': '5200',
            '单价': '500',
            '开始日期': new Date().toISOString().split('T')[0],
            '结束日期': new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            '联系方式': '13800138000',
            '邮箱': 'test@example.com'
          }
        }));
      } else {
        return NextResponse.json(
          { 
            success: false,
            error: `无法获取飞书记录: ${error.message || '未知错误'}`,
            data: { document_urls: [] }
          },
          { status: 500 }
        );
      }
    }
    
    // 步骤5: 处理每条记录，生成文档
    const documentUrls: string[] = [];
    const processedRecordIds = new Set<string>(); // 用于跟踪已处理的记录ID
    
    console.log('开始处理记录和生成文档');
    console.log(`需要处理的记录数量: ${records.length}`);
    
    for (const record of records) {
      try {
        // 检查记录ID是否已处理过，防止重复处理
        if (processedRecordIds.has(record.record_id)) {
          console.log(`记录 ${record.record_id} 已被处理过，跳过`);
          continue;
        }
        
        console.log(`处理记录 ${record.record_id}`);
        console.log(`记录字段数: ${Object.keys(record.fields).length}`);
        
        // 将记录ID添加到已处理集合
        processedRecordIds.add(record.record_id);
        
        // 处理模板，替换占位符
        const templateArrayBuffer = await templateBlob.arrayBuffer();
        const templateName = path.split('/').pop() || 'document';
        
        let generatedBlob;
        try {
          console.log(`开始处理模板 ${templateName} 替换记录 ${record.record_id} 的占位符`);
          generatedBlob = await processTemplate(
            templateArrayBuffer,
            templateType,
            record,
            templateName
          );
          console.log(`模板处理成功，生成的文档大小: ${generatedBlob.size} 字节`);
        } catch (error: any) {
          console.error(`处理模板失败:`, error);
          
          // 在开发环境中，使用模拟生成的文档
          if (process.env.NODE_ENV === 'development') {
            console.log('开发环境: 使用模拟生成的文档');
            generatedBlob = new Blob(['模拟生成的文档内容'], { 
              type: templateType === 'docx' 
                ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
          } else {
            throw error;
          }
        }
        
        // 上传生成的文档到Supabase
        const timestamp = Date.now();
        const fileName = `${record.record_id}_${timestamp}.${templateType}`;
        const file = new File([generatedBlob], fileName, {
          type: templateType === 'docx' 
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        
        console.log(`上传生成的文档到Supabase: ${fileName}，大小: ${file.size} 字节`);
        let uploadResult;
        try {
          uploadResult = await uploadFile(file, 'generated');
          console.log(`文件上传成功: ${uploadResult.path}`);
        } catch (error: any) {
          console.error(`上传生成的文档失败:`, error);
          
          // 在开发环境中，使用模拟上传结果
          if (process.env.NODE_ENV === 'development') {
            console.log('开发环境: 使用模拟上传结果');
            uploadResult = {
              path: fileName,
              fullPath: `https://example.com/storage/v1/object/public/generated/${fileName}`
            };
          } else {
            throw error;
          }
        }
        
        documentUrls.push(uploadResult.fullPath);
        
        // 更新飞书记录，添加文档链接
        console.log(`更新飞书记录 ${record.record_id}`);
        try {
          await updateLarkRecord(effectiveAppId, effectiveTableId, record.record_id, {
            '文档链接': uploadResult.fullPath
          });
          console.log(`成功更新飞书记录 ${record.record_id} 的文档链接`);
        } catch (error: any) {
          console.error(`更新飞书记录失败:`, error);
          // 继续处理其他记录
        }
      } catch (error: any) {
        console.error(`处理记录 ${record.record_id} 失败:`, error);
      }
    }
    
    console.log(`文档生成完成，共 ${documentUrls.length} 个文档，处理了 ${processedRecordIds.size} 条记录`);
    if (documentUrls.length !== processedRecordIds.size) {
      console.warn(`警告: 生成的文档数量 (${documentUrls.length}) 与处理的记录数量 (${processedRecordIds.size}) 不匹配`);
    }
    return NextResponse.json({
      success: true,
      message: `成功生成 ${documentUrls.length} 个文档`,
      data: {
        document_urls: documentUrls
      }
    });
  } catch (error: any) {
    console.error('生成文档API错误:', error);
    return NextResponse.json(
      { 
        success: false,
        error: `生成文档失败: ${error.message || '未知错误'}`,
        data: {
          document_urls: []
        }
      },
      { status: 500 }
    );
  }
} 