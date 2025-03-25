-- 创建存储桶
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES 
  ('templates', 'templates', true, false),
  ('generated', 'generated', true, false)
ON CONFLICT (id) DO NOTHING;

-- 创建存储桶的公共访问策略
-- 注意：新版本的Supabase使用RLS而不是storage.policies
-- 为templates存储桶创建公共访问策略
CREATE POLICY "Templates Public Access"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'templates');

-- 为generated存储桶创建公共访问策略
CREATE POLICY "Generated Public Access"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'generated');

-- 创建templates表
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('docx', 'xlsx')),
  placeholders TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 为templates表添加RLS策略
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- 添加模板表的访问策略
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