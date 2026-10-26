# PR6 — preparación para integrar sin desplegar

Fecha: 2026-10-25, America/Mexico_City. Mandato de Arturo: preparar PR6,
verificar ausencia de despliegue por merge, incorporar aceptación H1.1 y revisar
técnicamente; mantener 39 flujos pendientes, sin merge ni producción.

## Referencias y cambio de esta ronda

- Repositorio único editable: donventas/dv-portal, rama codex/portal-h1-hardening.
- Base main inspeccionada: `3b0cd48b3dc6657881a40289f6fca8c477612b45`.
- Head de producto aceptado/revisado: `6f69bcf8b01504a1c7fa4884f30ae2ae8d3d4f12`;
  checkout limpio al empezar; PR6 abierto, borrador y sin conflictos.
- Diff acumulado previo: 9 commits, 133 archivos. Incluye H1.0, contratos SQL
  candidatos, Auth/invitaciones aislados, DEMO y apariencia H1.1.
- Esta ronda modifica documentación, vercel.json y una prueba de regresión.
  No cambia código de producto, SQL, dependencias ni configuración remota.
- [Aceptación de Arturo](../h11-appearance/ACCEPTANCE.md) incorporada al PR.
  El [backlog](../operational-backlog.md) mantiene sus 39 IDs pendientes; solo
  se aclara el subcriterio visual ya aceptado de UX-01/BRAND-01.

## Verificación de despliegue

El panel Vercel de `don-ventas/dv-portal` se inspeccionó en lectura:

- Repositorio conectado: donventas/dv-portal; rama productiva main.
- Producción existente: `ERiHajAUaPuSJmC3TSSHqnThSkVH`, commit `3b0cd48`,
  dominio app.donventas.mx. No se accionó Visit, Deploy, Rollback ni Save.
- Root Directory vacío (raíz del repositorio), framework Other y overrides
  de build/install/output desactivados; Ignored Build Step en Automatic.
- Git settings informa que no hay Deploy Hooks.
- GitHub: no webhooks de repositorio listados en Settings/Webhooks; la única
  GitHub App instalada que muestra el repositorio es Vercel. Se usó la sesión
  de navegador existente porque la CLI no tiene admin:repo_hook; no se amplió
  ningún permiso. No se auditó configuración organizacional fuera del repo.
- `.github/workflows/portal-ci.yml` solo instala dependencias de test y ejecuta
  verify:all; no incluye despliegue, SQL remoto ni un trigger repository_dispatch.

**Hallazgo corregido:** el head anterior solo bloqueaba la rama del PR. Ahora
vercel.json establece `main: false` y `codex/portal-h1-hardening: false` en
git.deploymentEnabled. La configuración viaja en el commit que se integraría.
La documentación oficial confirma que las ramas no especificadas se habilitan
por defecto y que una regla true coincidente puede prevalecer:
[Vercel Git Configuration](https://vercel.com/docs/project-configuration/git-configuration).
Una prueba de regresión exige el mapa exacto y evita que se agregue una regla
true que lo anule inadvertidamente. Las demás ramas conservan su comportamiento.

Conclusión acotada: la ruta automática Git → Vercel queda bloqueada para un
merge que conserve esta configuración en main. No se simula un merge real para
demostrarlo ni se afirma bloquear despliegues manuales por CLI/API o acciones
ajenas posteriores. Antes de un merge autorizado, volver a comprobar head/base
y conservar este archivo. Reactivar publicación requiere cambio y autorización
propios; el bloqueo no retira ni reemplaza la producción existente.

## Revisión técnica

Revisor independiente de solo lectura autorizado por Arturo: revisión del diff
base→head y seguimiento del parche local. Alcance: resolución de entorno,
admisión de capacidades, guardias, SQL/RLS/grants, Auth/PKCE/MFA, invitaciones,
secretos y servidores locales; inspección de tests y recibos de pruebas previas.

- Candidatos SQL permanecen en proposals, fuera de migrations. No hay aplicación
  automática ni nuevas capacidades admitidas por la configuración normal.
- Se conserva autorización por actor/cuenta, MFA administrativo, idempotencia,
  resultado uncertain sin reenvío automático y dispatcher local/sintético.
- Se mantienen aislamiento de la DEMO y ausencia de credenciales privilegiadas
  en el navegador; la apariencia no reescribe formularios ni identidad.
- La sospecha sobre member_role NULL fue descartada como hallazgo: el CHECK
  app_user_shape del esquema versionado impide tener cliente con cuenta y rol
  de miembro vacío. No se alteró SQL ni se afirmó cobertura nueva del esquema
  alojado; su reconciliación sigue en DB-01/IAM-02.
- El único bloqueante confirmado de esta revisión fue el bloqueo de main,
  corregido y revisado de nuevo. Sin otros bloqueantes confirmados dentro del
  alcance; dictamen favorable condicionado a verificaciones del commit final.
- GitHub informa main sin protección y sin reglas aplicables. No se cambiaron
  permisos ni reglas; revisión y CI deben comprobarse explícitamente al integrar.
  El revisor local no constituye una aprobación formal de GitHub.

## Validación y límites

Resultados locales de esta ronda: **257 pruebas Node** (226 unitarias y 31 de
integración), **19 pruebas de navegador** con Edge y verificadores paths/bundle/
secrets aprobados; git diff --check sin errores. Los 39 identificadores del
backlog se conservaron. La prueba nueva comprueba el bloqueo de despliegues.

La ejecución inicial de verify:all completó Node pero quedó detenida al iniciar
el servidor temporal de Playwright dentro del sandbox. Se terminaron únicamente
los procesos identificados de esa suite y se repitió test:browser con ejecución
local habilitada: 19/19 PASS en 36 segundos. Se volvieron a ejecutar los tres
verificadores con la documentación final. No se presenta la primera ejecución
interrumpida como un verify:all exitoso.

El CI previo del head aceptado está verde: ejecución 40243084096. El nuevo head
debe obtener su propia ejecución antes de declararse preparado para integración;
su resultado exacto se registra externamente como se indica al final.

No se repite laboratorio de BD/Auth, restauración, SMTP ni pruebas productivas:
no cambió ese código. Las evidencias previas conservan su alcance aislado.
Tampoco se amplía la certificación de accesibilidad/dispositivos.

## Control de integración y recuperación

PR permanece borrador; no auto-merge. LIVE conserva NO_GO. No se retiraron flujos
del backlog ni se inició H1.2. Merge, migración y publicación requieren decisiones
separadas. No se modificaron Runtime, Landing, servicios ni producción.

Si se corrige este paquete antes de integrar, hacerlo con otro commit revisado.
No revertir el bloqueo de despliegue como parte de una corrección documental.
Después de un futuro merge, cualquier rollback debe conservar main:false hasta
que exista autorización explícita de publicación. No hay cambio de BD que revertir.

Las observaciones del panel y logs de ejecución permanecen en el workspace
padre, evidence/portal-h11-final-review-20261025/; no contienen credenciales.
El hash final y el enlace del CI correspondiente se registran en la descripción
del PR y en el recibo de coordinación, evitando atribuir CI al commit padre.
