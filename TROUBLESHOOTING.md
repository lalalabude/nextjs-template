# 故障排除指南

本指南帮助解决在使用飞书多维表格文档生成器时可能遇到的常见问题。

## 问题：上传模板失败 - unsupported Unicode escape sequence

### 原因分析
这个错误通常发生在二进制文件如 `.docx` 或 `.xlsx` 文件被当作文本处理时。当系统尝试解析文件内容中的占位符时，遇到了无法作为文本解析的字符序列。

### 解决方案
我们已经修改了模板上传的代码，暂时跳过占位符提取步骤，这应该可以解决问题。以下是更新后系统的处理流程：

1. 上传文件到 Supabase 存储桶
2. 创建模板记录，暂时不提取占位符
3. 后续在生成文档时再根据需要解析占位符

### 手动修复步骤
如果您仍然遇到这个问题，可以尝试：

1. 确保上传的文件是有效的 `.docx` 或 `.xlsx` 格式
2. 如果模板中有复杂的格式或嵌入对象，尝试使用更简单的文档格式
3. 检查控制台日志中的详细错误信息

## 问题：存储桶中有文件但页面显示"暂无模板"

### 原因分析
这个问题可能由以下几个原因导致：

1. 文件已上传到存储桶，但相应的记录未成功插入到 `templates` 表中
2. 前端通过API获取模板列表失败
3. 数据格式不匹配，导致前端组件无法正确渲染

### 解决方案
我们已经对代码做了以下改进：

1. 添加了详细的日志记录，帮助诊断问题
2. 改进了数据验证和错误处理
3. 在前端添加了调试信息显示
4. 修复了可能的数据格式不一致问题

### 手动修复步骤

#### 1. 检查Supabase表和存储桶
首先确认两者是否都正确创建和配置：

```sql
-- 检查templates表是否存在记录
SELECT * FROM templates ORDER BY created_at DESC LIMIT 10;

-- 检查存储桶访问权限
SELECT * FROM storage.buckets WHERE name = 'templates';
```

#### 2. 检查浏览器控制台错误
打开浏览器开发者工具(F12)查看控制台日志和网络请求，寻找API错误或CORS问题。

#### 3. 手动创建测试记录
如果数据库表中确实没有记录，可以尝试手动插入一条测试记录：

```sql
INSERT INTO templates (
  id, 
  name, 
  file_url, 
  file_type, 
  placeholders, 
  created_at
)
VALUES (
  gen_random_uuid(), 
  '测试模板', 
  'https://your-project.supabase.co/storage/v1/object/public/templates/test.docx', 
  'docx', 
  '{}', 
  now()
);
```

#### 4. 验证环境变量
确保 `.env.local` 文件中的Supabase URL和匿名密钥正确配置：

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

#### 5. 重新启动开发服务器
有时简单地重启开发服务器可以解决一些暂时性问题：

```bash
npm run dev
```

## 其他常见问题

### Supabase存储桶权限问题
如果上传文件失败，可能是由于存储桶权限配置问题。确保在Supabase控制台中为`templates`和`generated`存储桶设置了正确的访问策略：

1. 登录Supabase管理控制台
2. 进入"存储" > 选择存储桶 > "策略"
3. 添加允许公共读取和认证用户上传的策略

### RLS策略问题
如果无法获取模板列表，可能是由于行级安全(RLS)策略阻止了查询。检查`templates`表的RLS策略是否正确配置：

```sql
-- 检查是否启用了RLS
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'templates';

-- 查看现有策略
SELECT * FROM pg_policies WHERE tablename = 'templates';
```

### 数据库连接问题
如果持续遇到数据库连接问题，可能是由于Supabase限制或网络问题。尝试：

1. 检查Supabase项目的状态页面
2. 使用Supabase的API健康检查端点验证连接
3. 确认网络没有阻止到Supabase的连接

## 联系支持
如果您尝试了上述所有方法仍然无法解决问题，请联系项目维护者并提供以下信息：

1. 详细的错误信息
2. 控制台日志截图
3. 重现问题的步骤
4. 浏览器和操作系统信息 