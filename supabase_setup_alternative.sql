-- 备选脚本，使用最简方法创建存储桶
-- 如果主要脚本报错，请使用此脚本

-- 创建存储桶
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('templates', 'templates', true),
  ('generated', 'generated', true)
ON CONFLICT (id) DO NOTHING;

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

-- 添加公共读取策略
DO $$ 
BEGIN
  BEGIN
    CREATE POLICY "Allow public read access" 
      ON public.templates
      FOR SELECT 
      USING (true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- 添加认证插入策略
DO $$ 
BEGIN
  BEGIN
    CREATE POLICY "Allow authenticated insert"
      ON public.templates
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- 添加认证删除策略
DO $$ 
BEGIN
  BEGIN
    CREATE POLICY "Allow authenticated delete"
      ON public.templates
      FOR DELETE
      TO authenticated
      USING (true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$; 