ALTER TABLE documents ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN document_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE documents ADD COLUMN usage_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE documents ADD COLUMN topic_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE documents ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE documents ADD COLUMN vector_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE documents ADD COLUMN content_hash TEXT;
ALTER TABLE documents ADD COLUMN updated_at TEXT;

UPDATE documents
SET document_type = CASE
  WHEN doc_type IN ('work_report', 'situation_report', 'implementation_plan', 'research_report', 'speech', 'policy') THEN doc_type
  ELSE 'other'
END,
usage_tags = CASE library_type
  WHEN 'fact' THEN '["facts"]'
  WHEN 'policy' THEN '["policy"]'
  WHEN 'case' THEN '["case"]'
  WHEN 'template' THEN '["structure","format"]'
  ELSE '["structure","wording"]'
END,
vector_status = CASE WHEN vector_data IS NOT NULL AND length(vector_data) > 2 THEN 'ready' ELSE 'pending' END,
updated_at = created_at;

CREATE INDEX IF NOT EXISTS documents_document_type_idx ON documents(document_type);
CREATE INDEX IF NOT EXISTS documents_processing_status_idx ON documents(processing_status);
CREATE UNIQUE INDEX IF NOT EXISTS documents_content_hash_idx ON documents(content_hash) WHERE content_hash IS NOT NULL;
