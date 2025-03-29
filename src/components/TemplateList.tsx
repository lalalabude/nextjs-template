import React, { useState, useEffect, useCallback } from 'react';
import { Template, TemplateType, TemplateRecord } from '@/types';

// 组件属性接口
interface TemplateListProps {
  selectedTemplateId: string | null;
  selectedTemplateIds?: string[];
  onSelectTemplate: (template: TemplateRecord) => void;
  onSelectTemplates?: (template: TemplateRecord, isSelected: boolean) => void;
  isMultiSelectMode?: boolean;
  onRefresh?: () => void;
  refreshInterval?: number;
  className?: string;
}

export default function TemplateList({ 
  selectedTemplateId, 
  selectedTemplateIds = [],
  onSelectTemplate,
  onSelectTemplates,
  isMultiSelectMode = false,
  onRefresh,
  refreshInterval = 0,
  className = ''
}: TemplateListProps) {
  // 状态管理
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('获取模板列表...');
      
      const response = await fetch('/api/templates');
      if (!response.ok) {
        throw new Error('获取模板列表失败');
      }
      
      const data = await response.json();
      console.log('API返回数据:', data);
      
      // 检查返回的数据格式
      if (data.templates && Array.isArray(data.templates)) {
        console.log('模板列表获取成功:', data.templates.length);
        setTemplates(data.templates);
      } else if (Array.isArray(data)) {
        // 兼容旧格式，直接返回数组
        console.log('模板列表获取成功(兼容模式):', data.length);
        setTemplates(data);
      } else {
        console.error('API返回的数据格式不正确:', data);
        setTemplates([]);
        setError('获取模板列表失败：数据格式不正确');
      }
    } catch (error: any) {
      console.error('获取模板失败:', error);
      setError(error.message || '获取模板列表时出错');
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载模板
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // 设置定时刷新
  useEffect(() => {
    if (refreshInterval > 0) {
      console.log(`设置模板列表刷新间隔: ${refreshInterval}秒`);
      const refreshTimer = setInterval(fetchTemplates, refreshInterval * 1000);
      return () => clearInterval(refreshTimer);
    }
  }, [refreshInterval, fetchTemplates]);

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      console.log(`删除模板: ${templateId}`);
      setShowConfirmDelete(null);
      
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '删除模板失败');
      }
      
      // 刷新模板列表
      console.log('删除成功，刷新模板列表');
      fetchTemplates();
      
      // 如果选中的模板被删除，清除选择
      if (selectedTemplateId === templateId && onSelectTemplate) {
        onSelectTemplate(null as any);
      }
      
      // 触发外部刷新回调
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
    } catch (error: any) {
      console.error('删除模板失败:', error);
      setError(error.message || '删除模板时出错');
    }
  };

  const handleSelectTemplate = (template: TemplateRecord) => {
    console.log(`选择模板: ${template.id} - ${template.name}`);
    
    if (isMultiSelectMode && onSelectTemplates) {
      // 多选模式处理
      const isSelected = selectedTemplateIds.includes(template.id);
      onSelectTemplates(template, !isSelected);
    } else {
      // 单选模式处理
      onSelectTemplate(template);
    }
  };

  // 检查模板是否被选中
  const isTemplateSelected = (templateId: string) => {
    if (isMultiSelectMode) {
      return selectedTemplateIds.includes(templateId);
    } else {
      return selectedTemplateId === templateId;
    }
  };

  // 获取文件类型标签
  const getFileTypeLabel = (type: TemplateType) => {
    switch (type) {
      case 'docx':
        return 'Word 文档';
      case 'xlsx':
        return 'Excel 表格';
      default:
        return '未知格式';
    }
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`template-list ${className}`}>
      <div className="p-4 bg-white shadow rounded-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">模板库</h3>
          <div className="flex items-center">
            {isMultiSelectMode && (
              <span className="mr-2 text-xs text-blue-600">
                已选择 {selectedTemplateIds.length} 个模板
              </span>
            )}
            <button 
              onClick={fetchTemplates}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none"
            >
              刷新
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-600">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : templates.length === 0 ? (
          <div className="py-6 text-center text-gray-500 bg-gray-50 rounded-md">
            暂无模板，请上传新模板
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(template => (
              <div 
                key={template.id}
                className={`p-3 border rounded-md cursor-pointer transition-colors ${
                  isTemplateSelected(template.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => handleSelectTemplate(template)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center">
                    {isMultiSelectMode && (
                      <div className="mr-2">
                        <input 
                          type="checkbox" 
                          checked={selectedTemplateIds.includes(template.id)}
                          onChange={() => handleSelectTemplate(template)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300"
                        />
                      </div>
                    )}
                    <div>
                      <h4 className="font-medium text-gray-900">{template.name}</h4>
                      <div className="mt-1 flex items-center space-x-2 text-xs text-gray-500">
                        <span className={`px-1.5 py-0.5 rounded ${
                          template.file_type === 'docx' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {getFileTypeLabel(template.file_type)}
                        </span>
                        <span>上传时间: {formatDate(template.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  
                  {showConfirmDelete === template.id ? (
                    <div className="flex items-center space-x-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(template.id);
                        }}
                        className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        确认
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowConfirmDelete(null);
                        }}
                        className="px-2 py-1 text-xs border border-gray-300 rounded"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowConfirmDelete(template.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 