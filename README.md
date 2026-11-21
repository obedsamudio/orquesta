# orquesta

Panel animado en vivo dentro de Claude Code (app de escritorio, pestaña Code) que muestra al agente principal y a cada subagente: modelo, tarea, acción en vivo, cronómetro, tokens y árbol de agentes. Si alguno falla, aparece una tarjeta roja. Suena un sonido al empezar y otro al terminar, y al final ves un resumen. Verlo **no gasta tokens**: solo dibuja eventos que Claude ya produce.

## Requisitos

- App de escritorio de Claude Code
- Mods/plugins activados

## Instalar

### Opción A: comandos

En la terminal:

```
# Un solo comando (Claude Code reciente):
claude plugin install orquesta --marketplace TU_USUARIO/orquesta --scope user

# O en dos pasos:
claude plugin marketplace add TU_USUARIO/orquesta
claude plugin install orquesta@orquesta --scope user
```

O dentro del chat de Claude Code:

```
/plugin marketplace add TU_USUARIO/orquesta
/plugin install orquesta@orquesta
/reload-plugins
```

Abre el panel con:

```
/orquesta
```

### Opción B: pídeselo a Claude

Pega esto en Claude Code:

```
Instala el plugin de este repositorio: https://github.com/TU_USUARIO/orquesta y ábrelo
```

### Opción C: hazlo tú desde cero

Pega este prompt en Claude Code:

```
Créame un mod para Claude Code: un panel al lado del chat que muestre en vivo y con animaciones al agente principal y a cada subagente que lance, con su modelo, su tarea, lo que está haciendo, su tiempo y sus tokens. Agrega un resumen al final, sonidos al empezar y terminar, y tarjetas rojas si alguno falla. Que quede instalado para todas mis sesiones.
```

## Probarlo

Escribe en el chat:

```
investiga este tema usando 3 subagentes
```

## Desinstalar

```
claude plugin uninstall orquesta@orquesta
```

## Problemas comunes

- **El panel se ve muy chico:** ensánchalo arrastrando su borde.
- **No suena nada:** el sonido solo funciona en macOS (usa `afplay`).

---

Hecho con Claude Code · @osdevstudio
