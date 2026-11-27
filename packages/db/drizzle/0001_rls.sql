-- Aislamiento entre hoteles con Row Level Security.
--
-- La app se conecta con el usuario dueño de las tablas (que no está sujeto a RLS) y, para todo
-- lo que es de un hotel, usa withTenant(): abre una transacción, hace SET LOCAL ROLE cergo_app y
-- fija app.hotel_id. Con ese rol PostgreSQL solo deja ver y tocar filas del hotel fijado, aunque
-- una consulta se olvide del "where hotel_id = ...". Sin hotel fijado, no ve nada.
--
-- REGLA para migraciones futuras: toda tabla nueva con datos de un hotel necesita su GRANT para
-- cergo_app, ENABLE ROW LEVEL SECURITY y la política tenant_isolation. Hay un test que lo verifica.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cergo_app') THEN
    CREATE ROLE cergo_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- El usuario de la conexión tiene que poder pasarse a cergo_app (si es superusuario, ya puede).
DO $$
BEGIN
  EXECUTE format('GRANT cergo_app TO %I', current_user);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'No se pudo otorgar cergo_app a %: %', current_user, SQLERRM;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_hotel_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.hotel_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO cergo_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_hotel_id() TO cergo_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cergo_app;
--> statement-breakpoint

-- Permisos por tabla (lo mínimo que usa el código dentro de withTenant).
GRANT SELECT, UPDATE ON organizations TO cergo_app;
--> statement-breakpoint
GRANT SELECT ON memberships, phone_lines TO cergo_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON agents TO cergo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_config_versions TO cergo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON calls, handoffs, bookings, daily_stats TO cergo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON call_messages TO cergo_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON handoff_comments, audit_log, jobs TO cergo_app;
--> statement-breakpoint
-- De los usuarios, solo lo necesario para mostrar nombres (nunca contraseñas ni 2FA).
GRANT SELECT (id, email, name) ON users TO cergo_app;
--> statement-breakpoint
-- sessions, auth_tokens y webhook_events no tienen ningún permiso para cergo_app.

-- Políticas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations TO cergo_app
  USING (id = app_hotel_id()) WITH CHECK (id = app_hotel_id());
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships TO cergo_app
  USING (organization_id = app_hotel_id()) WITH CHECK (organization_id = app_hotel_id());
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_log TO cergo_app
  USING (organization_id = app_hotel_id()) WITH CHECK (organization_id = app_hotel_id());
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY member_of_hotel ON users FOR SELECT TO cergo_app
  USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.organization_id = app_hotel_id()));
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'phone_lines', 'agents', 'agent_config_versions', 'calls', 'call_messages', 'handoffs',
    'handoff_comments', 'bookings', 'daily_stats', 'jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO cergo_app USING (hotel_id = app_hotel_id()) WITH CHECK (hotel_id = app_hotel_id())',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint
-- Tablas sin datos de hotel: RLS activo y sin políticas = cergo_app no ve nada.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Aviso al worker cuando hay trabajos nuevos (LISTEN cergo_jobs): así no depende solo del sondeo.
CREATE OR REPLACE FUNCTION notify_new_jobs() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM pg_notify('cergo_jobs', '');
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER jobs_notify AFTER INSERT ON jobs FOR EACH STATEMENT EXECUTE FUNCTION notify_new_jobs();
