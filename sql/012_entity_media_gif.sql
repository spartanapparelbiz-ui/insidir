-- Proxy statements print many director portraits as GIF; their original bytes are kept (entity_media) so a
-- later run can re-check them without refetching. The first constraint allowed only the prepared formats, so
-- every GIF original was refused and lived in one instance's memory. GIF and ICO match media.mjs MIME.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_media_mime_check' AND pg_get_constraintdef(oid) LIKE '%image/gif%'
  ) THEN
    ALTER TABLE entity_media DROP CONSTRAINT IF EXISTS entity_media_mime_check;
    ALTER TABLE entity_media ADD CONSTRAINT entity_media_mime_check
      CHECK (mime IN ('image/png','image/webp','image/jpeg','image/svg+xml','image/gif','image/x-icon'));
  END IF;
END $$;
