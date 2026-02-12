# Layout Migrator — Instrucciones para Agentes

Este documento describe cómo ejecutar una **migración de prueba** para transferir plantillas entre cuentas de Prolibu.

---

## Resumen del Proyecto

El **Layout Migrator** es una herramienta CLI que:

1. Lee una plantilla (content template) desde una cuenta de Prolibu (origen)
2. La transforma al formato Document del Design Studio v2
3. La sube a otra cuenta de Prolibu (destino)

---

## Configuración de Cuentas

### Archivos de Configuración

Cada cuenta de Prolibu necesita un archivo `.{dominio}.env` en la raíz del proyecto.

**Ejemplo:** Para una cuenta llamada `micuenta`, crear el archivo `.micuenta.env`

### Formato del Archivo

```env
PROLIBU_API_URL=https://DOMINIO.prolibu.com
PROLIBU_AUTH_TOKEN=token_de_autenticacion_aqui
```

### Verificar Configuración Existente

Antes de ejecutar, verificar qué archivos `.env` existen:

```bash
ls -la .*.env
```

---

## Ejecutar Transfer entre Cuentas

### Método 1: Interactivo (Recomendado para pruebas)

```bash
pnpm run start
```

Luego seguir los prompts:

1. Seleccionar "Transfer from one account to another"
2. Elegir cuenta origen
3. Elegir cuenta destino
4. Ingresar el `contentTemplateCode` (ej: `main-layout`)
5. Confirmar con Y

### Método 2: Comando Directo

```bash
pnpm run start transfer --from ORIGEN --to DESTINO --id CODIGO_PLANTILLA
```

**Ejemplo:**

```bash
pnpm run start transfer --from cuenta-origen --to cuenta-destino --id main-layout
```

### Método 3: Dry Run (Solo Verificar)

Para probar sin crear nada en destino:

```bash
pnpm run start transfer --from cuenta-origen --to cuenta-destino --id main-layout --dry-run
```

---

## Parámetros Disponibles

| Parámetro         | Descripción            | Ejemplo                    |
| ----------------- | ---------------------- | -------------------------- |
| `--from`          | Cuenta origen          | `--from cuenta-origen`     |
| `--to`            | Cuenta destino         | `--to cuenta-destino`      |
| `--id`            | Código de la plantilla | `--id main-layout`         |
| `--dry-run`       | Solo validar, no subir | `--dry-run`                |
| `--save-json`     | Guardar JSON local     | `--save-json`              |
| `--name`          | Nombre personalizado   | `--name "Mi plantilla"`    |
| `--verbose`       | Mostrar detalles       | `--verbose`                |
| `--no-sync-fonts` | No sincronizar fuentes | `--no-sync-fonts`          |

---

## Ejemplos de Comandos Comunes

### Transferir con todas las opciones

```bash
pnpm run start transfer \
  --from cuenta-origen \
  --to cuenta-destino \
  --id main-layout \
  --name "Mi Layout Migrado" \
  --save-json \
  --verbose
```

### Verificar antes de ejecutar

```bash
pnpm run start transfer --from cuenta-origen --to cuenta-destino --id main-layout --dry-run --verbose
```

### Guardar JSON sin subir

```bash
pnpm run start migrate --domain cuenta-origen --id main-layout --json-only
```

---

## Flujo de Ejecución Esperado

```
🔄 Transferring contentTemplateCode: main-layout
   From: cuenta-origen (https://cuenta-origen.prolibu.com)
   To:   cuenta-destino (https://cuenta-destino.prolibu.com)

📊 Migration Stats:
   Pages: 5
   Total source nodes: 47
   Migrated nodes: 45
   ...

✅ Document validation: PASSED

📤 Uploading to cuenta-destino as new template...
✅ Created on cuenta-destino: Mi Plantilla [migrated YYYY-MM-DD]
   ID: 507f1f77bcf86cd799439011
   URL: https://cuenta-destino.prolibu.com/ui/spa/suite/contentTemplates/edit/507f1f77bcf86cd799439011
```

---

## Solución de Errores Comunes

### "No PROLIBU_AUTH_TOKEN found"

Verificar que exista el archivo `.{dominio}.env` con el token.

### "401 Unauthorized"

El token expiró. Obtener uno nuevo desde Prolibu (Network tab → header Authorization).

### "Template not found"

El `contentTemplateCode` no existe en la cuenta origen.

---

## Estructura del Proyecto

```
.
├── .{dominio}.env           # Config por cuenta (crear uno por cada cuenta)
├── .domain.env.example      # Plantilla de ejemplo
├── src/
│   ├── index.ts             # CLI principal
│   ├── cli/
│   │   └── interactive.ts   # Modo interactivo
│   ├── client/
│   │   └── prolibuClient.ts # Cliente API Prolibu
│   ├── config/
│   │   └── envLoader.ts     # Carga archivos .env
│   ├── pipeline/
│   │   └── migrationPipeline.ts # Orquestador
│   └── transformers/        # Transformadores de nodos
└── package.json
```

---

## Notas para el Agente

1. **Directorio de trabajo**: Ya estás en el directorio correcto del layoutMigrator
2. **Package manager**: Usar `pnpm` (no npm ni yarn)
3. **Verificar archivos .env**: Los tokens son sensibles, no mostrarlos
4. **Dry-run primero**: Siempre sugerir `--dry-run` para pruebas iniciales
5. **Logs**: El comando imprime progreso en tiempo real
