-- ════════════════════════════════════════════════════════════════════
-- 0006 · The server's clock, and only the server's
--
-- Devices pull "everything with an `updated_at` after the newest row I have
-- already seen". That is only safe if `updated_at` comes from one clock.
--
-- It did not. `0001` set it to `greatest(<time the device sent>, now())`,
-- which guards against a device sending a time in the past and does nothing
-- about one sending a time in the future. A single phone with a fast clock
-- therefore wrote rows stamped ahead of real time. Every other device that
-- pulled one of those rows moved its mark into the future too — and from then
-- on skipped every row anybody else wrote until real time caught up. Those
-- rows were never pulled at all. Nothing errored; data was simply missing on
-- some devices and not others.
--
-- From here the column is the server's time at the moment of the write,
-- whatever the device says. Which edit *wins* a conflict is still decided on
-- the device, from the timestamp inside the record itself; this column only
-- decides what gets fetched, and for that one clock is the whole requirement.
--
-- `clock_timestamp()` rather than `now()`: `now()` is fixed for a transaction,
-- and every row in a multi-row write should not share one instant.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

/*
 * Bring any row already stamped in the future back to the present.
 *
 * Touching them also makes every device pull them again, which is what a
 * device that never received them needs. A device whose own mark was already
 * pushed into the future still will not see rows written before it catches
 * up — States & sync → "Pull everything again" clears that.
 */
update public.records
set updated_at = clock_timestamp()
where updated_at > now();
