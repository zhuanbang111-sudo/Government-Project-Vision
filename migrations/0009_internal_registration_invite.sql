ALTER TABLE invitations ADD COLUMN public_display INTEGER NOT NULL DEFAULT 0 CHECK (public_display IN (0, 1));
ALTER TABLE invitations ADD COLUMN public_code TEXT;
ALTER TABLE invitations ADD COLUMN public_label TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS invitations_public_code_unique_idx
  ON invitations(public_code) WHERE public_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS invitations_public_active_idx
  ON invitations(public_display, status, expires_at, created_at DESC);
