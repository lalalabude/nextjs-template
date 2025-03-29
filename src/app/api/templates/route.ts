import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 获取模板列表
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取模板列表失败:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      templates: data,
    });
  } catch (error: any) {
    console.error('获取模板列表异常:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取模板列表时发生未知错误' },
      { status: 500 }
    );
  }
}

// 上传新模板
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // 获取必要字段
    const name = formData.get('name') as string;
    const file = formData.get('file') as File;

    // 验证必要参数
    if (!name) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数: name' },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数: file' },
        { status: 400 }
      );
    }

    // 获取文件类型
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!fileExt || !['docx', 'xlsx'].includes(fileExt)) {
      return NextResponse.json(
        { success: false, error: '不支持的文件类型，仅支持.docx和.xlsx文件' },
        { status: 400 }
      );
    }

    const fileType = fileExt === 'docx' ? 'docx' : 'xlsx';
    
    // 上传文件到Supabase
    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('templates')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('上传模板文件失败:', uploadError);
      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 500 }
      );
    }

    // 获取公共URL
    const { data: urlData } = supabase.storage
      .from('templates')
      .getPublicUrl(fileName);

    if (!urlData || !urlData.publicUrl) {
      return NextResponse.json(
        { success: false, error: '获取模板URL失败' },
        { status: 500 }
      );
    }

    // 创建模板记录
    const { data: templateData, error: templateError } = await supabase
      .from('templates')
      .insert([
        {
          name,
          file_url: urlData.publicUrl,
          file_type: fileType,
        }
      ])
      .select();

    if (templateError) {
      console.error('创建模板记录失败:', templateError);
      return NextResponse.json(
        { success: false, error: templateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template: templateData[0],
    });
  } catch (error: any) {
    console.error('处理模板上传请求失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || '处理模板上传请求时发生未知错误' },
      { status: 500 }
    );
  }
} 