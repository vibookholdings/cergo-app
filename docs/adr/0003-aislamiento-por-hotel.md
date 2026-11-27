# 3. Aislamiento entre hoteles con Row Level Security

**Estado:** aceptada · 27/11/2026

## Contexto
Todos los hoteles comparten la misma base. Un error en un `where` no puede mostrar llamadas de un hotel a otro.

## Decisión
Doble barrera:
1. La API valida la membresía del usuario en el hotel de la URL (`/api/h/:hotelId`) y los permisos de su rol.
2. Las consultas del panel corren dentro de `withTenant(db, hotelId, fn)`: una transacción con `SET LOCAL ROLE cergo_app` y `app.hotel_id`. Las políticas `tenant_isolation` de PostgreSQL filtran cada tabla por ese hotel, aunque la consulta se olvide del filtro.

Los caminos sin hotel (login, worker, panel interno) usan el rol dueño de las tablas y siempre filtran explícitamente.

## Consecuencias
Un bug de aplicación no alcanza para filtrar datos entre hoteles. Los tests de `rls.test.ts` lo verifican contra PostgreSQL real en cada CI.
