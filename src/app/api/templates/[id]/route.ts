import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 获取单个模板
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: '缺少模板ID' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { error: '模板不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({ template: data });
  } catch (error: any) {
    console.error('获取模板详情失败:', error);
    return NextResponse.json(
      { error: `获取模板详情失败: ${error.message}` },
      { status: 500 }
    );
  }
}

// 删除模板
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: '缺少模板ID' },
        { status: 400 }
      );
    }

    // 先获取模板信息，以获取文件URL
    const { data: template, error: getError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();

    if (getError) {
      throw getError;
    }

    if (!template) {
      return NextResponse.json(
        { error: '模板不存在' },
        { status: 404 }
      );
    }

    // 从数据库删除模板记录
    const { error: deleteError } = await supabase
      .from('templates')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    // 如果URL字段存在，尝试从存储中删除文件
    if (template.file_url) {
      try {
        // 从URL中提取存储桶和路径
        const url = new URL(template.file_url);
        const pathParts = url.pathname.split('/');
        const bucketIndex = pathParts.findIndex(part => part === 'storage') + 2; // storage/v1/object/public/[bucket]/[path]
        
        if (bucketIndex < pathParts.length) {
          const bucket = pathParts[bucketIndex];
          const path = pathParts.slice(bucketIndex + 1).join('/');
          
          await supabase.storage.from(bucket).remove([path]);
        }
      } catch (storageError) {
        console.error('删除文件失败:', storageError);
        // 即使删除文件失败，也继续执行
      }
    }

    return NextResponse.json({
      success: true,
      message: '模板已成功删除'
    });
  } catch (error: any) {
    console.error('删除模板失败:', error);
    return NextResponse.json(
      { error: `删除模板失败: ${error.message}` },
      { status: 500 }
    );
  }
} 