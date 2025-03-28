import { useState, useEffect } from 'react';
import { bitable } from '@lark-base-open/js-sdk';
import { TemplateRecord } from '@/types';

interface DocumentGeneratorProps {
  selectedTemplate: TemplateRecord | null;
}

// 简单的错误处理包装器
const safeExecute = async <T,>(
  operation: () => Promise<T>,
  errorMessage: string,
  defaultValue?: T
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw error;
  }
};

export default function DocumentGenerator({ selectedTemplate }: DocumentGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [recordCount, setRecordCount] = useState(0);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [isLarkEnvironment, setIsLarkEnvironment] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Record<string, any>>({});

  // 获取记录详细信息
  const fetchRecordDetails = async (recordId: string) => {
    if (!isLarkEnvironment || !recordId) return;

    try {
      console.log('获取记录详情:', recordId);
      setDebugInfo(prev => `${prev}\n获取记录详情: ${recordId}`);
      
      const table = await getCurrentTable();
      if (!table) {
        console.error('无法获取当前表格，无法获取记录详情');
        setDebugInfo(prev => `${prev}\n错误: 无法获取当前表格`);
        return;
      }

      // 获取记录详细信息
      const record = await table.getRecordById(recordId);
      if (record) {
        console.log('获取到记录详情:', record);
        setSelectedFields(record.fields || {});
        setDebugInfo(prev => `${prev}\n成功获取记录详情`);
      } else {
        console.warn('未找到记录详情:', recordId);
        setSelectedFields({});
        setDebugInfo(prev => `${prev}\n警告: 未找到记录详情 ${recordId}`);
      }
    } catch (error: any) {
      console.error('获取记录详情失败:', error);
      setDebugInfo(prev => `${prev}\n错误: 获取记录详情失败 - ${error.message}`);
      setSelectedFields({});
      
      // 如果是开发环境，使用模拟数据
      if (process.env.NODE_ENV === 'development') {
        console.log('开发环境: 使用模拟记录数据');
        setSelectedFields({
          '字段1': '测试值1',
          '字段2': '测试值2',
          '日期': new Date().toISOString().split('T')[0],
          '数量': 100,
          '状态': '进行中'
        });
        setDebugInfo(prev => `${prev}\n开发环境: 使用模拟记录数据`);
      }
    }
  };

  // 定义一个更强大的检测飞书环境的函数
  const detectLarkEnvironment = async (): Promise<boolean> => {
    try {
      // 多种方式检测飞书环境
      const hasLarkBridge = !!(bitable && typeof bitable.bridge !== 'undefined');
      
      // 尝试简单API调用来确认环境
      if (hasLarkBridge) {
        try {
          // 尝试获取基础信息，验证API是否可用
          const baseInfo = await safeExecute(
            () => bitable.base.getActiveTable(),
            '获取基础信息失败',
            null
          );
          
          return !!baseInfo; // 如果能获取到表信息，确认是飞书环境
        } catch (e) {
          console.warn('验证飞书API失败，但检测到bridge存在');
          return true; // 仍然认为在飞书环境中，因为bridge存在
        }
      }
      
      return false; // 未检测到飞书环境
    } catch (error) {
      console.error('检测飞书环境时出错:', error);
      return false;
    }
  };

  // 初始化组件
  useEffect(() => {
    const initialize = async () => {
      try {
        // 检测是否在飞书环境
        const isLark = await detectLarkEnvironment();
        setIsLarkEnvironment(isLark);
        console.log('环境检测结果:', isLark ? '飞书环境' : '非飞书环境');
        setDebugInfo(`环境: ${isLark ? '飞书环境' : '非飞书环境'}`);
        
        if (!isLark) {
          console.log('非飞书环境，使用模拟数据');
          return;
        }
        
        // 初始化选择状态
        await refreshSelectedRecords();
        
        // 设置选择变更监听器
        await setupSelectionChangeListener();
        
        // 设置定期刷新
        const intervalId = setInterval(() => {
          refreshSelectedRecords();
        }, 2000); // 每2秒刷新一次
        
        // 保存intervalId以便清除
        (window as any).__selectionCheckInterval = intervalId;
        
        // 特别设置一个2秒后的检查，解决初始化后没有即时获取选择的问题
        setTimeout(() => {
          refreshSelectedRecords();
        }, 2000);
      } catch (error: any) {
        console.error('初始化失败:', error);
        setDebugInfo(`初始化失败: ${error.message}`);
      }
    };
    
    initialize();
    
    // 清理函数
    return () => {
      cleanupSelectionChangeListener();
      
      // 清除轮询间隔
      if ((window as any).__selectionCheckInterval) {
        clearInterval((window as any).__selectionCheckInterval);
        (window as any).__selectionCheckInterval = undefined;
      }
    };
  }, []);

  // 设置选择变更监听器
  const setupSelectionChangeListener = async () => {
    if (!isLarkEnvironment) return;

    try {
      console.log('设置选择变更监听器');
      
      // 获取当前表格
      const table = await getCurrentTable();
      if (!table) {
        console.error('无法获取当前表格，无法设置监听器');
        return;
      }

      // 使用类型断言处理onSelectionChange方法
      const unsubscribe = await (table as any).onSelectionChange((selection: any) => {
        console.log('选择已变更:', selection);
        
        if (selection && Array.isArray(selection.recordId)) {
          setRecordCount(selection.recordId.length);
          setSelectedRecords(selection.recordId);
          console.log('选择变更: 已选择', selection.recordId.length, '条记录');
          
          // 获取第一条记录的详细信息
          if (selection.recordId.length > 0) {
            fetchRecordDetails(selection.recordId[0]);
          } else {
            setSelectedFields({});
          }
        } else if (selection && selection.recordId) {
          // 单条记录的情况
          setRecordCount(1);
          setSelectedRecords([selection.recordId]);
          console.log('选择变更: 已选择 1 条记录');
          
          // 获取该记录的详细信息
          fetchRecordDetails(selection.recordId);
        } else {
          setRecordCount(0);
          setSelectedRecords([]);
          setSelectedFields({});
        }
      });

      // 保存取消订阅函数到window对象，以便在组件卸载时清理
      (window as any).__selectionChangeUnsubscribe = unsubscribe;
      
      console.log('选择变更监听器设置成功');
    } catch (error: any) {
      console.error('设置选择变更监听器失败:', error);
    }
  };

  // 清理选择变更监听器
  const cleanupSelectionChangeListener = () => {
    if ((window as any).__selectionChangeUnsubscribe) {
      console.log('清理选择变更监听器');
      (window as any).__selectionChangeUnsubscribe();
      (window as any).__selectionChangeUnsubscribe = undefined;
    }
  };

  // 刷新选中记录
  const refreshSelectedRecords = async () => {
    if (!isLarkEnvironment) return;
    
    try {
      console.log('刷新选中记录...');
      const selection = await safeExecute(
        () => bitable.base.getSelection(),
        '获取选择信息失败',
        null
      );
      
      if (selection && Array.isArray(selection.recordId)) {
        const newCount = selection.recordId.length;
        // 只有当记录数量发生变化时才更新状态
        if (newCount !== recordCount) {
          setRecordCount(newCount);
          setSelectedRecords(selection.recordId);
          console.log('已刷新选择的记录:', newCount);
          
          // 获取第一条记录的详细信息
          if (newCount > 0) {
            fetchRecordDetails(selection.recordId[0]);
          } else {
            setSelectedFields({});
          }
        }
      } else if (selection && selection.recordId) {
        // 单条记录的情况
        if (recordCount !== 1 || !selectedRecords.includes(selection.recordId)) {
          setRecordCount(1);
          setSelectedRecords([selection.recordId]);
          console.log('已刷新选择的记录: 1');
          
          // 获取该记录的详细信息
          fetchRecordDetails(selection.recordId);
        }
      } else if (recordCount > 0) {
        // 没有选择任何记录，但之前有选择
        setRecordCount(0);
        setSelectedRecords([]);
        setSelectedFields({});
      }
    } catch (error: any) {
      console.warn('刷新选中记录失败:', error);
    }
  };

  // 获取当前表格
  const getCurrentTable = async () => {
    return safeExecute(
      () => bitable.base.getActiveTable(),
      '获取当前表格失败',
      null
    );
  };

  // 生成文档
  const handleGenerateDocument = async () => {
    if (!selectedTemplate) {
      setError('请先选择一个模板');
      return;
    }
    
    // 先刷新选中记录
    await refreshSelectedRecords();
    
    if (isLarkEnvironment && selectedRecords.length === 0) {
      setError('请先在多维表格中选择至少一条记录');
      return;
    }
    
    setIsGenerating(true);
    setError('');
    setSuccess('');
    setDebugInfo('');
    
    try {
      // 获取当前的多维表格信息
      // 设置固定的appId
      let appId = 'BVsobnM5FapiWFs0v4acmnvJnLf';
      let tableId = '';
      let recordIds: string[] = selectedRecords;
      
      try {
        console.log('尝试获取飞书多维表格选择的记录');
        
        if (isLarkEnvironment) {
          // 获取当前表格
          const table = await getCurrentTable();
          if (!table) {
            throw new Error('无法获取当前表格');
          }
          
          // 使用表格ID作为tableId
          tableId = table.id || '';
          
          // 已经从state获取了记录ID，无需重复获取
          
          if (!tableId) {
            throw new Error('无法获取多维表格信息');
          }
          
          if (recordIds.length === 0) {
            throw new Error('请先选择至少一条记录');
          }
          
          console.log('使用固定飞书应用ID:', appId);
        } else {
          throw new Error('非飞书环境');
        }
      } catch (error: any) {
        console.error('获取飞书多维表格信息失败:', error);
        setDebugInfo(`获取飞书多维表格信息失败: ${error.message || '未知错误'}`);
        
        // 开发环境中使用测试数据
        if (process.env.NODE_ENV === 'development') {
          console.log('开发环境: 使用测试数据');
          appId = 'BVsobnM5FapiWFs0v4acmnvJnLf'; // 使用固定的appId
          tableId = 'test_table_id';
          recordIds = ['test_record_1', 'test_record_2'];
          setRecordCount(recordIds.length);
          setSelectedRecords(recordIds);
        } else {
          throw error;
        }
      }

      // 准备API URL
      let apiUrl: string;
      
      if (typeof window !== 'undefined') {
        // 在浏览器环境中使用完整URL
        apiUrl = new URL('/api/document/generate', window.location.origin).toString();
      } else {
        // 在服务器环境中使用相对URL
        apiUrl = '/api/document/generate';
      }

      console.log('准备调用API生成文档', { 
        api: apiUrl,
        template_url: selectedTemplate.file_url,
        app_id: appId,
        table_id: tableId,
        record_ids: recordIds
      });
      
      // 调用API生成文档
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_url: selectedTemplate.file_url,
          app_id: appId,
          table_id: tableId,
          record_ids: recordIds,
        }),
      });
      
      // 解析响应
      let data: any;
      try {
        data = await response.json();
        console.log('API响应:', data);
        setDebugInfo(prev => prev + '\nAPI响应: ' + JSON.stringify(data).substring(0, 200) + '...');
      } catch (error: any) {
        console.error('解析API响应失败:', error);
        setDebugInfo(prev => prev + '\n解析API响应失败: ' + error.message);
        throw new Error('解析API响应失败');
      }
      
      // 检查响应状态
      if (!response.ok) {
        const errorMsg = data?.error || '生成文档失败';
        setDebugInfo(prev => prev + '\n响应错误: ' + errorMsg);
        throw new Error(errorMsg);
      }
      
      // 检查API响应格式
      if (!data || typeof data !== 'object') {
        console.error('API响应格式不正确:', data);
        setDebugInfo(prev => prev + '\nAPI响应格式不正确');
        throw new Error('API响应格式不正确');
      }
      
      // 添加数据检查，避免undefined错误
      // 新版接口结构中documents数组包含生成的文档
      const docCount = data.documents ? data.documents.length : 0;
      const successDocCount = data.documents ? data.documents.filter((d: any) => !d.error).length : 0;
      
      // 输出完整的成功信息，包括成功数量和总数量
      setSuccess(`成功生成 ${successDocCount} 个文档！${successDocCount < docCount ? `(${docCount - successDocCount}个失败)` : ''}`);
      
      // 在调试信息中显示生成的文档URL
      if (data.documents && data.documents.length > 0) {
        setDebugInfo(prev => prev + '\n\n生成的文档:');
        data.documents.forEach((doc: any, index: number) => {
          const status = doc.error ? `失败: ${doc.error}` : '成功';
          setDebugInfo(prev => prev + `\n${index + 1}. 记录ID: ${doc.record_id} - ${status}`);
          if (doc.url) {
            setDebugInfo(prev => prev + `\n   URL: ${doc.url}`);
          }
        });
      }
      
      // 尝试刷新多维表格视图
      if (isLarkEnvironment) {
        try {
          console.log('尝试刷新多维表格视图');
          // 使用简单的方式处理飞书环境中的成功提示
          if (typeof window !== 'undefined') {
            // 使用自定义DOM元素创建一个临时通知
            const notificationDiv = document.createElement('div');
            notificationDiv.style.position = 'fixed';
            notificationDiv.style.top = '20px';
            notificationDiv.style.left = '50%';
            notificationDiv.style.transform = 'translateX(-50%)';
            notificationDiv.style.padding = '12px 20px';
            notificationDiv.style.backgroundColor = '#10B981';
            notificationDiv.style.color = 'white';
            notificationDiv.style.borderRadius = '4px';
            notificationDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            notificationDiv.style.zIndex = '9999';
            notificationDiv.textContent = '文档生成成功！';
            
            document.body.appendChild(notificationDiv);
            
            // 3秒后移除通知
            setTimeout(() => {
              document.body.removeChild(notificationDiv);
            }, 3000);
          }
        } catch (error: any) {
          console.error('刷新多维表格视图失败:', error);
          setDebugInfo(prev => prev + '\n刷新多维表格视图失败: ' + error.message);
        }
      }
    } catch (error: any) {
      console.error('生成文档失败:', error);
      setError(error.message || '生成文档失败');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-2">生成文档</h2>
        {selectedTemplate ? (
          <div className="bg-blue-50 p-3 rounded-md border border-blue-200 mb-4">
            <p>当前模板: <span className="font-medium">{selectedTemplate.name}</span></p>
            <p>模板类型: <span className="font-medium">{selectedTemplate.file_type.toUpperCase()}</span></p>
            <p className="text-sm text-gray-600 mt-1">模板ID: {selectedTemplate.id}</p>
          </div>
        ) : (
          <div className="bg-yellow-50 p-3 rounded-md border border-yellow-200 mb-4">
            <p>请先选择一个模板</p>
          </div>
        )}
        
        <div className="bg-gray-50 p-3 rounded-md border border-gray-200 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">已选择记录</h3>
            {isLarkEnvironment && (
              <button
                onClick={refreshSelectedRecords}
                className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                刷新选择
              </button>
            )}
          </div>
          
          {isLarkEnvironment ? (
            recordCount > 0 ? (
              <>
                <div className="bg-green-50 p-2 rounded-md border border-green-200 mb-3">
                  <p>已选择 <span className="font-bold">{recordCount}</span> 条记录</p>
                </div>
                
                {Object.keys(selectedFields).length > 0 ? (
                  <div className="mt-3 p-2 bg-white rounded border border-gray-300">
                    <h4 className="font-medium mb-1">第一条记录数据预览:</h4>
                    <div className="text-sm max-h-40 overflow-y-auto">
                      {Object.entries(selectedFields).map(([key, value]) => (
                        <div key={key} className="mb-1">
                          <span className="font-medium">{key}:</span>{' '}
                          <span className="text-gray-700">
                            {typeof value === 'object' 
                              ? JSON.stringify(value) 
                              : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">加载记录详情中...</p>
                )}
              </>
            ) : (
              <div>
                <p className="text-yellow-600">请在多维表格中选择记录</p>
                <p className="text-sm text-gray-500 mt-1">提示：点击表格中的行来选择记录，选择后点击上方的"刷新选择"按钮</p>
                <button
                  onClick={refreshSelectedRecords}
                  className="mt-3 px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded text-sm"
                >
                  立即检查选择
                </button>
              </div>
            )
          ) : (
            <div>
              <p className="text-red-600">非飞书环境，无法选择记录</p>
              <p className="text-sm text-gray-500 mt-1">请在飞书多维表格中打开此应用</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex flex-col space-y-2">
        <button
          onClick={handleGenerateDocument}
          disabled={isGenerating || !selectedTemplate || (isLarkEnvironment && recordCount === 0)}
          className={`px-4 py-2 rounded font-medium ${
            isGenerating || !selectedTemplate || (isLarkEnvironment && recordCount === 0)
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              生成中...
            </span>
          ) : '生成文档'}
        </button>
        
        {error && (
          <div className="bg-red-50 p-3 rounded-md border border-red-200 text-red-700">
            <p className="font-medium">错误:</p>
            <p>{error}</p>
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 p-3 rounded-md border border-green-200 text-green-700">
            <p className="font-medium">成功:</p>
            <p>{success}</p>
          </div>
        )}
        
        {debugInfo && (
          <div className="mt-4 bg-gray-50 p-3 rounded-md border border-gray-200">
            <h3 className="font-medium mb-1">状态信息:</h3>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
              {debugInfo}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
} 