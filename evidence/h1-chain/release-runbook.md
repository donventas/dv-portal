# H1 · preparación de despliegue, sin habilitación

Decisión actual: **NO_GO para LIVE**. Preparación local completada; publicar no
forma parte de la autorización actual. PR #6 permanece borrador.

## Entornos y reproducibilidad

Frontend: npm ci, npm test, npm run test:browser y verificadores paths/bundle/secrets.
Las pruebas de navegador usan Chromium instalado o H10_BROWSER_PATH apuntando al
Edge local. H11_CAPTURE_DIR agrega capturas de evidencia; no cambia aserciones.
DEMO: npm run demo:local, loopback 127.0.0.1:8011. Nunca subir esa inyección de
configuración de demostración a una configuración LIVE.

Postgres portable 17.11 en directorio temporal dv-portal-h10-2795554, puerto 55439,
base exacta portal_h10_disposable. rebuild-local.ps1 verifica data_directory antes
de reconstruir exclusivamente esa base, sin FORCE; exige el switch explícito.
La prueba usa bootstrap auth.uid sintético, esquema 01/02/04 y candidato fuera de
migrations. No carga el seed histórico 03. La prueba de concurrencia exige una base
recién reconstruida: run-h10-local.cjs --authorized-local-disposable --concurrency,
con H10_DISPOSABLE_DATABASE_URL/H10_PSQL_PATH privados. No repetir sobre un entorno
con trabajo ni copiar credenciales a comandos compartidos o al repositorio.

Ensayo de proveedor separado: máquina Podman dv-portal-h1, red interna
dv-portal-test y servicios ligados a loopback (55440 Postgres, 55441 Auth,
55442 PostgREST). avos-nl1-p1 no se modifica. GoTrue aplica sus migraciones reales;
el ensayo usa su auth.uid y JWT firmado. Imágenes fijadas:

| Componente | Versión | Digest SHA-256 |
|---|---|---|
| Postgres | 17.11 | 3518071376d0b6156b02e1db2747a78511b5b9dc3763cc79c506ebe2dc2ee71c |
| GoTrue | 2.197.0 | 1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b |
| PostgREST | 14.18 | c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf |

SDK navegador 2.118.0 fijado con SRI. Credenciales, env privados y dumps permanecen
fuera de Git. Bootstrap/provider-integration son instrumentos de prueba local,
no herramientas de aprovisionamiento productivo. No se prueba SMTP ni OAuth.

## Secuencia obligatoria antes de habilitar una BD alojada

1. Identificar proyecto/backend, dueño, destino y ventana autorizada. Inventariar
   en modo lectura esquema real, políticas, grants de tabla/columna, funciones,
   triggers, índices y extensiones, versiones, configuración Auth y datos heredados.
   Comparar con la base fijada. El esquema lead previo a 05/06 no está demostrado
   completo en este ensayo: no asumir cobertura de esas migraciones.
2. Capturar backup/PITR de ese destino y restaurarlo en aislamiento. Ensayar migración
   y rollback contra la copia completa, incluyendo datos históricos y constraints
   NOT VALID. Validar nombres existentes sin divulgar datos personales.
3. Aprobar el contrato y adaptar todos sus consumidores. La marca de contrato
   h10Commands sigue deshabilitada en la configuración normal. Resolver paginación
   de hydrate, aprovisionamiento de identidades/asignaciones y los cambios del
   esquema que revele el inventario. Completar H1.2 para persistir contexto/encargos
   reales: la DEMO H1.1 solo usa estado local.
4. Probar en sandbox alojado autorizado: usuarios/tenants/paquetes reales de prueba,
   JWT manipulado, revocación, concurrencia/replay, pérdida de red, multi-tab,
   refresh/logout, caducidad y restricciones de grants/RLS. Probar SMTP/OAuth y
   redirects configurados cuando formen parte del producto.
5. Actualizar y comprobar el runtime Node de desarrollo/CI actualmente fijado a 20
   antes del release productivo. El SDK nuevo se consume como UMD en navegador;
   no confundir sus requisitos de servidor con una prueba de Node soportado.
6. Aceptación humana del diseño/función, revisión técnica del diff final, CI verde,
   autorización de merge, autorización de migración y autorización de publicación.
   Preparar configuración allowlist/backend exacta; después observar smoke y rollback.

## Recuperación y control de publicación

Se restauró final.dump en portal_h10_restore_final con huella de bloques/recibos/audit
idéntica al origen. Se restauró baseline.dump en portal_h10_recovery_final y se
comprobó ausencia del contrato candidato. Hashes en restore-results.json. Son
ensayos sintéticos, no respaldo recuperable de producción.

Un rollback futuro requiere congelar escrituras, conservar evidencias posteriores,
evaluar reconciliación y restaurar el backup del destino autorizado en aislamiento
antes de cambiar tráfico. No revocar políticas o reabrir grants como atajo.

La integración existente Vercel intentó un preview con el primer push de H1.0 y
reportó fallo. vercel.json deshabilita deployments solo para codex/portal-h1-hardening;
verificar el efecto tras push. No ejecutar vercel deploy, migraciones remotas ni merge
por el hecho de tener el paquete listo. Otras ramas conservan su configuración.
