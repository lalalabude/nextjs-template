# Supabase 设置指南

本指南将帮助您在 Supabase 中设置所需的资源，包括存储桶和数据表。

## 设置步骤

1. **登录 Supabase 管理控制台**
   - 访问 https://app.supabase.com/ 并登录您的账户
   - 选择您的项目，或创建一个新项目

2. **运行设置脚本**
   - 在左侧菜单中点击 **SQL 编辑器**
   - 创建一个新的查询
   - 将 `supabase_setup.sql` 中的内容复制粘贴到编辑器中
   - 点击 **运行** 按钮执行脚本

3. **处理可能的错误**

   如果您遇到类似 `relation "storage.policies" does not exist` 的错误，请尝试以下方法：
   
   **方法一**：
   - 使用提供的备选脚本 `supabase_setup_alternative.sql` 
   - 将其内容复制到 SQL 编辑器中运行

   **方法二**：分步执行
   - 只执行创建存储桶的命令:
     ```sql
     INSERT INTO storage.buckets (id, name, public)
     VALUES 
       ('templates', 'templates', true),
       ('generated', 'generated', true)
     ON CONFLICT (id) DO NOTHING;
     ```
   
   - 然后执行创建表的命令:
     ```sql
     CREATE TABLE IF NOT EXISTS public.templates (
       id UUID PRIMARY KEY,
       name TEXT NOT NULL,
       file_url TEXT NOT NULL,
       file_type TEXT NOT NULL CHECK (file_type IN ('docx', 'xlsx')),
       placeholders TEXT[] DEFAULT '{}',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );
     ```

   - 最后设置 RLS 策略:
     ```sql
     ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
     
     CREATE POLICY "Allow public read access" 
       ON public.templates
       FOR SELECT 
       USING (true);
     
     CREATE POLICY "Allow authenticated insert"
       ON public.templates
       FOR INSERT
       TO authenticated
       WITH CHECK (true);
     
     CREATE POLICY "Allow authenticated delete"
       ON public.templates
       FOR DELETE
       TO authenticated
       USING (true);
     ```

4. **手动设置存储桶权限**
   
   如果存储桶策略无法通过 SQL 创建，可以通过 UI 手动设置：
   - 在左侧菜单中点击 **存储**
   - 查看已创建的 `templates` 和 `generated` 存储桶
   - 对于每个存储桶:
     - 点击存储桶名称进入详情页
     - 在顶部选项卡中点击 **策略**
     - 点击 **创建新策略**
     - 选择 **所有人可以读取，仅认证用户可以上传和删除**
     - 保存策略

5. **验证设置**
   
   设置完成后，请验证以下资源是否已正确创建：
   - 在 **存储** 中应该有 `templates` 和 `generated` 两个存储桶
   - 在 **表编辑器** 中应该有 `templates` 表
   - `templates` 表应该有以下字段：
     - `id` (UUID, 主键)
     - `name` (TEXT)
     - `file_url` (TEXT)
     - `file_type` (TEXT)
     - `placeholders` (TEXT[])
     - `created_at` (TIMESTAMPTZ)

## 故障排除

如果在设置过程中遇到问题，请尝试以下方法：

1. **存储桶策略**
   
   不同版本的 Supabase 可能有不同的存储桶权限设置方式。如果通过 SQL 设置失败，请使用 UI 界面手动设置。

2. **表名冲突**
   
   如果表已存在，可以使用 `DROP TABLE IF EXISTS public.templates;` 先删除它，然后再创建。

3. **权限问题**
   
   确保您有足够的权限执行这些操作。您应该使用项目的 Owner 账户或具有管理员权限的账户登录。

## 后续步骤

成功设置 Supabase 资源后，您需要:

1. 更新项目中的 `.env.local` 文件，添加正确的 Supabase URL 和匿名密钥
2. 启动您的 Next.js 应用进行测试 