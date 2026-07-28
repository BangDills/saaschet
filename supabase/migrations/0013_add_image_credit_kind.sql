-- Migration: Add 'image' to credit_usage_log check constraint

ALTER TABLE public.credit_usage_log
  DROP CONSTRAINT IF EXISTS credit_usage_log_kind_check;

ALTER TABLE public.credit_usage_log
  ADD CONSTRAINT credit_usage_log_kind_check
  CHECK (kind IN ('chat', 'agent', 'image'));
