-- RLS jako pojistka (SPEC §9). Zápisy jdou přes server (Drizzle, vlastník tabulek RLS obchází).
-- authenticated: jen SELECT dle politik níže; anon: žádné politiky ani oprávnění.
-- Tabulky bez politik pro authenticated (RLS zapnuté => 0 řádků): customers, invitations, jobs,
-- stripe_events, invoice_sequences, audit_log, abandoned_checkouts.
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO authenticated;
--> statement-breakpoint
CREATE FUNCTION app.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
$$;
--> statement-breakpoint
CREATE FUNCTION app.is_org_member(org uuid, roles public.org_role[] DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = org
      AND (roles IS NULL OR m.role = ANY (roles))
  )
$$;
--> statement-breakpoint
-- door smí akci jen s přiřazením a platným členstvím (role door) v organizaci akce
CREATE FUNCTION app.is_door_for_event(event uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.door_assignments da
    JOIN public.events e ON e.id = da.event_id
    JOIN public.memberships m ON m.organization_id = e.organization_id AND m.user_id = da.user_id
    WHERE da.user_id = auth.uid()
      AND da.event_id = event
      AND m.role = 'door'
  )
$$;
--> statement-breakpoint
-- sdílí aktuální uživatel s `target` organizaci, kde je owner/staff? (definer kvůli rekurzi RLS na memberships)
CREATE FUNCTION app.shares_org_with(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships mine
    JOIN public.memberships theirs ON theirs.organization_id = mine.organization_id
    WHERE mine.user_id = auth.uid()
      AND mine.role IN ('owner', 'staff')
      AND theirs.user_id = target
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.is_platform_admin() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.is_platform_admin() TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.is_org_member(uuid, public.org_role[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.is_org_member(uuid, public.org_role[]) TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.is_door_for_event(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.is_door_for_event(uuid) TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.shares_org_with(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.shares_org_with(uuid) TO authenticated;
--> statement-breakpoint
CREATE POLICY "platform_admins_select" ON public.platform_admins FOR SELECT TO authenticated
USING (app.is_platform_admin() OR user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "users_select" ON public.users FOR SELECT TO authenticated
USING (app.is_platform_admin() OR id = auth.uid() OR app.shares_org_with(users.id));
--> statement-breakpoint
CREATE POLICY "organizations_select" ON public.organizations FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(organizations.id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "memberships_select" ON public.memberships FOR SELECT TO authenticated
USING (app.is_platform_admin() OR user_id = auth.uid() OR app.is_org_member(memberships.organization_id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "venues_select" ON public.venues FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(venues.organization_id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "events_select" ON public.events FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(events.organization_id, ARRAY['owner','staff']::public.org_role[]) OR app.is_door_for_event(events.id));
--> statement-breakpoint
CREATE POLICY "ticket_types_select" ON public.ticket_types FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(ticket_types.organization_id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "promo_codes_select" ON public.promo_codes FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(promo_codes.organization_id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(orders.organization_id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "refunds_select" ON public.refunds FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(refunds.organization_id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "settlements_select" ON public.settlements FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(settlements.organization_id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(invoices.organization_id, ARRAY['owner','staff']::public.org_role[]) OR app.is_org_member(invoices.recipient_organization_id, ARRAY['owner','staff']::public.org_role[]));
--> statement-breakpoint
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(tickets.organization_id, ARRAY['owner','staff']::public.org_role[]) OR app.is_door_for_event(tickets.event_id));
--> statement-breakpoint
CREATE POLICY "checkins_select" ON public.checkins FOR SELECT TO authenticated
USING (app.is_platform_admin() OR app.is_org_member(checkins.organization_id, ARRAY['owner','staff']::public.org_role[]) OR app.is_door_for_event(checkins.event_id));
--> statement-breakpoint
CREATE POLICY "price_waves_select" ON public.price_waves FOR SELECT TO authenticated
USING (app.is_platform_admin() OR EXISTS (SELECT 1 FROM public.ticket_types p WHERE p.id = price_waves.ticket_type_id AND app.is_org_member(p.organization_id, ARRAY['owner','staff']::public.org_role[])));
--> statement-breakpoint
CREATE POLICY "inventory_select" ON public.inventory FOR SELECT TO authenticated
USING (app.is_platform_admin() OR EXISTS (SELECT 1 FROM public.ticket_types p WHERE p.id = inventory.ticket_type_id AND app.is_org_member(p.organization_id, ARRAY['owner','staff']::public.org_role[])));
--> statement-breakpoint
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
USING (app.is_platform_admin() OR EXISTS (SELECT 1 FROM public.orders p WHERE p.id = order_items.order_id AND app.is_org_member(p.organization_id, ARRAY['owner','staff']::public.org_role[])));
--> statement-breakpoint
CREATE POLICY "ticket_transfers_select" ON public.ticket_transfers FOR SELECT TO authenticated
USING (app.is_platform_admin() OR EXISTS (SELECT 1 FROM public.tickets p WHERE p.id = ticket_transfers.ticket_id AND app.is_org_member(p.organization_id, ARRAY['owner','staff']::public.org_role[])));
--> statement-breakpoint
CREATE POLICY "reservations_select" ON public.reservations FOR SELECT TO authenticated
USING (app.is_platform_admin() OR EXISTS (SELECT 1 FROM public.events p WHERE p.id = reservations.event_id AND app.is_org_member(p.organization_id, ARRAY['owner','staff']::public.org_role[])));
--> statement-breakpoint
CREATE POLICY "invoice_lines_select" ON public.invoice_lines FOR SELECT TO authenticated
USING (app.is_platform_admin() OR EXISTS (SELECT 1 FROM public.invoices p WHERE p.id = invoice_lines.invoice_id AND (app.is_org_member(p.organization_id, ARRAY['owner','staff']::public.org_role[]) OR app.is_org_member(p.recipient_organization_id, ARRAY['owner','staff']::public.org_role[]))));
--> statement-breakpoint
CREATE POLICY "door_assignments_select" ON public.door_assignments FOR SELECT TO authenticated
USING (app.is_platform_admin() OR user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.events p WHERE p.id = door_assignments.event_id AND app.is_org_member(p.organization_id, ARRAY['owner','staff']::public.org_role[])));
--> statement-breakpoint
-- Oprávnění tabulek: authenticated jen SELECT na tabulky s politikou, anon nic.
-- (Supabase defaultně dává ALL; TRUNCATE by RLS obešel.) Budoucí tabulky dostanou default bez grantů.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
-- Budoucí objekty vytvořené vlastníkem (postgres) nesmí anon/authenticated dostat nic
-- (Supabase jim defaultně uděluje ALL na tabulky, funkce i sekvence). Každý typ objektu zvlášť.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
--> statement-breakpoint
-- Nové funkce mají v PostgreSQL EXECUTE pro PUBLIC (a tedy anon); to jde odebrat jen globálním defaultem.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON public.platform_admins, public.users, public.organizations, public.memberships, public.venues, public.events, public.ticket_types, public.promo_codes, public.orders, public.refunds, public.settlements, public.invoices, public.tickets, public.checkins, public.price_waves, public.inventory, public.order_items, public.ticket_transfers, public.reservations, public.invoice_lines, public.door_assignments TO authenticated;
--> statement-breakpoint
-- pojistka: každá tabulka v public musí mít zapnuté RLS
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Tabulky bez RLS: %', missing;
  END IF;
END
$$;
--> statement-breakpoint
-- pojistka: pg_default_acl pro schéma public nesmí dávat anon/authenticated žádná práva
DO $$
DECLARE leaked text;
BEGIN
  SELECT string_agg(d.defaclobjtype::text || ':' || a.grantee::regrole::text, ', ') INTO leaked
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE n.nspname = 'public'
    AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated'));
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'Default privileges v public dávají práva anon/authenticated: %', leaked;
  END IF;
END
$$;
