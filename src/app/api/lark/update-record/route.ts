import { NextRequest, NextResponse } from 'next/server';
import { bitable } from '@lark-base-open/js-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appId, tableId, recordId, fields } = body;

    if (!appId || !tableId || !recordId || !fields) {
      return NextResponse.json(
        { error: '缺少必要参数：appId, tableId, recordId, fields' },
        { status: 400 }
      );
    }

    // 在云函数环境中，使用飞书SDK更新记录
    try {
      // 初始化SDK
      const table = await bitable.base.getTable(tableId);
      
      // 获取字段元数据
      const fieldMetaList = await table.getFieldMetaList();
      
      // 构建更新数据
      const updateData: Record<string, any> = {};
      
      // 遍历传入的字段，根据字段名找到字段ID
      for (const [fieldName, fieldValue] of Object.entries(fields)) {
        const fieldMeta = fieldMetaList.find(meta => meta.name === fieldName);
        if (fieldMeta) {
          updateData[fieldMeta.id] = fieldValue;
        }
      }
      
      // 更新记录
      if (Object.keys(updateData).length > 0) {
        await table.setRecord(recordId, updateData);
      }
      
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('飞书SDK更新记录失败:', error);
      
      // 如果在开发环境中，模拟成功
      if (process.env.NODE_ENV === 'development') {
        console.log('开发环境: 模拟成功更新记录', { recordId, fields });
        return NextResponse.json({ success: true });
      }
      
      throw error;
    }
  } catch (error: any) {
    console.error('更新飞书记录API错误:', error);
    return NextResponse.json(
      { error: `更新记录失败: ${error.message}` },
      { status: 500 }
    );
  }
} 