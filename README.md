# 飞书多维表格文档生成器

这是一个基于NextJS和Supabase的飞书多维表格插件，用于根据预设的文档模板自动生成Word或Excel文档。

## 功能特点

- 支持上传Word(.docx)和Excel(.xlsx)模板文件
- 自动识别模板中的占位符
- 从飞书多维表格中获取记录数据
- 自动替换模板中的占位符为多维表格中的数据
- 将生成的文档保存到Supabase存储中
- 在多维表格中添加文档链接

## 技术栈

- 前端：NextJS, React, TailwindCSS
- 后端：NextJS API Routes
- 存储：Supabase Storage
- 数据库：Supabase Database
- 文档处理：docxtemplater, xlsx, docx

## 环境要求

- Node.js 14.x或更高版本
- npm 7.x或更高版本
- Supabase账号和项目

## 安装方法

1. 克隆仓库
```bash
git clone <repository-url>
cd lark-document-generator
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
复制`.env.local.template`文件为`.env.local`并填写Supabase配置：
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. 创建Supabase表和存储桶
在Supabase中创建以下资源：
   - 登录到Supabase管理控制台
   - 进入SQL编辑器，运行`supabase_setup.sql`脚本
   - 该脚本将创建：
     - 数据表：`templates`，包含字段：`id`, `name`, `file_url`, `file_type`, `placeholders`, `created_at`
     - 存储桶：`templates`，用于存储模板文件
     - 存储桶：`generated`，用于存储生成的文档
     - 所有必要的访问策略

5. 启动开发服务器
```bash
npm run dev
```

## 使用方法

1. 准备Word或Excel模板文件，在需要替换的地方使用`{字段名}`格式的占位符
2. 访问应用首页，上传模板文件
3. 在飞书多维表格中选择需要生成文档的记录
4. 选择一个模板，点击"生成文档"按钮
5. 生成的文档链接将自动添加到多维表格中的"文档链接"字段

## Supabase设置详情

项目需要以下Supabase资源：

1. **存储桶**:
   - `templates`: 存储上传的模板文件
   - `generated`: 存储生成的文档

2. **数据表**:
   - `templates`: 存储模板信息
     - `id`: UUID, 主键
     - `name`: TEXT, 模板名称
     - `file_url`: TEXT, 文件URL
     - `file_type`: TEXT, 文件类型(docx或xlsx)
     - `placeholders`: TEXT[], 占位符列表
     - `created_at`: TIMESTAMPTZ, 创建时间

所有这些资源都可以通过运行`supabase_setup.sql`脚本自动创建。

## 部署到生产环境

1. 构建项目
```bash
npm run build
```

2. 部署到你的托管服务，例如Vercel或Netlify

## 注意事项

- 在生产环境中，需要确保你的应用域名已被飞书多维表格信任
- "文档链接"字段需要在多维表格中预先创建
- Supabase的匿名密钥仅用于读取访问，敏感操作应使用后端API进行

## 许可证

MIT

## 作者

您的名字或组织名称

# Getting Started
- Hit run
- Edit [index.tsx](#pages/App/index.tsx) and watch it live update!

# Learn More

You can learn more in the [Base Extension Development Guide](https://lark-technologies.larksuite.com/docx/HvCbdSzXNowzMmxWgXsuB2Ngs7d) or [多维表格扩展脚本开发指南](https://feishu.feishu.cn/docx/U3wodO5eqome3uxFAC3cl0qanIe).

## Install packages

Install packages in Shell pane or search and add in Packages pane.
