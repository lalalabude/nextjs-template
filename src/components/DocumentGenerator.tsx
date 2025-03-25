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

  // 检查是否在飞书环境
  useEffect(() => {
    const checkLarkEnvironment = async () => {
      try {
        // 判断是否在飞书客户端环境
        if (bitable && typeof bitable.bridge !== 'undefined') {
          setIsLarkEnvironment(true);
          console.log('检测到飞书环境');
          
          try {
            // 获取选择信息，使用安全执行器
            const selection = await safeExecute(
              () => bitable.base.getSelection(),
              '获取初始选择失败',
              null
            );
            
            if (selection && Array.isArray(selection.recordId)) {
              setRecordCount(selection.recordId.length);
              setSelectedRecords(selection.recordId);
              console.log('已获取选择的记录:', selection.recordId.length);
            } else if (selection && selection.recordId) {
              // 单条记录的情况
              setRecordCount(1);
              setSelectedRecords([selection.recordId]);
              console.log('已获取选择的记录: 1');
            }
          } catch (error) {
            console.warn('获取初始选择失败:', error);
          }
        } else {
          console.log('非飞书环境');
          setIsLarkEnvironment(false);
        }
      } catch (error) {
        console.warn('检测飞书环境失败:', error);
        setIsLarkEnvironment(false);
      }
    };
    
    checkLarkEnvironment();
  }, []);

  // 刷新选中记录
  const refreshSelectedRecords = async () => {
    if (!isLarkEnvironment) return;
    
    try {
      const selection = await safeExecute(
        () => bitable.base.getSelection(),
        '获取选择信息失败',
        null
      );
      
      if (selection && Array.isArray(selection.recordId)) {
        setRecordCount(selection.recordId.length);
        setSelectedRecords(selection.recordId);
        console.log('已刷新选择的记录:', selection.recordId.length);
      } else if (selection && selection.recordId) {
        // 单条记录的情况
        setRecordCount(1);
        setSelectedRecords([selection.recordId]);
        console.log('已刷新选择的记录: 1');
      } else {
        setRecordCount(0);
        setSelectedRecords([]);
      }
    } catch (error) {
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
      let appId = '';
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
        } else {
          throw new Error('非飞书环境');
        }
      } catch (error: any) {
        console.error('获取飞书多维表格信息失败:', error);
        setDebugInfo(`获取飞书多维表格信息失败: ${error.message || '未知错误'}`);
        
        // 开发环境中使用测试数据
        if (process.env.NODE_ENV === 'development') {
          console.log('开发环境: 使用测试数据');
          appId = 'test_app_id';
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
      const docCount = data?.data?.document_urls?.length || 0;
      setSuccess(`成功生成 ${docCount} 个文档！`);
      
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
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">生成文档</h2>
      
      {!selectedTemplate ? (
        <div className="p-4 bg-yellow-50 text-yellow-700 rounded-md">
          请先从左侧列表选择一个模板
        </div>
      ) : (
        <div>
          <div className="mb-4 p-4 bg-blue-50 rounded-md">
            <p className="font-medium text-blue-700">已选择模板:</p>
            <p className="mt-1 text-blue-800">{selectedTemplate.name}</p>
            <div className="mt-2 text-sm text-blue-600">
              类型: {selectedTemplate.file_type.toUpperCase()}
            </div>
            <div className="mt-2 text-xs text-blue-500 truncate">
              文件: {selectedTemplate.file_url}
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">操作说明:</h3>
            <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
              <li>在飞书多维表格中选择需要生成文档的记录</li>
              <li>点击下方按钮生成文档</li>
              <li>生成的文档将自动添加到选中记录的"文档链接"字段</li>
            </ol>
          </div>
          
          {isLarkEnvironment ? (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">选中记录:</span>
                <button 
                  onClick={refreshSelectedRecords}
                  className="text-xs text-blue-600 hover:text-blue-800 focus:outline-none"
                >
                  刷新选中记录
                </button>
              </div>
              
              {recordCount > 0 ? (
                <div className="mb-4">
                  <div className="p-2 bg-green-50 text-green-700 text-sm rounded">
                    已选择 {recordCount} 条记录
                  </div>
                  {selectedRecords.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500 max-h-20 overflow-auto">
                      {selectedRecords.map((id, index) => (
                        <div key={id} className="truncate">
                          记录 {index + 1}: <span className="text-gray-700">{id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-4 p-2 bg-yellow-50 text-yellow-700 text-sm rounded">
                  请在多维表格中选择至少一条记录
                </div>
              )}
            </div>
          ) : (
            <div className="mb-4 p-2 bg-orange-50 text-orange-700 text-sm rounded">
              非飞书环境，将使用测试数据
            </div>
          )}
          
          {error && (
            <div className="mb-4 p-2 bg-red-50 text-red-500 text-sm rounded">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-2 bg-green-50 text-green-700 text-sm rounded">
              {success}
            </div>
          )}
          
          {debugInfo && (
            <div className="mb-4 p-2 bg-gray-50 text-gray-600 text-xs rounded overflow-auto max-h-32">
              <p className="font-medium mb-1">调试信息:</p>
              <pre className="whitespace-pre-wrap">{debugInfo}</pre>
            </div>
          )}
          
          <button
            onClick={handleGenerateDocument}
            disabled={isGenerating || !selectedTemplate || (isLarkEnvironment && recordCount === 0)}
            className={`w-full px-4 py-2 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              isGenerating || !selectedTemplate || (isLarkEnvironment && recordCount === 0)
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isGenerating ? '生成中...' : '生成文档'}
          </button>
        </div>
      )}
    </div>
  );
} 