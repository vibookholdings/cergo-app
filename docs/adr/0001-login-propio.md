# 1. Login propio en lugar de un servicio de autenticación

**Estado:** aceptada · 27/11/2026

## Contexto
El panel lo usan dueños y recepcionistas de hoteles. Necesitamos mail y contraseña, enlace mágico, invitaciones con rol, recuperación de clave, 2FA obligatorio para el equipo CERGO y sesiones revocables. La infraestructura es Railway + PostgreSQL y no queremos depender de un proveedor externo de identidad (ni de Supabase).

## Decisión
Autenticación propia en `@cergo/core/auth`, guardada en PostgreSQL:
- Contraseñas con `scrypt` (sal por usuario, comparación en tiempo constante).
- Sesión opaca: el navegador guarda un token aleatorio en la cookie `cergo_session` (HttpOnly, SameSite=Lax, Secure en producción) y la base guarda solo su SHA-256. Cerrar sesión o cambiar la clave la invalida en el momento.
- Enlaces de un solo uso (mágico 15 min, recuperación 1 h, invitación 7 días), también guardados como hash.
- TOTP con secreto cifrado (AES-GCM con `AUTH_SECRET`) y códigos de respaldo. Obligatorio para el staff de CERGO.
- CSRF: toda mutación exige el header `x-cergo-csrf`, que un formulario de otro sitio no puede mandar.
- Límite de intentos por IP y por mail.

## Consecuencias
Control total y cero costo por usuario. A cambio, mantenemos nosotros el código sensible: está cubierto por tests (`auth.test.ts`) y cualquier cambio en `auth/` pide revisión.
