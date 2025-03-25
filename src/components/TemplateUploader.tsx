import { useState, useRef } from 'react';
import { TemplateRecord } from '@/types';

interface TemplateUploaderProps {
  onUploadSuccess: (template: TemplateRecord) => void;
}

export default function TemplateUploader({ onUploadSuccess }: TemplateUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // 验证文件类型
      if (!selectedFile.name.toLowerCase().endsWith('.docx') && 
          !selectedFile.name.toLowerCase().endsWith('.xlsx')) {
        setError('仅支持 .docx 和 .xlsx 文件格式');
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      setFile(selectedFile);
      
      // 提取文件名作为默认模板名称（不包含扩展名）
      const fileName = selectedFile.name.split('.').slice(0, -1).join('.');
      setName(fileName);
      
      setError('');
    }
  };

  const resetForm = () => {
    setFile(null);
    setName('');
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('请选择一个文件');
      return;
    }
    
    if (!name.trim()) {
      setError('请输入模板名称');
      return;
    }
    
    setIsUploading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      
      const response = await fetch('/api/templates', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '上传模板失败');
      }
      
      // 调用上传成功回调
      onUploadSuccess(data.template);
      
      // 重置表单
      resetForm();
    } catch (error: any) {
      setError(error.message || '上传模板失败');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">上传新模板</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            选择模板文件
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.xlsx"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
            disabled={isUploading}
          />
          <p className="mt-1 text-xs text-gray-500">支持 .docx 和 .xlsx 文件格式</p>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            模板名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="输入模板名称"
            disabled={isUploading}
          />
        </div>
        
        {error && (
          <div className="mb-4 p-2 bg-red-50 text-red-500 text-sm rounded">
            {error}
          </div>
        )}
        
        <div className="flex justify-end">
          <button
            type="button"
            onClick={resetForm}
            className="mr-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            disabled={isUploading}
          >
            重置
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={isUploading}
          >
            {isUploading ? '上传中...' : '上传模板'}
          </button>
        </div>
      </form>
    </div>
  );
} 