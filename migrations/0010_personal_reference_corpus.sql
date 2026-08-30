-- Reference documents are private to their uploader. Existing ownership is
-- preserved; legacy single-user documents remain with the system owner/admin.
UPDATE documents
SET visibility = 'personal', department_id = NULL
WHERE visibility <> 'personal' OR department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_personal_lookup_idx
  ON documents(workspace_id, owner_user_id, deleted_at, processing_status, created_at DESC);
