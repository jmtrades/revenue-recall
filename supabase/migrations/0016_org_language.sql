-- The language a workspace sells in. The AI drafts email/SMS/call scripts in
-- this language and the voice synth speaks with a matching locale. Defaults to
-- English so existing orgs are unchanged.

alter table orgs add column if not exists language text not null default 'en';
