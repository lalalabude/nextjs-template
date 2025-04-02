import React, { useState, useEffect, useCallback } from 'react';
import { TemplateRecord } from '@/types';
import { apiClient } from '@/lib/api-client';

// 组件属性接口
interface TemplateListProps {
  selectedTemplateIds: string[];
  onSelectTemplates: (template: TemplateRecord, isSelected: boolean) => void;
  onRefresh?: () => void;
  className?: string;
}

export default function TemplateList({ 
  selectedTemplateIds = [],
  onSelectTemplates,
  onRefresh,
  className = ''
}: TemplateListProps) {
  // 状态管理
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('开始获取模板列表...');
      const response = await apiClient.get('/api/templates');
      
      if (!response) {
        throw new Error('API返回空响应');
      }
      
      if (Array.isArray(response)) {
        setTemplates(response);
      } else if (response && typeof response === 'object') {
        if ('data' in response && Array.isArray(response.data)) {
          setTemplates(response.data);
        } else if ('templates' in response && Array.isArray(response.templates)) {
          setTemplates(response.templates);
        } else if ('records' in response && Array.isArray(response.records)) {
          setTemplates(response.records);
        } else {
          throw new Error('API返回的数据格式不正确');
        }
      } else {
        throw new Error('API返回的数据格式不正确');
      }
    } catch (error) {
      console.error('获取模板列表失败:', error);
      setError(error instanceof Error ? error.message : '获取模板列表时出错');
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载模板
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      setShowConfirmDelete(null);
      await apiClient.delete(`/api/templates/${templateId}`);
      
      if (selectedTemplateIds.includes(templateId)) {
        // 使用TemplateRecord类型而不是any
        const template = templates.find(t => t.id === templateId);
        if (template) {
          onSelectTemplates(template, false);
        }
      }
      
      fetchTemplates();
      onRefresh?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : '删除模板失败');
    }
  };

  const handleTemplateClick = (template: TemplateRecord) => {
    const isSelected = selectedTemplateIds.includes(template.id);
    onSelectTemplates(template, !isSelected);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      // 如果没有设置名称，使用文件名（不含扩展名）作为默认名称
      if (!uploadName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setUploadName(nameWithoutExt);
      }
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName) {
      setError('请选择文件并输入模板名称');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadName);
      formData.append('description', uploadDescription);

      await apiClient.post('/api/templates', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setShowUploadDialog(false);
      setUploadFile(null);
      setUploadName('');
      setUploadDescription('');
      fetchTemplates();
      onRefresh?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : '上传模板失败');
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md">
        <div className="font-medium">错误</div>
        <div className="text-sm">{error}</div>
        <button 
          onClick={fetchTemplates}
          className="mt-2 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 上传按钮 */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowUploadDialog(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          上传模板
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center text-gray-500 py-4">
          暂无可用模板
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map(template => (
            <div
              key={template.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                selectedTemplateIds.includes(template.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
              onClick={() => handleTemplateClick(template)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-gray-900">{template.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {template.description || '暂无描述'}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmDelete(template.id);
                  }}
                  className="text-red-600 hover:text-red-800"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认对话框 */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg max-w-sm w-full">
            <h3 className="text-lg font-medium mb-4">确认删除</h3>
            <p className="text-gray-600 mb-4">
              确定要删除这个模板吗？此操作不可撤销。
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDelete(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteTemplate(showConfirmDelete)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 上传对话框 */}
      {showUploadDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">上传模板</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择文件
                </label>
                <input
                  type="file"
                  accept=".docx,.xlsx"
                  onChange={handleFileChange}
                  className="w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                {uploadFile && (
                  <p className="mt-1 text-sm text-gray-500">
                    已选择: {uploadFile.name}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  模板名称
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入模板名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  模板描述
                </label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="请输入模板描述（可选）"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowUploadDialog(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                取消
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className={`px-4 py-2 rounded ${
                  isUploading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isUploading ? '上传中...' : '上传'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 