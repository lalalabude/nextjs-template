import { NextRequest, NextResponse } from 'next/server';

// 飞书API基础URL
const FEISHU_BASE_URL = 'https://base-api.feishu.cn';

// 从环境变量获取Personal Base Token
const PERSONAL_BASE_TOKEN = process.env.LARK_PERSONAL_BASE_TOKEN;

export async function POST(request: NextRequest) {
  try {
    // 验证Token
    if (!PERSONAL_BASE_TOKEN) {
      console.error('缺少LARK_PERSONAL_BASE_TOKEN环境变量');
      return NextResponse.json(
        { error: '服务器未正确配置Personal Base Token' },
        { status: 500 }
      );
    }

    // 获取请求体
    const body = await request.json();
    const { appId, tableId, recordIds } = body;

    // 使用环境变量中的应用ID，如果有的话
    const effectiveAppId = process.env.NEXT_PUBLIC_LARK_APP_ID || appId;
    console.log('使用的应用ID:', effectiveAppId);

    // 验证必要参数
    if (!effectiveAppId || !tableId || !recordIds) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 构建飞书API URL
    const apiPath = `/open-apis/bitable/v1/apps/${effectiveAppId}/tables/${tableId}/records/batch_get`;
    const apiUrl = `${FEISHU_BASE_URL}${apiPath}`;
    console.log('调用飞书API:', apiUrl);

    // 准备请求体数据
    const requestBody = {
      record_ids: recordIds
    };

    console.log('请求体:', requestBody);

    // 使用正确的认证头格式
    // 参考: https://feishu.feishu.cn/docx/S1pMdbckEooVlhx53ZMcGGnMnKc
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
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    console.log('响应状态:', response.status, response.statusText);
    
    const responseData = await response.json();
    
    if (!response.ok) {
      console.error('飞书API返回错误:', responseData);
      return NextResponse.json(
        { error: '获取记录失败', details: responseData },
        { status: response.status }
      );
    }

    // 打印API返回的数据结构
    console.log('API响应数据结构:', {
      code: responseData.code,
      msg: responseData.msg,
      dataKeys: responseData.data ? Object.keys(responseData.data) : 'data为空'
    });
    
    // 检查响应数据格式
    if (responseData.code !== 0) {
      console.error('飞书API返回错误:', responseData);
      return NextResponse.json(
        { error: '返回数据格式错误', details: responseData },
        { status: 500 }
      );
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
      console.warn('未从API响应中获取到有效记录，返回空记录集');
      return NextResponse.json({ records: [] });
    }

    console.log(`成功获取${records.length}条记录，返回记录ID:`, records.map((r: {record_id: string}) => r.record_id).join(','));
    
    return NextResponse.json({ records });
  } catch (error: any) {
    console.error('处理请求失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误', message: error.message },
      { status: 500 }
    );
  }
} 