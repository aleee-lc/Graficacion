-- Ensure the Supabase Storage bucket used by technique evidences exists.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets relation not found; skipping bucket migration';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
  VALUES (
    'technique-evidences',
    'technique-evidences',
    false,
    26214400,
    ARRAY[
      'audio/*',
      'image/*',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]::text[]
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
END $$;
