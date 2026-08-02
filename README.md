# Dashboard de ventas — Akila

Solución reproducible para preparar, validar y visualizar la cartera ficticia de apartamentos de Akila.

- **Python (solo biblioteca estándar):** valida tipos, reglas de negocio y consistencia financiera; genera datos limpios y un reporte de calidad.
- **JavaScript, HTML y CSS:** presenta indicadores ejecutivos, ventas semanales, mezcla de producto, filtros por tipología y área, análisis de pago y detalle de calidad.
- **Sin dependencias adicionales:** no requiere instalar paquetes con `pip` o `npm`.

## Requisitos

- Python 3.10 o superior.
- Un navegador moderno.

## Instalar Python en Windows (opcional)

Python puede estar instalado previamente. Abre PowerShell y consulta la versión
con cualquiera de estos comandos:

```powershell
python --version
```

```powershell
py --version
```

Según el resultado:

- Si muestra Python 3.10 o una versión superior, no necesitas instalar ni
  actualizar Python.
- Si muestra una versión inferior a Python 3.10, actualízalo con el siguiente
  comando.
- Si ninguno de los comandos funciona, Python no está disponible y debes
  instalarlo con el mismo comando.

Para instalar o actualizar Python:

```powershell
winget install 9NQ7512CXL7T
```

Cuando finalice, cierra y vuelve a abrir PowerShell. Verifica nuevamente la
versión:

```powershell
python --version
```

o:

```powershell
py --version
```
## Clonar y ejecutar

Después de verificar o instalar Python, comprueba que Git esté disponible:

powershell
git --version


Si el comando no funciona, instala Git y vuelve a abrir PowerShell:

powershell
winget install --id Git.Git -e


Clona el repositorio:

powershell
git clone https://github.com/Alexandra961235/Desarrollo-Prueba-Ejercicio-2---Akila.git


Entra en la carpeta raíz del proyecto:

powershell
cd Desarrollo-Prueba-Ejercicio-2---Akila


Si ya habías clonado el repositorio, no necesitas repetir el comando
git clone; abre PowerShell directamente en la carpeta raíz del proyecto.
## Ejecutar

Desde la raíz del repositorio:

```bash
python run.py
```

En Windows también puede usarse:

```powershell
py run.py
```

Después, abrir [http://localhost:8000](http://localhost:8000). Para usar otro puerto:

```bash
python run.py --port 8080
```

Para permitir el acceso desde otro equipo de la misma red local:

```powershell
python run.py --host 0.0.0.0 --port 8000
```

No uses `python -m http.server`: ese servidor no ejecuta el procesamiento ni
acepta el endpoint de actualización.

El comando prepara los datos y levanta el dashboard. Para ejecutar únicamente la preparación:

```bash
python src/prepare_data.py
```

## Actualizar datos desde el dashboard

La carpeta de entrada definida es `data/raw/` y el archivo esperado es
`data/raw/apartamentos_akila.csv`. Reemplaza o modifica ese CSV conservando las
columnas indicadas y pulsa **Actualizar datos** en la barra superior. El servidor
vuelve a validar y procesar el archivo, actualiza el dashboard y recarga las
visualizaciones sin reiniciarlo.

El botón funciona al ejecutar el proyecto con `python run.py`; un servidor de
archivos estáticos no puede procesar el CSV.

## Validar

```bash
python -m unittest discover -s tests -v
```

## Estructura

```text
akila-dashboard/
├── data/
│   ├── raw/apartamentos_akila.csv
│   └── processed/                 # generado por Python
├── dashboard/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/prepare_data.py
├── tests/test_prepare_data.py
└── run.py
```

## Reglas de calidad

La preparación verifica:

- esquema y columnas obligatorias;
- enteros, decimales, porcentajes y fechas ISO (`AAAA-MM-DD`);
- valores permitidos para estado, tipo de apartamento y forma de pago;
- `id` único;
- coherencia entre torre, piso, puerta y el texto de `apartamento`;
- campos de venta vacíos cuando el apartamento está disponible;
- fecha y forma de pago informadas cuando está vendido;
- porcentaje de crédito igual a cero para contado;
- suma de crédito y contado igual al precio;
- monto de crédito compatible con el porcentaje, con tolerancia de redondeo;
- posibles apartamentos duplicados, reportados sin eliminarlos automáticamente.

El archivo original contiene 457 filas y `id` únicos, pero nombres de apartamento repetidos. Se conserva cada fila porque el enunciado declara que cada una representa un apartamento y no existe una regla de negocio suficiente para decidir cuál registro eliminar. El dashboard muestra esta observación en el panel de calidad.

## Lectura financiera

La sección de ventas realizadas descompone el valor vendido entre monto de contado y monto financiado, además de mostrar forma de pago y distribución del porcentaje de crédito. Es una **aproximación a la composición contractual del recaudo**, no un flujo de caja fechado: el CSV no incluye cuotas, anticipos, desembolsos ni fechas reales de recaudo.

## Decisiones de diseño

El dashboard se desarrolló como una aplicación web local con **HTML, CSS y
JavaScript**, sin frameworks de frontend. La preparación y validación de los
datos se implementó en **Python**, utilizando únicamente su biblioteca
estándar. El mismo proyecto incluye un servidor HTTP local que permite consultar
el dashboard y actualizar los datos desde la interfaz.

La solución se diseñó con una presentación ejecutiva, adaptable a diferentes
tamaños de pantalla y preparada para impresión desde el navegador. Los filtros
de fechas, métricas, períodos, tipologías y áreas permiten explorar la
información sin modificar el archivo fuente. Las visualizaciones priorizan la
comparación, el orden de mayor a menor y el uso de colores semáforo para facilitar
la interpretación de los resultados.
