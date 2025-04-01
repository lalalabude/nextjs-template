'use client';

import React, { useState, useEffect } from 'react';
import TemplateList from '@/components/TemplateList';
import DocumentGenerator from '@/components/DocumentGenerator';
import { TemplateRecord } from '@/types';

export default function Home() {
  const [selectedTemplates, setSelectedTemplates] = useState<TemplateRecord[]>([]);
  const [genStatus, setGenStatus] = useState('请选择要生成文档的记录');
  const [apiKey, setApiKey] = useState('');

  // 从localStorage加载API Key
  useEffect(() => {
    const savedApiKey = localStorage.getItem('apiKey');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  // 保存API Key到localStorage
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiKey = e.target.value;
    setApiKey(newApiKey);
    localStorage.setItem('apiKey', newApiKey);
  };

  const handleTemplateSelect = (template: TemplateRecord, isSelected: boolean) => {
    setSelectedTemplates(prev => {
      if (isSelected) {
        return [...prev, template];
      } else {
        return prev.filter(t => t.id !== template.id);
      }
    });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 左侧：模板列表 */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">模板库</h2>
            <TemplateList
              selectedTemplateIds={selectedTemplates.map(t => t.id)}
              onSelectTemplates={handleTemplateSelect}
              onRefresh={() => setSelectedTemplates([])}
            />
          </div>

          {/* 右侧：文档生成器 */}
          <div>
            <DocumentGenerator
              setGenStatus={setGenStatus}
              selectedTemplates={selectedTemplates}
              apiKey={apiKey}
            />
          </div>
        </div>
      </div>
    </main>
  );
} 