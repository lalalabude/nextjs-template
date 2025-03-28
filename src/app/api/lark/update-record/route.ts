import { NextRequest, NextResponse } from 'next/server';

// 从环境变量获取Personal Base Token
const PERSONAL_BASE_TOKEN = process.env.LARK_PERSONAL_BASE_TOKEN;

if (!PERSONAL_BASE_TOKEN) {
  console.error('未配置飞书Personal Base Token');
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
    const { appId, tableId, recordId, fields } = body;

    // 使用环境变量中的应用ID，如果有的话
    const effectiveAppId = process.env.NEXT_PUBLIC_LARK_APP_ID || appId;
    console.log('使用的应用ID:', effectiveAppId);

    // 验证必要参数
    if (!effectiveAppId || !tableId || !recordId || !fields) {
      return NextResponse.json(
        { error: '缺少必要参数' },
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
        { error: '更新记录失败', details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('飞书API返回数据:', data);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('处理请求失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误', message: error.message },
      { status: 500 }
    );
  }
} 