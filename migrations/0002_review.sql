-- Human review decision for photos that need a person to look. NULL means undecided.
ALTER TABLE photo_checks ADD COLUMN review_status TEXT CHECK (review_status IN ('approved', 'needs_new_photo'));
ALTER TABLE photo_checks ADD COLUMN reviewed_at TEXT;
