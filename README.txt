FINCORE v1.2.0 — INTERESES FLEXIBLES + ANALYTICS
=================================================
Tu control financiero — Planifica · Controla · Avanza

TECNOLOGÍA
- HTML + CSS + JavaScript puro.
- No necesita servidor, base de datos, PHP, Python, MySQL ni Access.
- No usa librerías externas ni CDN: funciona sin Internet.
- Los datos permanecen en memoria mientras la app está abierta y se guardan en un JSON privado del usuario.

CÓMO ABRIR
1. Descomprime el ZIP.
2. Abre index.html con Microsoft Edge o Chrome.
3. Elige “Nuevo usuario” o “Abrir JSON existente”.
4. Los archivos JSON creados con FinCore v1.0 y v1.1 siguen siendo compatibles.

GUARDADO
- “Guardar JSON” intenta actualizar el mismo archivo cuando el navegador y la PC permiten File System Access API.
- Si la PC corporativa no lo permite, se genera un JSON actualizado para descargar y abrir en la próxima sesión.
- “Exportar copia” crea un respaldo adicional.

MÓDULOS
- Dashboard Futuristic Fintech.
- Préstamos.
- Pagos: capital, capital + interés o solo intereses.
- Ingresos.
- Compromisos.
- Calendario.
- Acreedores e instituciones.
- Objetivos.
- Proyecciones.
- Centro de análisis / Reportes.
- Configuración.

NUEVO EN v1.2 — INTERESES FLEXIBLES
Cada préstamo puede definir:
- Tasa de interés en porcentaje.
- Periodicidad: diaria, quincenal, mensual o anual.
- Fecha hasta la que los intereses se consideran cubiertos.

Al registrar un pago puedes elegir:
- Capital / capital + interés.
- Solo intereses: el saldo de capital NO se reduce.
- “Usar interés de 1 período”: calcula saldo actual × tasa del período.
- “Usar interés acumulado estimado”: estima desde la última fecha de intereses cubiertos.
- El monto de interés siempre puede ajustarse manualmente antes de registrar el pago.

IMPORTANTE SOBRE EL CÁLCULO
- La tasa se interpreta según su periodicidad. Ejemplo: 5% mensual significa 5% del saldo por período mensual.
- El cálculo automático es una ayuda; FinCore permite modificar el interés manualmente para adaptarse al acuerdo real con cada acreedor.
- Al marcar “intereses cubiertos hasta la fecha de este pago”, FinCore guarda la nueva fecha de corte para el siguiente cálculo.
- Revertir el último pago que actualizó esa fecha restaura el corte anterior cuando corresponde.

CENTRO DE ANÁLISIS
En Reportes puedes combinar estos filtros:
- Desde / Hasta.
- Acreedor.
- Préstamo.
- Tipo de deuda.
- Estado: En mantenimiento, Sin mantenimiento, Pausado o Liquidado.

El Centro de análisis muestra:
- Saldo actual filtrado.
- Monto original.
- Total pagado durante el período.
- Capital amortizado.
- Intereses / cargos.
- Resumen por acreedor.
- Resumen por préstamo.
- Resumen mensual.
- Agrupación por tipo de deuda.
- Agrupación por estado.
- Pagos del período.
- Gráfico mensual de pagos vs. capital.
- Evolución de deuda filtrada.

ACCESOS RÁPIDOS
- En Préstamos, pulsa “Resumen” para abrir Reportes filtrado por ese préstamo.
- En Acreedores, pulsa “Resumen” para abrir Reportes filtrado por ese acreedor.
- “Limpiar filtros” vuelve al resumen general del año configurado.
- “Copiar resumen filtrado” copia un resumen textual al portapapeles cuando el navegador lo permite.

REGLAS IMPORTANTES
- Un préstamo puede estar “En mantenimiento” o “Sin mantenimiento”. Los que están sin mantenimiento siguen formando parte de la deuda total, pero no se programan en el calendario.
- Registrar capital reduce el saldo.
- Registrar solo intereses deja el saldo de capital igual.
- Revertir un pago devuelve al saldo únicamente el capital amortizado por ese pago.
- La primera quincena es configurable; la segunda se considera el último día de cada mes.
- La proyección anual utiliza ingresos, compromisos y pagos planificados recurrentes.

ARCHIVOS
index.html                App principal
styles.css                Estilo Futuristic Fintech
assets/fincore-logo.png   Logo oficial
js/app.js                 Lógica completa de FinCore
js/charts.js              Gráficos Canvas sin dependencias
FinCore_Demo.json         Archivo de ejemplo
README.txt                Esta guía

PRIVACIDAD
Cada persona puede tener su propio JSON independiente. FinCore no envía datos a Internet.

============================================================
PWA / ANDROID
============================================================
Esta edición incluye manifest.webmanifest, sw.js, iconos PWA y js/pwa.js.
Consulta PWA_ANDROID_LEEME.txt para instalarla en Android.
La app puede seguir usándose localmente en PC como antes; solo la instalación PWA requiere HTTPS.
