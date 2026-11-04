# Cómo funciona SCRL
## Cómo funciona un carrusel continuo y cómo construir una alternativa gratuita

**Guía de producto y desarrollo · 4 de noviembre de 2026 · Referencia comercial para España**

Imagina una foto panorámica de Vejer. En la primera página de Instagram ves la mitad de una calle. Arrastras el dedo y la calle continúa exactamente donde terminaba. En la segunda página hay, además, un pequeño vídeo de una persona cruzando la plaza. La calle permanece quieta mientras la persona se mueve. Para el espectador son dos elementos consecutivos de una publicación. Para quien diseña, la forma más cómoda de conseguirlo es trabajar sobre una sola mesa horizontal y decidir después dónde cortarla. Esa es la idea de SCRL.

Esta guía tiene dos partes. **La primera reconstruye la experiencia pública de SCRL** a partir del sitio oficial, las fichas regionales, ejemplos editoriales y un recorrido de interfaz de terceros. **La segunda especifica una implementación propia**, con formatos, decisiones de interacción, geometría, tratamiento del audio y pruebas. No se ha ejecutado una prueba directa en dispositivos ni se ha inspeccionado el código de SCRL. Donde una fuente solo describe una versión, un plan o una experiencia individual, se indica.

| Si quieres… | Empieza por… |
|---|---|
| Entender qué crea SCRL y cómo se usa | [1. El producto](#producto) y [2. Recorrido del usuario](#recorrido) |
| Saber qué herramientas tiene y cuáles son de pago | [3. Inventario](#inventario) y [4. Planes y plataformas](#planes) |
| Entender qué pasa con el vídeo al deslizar | [5. Qué ve el espectador](#salidas) y [9. Vídeo y audio](#video) |
| Diseñar o programar tu propia versión | [6. Qué mejorar](#mejoras), [7. Pantallas](#pantallas) y [8. Motor de composición](#motor) |
| Convertir la idea en tareas de GitHub | [10. Arquitectura](#arquitectura) y [11. Hitos y pruebas](#pruebas) |
| Comprobar una afirmación sobre SCRL | [12. Fuentes y comprobaciones pendientes](#fuentes) |

---

<a id="producto"></a>

## 1. El producto que vas a reproducir

SCRL es un editor visual para preparar publicaciones de redes sociales. Ofrece un lienzo libre y plantillas, permite superponer contenido y prepara la salida para compartir. Su especialidad es el **carrusel continuo**. También anuncia collages de una pieza, diseños de Historias y composiciones repartidas por la cuadrícula del perfil. Existe para iPhone y Android, y la empresa también identifica una aplicación web. La disponibilidad de cada herramienta depende de la superficie y del plan. [Web de SCRL][web] · [App Store de EE. UU.][iosus] · [Política del servicio][privacy]

| Concepto | Qué significa | Ejemplo |
|---|---|---|
| Recurso | Archivo de entrada que aporta el usuario o la biblioteca. | Una foto horizontal o un clip de seis segundos. |
| Capa | Una colocación editable de un recurso, texto o decoración. Varias capas pueden ocupar la misma zona. | La misma foto aparece grande al fondo y recortada en primer plano. |
| Lienzo | Superficie de trabajo sobre la que se compone la publicación completa. | Una tira con cinco zonas verticales. |
| Página o diapositiva | Parte del lienzo que acabará como un elemento del carrusel. | La tercera de las cinco imágenes o vídeos que seleccionas en Instagram. |
| Marco o hueco de plantilla | Contenedor visual en el que encaja el contenido. | Un rectángulo inclinado con borde de película dentro de la página 3. |
| Costura | Frontera entre dos páginas. | El punto donde una barandilla debe continuar a la misma altura al deslizar. |
| Panorámica animada | Un solo vídeo que recorre el diseño automáticamente. | Un barrido de izquierda a derecha que puedes reproducir sin tocar la pantalla. |
| Cuadrícula del perfil | Diseño repartido entre publicaciones distintas, vistas juntas en el perfil. | Tres portadas forman una imagen cuando aparecen contiguas. |

**Treinta fotos originales pueden caber en cinco páginas.** Por ejemplo, una página puede contener nueve fotos pequeñas y la siguiente solo media panorámica. Al estimar límites, almacenamiento y velocidad conviene contar por separado recursos, capas, páginas y archivos de salida. En algunas traducciones SCRL llama «marcos» a las páginas y en la interfaz también hay marcos decorativos. Aquí se mantiene la distinción de la tabla. [App Store de España][ios] · [Descripción de cuadrículas y composición][iosus]

<a id="recorrido"></a>

## 2. Cómo se usa SCRL, desde el primer arranque hasta Instagram

Los nombres de los botones pueden variar entre idiomas y versiones. Esta secuencia reconstruye las acciones y su efecto. Para ver cómo eran los controles en una versión grabada, el análisis público de ScreensDesign incluye marcas de tiempo. [Recorrido de interfaz][ux]

| Paso | Qué hace la persona | Qué cambia en su trabajo |
|---|---|---|
| 1. Entrar | En el recorrido publicado hay una introducción y una oferta de prueba que se puede saltar. | El usuario llega a la creación aun cuando elige el acceso básico. [Recorrido][ux] |
| 2. Elegir el punto de partida | Explora diseños preparados o abre un lienzo en blanco. | Con una plantilla ya hay una composición que rellenar. En blanco, la primera decisión es qué foto merece protagonismo. [Ejemplo editorial de Apple][apple] |
| 3. Colocar medios | Selecciona fotos y, con la función de vídeo habilitada, clips. Puede rellenar los huecos preparados o componer en el lienzo libre. | Las piezas comparten superficie. Una foto grande puede extenderse a la página siguiente. [Apple][apple] · [Ficha de iPhone][ios] |
| 4. Componer | Aleja el zoom para ver la secuencia y acércalo para ajustar una unión. Desplaza los elementos y utiliza las guías de centro y borde de la versión documentada. | La portada, la transición y el cierre se diseñan en relación entre sí. [App Store][iosus] · [Guías y lienzo][ux] |
| 5. Resolver las superposiciones | Selecciona una pieza y utiliza sus acciones o abre el panel de capas para reordenar, duplicar y bloquear. | Puedes dejar fija una foto de fondo y colocar un retrato o un rótulo delante. [Panel y menú contextual][ux] |
| 6. Dar acabado | Ajusta el fondo, añade texto, marcos, pegatinas o superposiciones. La ficha de iPhone en inglés describe también exposición, color y filtros. | Los recursos distintos adquieren un tratamiento visual común. [Apple][apple] · [Editor fotográfico][iosus] |
| 7. Previsualizar y exportar | Revisa las uniones. En iPhone se describen dos salidas, la secuencia de fotos/vídeos y el vídeo de barrido automático. | La primera deja al espectador controlar el avance. En la segunda, el montaje marca el ritmo. [Exportaciones de iPhone][ios] |
| 8. Compartir | SCRL anuncia el paso a Instagram. Si se han guardado piezas sueltas, se crea una publicación múltiple y se eligen en el orden diseñado. | La continuidad depende del orden, el encuadre y la orientación de los archivos que llegan a Instagram. [Compartir desde SCRL][ios] · [Carrusel de Instagram][ig] |

**Un ejercicio reproducible.** Abre un lienzo en blanco. Importa una panorámica de tu galería y escálala hasta que ocupe varios paneles. Mueve la foto hasta que las líneas de corte caigan sobre edificios o cielo y dejen la cara de una persona dentro de una página. Añade una fecha pequeña a la portada y exporta como carrusel. Abre dos piezas adyacentes en su orden original y sigue con el dedo una línea del horizonte. Apple describe la operación de extender una panorámica a varios paneles. La elección de los cortes y la prueba del horizonte son una forma de evaluar el resultado. [Demostración editorial][apple]

**Cómo localizar las acciones en la referencia visual.** El análisis del recorrido sitúa el lienzo en 01:38, el menú de selección en 02:24, el cruce de página en 02:35 y las capas en 03:22. Más adelante ubica el vídeo en 03:45, la tipografía en 06:17, las pegatinas en 06:50, los marcos en 07:00, las guías en 07:44 y la exportación en 10:05. Son referencias a esa grabación. [Recorrido con marcas de tiempo][ux]

<a id="inventario"></a>

## 3. Inventario funcional y decisiones creativas

| Familia | Qué se ha documentado de SCRL | Por qué importa al crear |
|---|---|---|
| Lienzo libre y zoom | Composición horizontal, trabajo sobre varios paneles y zoom de detalle o conjunto. [Sitio][web] · [iOS][ios] | Una misma línea de horizonte puede recorrer el proyecto. |
| Plantillas y cuadrículas | Colecciones para collages, carruseles e Historias. Hay diseños estructurados, composiciones libres y diseños para el mosaico del perfil. [App Store EE. UU.][iosus] | Una plantilla resuelve proporción, espacios y ritmo antes de elegir las fotos. |
| Galería y stock | Galería personal y fotografías de stock. La ficha española de iPhone identifica Pexels. [App Store España][ios] | Se puede completar una composición aunque falte, por ejemplo, una textura de fondo. |
| Edición fotográfica | Exposición, color y filtros en la descripción estadounidense. Eliminación de fondo en la española y en Android. [iOS EE. UU.][iosus] · [iOS España][ios] · [Android][andes] | Se puede igualar una serie tomada con luces distintas o hacer que una persona sobresalga del marco. |
| Texto y ornamentos | Fuentes, texto, fondos de color, degradados, pegatinas, decoraciones de borde y recursos de GIPHY según la ficha y el plan. [iOS][ios] · [Apple][apple] | Un pie de foto ocupa espacio propio. Una textura semitransparente modifica lo que queda debajo. |
| Capas y ayudas | En la versión analizada hay reordenación, bloqueo, duplicación, borrado contextual y guías de ajuste al alinear. [Análisis de interfaz][ux] | Permite seleccionar el elemento correcto incluso cuando varias piezas se tapan. |
| Vídeo dentro del collage | La tarifa Premium incluye capas de vídeo. Google Play en inglés anuncia que se pueden insertar vídeos en cuadrículas. [Planes][planesref] · [Google Play EN][anden] | El clip ocupa una región del diseño mientras el fondo, la foto y los textos de alrededor pueden permanecer quietos. |
| Previsualización y salidas | El sitio anuncia vista previa. En iPhone se documentan el carrusel mixto y el vídeo panorámico. La ficha estadounidense también menciona TikTok. [Sitio][web] · [iOS ES][ios] · [iOS EE. UU.][iosus] | Conviene decidir de antemano si el espectador va a deslizar o a reproducir. |
| Cuenta, plantillas públicas y comunidad | La documentación del servicio contempla acceso con código enviado por correo y plantillas compartidas públicamente. La web presenta un ecosistema de creadores. [Política publicada][privacy] · [Web][web] | Editar una pieza local, compartir la plantilla vacía y publicar el resultado son acciones diferentes. |
| Programación y datos sociales | Para cuentas de Instagram conectadas, la empresa describe guardar medios, texto y fecha de publicación, así como acceso a ciertos datos de rendimiento cuando están disponibles. [Política de SCRL, apartados 1 y 2][privacy] | Existe una función de publicación programada más allá de abrir Instagram. El documento público no acredita qué planes o clientes muestran todos esos controles. |
| Privacidad y funciones de IA | La empresa describe el tratamiento de imágenes enviadas a funciones de IA y del resultado. Esto se refiere al uso de esas funciones. [Política de SCRL][privacy] | Una alternativa local puede explicar, en el mismo botón de importación o recorte, dónde se procesan las fotos. |

**Una página estática también tiene ritmo.** Un diseño puede alternar portada con una única foto, doble página panorámica y cierre con cuatro detalles. Un marco gráfico organiza la mirada. Un hueco de plantilla además controla qué parte de un recurso se ve. Si los implementas como la misma acción, el usuario que solo quería cambiar el borde puede perder el encuadre. En tu editor conviene separarlos.

<a id="planes"></a>

## 4. Qué se paga y qué cambia entre plataformas

| Prestación anunciada en la tabla oficial | Básico | Premium |
|---|---|---|
| Precio de acceso | Gratis | Suscripción con prueba anunciada de siete días |
| Páginas por proyecto | 10 | 20 |
| Plantillas | Selección limitada | Catálogo completo |
| Herramientas de creación | Básicas | Avanzadas |
| Capas de vídeo | La tabla las reserva para Premium | Incluidas |

La web comercial especifica el límite **por proyecto y por plan**. Las descripciones españolas de las tiendas aún hablan de diez marcos sin dar ese desglose y la portada de SCRL anuncia hasta veinte. En la App Store española aparecen, entre varias compras, ejemplos etiquetados como semanales a 5,99 € y anuales a 41,99 €. Son referencias visibles en esa tienda, no una tarifa única para todas las cuentas, plataformas u ofertas. [Precios oficiales][planesref] · [Compras integradas en España][ios] · [Portada][web]

| Superficie | Qué está respaldado | Qué queda por comprobar |
|---|---|---|
| iPhone | La ficha española anuncia fotos y vídeos en carrusel y barrido panorámico como vídeo único. | Formatos exactos, audio de varios clips, duración máxima, política al atravesar una costura y diferencias por dispositivo. [App Store ES][ios] |
| Android | La ficha española describe una secuencia de fotos. La inglesa permite insertar vídeo en cuadrículas de Premium. Reseñas españolas relatan movimiento perdido y huecos tras algunas exportaciones. | Elegir un clip, verlo en el editor y obtener un archivo reproducible son tres pruebas distintas. No se puede generalizar el resultado a todos los Android. [Ficha y reseñas ES][andes] · [Descripción EN][anden] |
| Web | SCRL tiene una entrada web y la política identifica expresamente un cliente web. El sitio oficial anuncia cambio de formato y vista previa. | El material público consultado no prueba paridad de edición, exportación o programación con móvil. [Entrada web][webapp] · [Sitio][web] · [Política][privacy] |

<a id="salidas"></a>

## 5. Lo que recibe el espectador

| Intención | Salida | Qué ve quien la abre |
|---|---|---|
| «Quiero que cada persona avance a su ritmo» | Una publicación con varias piezas ordenadas. | Un deslizamiento cambia de pieza. Puede haber un vídeo en una página y una foto en otra. |
| «Quiero que el recorrido tenga una duración que yo controle» | Un único vídeo panorámico. | La ventana avanza por el diseño aunque nadie deslice. |
| «Quiero un póster con un vídeo incrustado» | Una pieza de vídeo que integra el fondo fijo, el clip y las decoraciones. | Solo se mueve la zona donde se ha colocado el clip. Es una salida que tu implementación debe producir cuando hay movimiento. |
| «Quiero que la imagen aparezca repartida en mi perfil» | Varias publicaciones individuales. | El efecto se aprecia desde el perfil y depende de cómo se presenten allí las portadas. |

Las dos primeras salidas están descritas por SCRL para iPhone. La cuadrícula del perfil se anuncia en la ficha estadounidense. Instagram amplió su publicación múltiple hasta 20 elementos en la app. Esa cifra cuenta las piezas finales, y la ruta de publicación importa. Un exportador de archivos no necesita conectarse a una cuenta para producirlas. [Modos de SCRL][ios] · [Cuadrícula de perfil][iosus] · [Límite de la app de Instagram][ig]

**Un vídeo que atraviesa una costura plantea dos problemas distintos.** En un fotograma detenido, las dos mitades deben formar la imagen original. En un carrusel real, el usuario puede quedarse siete segundos en la primera página y después pasar a la segunda. Cada pieza tiene su reproducción y tu editor no controla el reloj de Instagram. Si necesitas que una ola o una persona cruce la frontera en un instante exacto, entrega el vídeo panorámico único. Si necesitas libertad de deslizamiento, conserva la continuidad espacial y define qué instante de inicio recibe cada pieza. La segunda parte adopta una regla explícita para ello.

---
<a id="mejoras"></a>

## 6. Qué mejoraría primero en tu app

**Decisión de partida.** Para una app gratuita distribuida en GitHub, propongo una web instalable que edite y exporte en el dispositivo. Es una opción de implementación y se puede adaptar a un repositorio nativo existente. El objetivo de la primera versión pública es que una persona complete un carrusel mixto, cierre el editor, vuelva al día siguiente y obtenga los mismos encuadres. Cuenta, suscripción y servidor de render quedan fuera de esa dependencia.

| Prioridad | Problema u oportunidad | Comportamiento que ofrecer | Cómo demostrar la mejora |
|---|---|---|---|
| P0 | La página oficial reserva las capas de vídeo y las 20 páginas para Premium. [Planes][planesref] | Hasta 20 páginas y exportación mixta gratuita, sin marca de agua. | Crear y exportar un proyecto de 20 páginas desde una instalación nueva. |
| P0 | Reseñas de Android describen clips convertidos en imágenes y huecos en la salida. [Google Play][andes] | Etiqueta por página «Foto» o «Vídeo», duración y audio. Comprobar compatibilidad antes de editar el primer clip. | Una muestra que cambia de color durante el clip cambia también en el MP4 exportado. |
| P0 | Hay relatos de proyectos que se quedan en blanco al editar. Son incidencias individuales. [Reseñas][andes] | Autoguardado verificable, recuperación y copia portable con los medios. | Forzar el cierre tras «Guardado», reabrir y exportar. Restaurar la copia en otro dispositivo. |
| P0 | Una reseña de iPhone describe un recorte automático que se llevó parte importante de una imagen. [Reseñas de iPhone][ios] | Separar «Mover marco» y «Reencuadrar contenido». Guardar el punto de interés de cada foto. | Reemplazar una foto sin mover ni rotar su marco. Deshacer recupera exactamente la foto y el recorte previos. |
| P1 | Un error de un píxel puede pasar inadvertido en la vista general. | Modo «Revisar unión» que muestra juntas dos páginas al 100 % y permite arrastrar la frontera por pantalla. | Una regla diagonal y un patrón de columnas atraviesan todas las uniones sin saltos. |
| P1 | Maquetar un viaje entero a mano requiere decidir la colocación de cada foto. | Autocomposición local con ritmo editorial, orden de entrada y páginas bloqueables. | Regenerar una propuesta conserva las páginas aprobadas, los protagonistas y el orden narrativo. |
| P2 | El usuario puede querer reutilizar una composición sin entregar sus fotos. | «Guardar como plantilla» conserva huecos, máscaras y estilos. Permite distribuir el diseño como un archivo de texto versionado. | Otra persona abre la plantilla y usa sus fotos. El paquete no contiene originales, miniaturas ni nombres privados. |

Ya hay una referencia independiente en GitHub, **HeyPortal/open-scrl**, que describe un editor web y una app para Mac con exportación local. Si buscas diferenciarte, compara en los mismos dispositivos la recuperación de borradores, el audio de dos clips y la fiabilidad del MP4. Son diferencias que un usuario puede comprobar con su propio material. [Repositorio del proyecto independiente][opensource]

<a id="pantallas"></a>

## 7. Pantallas y reglas de interacción propuestas

| Pantalla | Qué aparece | Acción principal y casos que resolver |
|---|---|---|
| **Mis proyectos** | Miniatura, título, número de páginas, fecha de guardado y estado de recuperación. | Crear, abrir, duplicar, importar copia y borrar con posibilidad de deshacer. Dar acceso a una demo local para quien aún no tenga fotos. |
| **Nuevo proyecto** | Formato por página, número inicial y elección entre lienzo en blanco, plantilla o panorámica. | Por defecto, 3 páginas verticales de 1080 × 1350. Ofrecer 1:1 y dejar 3:4 como preset que se valida en el canal elegido. Mostrar las dimensiones finales junto al formato. |
| **Medios** | Miniaturas ordenadas, insignia de duración y estado de lectura del archivo. | Selección múltiple, arrastrar desde escritorio, reordenar antes de colocar y volver a vincular un original ausente. Si un archivo falla, indicar cuál y conservar el resto. |
| **Editor** | Lienzo horizontal, guías de costura, miniaturas de páginas y herramientas del objeto seleccionado. | En móvil, controles al alcance del pulgar y panel inferior plegable. En escritorio, inspector lateral y atajos. El zoom modifica la vista, nunca el tamaño exportado. |
| **Capas y encuadre** | Lista del frente al fondo, bloqueo, visibilidad, tipo de capa y máscara. | Mover, rotar, duplicar, eliminar, cambiar orden, sustituir y recortar. Doble toque en la foto abre el encuadre interior. Una capa bloqueada sigue siendo accesible desde la lista. |
| **Vista previa** | Una página por vez, indicador «2 de 5», reproducción y silencio. Segunda vista con dos páginas contiguas. | Deslizar con el dedo simula el carrusel. La vista doble permite comprobar el mismo fotograma a ambos lados. Volver a editar conserva selección y posición. |
| **Exportar** | Miniatura, formato, dimensiones y duración por pieza, cantidad total, progreso y destino. | Elegir carrusel o barrido. Guardar por separado, en ZIP o compartir cuando el dispositivo lo admita. Cancelar, reintentar y volver al proyecto. |

**Gestos y precisión.** Un dedo sobre una capa seleccionada la mueve. Dos dedos sobre el fondo desplazan y amplían el lienzo. Los tiradores transforman la capa. La barra superior ofrece deshacer y rehacer. En escritorio, las flechas desplazan un píxel y con Mayús desplazan diez. Ofrece campos numéricos y controles de capa etiquetados también para quien no pueda hacer gestos de precisión. La tolerancia del imán se mide en píxeles de pantalla y se convierte según el zoom, para que al ampliar siga siendo fácil colocar un objeto a mano.

**Cómo se comporta una plantilla.** Cada hueco tiene posición, tamaño, forma, proporción y un punto de interés. «Rellenar» cubre toda la máscara recortando lo que sobra. «Encajar» mantiene visible la imagen entera y deja ver el fondo en el espacio libre. Si una foto de 4000 × 3000 entra en un hueco de 600 × 600, «Rellenar» escala a 800 × 600 y recorta 100 píxeles por lado cuando está centrada. «Encajar» produce 600 × 450. Al arrastrar el contenido cambia su posición dentro de la máscara. Mover el marco arrastra máscara y contenido juntos. «Sustituir» conserva marco y estilo, ajusta el nuevo recurso y permite deshacer.

**Tres plantillas originales para arrancar.** Una postal de viaje con panorámica entre páginas 1 y 2 y cierre con tres detalles. Una película de contactos con una fila continua de seis retratos. Una crónica con portada tipográfica, clip central y foto final a sangre. Distribúyelas como datos editables. La postal pone a prueba las costuras, la película exige un buen sistema de huecos y la crónica verifica la mezcla de medios. Para autocomponer, puntúa la proporción de cada recurso frente al hueco, penaliza recortar el punto de interés y conserva el orden salvo que el usuario elija «Mezclar». Usa una semilla guardada para poder reproducir y deshacer el resultado.

<a id="motor"></a>

## 8. El motor de composición desde cero

### Un sistema de coordenadas para toda la publicación

Sea `W` el ancho de una página, `H` su alto y `N` el número de páginas. Con origen arriba a la izquierda, el lienzo ocupa `[0, N·W) × [0, H)`. La página `i`, numerada internamente desde cero, ve la franja `[i·W, (i+1)·W)`. El borde derecho se excluye para que cada columna pertenezca a una única página. Las capas conservan coordenadas globales aunque el usuario esté viendo solo una franja.

| Ejemplo a 1080 × 1350 | Página 1 | Página 2 | Página 3 |
|---|---:|---:|---:|
| Columnas del mundo que le pertenecen | 0–1079 | 1080–2159 | 2160–3239 |
| Foto situada entre x = 800 y x = 1599 | 280 columnas de foto | 520 columnas de foto | Ninguna |
| Posición local de esa porción | 800–1079 | 0–519 | — |

La foto se coloca y recorta **una sola vez**. Al dibujar la segunda página, el motor desplaza su cámara a `x = 1080`. Si se aplica «Rellenar» de nuevo a la porción que cae en cada página, aparecerán dos encuadres incompatibles. Para un degradado, un trazo o una textura que atraviese la costura, calcula su origen en el mismo espacio global. Las sombras y los desenfoques pueden aportar píxeles aunque el rectángulo base quede fuera.

### Qué persistir

| Entidad | Datos mínimos | Razón |
|---|---|---|
| `Project` | Versión de esquema, identificador, revisión, título, tamaño por página, lista ordenada de páginas, fondo global, recursos y capas. | Un proyecto se puede migrar, reabrir y exportar de forma reproducible. |
| `Page` | Identificador estable y ajustes de presentación, p. ej. pista de audio elegida. | El ID persiste aunque se inserten páginas. La posición horizontal se obtiene del orden. |
| `Asset` | ID, tipo detectado, referencia al original local, dimensiones orientadas, duración y pistas si existen, miniatura regenerable. | Dos capas pueden compartir un mismo archivo sin duplicar sus bytes. |
| `Layer` | ID, tipo, referencia a recurso o contenido, orden, visibilidad, bloqueo, posición, tamaño, rotación, opacidad, máscara y transformación interior. | La transformación del marco y el encuadre del contenido tienen vidas distintas. |
| `Clip` | Entrada y salida en el original, instante de aparición, ganancia, modo al terminar y fotograma de portada. | La vista previa y el exportador calculan el mismo instante. |
| `Template` | Versión, número de páginas, dimensiones de diseño, huecos tipados, estilos y política de relleno. | Rellenar una plantilla crea una copia con capas editables. |

**Ejemplo mínimo de documento.** Las dimensiones están en píxeles de diseño, el tiempo en milisegundos y la rotación en grados alrededor del centro de la capa. Las rutas apuntan a ficheros del paquete portable. Este proyecto concreto genera `01.jpg`, `02.mp4` y `03.jpg`.

```json
{
  "schemaVersion": 1,
  "id": "vejer",
  "revision": 7,
  "title": "Un paseo por Vejer",
  "canvas": { "pageWidth": 1080, "pageHeight": 1350, "background": "#F5F1E8" },
  "pages": [{ "id": "p1" }, { "id": "p2" }, { "id": "p3" }],
  "assets": [
    { "id": "calle", "type": "image", "path": "media/calle.jpg", "width": 3600, "height": 1500 },
    { "id": "plaza", "type": "video", "path": "media/plaza.mp4", "width": 1280,
      "height": 720, "durationMs": 8000, "hasAudio": true }
  ],
  "layers": [
    { "id": "fondo", "type": "image", "assetId": "calle", "x": 0, "y": 0,
      "width": 3240, "height": 1350, "fit": "cover" },
    { "id": "clip", "type": "video", "assetId": "plaza", "x": 1250, "y": 430,
      "width": 720, "height": 405, "fit": "cover",
      "clip": { "inMs": 1000, "outMs": 7000, "startMs": 0, "gain": 1, "endMode": "hold" } }
  ]
}
```

En este ejemplo, el orden del array de capas va de fondo a frente. Si se omiten, la rotación es 0, la opacidad es 1, la capa está visible y el recorte está centrado. El clip ocupa x = 1250…1969 dentro de la página 2, dura seis segundos y aporta la única pista audible.

### Dibujar y exportar una ventana

```text
dibujarVentana(proyecto, origenX, tiempo, superficie):
    limpiar la superficie y pintar el fondo con su origen global
    seleccionar capas visibles cuyo efecto alcance esta ventana
    para cada capa, del fondo hacia el frente:
        aplicar cámara (-origenX, 0) y transformación global de la capa
        aplicar máscara y encuadre interior
        resolver la imagen, el texto o el fotograma correspondiente al tiempo
        componer con opacidad y estilo
    devolver los píxeles de la ventana, sin guías ni tiradores

para cada índice i:
    origenX = i * anchoPágina
    si la página tiene movimiento efectivo o una pista de audio activa:
        componer sus fotogramas y codificar una pieza de vídeo
    en otro caso:
        guardar dibujarVentana(proyecto, origenX, 0, superficie) como imagen
```

Usa esta misma función para el editor, la previa y la exportación. El zoom interactivo solo cambia la resolución o la cámara de la vista. El tamaño exportado permanece fijo. En capas giradas, la caja delimitadora transformada sirve para descartar las lejanas. La máscara y la geometría transformada determinan la cobertura real. Si hay filtros que muestrean píxeles vecinos, renderiza una franja auxiliar alrededor de la página y descártala al final para evitar halos cortados.

**Qué hacer al cambiar páginas.** En la primera versión permite añadir al final y retirar la última mediante una operación deshacible. Si quitas una página con contenido, muestra qué se recortará y conserva el original en el historial. Para reordenación arbitraria, una decisión posterior debe distinguir «mover toda la escena con sus capas» de «reordenar las piezas ya cortadas». Esta última rompe panorámicas intencionadamente. Muestra la unión resultante antes de confirmar. Es preferible lanzar el núcleo con una regla clara y probar la reordenación como función aparte.

<a id="video"></a>

## 9. Cómo conservar vídeo y audio

### Reglas de reproducción propuestas

| Situación | Regla de la primera versión |
|---|---|
| Solo imágenes, texto y decoración estática | JPEG opaco a tamaño de página. PNG opcional para guardado sin pérdida. |
| Un clip visible en una página | MP4 que incluye el collage entero durante el tiempo activo del clip. Si el original tiene audio seleccionado, se conserva. |
| El mismo clip ocupa dos páginas | Exportar dos MP4 con el mismo recorte temporal y reloj local. A igual instante, cada archivo representa su ventana espacial. Al deslizar en Instagram cada reproductor puede arrancar por su cuenta. |
| Hay dos clips visibles de 3 y 6 segundos | Ambos empiezan según su desplazamiento. La duración de página cubre el último final. El clip corto mantiene el último fotograma y deja de emitir audio al acabar. |
| Un clip empieza después de cero | Antes de la entrada se ve el fondo en esa zona. La duración se calcula como el máximo de `startMs + outMs − inMs` de los clips activos. |
| Dos clips tienen sonido | De inicio se oye el primer clip audible según el orden de incorporación, que se guarda expresamente. El usuario puede cambiar la pista o silenciarla por página. La mezcla multipista puede incorporarse después. |
| Capa oculta o fuera de una página | No añade movimiento ni audio a esa página. Si se cubre por completo, se excluye del cálculo visual. Una pista de audio elegida expresamente puede seguir justificando una salida MP4. |
| El dispositivo no puede producir el MP4 solicitado | Mostrar el motivo al importar el primer vídeo y de nuevo al exportar. Ofrecer guardar el proyecto portable para otro equipo. «Solo fotos» requiere una elección explícita. |

Para muestrear un clip activo a tiempo `t` usa `tFuente = inMs + (t − startMs)` mientras esté en el intervalo `[inMs, outMs)`. Al mantener el último fotograma después de la salida, usa el último fotograma **anterior** a `outMs`. Recorta el audio a las mismas marcas. Un vídeo con tasa de imágenes variable debe leerse por sus marcas de presentación. Esto evita que un clip de móvil pierda sincronía por suponer que la entrada venía a 30 imágenes por segundo.

### Dos exportadores que comparten el mismo dibujado

1. **Carrusel.** Decide el tipo de cada página y muestra un resumen como «2 fotos y 1 vídeo con audio, 1080 × 1350». Usa nombres con dos dígitos. Para el proyecto anterior, la segunda pieza contiene 180 fotogramas a 30 fps. El usuario conserva las tres piezas por separado o en un ZIP con ese orden.
2. **Barrido panorámico.** Una cámara del tamaño de una página se desplaza por el mismo mundo. Para `F` fotogramas y un desplazamiento lineal, usa `x(k) = (N−1)·W·k/(F−1)` cuando `F > 1` y `x = 0` con un solo fotograma. El primero muestra la portada y el último la página final completa. Propón una duración ajustable y pausas opcionales al principio y al final. En este modo usa un único reloj de vídeo y permite escoger una pista o silencio para todo el barrido. La previa debe dejar oír y ver cuándo aparece el clip en la ventana.

### Ruta de exportación viable en navegador

- **Entrada.** Inspecciona contenedor, pistas y códecs reales. Un archivo `.mov` del iPhone puede tener distintas codificaciones. Comprueba decodificación de vídeo y audio, orientación y duración con una muestra. El icono del archivo o su extensión no demuestran que se pueda exportar.
- **Composición.** Dibuja cada ventana al tamaño de salida, con los originales y las fuentes cargadas. Para la interfaz usa miniaturas y copias de trabajo de menor resolución. Elimina los fotogramas y superficies que terminen de usarse. Un documento de 20 páginas de 1080 × 1350 representado en una única superficie RGBA requeriría unos 111 MiB solo para esa superficie.
- **Codificación.** Empieza con un perfil objetivo MP4, vídeo H.264 a 30 fps y audio AAC cuando corresponda. Verifica las configuraciones concretas, incluidas resolución y pista de audio, con `isConfigSupported()` y una codificación corta. WebCodecs produce datos codificados. Necesitas además leer el contenedor de entrada y empaquetar las pistas de salida. Mediabunny es una opción para esas operaciones. [WebCodecs][codecs] · [Prueba de vídeo][venc] · [Prueba de audio][aenc] · [Formatos de Mediabunny][bunny]
- **Compatibilidad.** Registra por separado «puedo previsualizar», «puedo leer todas las pistas», «puedo codificar» y «puedo guardar o compartir». Si el vídeo se puede codificar pero falla el audio, informa y ofrece exportar en silencio con consentimiento. Conserva el original para otro dispositivo. Usa una exportación reintentable con progreso por página.
- **Entrega a Instagram.** En móvil ofrece archivos individuales y compartir si `navigator.canShare({files})` acepta ese lote. Prepara los archivos y muestra después el botón «Compartir», para que la acción se inicie con un toque. El destino y la selección múltiple dependen del sistema. Mantén la descarga por pieza y una hoja que explique «Crear publicación → Selección múltiple → Elegir 01, 02, 03…». En escritorio ofrece el ZIP y explica que hay que descomprimirlo antes de publicar. Confirma «Archivos preparados» cuando lo sepas. Reserva «Publicado» para una confirmación real del servicio. [Web Share API][share]

### Receta ejecutable de referencia para el ejemplo de Vejer

Con FFmpeg instalado, guarda la panorámica de 3600 × 1500 como `media/calle.jpg` y el clip horizontal de 1280 × 720, de al menos siete segundos, como `media/plaza.mp4`. Ejecuta el bloque en Bash desde la carpeta que contiene `media`. Reproduce el documento JSON anterior usando tamaños y posiciones conocidos. Sirve como referencia externa para comprobar tu exportador de navegador. Requiere una compilación de FFmpeg con `libx264`. Usa una carpeta de salida que no contenga archivos con esos nombres.

```bash
set -eu
mkdir -p salida
for item in 01:0 03:2160; do
  nombre=${item%:*}
  origen=${item#*:}
  ffmpeg -n -v error -i media/calle.jpg \
    -vf "scale=3240:1350,crop=1080:1350:$origen:0,setsar=1" \
    -frames:v 1 -q:v 2 -threads 1 "salida/$nombre.jpg"
done

ffmpeg -n -v error -loop 1 -framerate 30 -i media/calle.jpg \
  -ss 1 -t 6 -i media/plaza.mp4 \
  -filter_complex_threads 1 \
  -filter_complex "[0:v]scale=3240:1350,crop=1080:1350:1080:0,setsar=1[bg];[1:v]fps=30,scale=720:405,setsar=1[clip];[bg][clip]overlay=x=170:y=430:format=rgb,format=yuv420p[v]" \
  -map "[v]" -map '1:a:0?' -t 6 -c:v libx264 -preset veryfast \
  -crf 18 -threads 2 -c:a aac -movflags +faststart salida/02.mp4

ffprobe -v error -show_entries stream=codec_name,width,height,nb_frames \
  -show_entries format=duration -of json salida/02.mp4
```

Los 170 píxeles de separación a la izquierda del clip en la página 2 salen de `1250 − 1080`. El comando lee los segundos 1 a 7 del vídeo. Con una pista de entrada con sonido, `ffprobe` debe mostrar H.264 de 1080 × 1350, 180 fotogramas, AAC y seis segundos. Las páginas 1 y 3 deben ser imágenes fijas con distintos recortes de la misma foto.

**Verificación del ejemplo.** Se ejecutó este bloque con una panorámica de prueba, un vídeo sintético en movimiento y un tono de 440 Hz. Produjo las tres piezas esperadas. Se comprobaron las dimensiones de las dos fotos, la duración de seis segundos, los 180 fotogramas del MP4 y la presencia de audio audible. Al comparar dos instantes de la página 2 cambiaron los píxeles del clip y permaneció fija la zona de fondo muestreada.

<a id="arquitectura"></a>

## 10. Arquitectura gratuita y recuperable

| Pieza del repositorio propuesto | Responsabilidad | Contrato que merece una prueba |
|---|---|---|
| `src/model/` | Tipos TypeScript, esquema, migraciones, comandos de edición e historial. | Serializar → reabrir devuelve las mismas capas, tiempos y encuadres. |
| `src/editor/` | Vistas, gestos, selección, cámara y navegación por páginas. React + Vite es una opción razonable si partes de una web nueva. | Mover la cámara y cambiar el zoom no modifica las coordenadas del proyecto. |
| `src/render/` | Composición 2D, transformaciones, máscaras, texto y dibujo de una ventana a un tiempo. | La misma escena a la misma escala ofrece los mismos píxeles en vista previa y exportación sin pérdida. |
| `src/media/` | Importación, metadatos, orientación, miniaturas, decodificación y fuentes. | Un formato que falla se identifica al principio. La app conserva los demás recursos. |
| `src/storage/` | Recursos binarios en IndexedDB y manifiestos versionados, guardado y copias portables. | «Guardado» solo aparece cuando los recursos referenciados y la revisión están disponibles de forma duradera en el almacén local. |
| `src/export/` | Plan por página, codificadores, empaquetado MP4, nombres, ZIP, progreso y cancelación. | Un fallo en la página 8 conserva el proyecto y permite reintentar con la misma revisión. |
| `templates/` y `tests/fixtures/` | Plantillas propias y escenas sintéticas con resultados esperados. | Construir y ejecutar las pruebas desde una copia limpia sin claves ni medios personales. |

**Guardado que se pueda creer.** Escribe primero los medios importados y después la revisión que los referencia. Actualiza de forma transaccional el índice que señala a la revisión actual. Si algo falla, conserva la última revisión válida y los originales. Agrupa todos los eventos de un arrastre y crea una sola entrada de historial cuando la persona suelte la capa. Con dos pestañas abiertas compara el número de revisión al guardar. Si diverge, conserva una copia recuperable y permite escoger. Los límites y la expulsión de datos del navegador varían, por lo que una copia descargable con `project.json` y `media/` debe poder importarse sin la instalación original. [Almacenamiento y cuotas del navegador][storage]

**Coste y distribución.** Un repositorio público puede servir el editor compilado como sitio estático con GitHub Pages. Si se publica bajo `/nombre-del-repo/`, configura la base de Vite y las rutas de fuentes, trabajadores y recursos para ese prefijo. El usuario aporta el almacenamiento y el trabajo de render en su propio dispositivo. Una vez cargados y almacenados el editor y los recursos de la plantilla, un service worker puede habilitar edición y exportación sin cobertura. Prueba en modo avión. GitHub Pages tiene límites de tamaño, tráfico y uso. Esta propuesta evita un coste de render por exportación. [GitHub Pages][pages] · [Límites][limits] · [Despliegue de Vite][vite]

**Recursos redistribuibles.** Empieza con plantillas propias, ornamentos vectoriales y fuentes que puedas incluir en el repositorio con su licencia y créditos. Distingue las licencias de código, medios de ejemplo y fuentes. La importación local y la biblioteca empaquetada permiten crear sin cuentas de terceros. Si más adelante añades un catálogo externo, documenta permisos, atribución, disponibilidad sin red y tratamiento de claves antes de incluirlo en una distribución pública. Los servicios de stock y GIPHY nombrados por SCRL describen su producto, no conceden acceso a sus acuerdos. [Ficha del producto][ios] · [Condiciones publicadas por SCRL][terms]

**Privacidad visible.** El editor básico puede funcionar sin registro ni subida de originales. Compruébalo en las peticiones de red durante importación y exportación. Deja la programación para una fase separada. Publicar con la aplicación cerrada exige otra arquitectura, autorización de una cuenta compatible, almacenamiento del material y tratamiento del resultado de Meta. La colección oficial de Meta documenta la integración con cuentas profesionales. Mantén la exportación de archivos independiente del servicio de publicación. [Documentación de Meta][meta] · [Cómo SCRL explica su programación][privacy]

<a id="pruebas"></a>

## 11. Hitos de GitHub y criterios de aceptación

| Hito | Qué construir | Qué tiene que funcionar para cerrarlo |
|---|---|---|
| 0 · Prueba de viabilidad de vídeo | Una escena fija + un clip con tono + MP4 local, a tamaño final. | Ejecutar en Safari de iPhone, Chrome Android y un navegador de escritorio. Anotar por dispositivo qué lee, codifica, guarda y comparte. Definir soporte según resultados. |
| 1 · Carrusel fotográfico | Lienzo, páginas, zoom, foto, fondo, texto, capas básicas, preview y archivos ordenados. | Una panorámica de 3 páginas y otra de 20 se reconstruyen en PNG sin columnas omitidas ni repetidas. |
| 2 · Carrusel mixto | Tiempo por capa, audio seleccionable, vista previa temporal, MP4 por página y progreso. | El caso de Vejer genera exactamente JPG–MP4–JPG. El clip se mueve, suena y mantiene el horizonte. |
| 3 · Proyecto duradero | Autoguardado, historial, recuperación de errores, ZIP de proyecto e importación. | Reabrir tras cierre forzado, restaurar en otro equipo y reintentar una exportación cancelada. |
| 4 · Primera versión pública | Tres plantillas originales, encuadre interior, teclado/táctil, revisión de uniones y guía de publicación. | Una persona nueva completa el flujo sin instrucciones del equipo. Se guarda la secuencia y puede seleccionarse en orden en Instagram. |
| 5 · Segunda versión | Vídeo panorámico, autocomposición, plantillas compartibles y herramientas avanzadas de foto. | El barrido alcanza la última página exacta y las páginas bloqueadas sobreviven a la regeneración. |

### Matriz mínima de pruebas

| Caso | Preparación | Resultado esperado |
|---|---|---|
| Costura exacta | Degradado, números de columna, diagonal y foto que cruza dos fronteras. | Al concatenar los PNG se obtiene el mismo resultado que al dibujar el lienzo de referencia. Para JPEG y MP4 compara geometría con tolerancia a compresión. |
| Borde exclusivo | Clip al que le queda exactamente `xDerecha = 1080`. | La página 2 no se convierte en vídeo por tocar una línea de área cero. |
| Rotación y sombra | Foto inclinada cuyo centro cae fuera de la página, pero cuya sombra y esquina sí entran. | Ambas se ven como en el lienzo, incluso en el borde. |
| Vídeo atravesando una costura | Clip de un contador móvil y rejilla, situado a ambos lados. | Se generan dos MP4. A igual marca de tiempo, la rejilla y el contador encajan. |
| Audio y silencio | Clip con tono y silencio alternos. Repetir con clip mudo y con modo silencio. | El audio se mantiene en sus intervalos, no hay sonido duplicado y la ausencia de pista no bloquea la exportación. |
| Dos duraciones | Clips de 3 y 6 segundos con inicio simultáneo. | La página dura 6 s. Desde el segundo 3 el primero queda fijo y su audio cesa. |
| Medios de teléfono | Probar foto con orientación EXIF, PNG transparente y muestra real HEIC/MOV/HEVC y HDR de un iPhone. Repetir con un Android. | La orientación es correcta. El perfil SDR se ve razonable o se advierte de la limitación antes de empezar. Cada entrada incompatible tiene una salida comprensible. |
| Guardado y cancelación | Cerrar tras «Guardado», cancelar durante la codificación, agotar cuota en una importación. | Se reabre la última revisión válida. No se presenta un ZIP a medias como final y se puede recuperar la copia. |
| Tamaño real | Proyecto de 20 páginas con fotografías grandes y varios clips. | Medir tiempo hasta la primera vista previa, tiempo de exportación, pico de memoria y fallos por dispositivo. No publicar cifras de rendimiento sin esas mediciones. |
| Entrega real | Abrir los archivos locales en el carrete o galería y seleccionarlos como nueva publicación múltiple. | Orden y encuadre correctos. Marcadores de movimiento y audio se detectan en la previsualización de Instagram. Comprobar allí el posible recorte o recompresión. |

**Definición de una primera versión que merece publicarse.** Una persona abre un enlace, combina una panorámica y un vídeo propio, guarda y recupera el proyecto, exporta las piezas en el orden correcto y comprueba el movimiento y el audio en el teléfono. Puede hacerlo sin suscripción, sin cuenta y sin entregar sus originales a un servidor de render. Si ese recorrido solo funciona en determinados dispositivos, la pantalla de importación indica el soporte real antes de invertir tiempo en el montaje.

<a id="fuentes"></a>

## 12. Fuentes y comprobaciones pendientes

**Qué se sabe con mayor seguridad.** El reparto comercial 10/20 y las capas de vídeo constan en la página de precios. Las dos salidas se describen expresamente para iPhone. Las operaciones detalladas de capas y guías proceden del análisis de una versión grabada. Las reseñas sirven para elegir pruebas de regresión. No permiten estimar la frecuencia de un fallo. La arquitectura, las reglas de audio, los valores de exportación y el plan de GitHub de esta guía son propuestas propias. [Precios][planesref] · [iPhone][ios] · [Recorrido][ux] · [Testimonios de Android][andes]

**Qué verificar si quieres paridad exacta con una versión concreta.** Anota sistema, versión, país y plan. En iOS y Android repite el mismo proyecto con una foto normal, una panorámica, un clip con tono y dos clips solapados. Registra qué se puede importar y mover, si se puede desplazar el recorte dentro de cada plantilla, qué ofrece Exportar y qué archivos se reciben realmente. Mide tamaño, códec, longitud, audio y fotograma inicial de cada pieza. Cierra y abre el proyecto, y prueba el paso a Instagram. Quedan abiertos, entre otros, los límites concretos por clip, el comportamiento del audio cuando hay solapes, los formatos exactos y la paridad web/móvil. Estas pruebas de producto no se han ejecutado sobre SCRL en esta investigación.

| Fuente | Qué permite contrastar |
|---|---|
| [Web oficial][web] · [Planes oficiales][planesref] · [Entrada web][webapp] | Posicionamiento, formatos, ecosistema, límites por plan y capas de vídeo. |
| [App Store España][ios] · [App Store EE. UU.][iosus] | Salidas, recursos, compras regionales, edición de foto e integraciones anunciadas. |
| [Google Play España][andes] · [Google Play en inglés][anden] | Diferenciar inserción de vídeos, descripción de la exportación y experiencias reportadas. |
| [Demostración editorial de Apple][apple] · [Recorrido de ScreensDesign][ux] | Cómo se parte de una plantilla o panorámica y cómo se manipulan las capas. |
| [Política del servicio][privacy] · [Condiciones de SCRL][terms] | Cuenta, contenido, plantillas públicas, uso de funciones de IA y publicación programada. |
| [Ampliación del carrusel de Instagram][ig] · [API oficial de Meta en Postman][meta] | Contexto de la app de Instagram y separación entre exportar y publicar por API. |
| [HeyPortal/open-scrl][opensource] | Referencia de un proyecto independiente ya existente para comparar el flujo local. |
| [WebCodecs][codecs] · [Vídeo][venc] · [Audio][aenc] · [Mediabunny][bunny] | Primitivas para detectar capacidades, procesar fotogramas y trabajar con contenedores. |
| [Web Share][share] · [Cuotas de almacenamiento][storage] | Entrega al sistema, límites de compatibilidad y recuperación local. |
| [GitHub Pages][pages] · [Límites de Pages][limits] · [Despliegue de Vite][vite] | Publicación del editor estático y configuración de recursos bajo la ruta del repositorio. |

[web]: https://scrl.com/
[planesref]: https://scrl.com/pricing
[webapp]: https://app.scrl.com/
[ios]: https://apps.apple.com/es/app/photo-collage-maker-scrl/id1289057196
[iosus]: https://apps.apple.com/us/app/scrl-photo-collage-maker/id1289057196
[andes]: https://play.google.com/store/apps/details?hl=es&id=com.appostrophe.scrl
[anden]: https://play.google.com/store/apps/details?hl=en-US&id=com.appostrophe.scrl
[apple]: https://apps.apple.com/co/iphone/story/id1781346766
[ux]: https://screensdesign.com/showcase/scrl-photo-collage-maker
[privacy]: https://scrl.com/privacy-policy
[terms]: https://scrl.com/terms-of-service
[ig]: https://techcrunch.com/2024/08/08/instagram-is-embracing-the-photo-dump/
[meta]: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
[opensource]: https://github.com/HeyPortal/open-scrl
[codecs]: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
[venc]: https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static
[aenc]: https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder/isConfigSupported_static
[bunny]: https://mediabunny.dev/guide/supported-formats-and-codecs
[share]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API
[storage]: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
[pages]: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
[limits]: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
[vite]: https://vite.dev/guide/static-deploy.html
