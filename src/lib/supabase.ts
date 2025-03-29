import { createClient } from '@supabase/supabase-js';

// 从环境变量获取Supabase URL和密钥
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 验证环境变量
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('缺少Supabase配置，请检查环境变量');
}

// 创建Supabase客户端
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

/**
 * 上传文件到指定的存储桶
 * @param bucket 存储桶名称
 * @param path 文件路径
 * @param file 要上传的文件
 * @returns 上传成功返回文件的公共URL，失败则抛出错误
 */
export const uploadFile = async (
  bucket: string,
  path: string,
  file: File | Blob
): Promise<string> => {
  try {
    // 将文件转换为arrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // 上传文件
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType: file instanceof File ? file.type : 'application/octet-stream',
        upsert: true
      });
    
    if (error) {
      throw error;
    }
    
    // 获取公共URL
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    
    return data.publicUrl;
  } catch (error) {
    console.error('上传文件失败:', error);
    throw error;
  }
};

/**
 * 从指定的存储桶下载文件
 * @param bucket 存储桶名称
 * @param path 文件路径
 * @returns 下载成功返回Blob对象，失败则抛出错误
 */
export const getFile = async (
  bucket: string,
  path: string
): Promise<Blob> => {
  try {
    // 下载文件
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);
    
    if (error) {
      throw error;
    }
    
    if (!data) {
      throw new Error('文件下载失败: 返回数据为空');
    }
    
    return data;
  } catch (error) {
    console.error('下载文件失败:', error);
    throw error;
  }
};

// 测试Supabase连接
export const testConnection = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.from('templates').select('count');
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Supabase连接测试失败:', error);
    return false;
  }
};

// 确保存储桶存在
export const ensureBucketExists = async (bucketName: string): Promise<boolean> => {
  // 假设存储桶已经存在，不进行检查和创建操作
  return true;
}; 