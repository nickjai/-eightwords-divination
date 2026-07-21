-- Run once in Supabase SQL Editor.
-- The app now creates the profile with an authenticated RLS-safe upsert.
drop trigger if exists on_auth_user_created on auth.users;
