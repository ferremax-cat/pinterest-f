# Documentación del Proyecto Pinterest-f

## 1. ESTADO ACTUAL DEL PROYECTO
- Repositorio desarrollo y producción: ferremax-cat/pinterest-f
- Estructura local: 
  * C:\ferremax-catalogo (desarrollo y producción)
- Ramas: main (desarrollo) y production (versión clientes)
- GitHub Pages activo en rama production

## 2. ARCHIVOS PRINCIPALES
- index.html: Galería de productos
- estilos-copia.css: Estilos y media queries
- imagenes_drive.xlsx: IDs de imágenes en Drive
- credentials.json: Credenciales para acceso

## 3. CONFIGURACIÓN GIT
- Repositorio ferremax-cat configurado con credenciales locales
- GitHub Pages usando rama production
- Flujo de trabajo: main -> production

## 4. SISTEMA DE IMÁGENES
- Imágenes alojadas en Google Drive
- Excel con mapeo de códigos e IDs
- Soporte para .jpg y .webp

## 5. FLUJO DE TRABAJO DIARIO
- Desarrollo en rama main:
  * git checkout main
  * hacer cambios
  * git add .
  * git commit -m "descripción"
  * git push origin main

- Pasar a producción:
  * git checkout production
  * git merge main
  * git push origin production
  * Esperar actualización de GitHub Pages (1-5 minutos)

## 6. SOLUCIONES IMPLEMENTADAS
- Manejo de diferentes extensiones de imagen (.jpg, .webp)
- Sistema de carga dinámica de imágenes desde Drive
- Responsive design implementado con media queries
- Sincronización desarrollo-producción mediante ramas

## 7. COMANDOS FRECUENTES
- Ver rama actual: git branch
- Cambiar rama: git checkout [rama]
- Ver estado: git status
- Ver cambios: git log

## 8. URLs IMPORTANTES
- Repositorio: https://github.com/ferremax-cat/pinterest-f
- Sitio publicado: https://ferremax-cat.github.io/pinterest-f/

## 9. ESTRUCTURA DE MEDIA QUERIES
- Pantallas grandes (>1200px): 4 columnas
- Tablets (992px-1200px): 3 columnas
- Móviles (768px-992px): 2 columnas
- Móviles pequeños (<768px): 2 columnas con ajustes específicos

## 10. MANEJO DE ERRORES COMUNES
- Imagen no visible: verificar ID en Excel y permisos en Drive
- Cambios no visibles en producción: esperar rebuild de GitHub Pages
- Conflictos de merge: resolver en main antes de pasar a production
- Errores de credenciales: verificar git config --local

## 11. ACTUALIZACIONES DE CONTENIDO
- Agregar nueva imagen:
  * Subir a Drive y configurar permisos
  * Agregar entrada en Excel con ID
  * Actualizar HTML si es necesario
  * Seguir flujo normal de git

## 12. SEGURIDAD Y PERMISOS
- Imágenes en Drive: "Cualquier persona con el enlace"
- GitHub Pages: rama production pública
- Repositorio: acceso mediante cuenta ferremax-cat

## 13. PERSONALIZACIÓN DE LA GALERÍA
- Estructura de cada producto:
  * container-img: contenedor principal
  * top-row: título del producto
  * bottom-row: código de producto (evo...)
  * info-img: información adicional
  * reactions: precio y ofertas

## 14. RESPALDO Y SEGURIDAD
- Código fuente en rama main
- Versión estable en rama production
- Excel respaldado en Drive
- Credenciales en archivo local no versionado

## 15. MANTENIMIENTO
- Actualización de productos:
  * Modificar Excel para nuevas imágenes
  * Actualizar HTML para nuevos productos
  * Seguir flujo git: main -> production

- Limpieza periódica:
  * Verificar imágenes no usadas en Drive
  * Actualizar permisos de archivos
  * Revisar consistencia Excel-HTML

## 16. TROUBLESHOOTING
- Ver logs en consola del navegador
- Verificar Network para carga de imágenes
- Revisar Actions en GitHub para estado del build
- Comprobar permisos en Drive regularmente

## 17. ESTRUCTURA DE PERMISOS Y ACCESOS
- Google Drive:
  * Permisos de lectura pública para imágenes
  * Excel de mapeo con acceso controlado
  * Backup de configuraciones

- GitHub:
  * Repositorio público para GitHub Pages
  * Commits autenticados con usuario ferremax-cat
  * Branch protection en production (opcional)

## 18. DIAGNÓSTICO Y MONITOREO
- Verificación de imágenes:
  * Console.log de IDs cargados
  * Estado de carga de imágenes
  * Mapeo código-ID exitoso

- Monitoreo de GitHub Pages:
  * Estado del deploy
  * Tiempo de actualización
  * Logs de build

## 19. ESCALABILIDAD
- Agregar productos:
  * Mantener estructura HTML consistente
  * Seguir nomenclatura de códigos
  * Respetar formato en Excel

- Modificar estilos:
  * Cambios en main primero
  * Probar en diferentes dispositivos
  * Verificar media queries

## 20. OPTIMIZACIÓN DE RENDIMIENTO
- Imágenes:
  * Carga dinámica desde Drive
  * Soporte múltiples formatos (.jpg, .webp)
  * Manejo de errores de carga

- Responsive:
  * Grid adaptativo
  * Breakpoints optimizados
  * Ajustes específicos por dispositivo

## 21. PROCESO DE ACTUALIZACIÓN
- Nuevos Productos:
  1. Subir imagen a Drive
  2. Actualizar Excel con ID
  3. Agregar en main
  4. Probar localmente
  5. Push a main
  6. Merge a production
  
- Modificaciones:
  1. Cambios en main
  2. Pruebas locales
  3. Actualizar Excel si necesario
  4. Seguir flujo git normal

## 22. DOCUMENTACIÓN DE CÓDIGO
- HTML:
  * Estructura de galería
  * Sistema de clases
  * Formato de productos

- CSS:
  * Variables globales
  * Media queries
  * Estructura responsive

## 23. SISTEMA DE NAVEGACIÓN
- Menú Principal:
  * Logo
  * Botón inicio
  * Barra búsqueda
  * Iconos de navegación
  
- Elementos Interactivos:
  * Botones inferiores flotantes
  * Hover effects en productos
  * Bottom-row con códigos

## 24. GESTIÓN DE VERSIONES
- Branch Strategy:
  * main: desarrollo y pruebas
  * production: versión pública
  * Sin commits directos a production
  * Merge siempre desde main

- Convenciones de Commits:
  * test: pruebas y verificaciones
  * fix: correcciones de errores
  * feat: nuevas características

## 25. PROCESO DE PRUEBAS
- Local:
  * Visualización en diferentes navegadores
  * Pruebas responsive con DevTools
  * Verificación de carga de imágenes

- Producción:
  * Verificar deploy en GitHub Pages
  * Comprobar URLs de imágenes
  * Testing en dispositivos reales

## 26. SISTEMA DE CLASES CSS
- Contenedores:
  * gallery-container: grid principal
  * container-img: wrapper de imagen
  * info-img: información adicional
  * bottom-row: códigos de producto

- Utilidades:
  * Variables CSS en :root
  * Prefijos para navegadores
  * Clases de apoyo responsive

## 27. MANEJO DE ASSETS
- Google Drive:
  * Estructura de carpetas
  * Nomenclatura de archivos
  * Sistema de respaldo

- Archivos Locales:
  * Excel de mapeo
  * Estilos CSS
  * HTML principal

## 28. CHECKLIST DE DEPLOY
- Pre-deploy:
  * Verificar cambios en main
  * Comprobar Excel actualizado
  * Test local completo

- Deploy:
  * Merge a production
  * Push a GitHub
  * Verificar GitHub Pages
  * Comprobar imágenes