import React, { useState, useRef } from 'react';
import { TemplateRecord } from '@/types';

// 组件属性接口
interface TemplateUploaderProps {
  onUploadSuccess?: (template: TemplateRecord) => void;
  className?: string;
}

export default function TemplateUploader({
  onUploadSuccess,
  className = '',
}: TemplateUploaderProps) {
  // 状态管理
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    
    // 如果文件已选择，并且名称为空，则使用文件名作为模板名
    if (selectedFile && !name) {
      // 移除扩展名
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setName(fileName);
    }
    
    // 清除错误和成功状态
    setError(null);
    setSuccess(false);
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证表单
    if (!name.trim()) {
      setError('请输入模板名称');
      return;
    }
    
    if (!file) {
      setError('请选择文件');
      return;
    }
    
    // 验证文件格式
    const fileType = file.name.split('.').pop()?.toLowerCase();
    if (fileType !== 'docx' && fileType !== 'xlsx') {
      setError('仅支持 .docx 和 .xlsx 文件');
      return;
    }
    
    setIsUploading(true);
    setError(null);
    
    try {
      // 准备表单数据
      const formData = new FormData();
      formData.append('name', name);
      formData.append('file', file);
      
      console.log('正在上传模板...', name, file.name);
      
      // 上传文件
      const response = await fetch('/api/templates', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '上传失败');
      }
      
      // 解析响应数据
      const template = await response.json();
      console.log('模板上传成功:', template);
      
      // 上传成功
      setSuccess(true);
      setName('');
      setFile(null);
      
      // 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // 回调通知
      if (onUploadSuccess && template) {
        onUploadSuccess(template);
      }
      
      // 3秒后隐藏成功消息
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err: any) {
      console.error('模板上传失败:', err);
      setError(err.message || '上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`template-uploader ${className}`}>
      <div className="p-4 bg-white shadow rounded-lg">
        <h3 className="text-lg font-semibold mb-4">上传新模板</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              模板名称
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入模板名称"
              disabled={isUploading}
            />
          </div>
          
          <div className="mb-4">
            <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-1">
              选择文件
            </label>
            <input
              type="file"
              id="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".docx,.xlsx"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isUploading}
            />
            <p className="mt-1 text-sm text-gray-500">支持 .docx (Word) 和 .xlsx (Excel) 文件</p>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-600 text-sm">
              模板上传成功！
            </div>
          )}
          
          <button
            type="submit"
            disabled={isUploading || !file || !name.trim()}
            className={`w-full px-4 py-2 text-white font-medium rounded-md ${
              isUploading || !file || !name.trim()
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            }`}
          >
            {isUploading ? '上传中...' : '上传模板'}
          </button>
        </form>
      </div>
    </div>
  );
} 