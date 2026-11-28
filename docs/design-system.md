# CERGO: sistema de diseño

Colores, tipografías y componentes sacados de la web actual (holacergo.com, archivo fuente `presentacion/web/index.html`, 27/11/2026). El panel del hotel y cualquier pieza nueva usan estos valores para que todo se vea como una sola marca.

**En una frase:** fondo crema cálido, verde bosque como color de marca, verde lima como acento, títulos con serif editorial (Instrument Serif) y texto con una sans moderna (Manrope). Sobrio y cálido, como un hotel boutique, sin estética de software genérico.

---

## 1. Colores

### Base

| Token | Hex | Uso |
| --- | --- | --- |
| `--bg` | `#F7F5EF` | Fondo general de la página (crema) |
| `--bg-deep` | `#EFECE3` | Fondo de secciones alternas, chips suaves, pestaña activa |
| `--surface` | `#FFFFFF` | Tarjetas, paneles, inputs |
| `--surface-soft` | `#FBFAF6` | Barras de encabezado de tarjetas, bloques de resumen |
| `--ink` | `#202720` | Texto principal |
| `--muted` | `#575F57` | Texto secundario, párrafos de apoyo |
| `--soft` | `#7A8179` | Etiquetas, horarios, texto terciario |
| `--placeholder` | `#9A9F98` | Placeholder de inputs |
| `--line` | `#E2DED2` | Bordes y divisores |
| `--line-strong` | `#CFCABB` | Bordes de inputs, botones fantasma, divisores marcados |
| `--line-hover` | `#B7B1A0` | Borde de input en hover |

### Marca

| Token | Hex | Uso |
| --- | --- | --- |
| `--brand` | `#234638` | Verde bosque. Botón principal, links, íconos, acentos en títulos, foco |
| `--brand-deep` | `#1B382C` | Hover del botón principal, footer |
| `--brand-ink` | `#F7F5EF` | Texto sobre verde de marca |
| `--brand-muted` | `#C3CFC6` | Texto secundario sobre fondo verde |
| `--lime` | `#DCE9A8` | Acento lima. Píldoras de éxito, botón lima, íconos sobre verde, selección |
| `--lime-hover` | `#CFE08F` | Hover del botón lima |
| `--lime-ink` | `#2C3A12` | Texto sobre lima |

### Estados

| Token | Hex | Uso |
| --- | --- | --- |
| `--warn-bg` | `#F6E7D6` | Fondo de píldora de atención (ej. "Derivada", "Pendiente") |
| `--warn-ink` | `#7A4A16` | Texto de atención |
| `--error` | `#A1361F` | Bordes y mensajes de error |
| `--error-bg` | `#F8E5DF` | Fondo de alerta de error |
| `--error-ink` | `#7C2915` | Texto de alerta de error |
| Éxito | `--lime` / `--lime-ink` | Confirmado, resuelto, reservado |
| Info / marca | `rgba(35,70,56,.10)` / `--brand` | Píldora neutra de marca (ej. "En vivo") |

### Transparencias de marca

- Hover de navegación: `rgba(35,70,56,.06)`
- Fondo de píldora de marca: `rgba(35,70,56,.08)` a `.10`
- Anillo de foco de input: `0 0 0 3px rgba(35,70,56,.16)`
- Fila seleccionada: `rgba(220,233,168,.32)` (lima translúcido) con barra izquierda de 3px en `--brand`

### Reglas de uso

- El verde `--brand` es el único color de acción. No hay azul.
- El lima es acento, nunca fondo grande ni color de texto sobre crema (no tiene contraste).
- Sobre fondo verde: texto `--brand-ink`, secundario `--brand-muted`, acentos `--lime`.
- La web hoy es solo modo claro (`color-scheme: light`). Para el panel, el modo oscuro queda para más adelante; si se hace, partir de `--brand-deep` como fondo.

---

## 2. Tipografía

Fuentes de Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
```

| Token | Familia | Uso |
| --- | --- | --- |
| `--f-serif` | "Instrument Serif", "Iowan Old Style", "Palatino Linotype", Georgia, serif | Títulos H1 y H2, números grandes, títulos de tarjetas destacadas |
| `--f-sans` | "Manrope", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif | Todo lo demás: texto, H3, botones, formularios, tablas |

### Escala

| Estilo | Fuente | Tamaño | Peso / detalles |
| --- | --- | --- | --- |
| H1 | Serif | `clamp(3rem, 1.9rem + 4.6vw, 5.75rem)` | 400, line-height 1.02, letter-spacing -.01em |
| H2 | Serif | `clamp(2.25rem, 1.6rem + 2.6vw, 3.6rem)` | 400, line-height 1.02 |
| Título de tarjeta (serif) | Serif | `clamp(1.6rem, 1.35rem + .8vw, 2rem)` | 400, line-height 1.1 |
| H3 | Sans | 1.12rem | 700, line-height 1.3 |
| Cuerpo | Sans | 17px | 400, line-height 1.6 |
| Lede (bajada) | Sans | `clamp(1.06rem, 1rem + .3vw, 1.2rem)` | color `--muted`, máx. 58ch |
| Texto chico | Sans | .9rem a .95rem | — |
| Eyebrow / etiqueta | Sans | .72rem a .78rem | 700, MAYÚSCULAS, letter-spacing .08em a .14em |
| Números grandes | Serif | 2.6rem a 3rem | color `--brand`, `font-variant-numeric: tabular-nums` |

### Reglas

- Palabras destacadas dentro de H1/H2 van en *itálica* serif y color `--brand` (sobre fondo verde, `--lime`).
- Horarios, montos y métricas con `tabular-nums` para que alineen.
- Títulos con `text-wrap: balance`.

### Para el panel

En pantallas de trabajo (tablas, filtros, formularios) usar casi siempre Manrope. La serif queda para el título de cada página, los números grandes de las tarjetas de métricas y estados vacíos.

---

## 3. Espaciado, radios y sombras

| Token | Valor | Uso |
| --- | --- | --- |
| `--r-sm` | 8px | Chips, links de navegación |
| (botón / input) | 12px (10px en botón chico) | Botones e inputs |
| `--r-md` | 14px | Tarjetas chicas, burbujas de chat |
| `--r-lg` | 20px | Tarjetas grandes, paneles, formularios |
| Píldora | 999px | Badges de estado |
| `--shadow` | `0 1px 2px rgba(32,39,32,.04), 0 12px 32px -18px rgba(32,39,32,.18)` | Única sombra para tarjetas elevadas |
| `--container` | 1200px | Ancho máximo de contenido |
| `--gutter` | `clamp(16px, 4vw, 32px)` | Margen lateral |
| `--header-h` | 68px | Alto del encabezado fijo |
| Separación interna | 8 / 12 / 16 / 20 / 24 / 32px | Múltiplos de 4 |

Bordes de 1px en `--line` para tarjetas y divisores; 1.5px en `--line-strong` para inputs y botones fantasma.

---

## 4. Componentes

### Botones

| Variante | Fondo | Texto | Borde | Hover |
| --- | --- | --- | --- | --- |
| Primario | `--brand` | `--brand-ink` | — | `--brand-deep` |
| Fantasma | transparente | `--ink` | 1.5px `--line-strong` | borde `--ink` |
| Lima | `--lime` | `--lime-ink` | — | `#CFE08F` |

- Alto 52px (chico: 42px), padding horizontal 24px (chico: 16px), radio 12px (chico: 10px).
- Manrope 600, 1rem. Ícono de 18px con 10px de separación.
- Activo: `translateY(1px)`. Deshabilitado / cargando: opacidad .7 y spinner.

### Inputs

- Alto 52px, padding 0 15px, radio 12px, borde 1.5px `--line-strong`, fondo `--surface`.
- Hover: borde `#B7B1A0`. Foco: borde `--brand` + anillo `rgba(35,70,56,.16)`.
- Error: borde `--error`, mensaje debajo en `--error`, .86rem, 600.
- Label: 700, .92rem; "(opcional)" en 500 y `--soft`.

### Píldoras de estado

Radio 999px, padding 3px 10px, .8rem, 700.

| Clase | Fondo | Texto | Ejemplo en el panel |
| --- | --- | --- | --- |
| `pill-lime` | `--lime` | `--lime-ink` | Reserva confirmada, pendiente resuelto |
| `pill-warn` | `--warn-bg` | `--warn-ink` | Derivada a recepción, pendiente abierto |
| `pill-soft` | `--bg-deep` | `--muted` | Consulta, cerrada, neutro |
| `pill-brand` | `rgba(35,70,56,.1)` | `--brand` | En vivo, cotizada |

### Tarjetas y paneles

- Fondo `--surface`, borde 1px `--line`, radio `--r-lg`, `--shadow`, `overflow: hidden`.
- Encabezado de tarjeta: padding 14px 18px, fondo `#FBFAF6`, divisor inferior 1px `--line`.
- Pestañas dentro de la tarjeta: .8rem, 600, `--soft`; activa con fondo `--bg-deep` y texto `--ink`.

### Lista de llamadas (ya diseñada en la web)

- Fila: grilla `44px | 1fr`, padding 13px 16px, divisor `--line`.
- Hora en `tabular-nums`, `--soft`, .8rem, 600. Nombre en 700. Motivo en `--muted`, .84rem.
- Seleccionada: fondo lima translúcido + barra izquierda de 3px en `--brand`.
- Detalle: etiquetas en MAYÚSCULAS .72rem `--soft`; bloque "Próximo paso" con fondo `--bg`, borde `--line`, radio 12px e ícono verde.

### Transcripción (chat)

- Agente: fondo `--bg`, borde `--line`, radio 14px con esquina superior izquierda de 4px; etiqueta en `--brand`.
- Huésped: fondo `--brand`, texto `--brand-ink`, alineado a la derecha, esquina superior derecha de 4px.
- Etiqueta de quién habla: .72rem, 700, MAYÚSCULAS, `--soft`.

### Íconos

- Trazo, sin relleno: `stroke: currentColor`, `stroke-width: 1.6`, puntas y uniones redondeadas, 22px (20px en botones y listas, 16px en campos).
- Color por defecto `--brand`. Estilo compatible con Lucide, que conviene usar en el panel.
- Contenedor de ícono: 44px, radio 12px, fondo `--surface` o `--bg-deep`, borde `--line`.

### Encabezado y navegación

- Encabezado fijo de 68px, fondo `--bg`; al hacer scroll, `rgba(247,245,239,.94)` con borde inferior `--line`.
- Links: .95rem, 500, `--muted`; hover `--ink` con fondo `rgba(35,70,56,.06)`, radio 8px.

### Footer y bloques destacados

- Bloque destacado (CTA): fondo `--brand`, títulos `--brand-ink`, itálicas y eyebrow en `--lime`.
- Footer: fondo `--brand-deep`, texto `--brand-muted`, links `--brand-ink`. Logo en negativo (símbolo lima sobre verde).

---

## 5. Logo

Archivos en `presentacion/marca/`:

- `cergo-logo.svg`: símbolo + palabra, para fondo claro. Símbolo: cuadrado verde `#234638` de radio 13 con una "C" y tres barras de onda de voz en lima `#DCE9A8`; palabra en `#202720`.
- `cergo-logo-negativo.svg`: para fondo verde.
- `cergo-simbolo.svg` / `cergo-simbolo-negativo.svg` / `cergo-simbolo-512.png`: solo el símbolo (favicon, avatar, app).
- En la web el logo mide 36px de alto en el encabezado y 40px en el footer.

---

## 6. Movimiento y accesibilidad

- Transiciones de .2s en colores y bordes; apariciones de .6s (opacidad + 14px de desplazamiento) solo si el usuario no pidió reducir movimiento.
- Con `prefers-reduced-motion: reduce` se apagan todas las animaciones.
- Foco visible siempre: contorno 2px `--brand`, separación 3px, radio 6px (sobre verde, en `--lime`).
- Áreas táctiles de al menos 42–44px.
- Contraste: `--ink` y `--muted` sobre `--bg` cumplen AA; `--soft` solo para texto chico secundario, nunca para información crítica.

---

## 7. Variables CSS listas para copiar

```css
:root{
  --bg:#F7F5EF;
  --bg-deep:#EFECE3;
  --surface:#FFFFFF;
  --surface-soft:#FBFAF6;
  --ink:#202720;
  --muted:#575F57;
  --soft:#7A8179;
  --line:#E2DED2;
  --line-strong:#CFCABB;
  --brand:#234638;
  --brand-deep:#1B382C;
  --brand-ink:#F7F5EF;
  --brand-muted:#C3CFC6;
  --lime:#DCE9A8;
  --lime-ink:#2C3A12;
  --warn-bg:#F6E7D6;
  --warn-ink:#7A4A16;
  --error:#A1361F;
  --error-bg:#F8E5DF;
  --error-ink:#7C2915;
  --f-serif:"Instrument Serif", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --f-sans:"Manrope", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --r-sm:8px;
  --r-md:14px;
  --r-lg:20px;
  --shadow:0 1px 2px rgba(32,39,32,.04), 0 12px 32px -18px rgba(32,39,32,.18);
}
```

### Equivalente para Tailwind (panel)

```js
// tailwind.config: theme.extend
colors: {
  bg: { DEFAULT: '#F7F5EF', deep: '#EFECE3' },
  surface: { DEFAULT: '#FFFFFF', soft: '#FBFAF6' },
  ink: { DEFAULT: '#202720', muted: '#575F57', soft: '#7A8179' },
  line: { DEFAULT: '#E2DED2', strong: '#CFCABB' },
  brand: { DEFAULT: '#234638', deep: '#1B382C', ink: '#F7F5EF', muted: '#C3CFC6' },
  lime: { DEFAULT: '#DCE9A8', hover: '#CFE08F', ink: '#2C3A12' },
  warn: { bg: '#F6E7D6', ink: '#7A4A16' },
  error: { DEFAULT: '#A1361F', bg: '#F8E5DF', ink: '#7C2915' },
},
fontFamily: {
  serif: ['"Instrument Serif"', '"Iowan Old Style"', '"Palatino Linotype"', 'Georgia', 'serif'],
  sans: ['Manrope', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
},
borderRadius: { sm: '8px', md: '14px', lg: '20px', btn: '12px' },
boxShadow: { card: '0 1px 2px rgba(32,39,32,.04), 0 12px 32px -18px rgba(32,39,32,.18)' },
```

Los componentes de shadcn/ui del panel se configuran con estas variables (primario = `--brand`, acento = `--lime`, radio base 12px), así quedan iguales a la web sin rediseñarlos.

---

## Gráficos del panel

Paleta categórica validada (separación para daltonismo y contraste) sobre superficie blanca. El orden es fijo y el color sigue a la serie, nunca al ranking.

| Rol | Token | Color | Uso |
|---|---|---|---|
| Serie 1 | `--color-series-1` | `#28805A` | Resueltas por el agente |
| Serie 2 | `--color-series-2` | `#7A6FD0` | Derivadas a recepción |
| Serie 3 | `--color-series-3` | `#D4782F` | Sin resolver |
| Pista | `--color-series-1-track` | `#DCEFE5` | Fondo de medidores |
| Grilla | `--color-grid` | `#ECE9DF` | Líneas de referencia |
| Eje | `--color-axis` | `#CFCABB` | Línea base |

Reglas: columnas de hasta 24 px con la punta redondeada (4 px) y la base recta, 2 px de aire entre segmentos apilados, leyenda cuando hay dos series o más, tooltip al pasar el mouse o con el teclado, y siempre una tabla con los mismos datos ("Ver tabla"). Los números grandes van en Instrument Serif. Los textos usan las tintas de texto, nunca el color de la serie. El panel es solo modo claro, como la marca.
