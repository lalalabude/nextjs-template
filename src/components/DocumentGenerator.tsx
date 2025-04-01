'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TemplateRecord } from '@/types';
import { bitable } from '@lark-base-open/js-sdk';
import { apiClient } from '@/lib/api-client';

// 根据飞书官方文档更新Selection接口
interface BaseSelection {
  tableId?: string;
  viewId?: string;
  recordId?: string;
  fieldId?: string;
  fieldIds?: string[];
}

// 扩展Selection接口，包含recordIds数组
interface ExtendedSelection extends BaseSelection {
  recordIds?: string[];
}

// 扩展事件回调接口
interface SelectionEventContext {
  data?: ExtendedSelection;
  tableId?: string;
  viewId?: string;
  recordId?: string;
  recordIds?: string[];
  fieldId?: string;
  fieldIds?: string[];
}

export default function DocumentGenerator({
  appId: propAppId = '',
  tableId: propTableId = '',
  setGenStatus,
  selectedTemplates = [],
  apiKey = ''
}: {
  appId?: string;
  tableId?: string;
  setGenStatus?: (status: string) => void;
  selectedTemplates?: TemplateRecord[];
  apiKey?: string;
}) {
  // 状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const [selectedTemplateNames, setSelectedTemplateNames] = useState<string[]>([]);
  const [progressStatus, setProgressStatus] = useState({ current: 0, total: 0 });
  const [isSDKReady, setIsSDKReady] = useState(false);
  const [currentTableId, setCurrentTableId] = useState<string>('');
  const [currentAppId, setCurrentAppId] = useState<string>('');

  // 根据props更新已选择的模板
  useEffect(() => {
    const templateNames: string[] = [];
    
    // 从props中获取模板名称
    if (selectedTemplates && selectedTemplates.length > 0) {
      selectedTemplates.forEach(t => {
        if (t && t.name && !templateNames.includes(t.name)) {
          templateNames.push(t.name);
        }
      });
    }
    
    setSelectedTemplateNames(templateNames);
  }, [selectedTemplates]);

  // 刷新选中记录 - 根据飞书官方API正确使用
  const refreshSelectedRecords = useCallback(async () => {
    try {
      setError(null);
      
      if (!isSDKReady) {
        console.warn('飞书SDK未就绪，无法获取选中记录');
        return;
      }
      
      try {
        // 使用官方API获取选择
        const selection = await bitable.base.getSelection() as unknown as SelectionEventContext;
        
        // 处理记录ID集合
        if (selection) {
          // 如果获取到tableId，更新currentTableId
          if (selection.tableId && selection.tableId !== currentTableId) {
            console.log('从选择中更新表格ID:', selection.tableId);
            setCurrentTableId(selection.tableId);
          } else if (selection.data?.tableId && selection.data.tableId !== currentTableId) {
            console.log('从选择的data中更新表格ID:', selection.data.tableId);
            setCurrentTableId(selection.data.tableId);
          }
          
          // 情况1: 直接包含recordId
          if (selection.recordId) {
            setRecordIds([selection.recordId]);
            return;
          }
          
          // 情况2: 包含recordIds数组
          if (selection.recordIds && selection.recordIds.length > 0) {
            setRecordIds(selection.recordIds);
            return;
          }
          
          // 情况3: 包含在data对象中
          if (selection.data) {
            if (selection.data.recordId) {
              setRecordIds([selection.data.recordId]);
              return;
            }
            
            if (selection.data.recordIds && selection.data.recordIds.length > 0) {
              setRecordIds(selection.data.recordIds);
              return;
            }
          }
        }
        
        // 如果没有匹配任何记录，则清空
        setRecordIds([]);
      } catch (err) {
        console.error('获取选中记录失败:', err);
        setRecordIds([]);
      }
    } catch (err) {
      console.error('刷新选中记录时出错:', err);
      setRecordIds([]);
    }
  }, [isSDKReady, currentTableId]);

  // 设置选择变化监听
  useEffect(() => {
    if (!isSDKReady) return;
    
    refreshSelectedRecords();
    
    // 监听选择变化
    let unsubscribe: (() => void) | undefined;
    
    try {
      // 设置selection监听器
      unsubscribe = bitable.base.onSelectionChange((selection: unknown) => {
        const selectionCtx = selection as SelectionEventContext;
        
        if (selectionCtx) {
          // 更新tableId (如果有)
          if (selectionCtx.tableId) {
            setCurrentTableId(selectionCtx.tableId);
          } else if (selectionCtx.data?.tableId) {
            setCurrentTableId(selectionCtx.data.tableId);
          }
          
          // 处理recordId
          if (selectionCtx.recordId) {
            setRecordIds([selectionCtx.recordId]);
            return;
          }
          
          // 处理recordIds数组
          if (selectionCtx.recordIds && selectionCtx.recordIds.length > 0) {
            setRecordIds(selectionCtx.recordIds);
            return;
          }
          
          // 处理data中的属性
          if (selectionCtx.data) {
            if (selectionCtx.data.recordId) {
              setRecordIds([selectionCtx.data.recordId]);
              return;
            }
            
            if (selectionCtx.data.recordIds && selectionCtx.data.recordIds.length > 0) {
              setRecordIds(selectionCtx.data.recordIds);
              return;
            }
          }
        }
        
        // 默认情况
        setRecordIds([]);
      });
    } catch (err) {
      console.error('设置选择监听器失败:', err);
    }
    
    // 清理函数
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        try {
          unsubscribe();
        } catch (err) {
          console.error('移除选择监听器失败:', err);
        }
      }
    };
  }, [isSDKReady, refreshSelectedRecords]);

  // 监听选择变化
  useEffect(() => {
    if (!isSDKReady) return;

    const handleSelectionChange = (event: any) => {
      try {
        console.log('选择变化事件:', event);
        
        // 获取选中的记录ID
        const selectedRecordIds = event.recordIds || [];
        console.log('选中的记录ID:', selectedRecordIds);
        
        // 更新状态
        setRecordIds(selectedRecordIds);
        
        // 更新进度状态
        setProgressStatus({
          current: 0,
          total: selectedRecordIds.length
        });
        
        // 更新选中的模板名称
        if (selectedTemplates.length > 0) {
          setSelectedTemplateNames(selectedTemplates.map(t => t.name));
        } else {
          setSelectedTemplateNames([]);
        }
        
        // 更新生成状态
        if (setGenStatus) {
          if (selectedRecordIds.length > 0) {
            setGenStatus(`已选择 ${selectedRecordIds.length} 条记录`);
          } else {
            setGenStatus('请选择要生成文档的记录');
          }
        }
      } catch (error) {
        console.error('处理选择变化事件失败:', error);
        if (setGenStatus) {
          setGenStatus('处理选择变化事件失败');
        }
      }
    };

    // 注册选择变化事件监听器
    bitable.base.onSelectionChange(handleSelectionChange);

    // 清理函数
    return () => {
      // 由于飞书SDK没有提供offSelectionChange方法，我们在这里不做清理
      // 这不会造成内存泄漏，因为组件卸载时事件监听器会自动被清理
    };
  }, [isSDKReady, selectedTemplates, setGenStatus]);

  // 生成文档
  const handleGenerateDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // 验证必要参数
      if (!recordIds.length) {
        throw new Error('请先选择要生成文档的记录');
      }

      if (selectedTemplates.length === 0) {
        throw new Error('请先选择要使用的模板');
      }

      // 使用环境变量中的应用ID，如果有的话
      const effectiveAppId = process.env.NEXT_PUBLIC_LARK_APP_ID || propAppId || currentAppId;
      const effectiveTableId = propTableId || currentTableId;

      if (!effectiveAppId || !effectiveTableId) {
        throw new Error('缺少必要的应用ID或表格ID');
      }

      // 准备请求数据
      const requestData = {
        template_name: selectedTemplates.map(t => t.name),
        app_id: effectiveAppId,
        table_id: effectiveTableId,
        record_ids: recordIds
      };

      console.log('发送文档生成请求:', requestData);

      // 使用apiClient发送请求
      const response = await apiClient.post('/api/document/generate-from-records', requestData, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });

      console.log('文档生成响应:', response);

      // 更新进度状态
      setProgressStatus({
        current: recordIds.length,
        total: recordIds.length
      });

      // 显示成功消息
      setSuccess(`成功处理 ${recordIds.length} 条记录`);
      if (setGenStatus) {
        setGenStatus(`成功处理 ${recordIds.length} 条记录`);
      }
    } catch (error) {
      console.error('生成文档失败:', error);
      const errorMessage = error instanceof Error ? error.message : '生成文档时发生未知错误';
      setError(errorMessage);
      if (setGenStatus) {
        setGenStatus(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // 检查生成按钮状态
  const isGenerateDisabled = loading || recordIds.length === 0 || selectedTemplateNames.length === 0;

  // 初始化飞书SDK
  useEffect(() => {
    async function initSDK() {
      try {
        // 检查直接导入的bitable API是否存在
        if (typeof bitable !== 'undefined') {
          console.log('飞书SDK已导入');
          setIsSDKReady(true);
          
          // 尝试获取当前表格ID
          try {
            // 通过any类型跳过类型检查，因为SDK类型定义不完整
            const meta = await (bitable.base as any).getTableMetaList();
            if (meta && Array.isArray(meta) && meta.length > 0) {
              // 获取当前活动表格的ID
              const activeTable = meta.find(table => table.active === true || table.primary === true);
              if (activeTable && activeTable.id) {
                console.log('获取到当前表格ID:', activeTable.id);
                setCurrentTableId(activeTable.id);
              } else if (meta[0].id) {
                // 如果没有active标记，使用第一个表格
                console.log('使用第一个表格ID:', meta[0].id);
                setCurrentTableId(meta[0].id);
              }
            }
            
            // 尝试获取应用ID
            try {
              // 通过any类型跳过类型检查
              const appInfo = await (bitable.base as any).getAppInfo();
              if (appInfo && appInfo.appId) {
                console.log('获取到当前应用ID:', appInfo.appId);
                setCurrentAppId(appInfo.appId);
              }
            } catch (err) {
              console.warn('获取应用ID失败:', err);
            }
          } catch (err) {
            console.warn('获取表格元数据失败:', err);
          }
        } else {
          console.log('未找到飞书SDK，可能不在飞书环境中运行');
        }
      } catch (error) {
        console.error('初始化飞书SDK失败:', error);
      }
    }

    initSDK();
  }, []);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">文档生成器</h2>
        <p className="text-sm text-gray-600">
          选择模板和记录，生成文档
        </p>
      </div>

      {/* 已选模板信息展示 */}
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">已选模板</h3>
        <div className="rounded-md border p-2">
          {selectedTemplateNames.length > 0 ? (
            <div>
              {selectedTemplateNames.map((name, index) => (
                <div key={index} className="text-sm mb-1">{name}</div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">未选择任何模板，请在左侧模板库中选择</p>
          )}
        </div>
      </div>

      {/* 选中记录信息 */}
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">选中记录</h3>
        <div>
          {recordIds.length > 0 ? (
            <div>
              <p className="text-sm mb-1">已选择 {recordIds.length} 条记录</p>
              <div className="text-xs text-gray-500 overflow-hidden text-ellipsis">
                {recordIds.slice(0, 3).map((id, index) => (
                  <span key={id} className="mr-1">
                    {id}
                    {index < Math.min(recordIds.length, 3) - 1 ? ',' : ''}
                  </span>
                ))}
                {recordIds.length > 3 && (
                  <span>...等{recordIds.length}条记录</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">未选择任何记录，请在表格中选择记录</p>
          )}
          <button
            className="mt-2 px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            onClick={refreshSelectedRecords}
            disabled={loading}
          >
            刷新选择
          </button>
        </div>
      </div>

      {/* 错误和成功提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
          <div className="font-medium">错误</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md">
          <div className="font-medium">成功</div>
          <div className="text-sm">{success}</div>
        </div>
      )}

      {/* 进度指示器 */}
      {loading && progressStatus.total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>处理进度</span>
            <span>
              {progressStatus.current}/{progressStatus.total}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${(progressStatus.current / progressStatus.total) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* 生成按钮 */}
      <button
        onClick={handleGenerateDocument}
        disabled={isGenerateDisabled}
        className={`w-full px-4 py-2 rounded-md ${
          isGenerateDisabled 
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {loading ? (
          <span>正在生成...</span>
        ) : (
          <span>生成文档</span>
        )}
      </button>
    </div>
  );
}