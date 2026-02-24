# Layout Migrator CLI

Herramienta de línea de comandos para migrar plantillas de contenido de Prolibu v1 al formato Design Studio v2.

## 📋 Tabla de Contenidos

- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Modos de Uso](#modos-de-uso)
  - [Modo Interactivo](#modo-interactivo)
  - [Migrar en la Misma Cuenta](#comando-migrate)
  - [Transferir Entre Cuentas](#comando-transfer)
  - [Migración Masiva](#comando-migrate-all)
- [Opciones Disponibles](#opciones-disponibles)
- [Ejemplos de Uso](#ejemplos-de-uso)
- [Solución de Problemas](#solución-de-problemas)

---

## Requisitos Previos

- **Node.js** versión 20.0.0 o superior
- **pnpm** como gestor de paquetes
- Token de autenticación de Prolibu (API token)

## Instalación

```bash
# Desde el directorio raíz del proyecto
pnpm install

# Compilar el CLI
pnpm --filter layout-migrator build
```

### Ejecutar el CLI

Hay varias formas de ejecutar el CLI:

```bash
# Opción 1: Usando pnpm (desarrollo)
pnpm --filter layout-migrator start

# Opción 2: Ejecutar el binario compilado directamente
node apps/layoutMigrator/dist/index.cjs

# Opción 3: Desde el directorio del proyecto
cd apps/layoutMigrator
node dist/index.cjs

# Opción 4: Usando tsx (desarrollo sin compilar)
cd apps/layoutMigrator
pnpm start
```

### Instalación global (opcional)

Para usar el comando `layout-migrator` desde cualquier lugar:

```bash
# Desde el directorio apps/layoutMigrator
cd apps/layoutMigrator
pnpm link --global

# Ahora puedes usar:
layout-migrator --help
layout-migrator migrate --domain miempresa --id main-layout
layout-migrator transfer --from origen --to destino --id main-layout
layout-migrator migrate-all --from origen --to destino
```

Para desinstalar el link global:

```bash
pnpm unlink --global layout-migrator
```

---

## Configuración

### Archivos de Entorno (.env)

El CLI utiliza archivos `.{dominio}.env` para almacenar las credenciales de cada cuenta Prolibu. Esto evita tener que pasar tokens por línea de comandos.

#### Crear un archivo de configuración

1. Copia el archivo de ejemplo:
   ```bash
   cp .domain.env.example .midominio.env
   ```

2. Edita el archivo con tus credenciales:
   ```env
   # .midominio.env
   PROLIBU_API_URL=https://midominio.prolibu.com
   PROLIBU_AUTH_TOKEN=tu-token-de-autenticación-aquí
   ```

#### Ejemplos de nombres de archivo

| Dominio        | Archivo .env          |
|----------------|----------------------|
| miempresa      | `.miempresa.env`     |
| demo           | `.demo.env`          |
| dev            | `.dev.env`           |
| staging        | `.stg.env`           |

#### Variable opcional: MIGRATION_IDS

Para migraciones masivas de IDs específicos, puedes definirlos en el archivo .env:

```env
PROLIBU_API_URL=https://midominio.prolibu.com
PROLIBU_AUTH_TOKEN=tu-token-aquí

# IDs para migrate-all (separados por coma)
MIGRATION_IDS=template-1, template-2, main-layout
```

---

## Modos de Uso

> **Nota sobre los comandos:** En los ejemplos usamos `pnpm --filter layout-migrator start`, pero puedes reemplazarlo por:
> - `layout-migrator` (si instalaste globalmente)
> - `node dist/index.cjs` (desde el directorio layoutMigrator)

### Modo Interactivo

La forma más sencilla de usar el CLI. No requiere memorizar opciones.

```bash
# Usando pnpm
pnpm --filter layout-migrator start

# Usando el binario global
layout-migrator

# Usando node directamente
node apps/layoutMigrator/dist/index.cjs
```

#### Flujo interactivo paso a paso

```
🚀 Layout Migrator — Modo Interactivo

¿Qué deseas hacer?
❯ Migrar dentro de la misma cuenta
  Transferir de una cuenta a otra
  Transferir TODOS los templates de una cuenta a otra
```

Selecciona con las flechas ↑/↓ y presiona Enter.

El asistente te guiará preguntando:
1. **Dominio origen** - selecciona de la lista o ingresa manualmente
2. **Dominio destino** - solo si eliges transferir
3. **Código del template** - el `contentTemplateCode` a migrar
4. **Opciones adicionales** - tipo, modo prueba, etc.

```
  ─────────────────────────────
  Origen:      cuenta-origen
  Destino:     cuenta-destino
  Código:      main-layout
  Nombre:      <original> [migrated 2026-02-24]
  ─────────────────────────────

¿Continuar? (S/n)
```

---

### Comando `migrate`

Migra un template dentro de la **misma cuenta**. Crea una copia con el sufijo `[migrated]`.

```bash
# Usando pnpm
pnpm --filter layout-migrator start migrate --domain miempresa --id main-layout

# Usando el binario global
layout-migrator migrate --domain miempresa --id main-layout

# Usando node directamente (desde el directorio layoutMigrator)
node dist/index.cjs migrate --domain miempresa --id main-layout
```

#### Opciones específicas

| Opción | Descripción | Valor por defecto |
|--------|-------------|-------------------|
| `--id <código>` | contentTemplateCode del template | `main-layout` |
| `--domain <dominio>` | Carga config de `.{dominio}.env` | — |
| `--api-url <url>` | URL base de la API (sobrescribe .env) | — |
| `--token <token>` | Token de autenticación (sobrescribe .env) | — |
| `--name <nombre>` | Nombre para el nuevo template | `<original> [migrated]` |
| `--type <tipo>` | Tipo: `layout`, `content`, `snippet` | `layout` |
| `--save-json [ruta]` | Guardar JSON localmente | — |
| `--json-only` | Solo guardar JSON, NO subir a Prolibu | `false` |
| `--dry-run` | Validar sin subir ni escribir archivos | `false` |
| `--no-sync-fonts` | Deshabilitar sincronización de fuentes | — |
| `--verbose` | Mostrar advertencias y estadísticas | `false` |

#### Ejemplos

```bash
# Migrar con nombre personalizado
pnpm --filter layout-migrator start migrate \
  --domain miempresa \
  --id propuesta-2024 \
  --name "Propuesta Nueva v2"

# Solo validar (dry run)
pnpm --filter layout-migrator start migrate \
  --domain demo \
  --id main-layout \
  --dry-run \
  --verbose

# Guardar JSON localmente sin subir
pnpm --filter layout-migrator start migrate \
  --domain dev \
  --id template-demo \
  --json-only \
  --save-json ./backups/

# Usando URL y token directamente (sin archivo .env)
pnpm --filter layout-migrator start migrate \
  --api-url https://miempresa.prolibu.com \
  --token abc123def456... \
  --id main-layout
```

---

### Comando `transfer`

Migra un template **de una cuenta a otra**. Útil para mover plantillas entre entornos o clientes.

```bash
# Usando pnpm
pnpm --filter layout-migrator start transfer \
  --from origen \
  --to destino \
  --id main-layout

# Usando el binario global
layout-migrator transfer --from origen --to destino --id main-layout

# Usando node directamente
node dist/index.cjs transfer --from origen --to destino --id main-layout
```

#### Opciones específicas

| Opción | Descripción | Valor por defecto |
|--------|-------------|-------------------|
| `--id <código>` | contentTemplateCode del template origen | `main-layout` |
| `--from <dominio>` | **Requerido.** Dominio origen | — |
| `--to <dominio>` | **Requerido.** Dominio destino | — |
| `--name <nombre>` | Nombre para el nuevo template | `<original> [migrated]` |
| `--type <tipo>` | Tipo: `layout`, `content`, `snippet` | `layout` |
| `--save-json [ruta]` | Guardar JSON localmente | — |
| `--dry-run` | Validar sin subir | `false` |
| `--no-sync-fonts` | Deshabilitar sincronización de fuentes | — |
| `--verbose` | Mostrar advertencias detalladas | `false` |

#### Ejemplos

```bash
# Transferir de desarrollo a producción
pnpm --filter layout-migrator start transfer \
  --from dev \
  --to produccion \
  --id template-aprobado

# Transferir y guardar backup JSON
pnpm --filter layout-migrator start transfer \
  --from staging \
  --to destino \
  --id propuesta-base \
  --save-json ./output/transfer-backup.json

# Validar transferencia sin ejecutar
pnpm --filter layout-migrator start transfer \
  --from origen \
  --to destino \
  --id main-layout \
  --dry-run \
  --verbose
```

---

### Comando `migrate-all`

Migra **TODOS** los templates de una cuenta a otra en lote. Utiliza lógica de **upsert** (crear si no existe, actualizar si ya existe).

```bash
# Usando pnpm
pnpm --filter layout-migrator start migrate-all \
  --from origen \
  --to destino

# Usando el binario global
layout-migrator migrate-all --from origen --to destino

# Usando node directamente
node dist/index.cjs migrate-all --from origen --to destino
```

#### Opciones específicas

| Opción | Descripción | Valor por defecto |
|--------|-------------|-------------------|
| `--from <dominio>` | **Requerido.** Dominio origen | — |
| `--to <dominio>` | **Requerido.** Dominio destino | — |
| `--type <tipo>` | Filtrar por tipo: `all`, `layout`, `content`, `snippet` | `all` |
| `--concurrency <n>` | Número de migraciones en paralelo | `5` |
| `--ids <códigos>` | IDs específicos separados por coma | — |
| `--keep-original-name` | Mantener nombre original (sin sufijo `-migrated`) | `false` |
| `--hide-old` | Inhabilitar templates viejos en origen después de migrar | `false` |
| `--dry-run` | Mostrar qué se migraría sin hacer cambios | `false` |
| `--verbose` | Mostrar progreso detallado | `false` |

#### Ejemplos

```bash
# Migrar todos los layouts de una cuenta a otra
pnpm --filter layout-migrator start migrate-all \
  --from origen \
  --to destino \
  --type layout

# Migrar IDs específicos
pnpm --filter layout-migrator start migrate-all \
  --from dev \
  --to produccion \
  --ids "template-1, template-2, main-layout"

# Migrar manteniendo nombres originales (sobrescribe si existe)
pnpm --filter layout-migrator start migrate-all \
  --from staging \
  --to produccion \
  --keep-original-name

# Preview: ver qué se migraría (dry run)
pnpm --filter layout-migrator start migrate-all \
  --from origen \
  --to destino \
  --dry-run \
  --verbose

# Migrar y ocultar los originales
pnpm --filter layout-migrator start migrate-all \
  --from dev \
  --to staging \
  --hide-old

# Alta concurrencia para migraciones grandes
pnpm --filter layout-migrator start migrate-all \
  --from origen \
  --to destino \
  --concurrency 10
```

#### Flujo de `migrate-all` en modo interactivo

```
🚀 Layout Migrator — Modo Interactivo

¿Qué deseas hacer?
  Migrar dentro de la misma cuenta
  Transferir de una cuenta a otra
❯ Transferir TODOS los templates de una cuenta a otra

Dominio origen: cuenta-origen
Dominio destino: cuenta-destino

¿Qué tipos de templates migrar?
❯ Todos los tipos
  Solo layouts
  Solo contenido
  Solo snippets

¿Qué templates migrar?
❯ Todos los templates
  Solo IDs específicos

¿Mantener nombre original? (sin sufijos "-migrated")
(S/n): n

¿Inhabilitar templates viejos en origen después de migrar?
(S/n): n

¿Ejecutar primero en modo prueba?
(S/n): S

  ─────────────────────────────
  Origen:       cuenta-origen
  Destino:      cuenta-destino
  Tipo:         all
  IDs:          Todos
  Nombre orig:  No (con sufijo)
  Inhabilitar:  No
  Modo prueba:  Sí
  ─────────────────────────────

¿Continuar? (S/n)
```

---

## Opciones Disponibles

### Opciones Globales

| Opción | Descripción |
|--------|-------------|
| `--help`, `-h` | Muestra la ayuda del comando |
| `--version`, `-V` | Muestra la versión del CLI |

### Sincronización de Fuentes

Por defecto, el CLI sincroniza automáticamente las fuentes del template origen al destino. Esto asegura que las fuentes personalizadas estén disponibles.

Para deshabilitar:
```bash
pnpm --filter layout-migrator start migrate --no-sync-fonts ...
```

### Modo Dry Run

El modo `--dry-run` es útil para:
- Verificar que las credenciales son correctas
- Ver estadísticas de la migración
- Validar el template antes de subir
- En `migrate-all`: ver cuántos templates se crearían/actualizarían

```bash
# Ver estadísticas sin hacer cambios
pnpm --filter layout-migrator start migrate-all \
  --from origen \
  --to destino \
  --dry-run

# Salida:
# 📥 Fetching templates from source (origen)...
#    Found 15 templates
# 📥 Fetching existing templates from destination (destino)...
#    Found 3 existing templates in destination
#
# 🔍 Dry run — showing what would be migrated:
#
# 📊 Summary:
#    Would CREATE: 12
#    Would UPDATE: 3
#    Total: 15
```

---

## Ejemplos de Uso

### Escenario 1: Primera migración a nueva cuenta

```bash
# 1. Crear archivo de credenciales para origen
echo "PROLIBU_API_URL=https://viejo.prolibu.com
PROLIBU_AUTH_TOKEN=token-viejo" > .viejo.env

# 2. Crear archivo de credenciales para destino
echo "PROLIBU_API_URL=https://nuevo.prolibu.com
PROLIBU_AUTH_TOKEN=token-nuevo" > .nuevo.env

# 3. Preview de la migración
pnpm --filter layout-migrator start migrate-all \
  --from viejo \
  --to nuevo \
  --dry-run

# 4. Ejecutar migración real
pnpm --filter layout-migrator start migrate-all \
  --from viejo \
  --to nuevo
```

### Escenario 2: Actualizar templates específicos

```bash
# Definir IDs en el archivo .env
echo "PROLIBU_API_URL=https://origen.prolibu.com
PROLIBU_AUTH_TOKEN=mi-token
MIGRATION_IDS=propuesta-2024, cotizacion-base, factura-v2" > .origen.env

# Migrar solo esos IDs manteniendo nombres originales
pnpm --filter layout-migrator start migrate-all \
  --from origen \
  --to destino \
  --keep-original-name
```

### Escenario 3: Backup local antes de migrar

```bash
# Guardar JSON localmente primero
pnpm --filter layout-migrator start migrate \
  --domain micliente \
  --id template-importante \
  --json-only \
  --save-json ./backups/antes-de-migrar.json

# Revisar el JSON si es necesario
# ...

# Subir la versión migrada
pnpm --filter layout-migrator start migrate \
  --domain micliente \
  --id template-importante
```

### Escenario 4: Migrar y limpiar cuenta origen

```bash
# Migrar todo y ocultar los originales
pnpm --filter layout-migrator start migrate-all \
  --from cuenta-vieja \
  --to cuenta-nueva \
  --hide-old \
  --verbose
```

---

## Solución de Problemas

### Error: "No PROLIBU_AUTH_TOKEN found"

```
❌ Source: No PROLIBU_AUTH_TOKEN found in .midominio.env
```

**Solución:** Verifica que el archivo `.midominio.env` existe y contiene `PROLIBU_AUTH_TOKEN`.

### Error: "API URL required"

```
❌ API URL required. Use --domain <name>, --api-url <url>, or set PROLIBU_API_URL env var.
```

**Solución:** Asegúrate de especificar `--domain` o que el archivo .env tenga `PROLIBU_API_URL`.

### Error: "Document validation: FAILED"

```
❌ Document validation: FAILED
   Error: Invalid page structure at /pages/0
```

**Solución:** El template origen tiene una estructura no soportada. Usa `--verbose` para ver detalles y reporta el caso.

### Template no se encuentra

```
⚠️  IDs no encontrados: template-xyz
```

**Solución:** Verifica que el `contentTemplateCode` sea correcto. Puedes buscar el ID en la URL de edición del template en Prolibu.

### Timeout en migraciones masivas

Si la migración se interrumpe o es muy lenta:

```bash
# Reducir concurrencia
pnpm --filter layout-migrator start migrate-all \
  --from origen \
  --to destino \
  --concurrency 2
```

### Validar conectividad

```bash
# Probar conexión con dry-run
pnpm --filter layout-migrator start migrate \
  --domain midominio \
  --id cualquier-template \
  --dry-run
```

---

## Estructura del Proyecto

```
apps/layoutMigrator/
├── .{dominio}.env      # Archivos de configuración por dominio
├── src/
│   ├── index.ts        # Entry point y comandos CLI
│   ├── cli/
│   │   ├── interactive.ts   # Flujo interactivo
│   │   └── prompts.ts       # Utilidades de prompts
│   ├── client/
│   │   └── prolibuClient.ts # Cliente HTTP para Prolibu API
│   ├── config/
│   │   └── envLoader.ts     # Carga de archivos .env
│   ├── pipeline/
│   │   └── migrationPipeline.ts # Pipeline de migración
│   ├── transformers/        # Transformadores de nodos
│   └── converters/          # Conversores de formatos
├── output/              # JSON generados (--save-json)
└── package.json
```

---

## Licencia

Propiedad de Prolibu. Uso interno.
