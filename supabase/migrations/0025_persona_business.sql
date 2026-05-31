-- Persist what the business actually does — its offer and who it serves —
-- captured at onboarding from the user's own description. This feeds every AI
-- message (drafts, replies, call prep) so output is grounded in THIS specific
-- business, not just the industry template. Essential for businesses outside the
-- built-in verticals (the "generic" industry): it's what lets the product tailor
-- to literally any business or person, solo to enterprise.
alter table public.personas add column if not exists business text;
