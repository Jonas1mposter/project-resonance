
CREATE TABLE public.phone_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for quick lookup
CREATE INDEX idx_phone_otps_phone_code ON public.phone_otps (phone, code);

-- Auto-cleanup old OTPs (keep last 24h only)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.phone_otps WHERE expires_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_cleanup_otps
AFTER INSERT ON public.phone_otps
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_expired_otps();

-- RLS: only edge functions (service role) access this table
ALTER TABLE public.phone_otps ENABLE ROW LEVEL SECURITY;
