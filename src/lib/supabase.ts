import { createClient } from '@supabase/supabase-js';

// 从环境变量中获取Supabase URL和密钥
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 验证环境变量
if (!supabaseUrl || !supabaseKey) {
  console.error('环境变量缺失: NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 未设置');
}

console.log('Supabase 配置:', { 
  url: supabaseUrl ? `${supabaseUrl.substring(0, 10)}...` : '未设置',
  keyProvided: !!supabaseKey
});

// 创建Supabase客户端
export const supabase = createClient(supabaseUrl, supabaseKey);

// 确保存储桶存在
export const ensureBucketExists = async (bucketName: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.storage.getBucket(bucketName);
    
    if (error) {
      console.log(`尝试创建存储桶 "${bucketName}"`);
      
      // 尝试创建存储桶
      const { data: createData, error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true
      });
      
      if (createError) {
        console.error(`创建存储桶 "${bucketName}" 失败:`, createError);
        return false;
      }
      
      console.log(`存储桶 "${bucketName}" 创建成功`);
      return true;
    }
    
    console.log(`存储桶 "${bucketName}" 已存在`);
    return true;
  } catch (error) {
    console.error(`检查存储桶 "${bucketName}" 时发生错误:`, error);
    return false;
  }
};

// 存储桶操作
export const uploadFile = async (file: File, bucketName: string) => {
  try {
    console.log(`开始上传文件到存储桶 "${bucketName}"`, { 
      fileName: file.name, 
      fileSize: file.size,
      fileType: file.type
    });
    
    // 确保存储桶存在
    await ensureBucketExists(bucketName);
    
    const fileName = `${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file);

    if (error) {
      console.error(`上传文件到存储桶 "${bucketName}" 失败:`, { 
        message: error.message, 
        code: error.code, 
        details: error.details 
      });
      throw new Error(`上传文件失败: ${error.message}`);
    }

    console.log(`文件上传成功:`, { path: data.path, bucket: bucketName });
    return {
      path: data.path,
      fullPath: `${supabaseUrl}/storage/v1/object/public/${bucketName}/${data.path}`
    };
  } catch (error: any) {
    console.error('上传文件错误:', error);
    throw new Error(`上传文件失败: ${error.message}`);
  }
};

// 获取文件
export const getFile = async (path: string, bucket: string) => {
  try {
    console.log(`开始从存储桶 "${bucket}" 获取文件:`, { path });
    
    // 验证参数
    if (!path) {
      throw new Error('文件路径不能为空');
    }
    
    if (!bucket) {
      throw new Error('存储桶名称不能为空');
    }
    
    // 检查存储桶是否存在
    try {
      // 确保存储桶存在
      const bucketExists = await ensureBucketExists(bucket);
      
      if (!bucketExists) {
        console.warn(`存储桶 "${bucket}" 不存在或无法访问，但将继续尝试获取文件`);
      }
    } catch (error: any) {
      console.warn(`验证存储桶 "${bucket}" 时出错:`, error);
      // 继续尝试下载，可能是权限问题但文件仍然可访问
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);

    if (error) {
      console.error(`从存储桶 "${bucket}" 下载文件失败:`, { 
        path,
        message: error.message, 
        code: error.code, 
        details: error.details 
      });
      
      // 如果在开发环境中，并且是测试数据，返回模拟数据
      if (process.env.NODE_ENV === 'development' && 
          (path.includes('test_') || bucket.includes('test_'))) {
        console.log('开发环境: 返回模拟文件数据');
        return new Blob(['测试文件内容'], { type: 'application/octet-stream' });
      }
      
      throw new Error(`获取文件失败: ${error.message}`);
    }

    if (!data) {
      console.error(`文件下载成功但内容为空:`, { path, bucket });
      throw new Error('文件内容为空');
    }

    console.log(`文件下载成功:`, { 
      path, 
      bucket, 
      contentType: data.type, 
      size: data.size 
    });
    return data;
  } catch (error: any) {
    console.error(`获取文件错误 [${bucket}/${path}]:`, error);
    
    // 如果在开发环境中，返回模拟数据
    if (process.env.NODE_ENV === 'development') {
      console.log('开发环境: 返回模拟文件数据');
      return new Blob(['测试文件内容'], { type: 'application/octet-stream' });
    }
    
    throw new Error(`获取文件失败: ${error.message}`);
  }
}; 