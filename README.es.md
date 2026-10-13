# Lore + Kin

*[Read in English](README.md)*

**Lore** es un formato de archivos abierto y local para el contexto de la vida de una persona: una
carpeta de archivos Markdown con frontmatter YAML que pueden leer tanto las personas como los
modelos de lenguaje.

**Kin** es la primera app construida sobre Lore. Es una skill para
[Google AI Edge Gallery](https://github.com/google-ai-edge/gallery), la app que ejecuta modelos
Gemma en el teléfono, y te ayuda a recordar a la gente de tu vida: cumpleaños, ideas de regalo,
promesas, cosas que preguntar y con quién hace tiempo que no hablas. No hace ninguna petición de
red y nada de lo que le cuentas sale del teléfono.

## Por qué local

Lo que sabes de la gente cercana es de lo más personal que tienes, y casi todo trata de personas
que nunca aceptaron estar en una base de datos. Su sitio es tu teléfono, no un servidor.

- **El modelo funciona en el teléfono.** Gemma se ejecuta dentro de la app Gallery. Kin le pasa
  solo lo que necesita la pregunta del momento y quita las notas sensibles salvo que las pidas.
- **Kin no se conecta a nada.** Sus páginas llevan una Content-Security-Policy que bloquea
  cualquier conexión, y la CI falla si aparece en la skill una API de red o un script externo.
- **Archivos normales que son tuyos.** Kin guarda una carpeta Lore: Markdown que puedes exportar,
  leer con cualquier editor de texto y llevar a otra app. El formato es una
  [especificación](spec/SPEC.md) abierta, no una base de datos privada.
- **Sin cuenta, sin suscripción, sin servidor que pueda cerrar.** GitHub Pages aloja el código de
  Kin, pero nunca tus datos.

## Probar Kin en un iPhone

1. Instala **Google AI Edge Gallery** desde la App Store.
2. En la app, descarga **Gemma 4 E4B**. E2B es más pequeño y rápido, pero se equivoca más al elegir
   la acción.
3. Abre **Agent Skills**, toca el chip **Skills**, luego **+** → **Load skill from URL**, y pega:

   ```
   https://quantumbboy.github.io/lore/skills/kin
   ```

4. Comprueba que `kin` está activada, abre un chat nuevo y habla con normalidad. No hay botón: el
   modelo llama a Kin cuando tu mensaje trata de una persona.

Kin contesta en español o en inglés, según en qué idioma escribas. La misma app existe para
Android y Kin debería funcionar igual, pero solo se ha probado en iPhone.

## Demo de 30 segundos

Escribe esto en un chat nuevo. Las respuestas en cursiva son lo que devuelve Kin; el modelo las
cuenta con sus palabras.

1. `Ayer Marta me dijo que quiere aprender cerámica`
   → *No conozco a nadie llamado "Marta". ¿Añado a "Marta" como persona nueva?* → `sí`
   → *He añadido a Marta. Guardado en Marta (ideas de regalo): Quiere aprender cerámica*
2. `El cumpleaños de Marta es el 12 de abril`
   → *Guardado el cumpleaños de Marta: 12 abr.*
3. `Le presté a Marta mi libro de Dune`
4. `Mañana veo a Marta, ¿algo pendiente?`
   → *Antes de ver a Marta: Prestado (sin devolver): Le presté mi libro de Dune*
5. `¿Qué le regalo a Marta? Unos 40 euros`
   → Kin devuelve las ideas guardadas y los regalos anteriores, y el modelo propone tres regalos a
   partir de ellos.
6. `¿Qué cumpleaños tengo en los próximos 12 meses?`
   → *Marta: cumpleaños en 181 días (12 abr)*

Kin también guarda planes, tallas, restricciones alimentarias y cosas que preguntarle a alguien.
Puedes decir cada cuánto quieres hablar con alguien y preguntar con quién vas atrasado. Di `copia
de seguridad` para guardar o recuperar todo.

## Limitaciones

Kin es un prototipo que funciona. Antes de fiarte de él, ten en cuenta esto:

- **Tus datos están en un solo sitio.** Kin los guarda en el almacenamiento web de la app Gallery
  en tu teléfono. Si borras la app o sus datos de sitios web, se borran, e iOS puede vaciar ese
  almacenamiento si el teléfono se queda sin espacio. Kin te recuerda hacer copia cada 30 días o
  20 cambios; guarda esas copias. Todavía se está comprobando si el almacenamiento aguanta ocho
  días o más sin abrir Kin.
- **Sin sincronización.** Un solo teléfono. Para pasar a otro, usa una copia de seguridad.
- **Sin recordatorios.** Las skills no pueden ejecutarse en segundo plano, así que Kin solo habla
  cuando le preguntas. No puede avisarte de un cumpleaños.
- **Los modelos pequeños se equivocan.** A veces el modelo contesta sin llamar a Kin, elige la
  acción equivocada o entiende mal un nombre. Kin pregunta antes de crear, sobrescribir o borrar,
  pero revisa lo que dice que ha guardado.
- **Los chats largos rompen el modelo.** Tras unas quince peticiones en el mismo chat, el modelo
  se queda sin contexto y empieza a escribir sin sentido. Abre un chat nuevo cada pocas
  peticiones; los datos de Kin no dependen del chat. No toques *Max tokens*: con valores muy altos
  el modelo solo genera ruido.
- **Las notas sensibles se detectan por palabras clave** (salud, dinero, relaciones, temas
  legales; en español e inglés). Se le escaparán cosas. Di cuándo algo es privado y Kin lo marca.
- **El código se carga desde GitHub Pages.** La app descarga las páginas de Kin de
  `quantumbboy.github.io`, así que GitHub ve esa petición (como con cualquier web). Tus datos nunca
  se envían. No se ha probado si Kin funciona sin conexión.
- **Solo español e inglés**, y de momento solo la parte de personas de Lore.
- **La especificación es un borrador 0.1** y puede cambiar antes de la 1.0.

Es un proyecto independiente, sin relación con Google ni respaldado por Google.

## Lore, el formato

Una carpeta Lore es así ([ejemplo completo](examples/lore/), todas las personas son inventadas):

```text
lore/
├── me.md                 tú: nombre, idioma, zona horaria; declara la versión de la spec
├── INDEX.md              una línea por archivo, generado, lo primero que leen los modelos
└── people/
    ├── marta-ruiz.md     frontmatter para los datos, secciones para ideas de regalo, promesas, notas…
    └── luis-ortega.md
```

- [spec/SPEC.md](spec/SPEC.md): la especificación (en inglés), con niveles de sensibilidad,
  sintaxis del cuerpo, reglas de fechas y extensiones.
- [spec/schemas/](spec/schemas/): los JSON Schemas, publicados también en
  `https://quantumbboy.github.io/lore/spec/0.1/`.
- [lore-core/](lore-core/README.md): una librería JavaScript sin dependencias que lee, edita,
  valida y consulta carpetas Lore sin perder lo editado a mano.

Cualquiera puede construir sobre Lore. Lee [CONTRIBUTING.md](CONTRIBUTING.md) para proponer
cambios o registrar un espacio de nombres para extensiones.

## Estado

| Fase | Estado |
| --- | --- |
| 1. Prueba de viabilidad: ¿sobrevive el almacenamiento de una skill en iPhone? | Hecha ([resultados](docs/spike/RESULTS.md)) |
| 2. Especificación Lore 0.1 | Borrador |
| 3. Librería lore-core | Hecha |
| 4. Skill Kin | Hecha, probada en iPhone ([resultados](docs/kin/RESULTS.md)) |
| 5. Documentación y lanzamiento | Este README, [PRIVACY.md](PRIVACY.md), [ROADMAP.md](ROADMAP.md), [CONTRIBUTING.md](CONTRIBUTING.md) |

Lo siguiente está en [ROADMAP.md](ROADMAP.md).

## Desarrollo

Hace falta Node.js 22 o posterior.

```sh
npm ci
npx playwright install chromium webkit   # una vez, para los tests de navegador
node tools/build-kin.mjs                 # después de editar kin/ o lore-core/
npm test
```

Los detalles, la estructura del repositorio y cómo contribuir están en
[CONTRIBUTING.md](CONTRIBUTING.md) (en inglés).

## Privacidad

Lee [PRIVACY.md](PRIVACY.md) (en inglés): qué guarda Kin, dónde, cómo trata las notas sensibles y
qué tener en cuenta al escribir sobre otras personas.

## Licencia

[Apache-2.0](LICENSE)
