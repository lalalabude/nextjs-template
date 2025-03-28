import { NextRequest, NextResponse } from 'next/server';
import { supabase, uploadFile, testConnection } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { TemplateRecord, TemplateType } from '@/types';
import { extractPlaceholders } from '@/lib/template-processor';

// 获取模板列表
export async function GET() {
  try {
    console.log('正在获取模板列表...');
    
    // 测试数据库连接
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('无法连接到Supabase数据库');
    }
    
    // 从Supabase数据库查询模板列表
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase查询错误:', error);
      throw error;
    }

    console.log(`成功获取到 ${data ? data.length : 0} 个模板记录`);
    
    // 尝试直接从存储桶获取文件列表，以便调试
    try {
      const { data: storageData, error: storageError } = await supabase
        .storage
        .from('templates')
        .list();
        
      if (storageError) {
        console.error('获取存储桶文件列表失败:', storageError);
      } else {
        console.log(`存储桶中有 ${storageData.length} 个文件`);
      }
    } catch (storageListError) {
      console.error('获取存储桶列表异常:', storageListError);
    }

    return NextResponse.json({
      templates: data || []
    });
  } catch (error: any) {
    console.error('获取模板列表失败:', error);
    
    // 返回更详细的错误信息
    return NextResponse.json(
      { 
        error: `获取模板列表失败: ${error.message}`,
        details: error.stack,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? '已配置' : '未配置',
        supabaseKeyConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      },
      { status: 500 }
    );
  }
}

// 上传新模板
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;

    if (!file || !name) {
      return NextResponse.json(
        { error: '缺少必要参数：file, name' },
        { status: 400 }
      );
    }

    console.log(`正在上传模板: ${name}, 文件大小: ${file.size} 字节`);

    // 确定文件类型
    let fileType: TemplateType = 'docx';
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      fileType = 'xlsx';
    } else if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json(
        { error: '仅支持 .docx 和 .xlsx 文件格式' },
        { status: 400 }
      );
    }

    // 上传文件到Supabase存储
    console.log(`开始上传文件到 templates 存储桶...`);
    const uploadResult = await uploadFile(file, 'templates');
    console.log(`文件上传成功，路径: ${uploadResult.path}`);

    // 从模板中提取占位符
    let placeholders: string[] = [];
    try {
      // 暂时跳过占位符提取，避免Unicode错误
      placeholders = [];
    } catch (error) {
      console.error('提取占位符失败:', error);
      // 继续处理，即使占位符提取失败
    }

    // 在Supabase数据库中保存模板记录
    const templateId = uuidv4();
    console.log(`生成的模板ID: ${templateId}`);
    
    const templateData = {
      id: templateId,
      name,
      file_url: uploadResult.fullPath,
      file_type: fileType,
      placeholders,
      created_at: new Date().toISOString()
    };
    
    console.log('准备插入模板记录:', templateData);
    
    const { error } = await supabase
      .from('templates')
      .insert(templateData);

    if (error) {
      console.error('插入模板记录失败:', error);
      throw error;
    }

    console.log('模板记录插入成功');

    return NextResponse.json({
      success: true,
      template: templateData
    });
  } catch (error: any) {
    console.error('上传模板失败:', error);
    return NextResponse.json(
      { 
        error: `上传模板失败: ${error.message}`,
        details: error.stack
      },
      { status: 500 }
    );
  }
} 