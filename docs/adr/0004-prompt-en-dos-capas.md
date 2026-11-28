# 4. Prompt del agente en dos capas, editable por el hotel

**Estado:** aceptada · 27/11/2026

## Contexto
Cada hotel tiene que poder cambiar todo lo que dice su agente sin pedirnos nada, pero hay reglas que protegen al hotel y al huésped (no inventar precios, no pedir tarjetas, derivar emergencias, usar bien las herramientas) que no se pueden romper por un cambio de texto.

## Decisión
- **Capa base de CERGO** (`BASE_LAYER`, versionada con `BASE_LAYER_VERSION`): fija, va primero y declara que prevalece.
- **Capa del hotel** (`AgentConfig`): datos, saludo, estilo, habitaciones y tarifas en USD, temporada alta, políticas, preguntas frecuentes, horario de recepción, derivaciones e indicaciones avanzadas. Se edita en formularios, no en texto libre.
- Flujo: borrador → revisión automática (y con IA si está configurada) → prueba por voz en el navegador → publicación por el worker → historial con diferencias y "volver a esta versión".
- La misma función `compileAgent` arma el prompt en el servidor y en la vista previa del panel, así lo que el hotel ve es exactamente lo que recibe el agente.

## Consecuencias
El hotel es 100 % autónomo y CERGO conserva las garantías. Cambiar la capa base es un cambio de producto: se sube la versión y queda registrado en cada versión publicada.
