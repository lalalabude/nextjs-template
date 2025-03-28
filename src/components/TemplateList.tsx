import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TemplateRecord, TemplateType } from '@/types';

interface TemplateListProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (template: TemplateRecord | null) => void;
  onRefresh: () => void;
}

function TestTemplateLink({ url }: { url: string }) {
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [error, setError] = useState<string>('');

  const testLink = async () => {
    setStatus('pending');
    setError('');
    
    try {
      console.log('测试文件链接:', url);
      const response = await fetch(url, { method: 'HEAD' });
      
      if (response.ok) {
        console.log('文件链接可访问:', url, response.status);
        setStatus('success');
      } else {
        console.error('文件链接不可访问:', url, response.status);
        setStatus('error');
        setError(`状态码: ${response.status}`);
      }
    } catch (error: any) {
      console.error('测试文件链接失败:', error);
      setStatus('error');
      setError(error.message || '未知错误');
    }
  };

  return (
    <div className="flex items-center space-x-2 mt-1">
      <button 
        onClick={testLink}
        className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded"
      >
        测试链接
      </button>
      {status === 'pending' && <span className="text-xs text-gray-500">点击左侧按钮测试</span>}
      {status === 'success' && <span className="text-xs text-green-600">✓ 可访问</span>}
      {status === 'error' && <span className="text-xs text-red-600">✗ 不可访问: {error}</span>}
    </div>
  );
}

function TemplateItem({ 
  template, 
  onDelete, 
  onSelect, 
  isSelected 
}: { 
  template: TemplateRecord;
  onDelete: (id: string) => void;
  onSelect: (template: TemplateRecord) => void;
  isSelected: boolean;
}) {
  const getFileTypeLabel = (type: TemplateType) => {
    switch (type) {
      case 'docx':
        return 'Word';
      case 'xlsx':
        return 'Excel';
      default:
        return '未知';
    }
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const getShortUrl = (url: string) => {
    try {
      const parts = new URL(url).pathname.split('/');
      return parts[parts.length - 1];
    } catch (e) {
      return url.split('/').pop() || url;
    }
  };

  return (
    <div 
      className={`border rounded-lg mb-4 overflow-hidden transition-all ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div 
        className="p-4 cursor-pointer"
        onClick={() => onSelect(template)}
      >
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold text-gray-800">{template.name}</h3>
          <span className={`px-2 py-1 text-xs rounded ${
            template.file_type === 'docx' 
              ? 'bg-blue-100 text-blue-800' 
              : 'bg-green-100 text-green-800'
          }`}>
            {getFileTypeLabel(template.file_type)}
          </span>
        </div>
        
        <div className="mt-2 text-xs text-gray-500">
          创建于: {formatDate(template.created_at)}
        </div>
        
        <div className="mt-2">
          <div className="text-xs text-gray-500 truncate">
            文件: {getShortUrl(template.file_url)}
          </div>
          <TestTemplateLink url={template.file_url} />
        </div>
        
        {template.placeholders && template.placeholders.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-500 mb-1">占位符:</p>
            <div className="flex flex-wrap gap-1">
              {template.placeholders.slice(0, 5).map((placeholder, index) => (
                <span
                  key={index}
                  className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                >
                  {placeholder}
                </span>
              ))}
              {template.placeholders.length > 5 && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                  +{template.placeholders.length - 5}个
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-gray-50 px-4 py-2 flex justify-between items-center">
        <button
          onClick={() => onSelect(template)}
          className={`px-3 py-1 rounded text-sm ${
            isSelected 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-blue-600 border border-blue-600 hover:bg-blue-50'
          }`}
        >
          {isSelected ? '已选择' : '选择'}
        </button>
        
        <button
          onClick={() => onDelete(template.id)}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          删除
        </button>
      </div>
    </div>
  );
}

export default function TemplateList({ 
  selectedTemplateId, 
  onSelectTemplate,
  onRefresh
}: TemplateListProps) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState<string>('');

  const fetchTemplates = async () => {
    setIsLoading(true);
    setError('');
    setDebugInfo('');
    
    try {
      const response = await fetch('/api/templates');
      console.log('获取模板列表响应:', response.status);
      setDebugInfo(`API响应状态: ${response.status}`);
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '获取模板列表失败');
      }
      
      if (Array.isArray(data.templates)) {
        console.log(`获取到 ${data.templates.length} 个模板`);
        setDebugInfo(prev => `${prev}\n模板数量: ${data.templates.length}`);
        setTemplates(data.templates);
        
        // 如果有选中的模板ID，确保它仍然存在于新的模板列表中
        if (selectedTemplateId) {
          const templateExists = data.templates.some(t => t.id === selectedTemplateId);
          if (!templateExists) {
            console.log('之前选中的模板已不存在，清除选择');
            onSelectTemplate(null);
          }
        }
      } else {
        console.error('接收到的数据不是数组:', data);
        setTemplates([]);
        setError('服务器返回了无效的数据格式');
      }
    } catch (error: any) {
      console.error('获取模板列表失败:', error);
      setError(error.message || '获取模板列表失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('确定要删除这个模板吗？此操作不可撤销。')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '删除模板失败');
      }
      
      // 如果删除的是当前选中的模板，清除选择
      if (selectedTemplateId === templateId) {
        onSelectTemplate(null);
      }
      
      // 刷新模板列表
      fetchTemplates();
      onRefresh();
    } catch (error: any) {
      alert(`删除失败: ${error.message}`);
    }
  };

  const handleSelectTemplate = (template: TemplateRecord) => {
    console.log('选择模板:', template.id);
    setDebugInfo(prev => `${prev}\n选择模板: ${template.id}`);
    onSelectTemplate(template);
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-500">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center bg-red-50 text-red-500 rounded-md">
        <p className="mb-2">{error}</p>
        {debugInfo && (
          <div className="mb-2 p-2 bg-gray-100 text-gray-800 text-xs overflow-auto max-h-32 rounded">
            <pre>{debugInfo}</pre>
          </div>
        )}
        <button 
          onClick={fetchTemplates}
          className="mt-2 px-4 py-2 text-sm text-white bg-red-500 rounded-md hover:bg-red-600"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-800">模板列表</h2>
        <button
          onClick={fetchTemplates}
          className="p-1 rounded-full hover:bg-gray-200"
          title="刷新列表"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
      
      {debugInfo && (
        <div className="p-2 bg-gray-50 border-b text-xs text-gray-500">
          <pre className="whitespace-pre-wrap">{debugInfo}</pre>
        </div>
      )}
      
      <div className="p-4">
        {templates.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">暂无模板</p>
            <p className="text-sm text-gray-400 mt-2">请上传新模板</p>
          </div>
        ) : (
          templates.map((template) => (
            <TemplateItem
              key={template.id}
              template={template}
              onDelete={handleDeleteTemplate}
              onSelect={handleSelectTemplate}
              isSelected={selectedTemplateId === template.id}
            />
          ))
        )}
      </div>
    </div>
  );
} 