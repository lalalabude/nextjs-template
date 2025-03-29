'use client';

import { useState, useEffect } from 'react';
import TemplateUploader from '@/components/TemplateUploader';
import TemplateList from '@/components/TemplateList';
import DocumentGenerator from '@/components/DocumentGenerator';
import { TemplateRecord } from '@/types';

export default function Home() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRecord | null>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<TemplateRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // 当单个模板选择变化时，同时更新多选列表
  useEffect(() => {
    if (selectedTemplate) {
      if (!selectedTemplates.some(t => t.id === selectedTemplate.id)) {
        setSelectedTemplates([selectedTemplate]);
      }
    }
  }, [selectedTemplate]);

  // 当多选列表变化时，更新单选模板（使用第一个模板）
  useEffect(() => {
    if (selectedTemplates.length > 0) {
      setSelectedTemplate(selectedTemplates[0]);
    } else {
      setSelectedTemplate(null);
    }
  }, [selectedTemplates]);

  const handleTemplateMultiSelect = (template: TemplateRecord, isSelected: boolean) => {
    if (isSelected) {
      if (!selectedTemplates.some(t => t.id === template.id)) {
        setSelectedTemplates([...selectedTemplates, template]);
      }
    } else {
      setSelectedTemplates(selectedTemplates.filter(t => t.id !== template.id));
    }
  };

  const handleUploadSuccess = (template: TemplateRecord) => {
    setSelectedTemplate(template);
    if (!selectedTemplates.some(t => t.id === template.id)) {
      setSelectedTemplates([...selectedTemplates, template]);
    }
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
                  selectedTemplateIds={selectedTemplates.map(t => t.id)}
                  onSelectTemplate={setSelectedTemplate}
                  onSelectTemplates={handleTemplateMultiSelect}
                  isMultiSelectMode={true}
                  onRefresh={handleRefresh}
                  refreshInterval={0}
                />
              </div>
            </div>
            
            {/* 右侧栏：生成文档 */}
            <div className="md:col-span-2">
              <DocumentGenerator 
                selectedTemplate={selectedTemplate}
                selectedTemplates={selectedTemplates}
                appId={process.env.NEXT_PUBLIC_LARK_APP_ID} 
                tableId={process.env.NEXT_PUBLIC_LARK_TABLE_ID}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
} 