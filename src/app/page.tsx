'use client';

import { useState } from 'react';
import TemplateUploader from '@/components/TemplateUploader';
import TemplateList from '@/components/TemplateList';
import DocumentGenerator from '@/components/DocumentGenerator';
import { TemplateRecord } from '@/types';

export default function Home() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = (template: TemplateRecord) => {
    setSelectedTemplate(template);
    setRefreshKey(prevKey => prevKey + 1);
  };

  const handleRefresh = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">飞书多维表格文档生成器</h1>
        </div>
      </header>
      
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 左侧栏：上传模板 */}
            <div className="md:col-span-1 space-y-6">
              <TemplateUploader onUploadSuccess={handleUploadSuccess} />
              
              {/* 模板列表 */}
              <div className="mt-6">
                <TemplateList
                  key={refreshKey}
                  selectedTemplateId={selectedTemplate?.id || null}
                  onSelectTemplate={setSelectedTemplate}
                  onRefresh={handleRefresh}
                />
              </div>
            </div>
            
            {/* 右侧栏：生成文档 */}
            <div className="md:col-span-2">
              <DocumentGenerator selectedTemplate={selectedTemplate} />
              
              {/* 使用说明 */}
              <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-semibold mb-4">使用说明</h2>
                <div className="prose prose-blue">
                  <h3>功能介绍</h3>
                  <p>
                    飞书多维表格文档生成器是一款应用于飞书多维表格的插件，可以基于上传的文档模板生成定制化文档。
                  </p>
                  
                  <h3>操作步骤</h3>
                  <ol>
                    <li>上传Word或Excel模板文件，模板中使用 {'{字段名}'} 格式作为占位符</li>
                    <li>在多维表格中选择一条或多条记录</li>
                    <li>选择一个已上传的模板，点击"生成文档"按钮</li>
                    <li>系统将根据所选记录的字段值，替换模板中的占位符</li>
                    <li>生成的文档将自动添加到记录的"文档链接"字段中</li>
                  </ol>
                  
                  <h3>占位符说明</h3>
                  <p>
                    占位符使用 {'{字段名}'} 格式，其中"字段名"必须与多维表格中的字段名称完全一致。例如，如果多维表格中有一个名为"客户名称"的字段，则在模板中使用 {'{客户名称}'} 作为占位符。
                  </p>
                  
                  <h3>支持的文件格式</h3>
                  <ul>
                    <li>Word文档 (.docx)</li>
                    <li>Excel表格 (.xlsx)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
} 