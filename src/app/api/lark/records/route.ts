import { NextRequest, NextResponse } from 'next/server';
import { LarkRecord } from '@/types';
import { bitable } from '@lark-base-open/js-sdk';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get('appId');
    const tableId = searchParams.get('tableId');
    const recordIdsParam = searchParams.get('recordIds');

    if (!appId || !tableId || !recordIdsParam) {
      return NextResponse.json(
        { error: '缺少必要参数：appId, tableId, recordIds' },
        { status: 400 }
      );
    }

    const recordIds = recordIdsParam.split(',');
    const records: LarkRecord[] = [];

    // 在云函数环境中，使用飞书SDK获取记录
    try {
      // 初始化SDK
      const table = await bitable.base.getTable(tableId);
      
      // 获取表格字段元数据
      const fieldMetaList = await table.getFieldMetaList();
      
      // 获取记录
      for (const recordId of recordIds) {
        const record = await table.getRecordById(recordId);
        if (record) {
          const fields: Record<string, any> = {};
          
          // 遍历字段元数据，获取字段值
          for (const fieldMeta of fieldMetaList) {
            const fieldValue = await table.getCellValue(fieldMeta.id, recordId);
            fields[fieldMeta.name] = fieldValue;
          }
          
          records.push({
            record_id: recordId,
            fields
          });
        }
      }
    } catch (error) {
      console.error('飞书SDK获取记录失败:', error);
      
      // 如果在开发环境或非飞书环境中，返回模拟数据
      if (process.env.NODE_ENV === 'development') {
        recordIds.forEach(recordId => {
          records.push({
            record_id: recordId,
            fields: {
              '标题': `测试记录 ${recordId}`,
              '描述': '这是一个测试记录，用于开发环境测试。',
              '创建日期': new Date().toISOString(),
              '状态': '进行中',
              '负责人': {
                name: '测试用户',
                id: 'user_123456'
              }
            }
          });
        });
      }
    }

    return NextResponse.json({ records });
  } catch (error: any) {
    console.error('获取飞书记录API错误:', error);
    return NextResponse.json(
      { error: `获取记录失败: ${error.message}` },
      { status: 500 }
    );
  }
} 