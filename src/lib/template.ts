import { Template, SerializedTemplate } from '../types';
import { processTemplateFromFile, generateFileName, downloadFile } from './template-processor';

const TEMPLATE_STORAGE_KEY = 'template_history';

export const saveTemplateToStorage = (template: Template): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      console.log('开始保存模板到本地存储:', template.name);
      
      // 我们需要先转换 File 对象以便可以存储
      const fileReader = new FileReader();
      fileReader.readAsArrayBuffer(template.file);
      
      fileReader.onload = () => {
        const arrayBuffer = fileReader.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // 使用 btoa 只是为了存储，不涉及字符编码解析
        const base64String = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
        
        // 先获取现有的模板列表
        let existingTemplatesStr = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        console.log('从localStorage获取的现有模板数据:', existingTemplatesStr?.substring(0, 100) + '...');
        
        let existingTemplates: SerializedTemplate[] = [];
        if (existingTemplatesStr) {
          try {
            existingTemplates = JSON.parse(existingTemplatesStr);
            console.log('现有模板数量:', existingTemplates.length);
          } catch (err) {
            console.error('解析现有模板失败，将重置模板列表:', err);
            existingTemplates = [];
          }
        }
        
        const templateToSave: SerializedTemplate = {
          id: template.id,
          name: template.name,
          file: {
            name: template.file.name,
            type: template.file.type,
            dataUrl: `data:${template.file.type};base64,${base64String}`,
            lastModified: template.file.lastModified
          },
          placeholders: template.placeholders,
          type: template.type,
          createdAt: template.createdAt.toISOString()
        };
        
        // 添加到现有模板列表 - 不检查重复ID，直接添加
        existingTemplates.push(templateToSave);
        console.log('保存后的模板数量:', existingTemplates.length);
        
        // 将整个模板列表序列化并保存回本地存储
        const templatesJson = JSON.stringify(existingTemplates);
        console.log('序列化后的模板数据长度:', templatesJson.length);
        
        localStorage.setItem(TEMPLATE_STORAGE_KEY, templatesJson);
        console.log('模板已保存到本地存储');
        
        // 验证保存是否成功
        const verifyData = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        if (verifyData) {
          try {
            const parsed = JSON.parse(verifyData);
            console.log('验证: 已成功保存 ' + parsed.length + ' 个模板');
            resolve(); // 成功保存后解析Promise
          } catch (err) {
            console.error('验证: 保存的数据无法解析', err);
            reject(err); // 验证失败时拒绝Promise
          }
        } else {
          console.error('验证: 无法从localStorage获取保存的数据');
          reject(new Error('无法从localStorage获取保存的数据')); // 拒绝Promise
        }
      };
      
      fileReader.onerror = (error) => {
        console.error('读取文件失败:', error);
        reject(error); // 读取文件失败时拒绝Promise
      };
    } catch (error) {
      console.error('保存模板到本地存储失败:', error);
      reject(error); // 其他错误时拒绝Promise
    }
  });
};

export const getTemplatesFromStorage = (): Template[] => {
  try {
    console.log('开始获取模板列表');
    const templatesJson = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    
    if (!templatesJson) {
      console.log('localStorage中没有模板数据');
      return [];
    }
    
    console.log(`从localStorage获取了 ${templatesJson.length} 字节的模板数据`);
    
    try {
      const parsedTemplates = JSON.parse(templatesJson) as SerializedTemplate[];
      
      if (!Array.isArray(parsedTemplates)) {
        console.error('解析的模板不是数组格式，返回空数组');
        localStorage.removeItem(TEMPLATE_STORAGE_KEY); // 移除无效数据
        return [];
      }
      
      console.log('成功解析的模板数量:', parsedTemplates.length);
      
      // 将序列化的模板转换为实际的模板对象（包含File对象）
      const templates = parsedTemplates
        .map((template, index) => {
          try {
            console.log(`处理第 ${index+1}/${parsedTemplates.length} 个模板: ${template.name}`);
            
            // 基本数据验证
            if (!template.id || !template.name || !template.type) {
              console.error(`模板 #${index} 缺少基本属性`);
              return null;
            }
            
            // 创建File对象
            if (template.file && template.file.dataUrl) {
              // 从dataUrl提取MIME类型和base64数据
              const dataUrlRegex = /^data:(.+);base64,(.*)$/;
              const matches = template.file.dataUrl.match(dataUrlRegex);
              
              if (!matches) {
                console.error(`模板 ${template.name} 的数据URL格式无效`);
                return null;
              }
              
              const [_, mimeType, base64Data] = matches;
              
              if (!base64Data || base64Data.length === 0) {
                console.error(`模板 ${template.name} 的base64数据为空`);
                return null;
              }
              
              try {
                // 解码base64
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                
                if (bytes.length === 0) {
                  console.error(`模板 ${template.name} 解码后的二进制数据为空`);
                  return null;
                }
                
                // 创建Blob和File对象
                const blob = new Blob([bytes], { type: mimeType });
                
                if (blob.size === 0) {
                  console.error(`模板 ${template.name} 创建的Blob为空`);
                  return null;
                }
                
                const file = new File(
                  [blob], 
                  template.file.name, 
                  {
                    type: mimeType,
                    lastModified: template.file.lastModified || Date.now()
                  }
                );
                
                console.log(`成功为模板 ${template.name} 创建File对象，大小: ${file.size} 字节`);
                
                return {
                  id: template.id,
                  name: template.name,
                  file: file,
                  placeholders: template.placeholders || [],
                  type: template.type,
                  createdAt: new Date(template.createdAt)
                };
              } catch (decodeError) {
                console.error(`解码模板 ${template.name} 的base64数据失败:`, decodeError);
                return null;
              }
            } else {
              console.error(`模板 ${template.name} 缺少文件数据`);
              return null;
            }
          } catch (templateError) {
            console.error(`处理模板 #${index} 时出错:`, templateError);
            return null;
          }
        })
        .filter(Boolean) as Template[]; // 过滤掉null值
      
      console.log(`成功加载了 ${templates.length} 个模板`);
      return templates;
    } catch (parseError) {
      console.error('解析模板JSON数据失败:', parseError);
      localStorage.removeItem(TEMPLATE_STORAGE_KEY); // 移除无效数据
      return [];
    }
  } catch (error) {
    console.error('从localStorage获取模板失败:', error);
    return [];
  }
};

export const deleteTemplateFromStorage = (templateId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      console.log('开始从本地存储删除模板:', templateId);
      
      // 获取现有模板列表
      const templatesJson = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (!templatesJson) {
        console.log('localStorage中没有模板数据');
        resolve(); // 没有数据，视为删除成功
        return;
      }
      
      // 解析模板列表
      let templates: SerializedTemplate[];
      try {
        templates = JSON.parse(templatesJson);
        if (!Array.isArray(templates)) {
          console.error('解析的模板不是数组格式');
          localStorage.removeItem(TEMPLATE_STORAGE_KEY); // 移除无效数据
          resolve(); // 移除了无效数据，视为删除成功
          return;
        }
      } catch (err) {
        console.error('解析模板数据失败:', err);
        localStorage.removeItem(TEMPLATE_STORAGE_KEY); // 移除无效数据
        resolve(); // 移除了无效数据，视为删除成功
        return;
      }
      
      // 找到要删除的模板索引
      const templateIndex = templates.findIndex(t => t.id === templateId);
      if (templateIndex === -1) {
        console.log(`未找到ID为 ${templateId} 的模板`);
        resolve(); // 未找到要删除的模板，视为删除成功
        return;
      }
      
      // 从数组中删除模板
      templates.splice(templateIndex, 1);
      console.log(`已从内存中删除ID为 ${templateId} 的模板，剩余模板: ${templates.length}`);
      
      // 保存更新后的模板列表
      const updatedTemplatesJson = JSON.stringify(templates);
      localStorage.setItem(TEMPLATE_STORAGE_KEY, updatedTemplatesJson);
      console.log('已将更新后的模板列表保存到本地存储');
      
      resolve(); // 删除成功
    } catch (error) {
      console.error('从本地存储删除模板失败:', error);
      reject(error);
    }
  });
};

export const processTemplate = async (
  template: Template,
  record: Record<string, any>
): Promise<Blob> => {
  try {
    return await processTemplateFromFile(
      template.file,
      template.type,
      record,
      template.name
    );
  } catch (error) {
    console.error('处理模板失败:', error);
    throw error;
  }
};

export const downloadProcessedFile = async (
  template: Template,
  record: Record<string, any>
): Promise<void> => {
  try {
    const blob = await processTemplate(template, record);
    const fileName = generateFileName(template.name, template.type);
    downloadFile(blob, fileName);
  } catch (error) {
    console.error('下载处理后的文件失败:', error);
    throw error;
  }
}; 