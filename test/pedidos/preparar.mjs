// Auxiliar de las pruebas con jsdom de test/pedidos (no es una prueba).
//
// Copia los modulos REALES de js/ a una carpeta temporal, con reemplazos
// minimos para los que hablan con el servidor (config.js, sesion.js), e
// importa desde ahi. Asi las pruebas usan siempre el codigo del proyecto, sin
// tocarlo. La carpeta temporal se borra al terminar.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

/** Raiz del proyecto (dos carpetas arriba de test/pedidos) */
export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** jsdom, instalado en node_modules del proyecto (lo trae jest-environment-jsdom) */
export const { JSDOM } = createRequire(join(RAIZ, 'package.json'))('jsdom');

/**
 * modulos: nombres de archivos de js/ a copiar. reemplazos: { 'nombre.js': texto }.
 * Devuelve importar(nombre), que importa el modulo copiado.
 */
export function prepararModulos(modulos, reemplazos = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ferremax-prueba-'));
  process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch (e) {} });
  mkdirSync(join(dir, 'js'));
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');
  modulos.forEach(n => copyFileSync(join(RAIZ, 'js', n), join(dir, 'js', n)));
  Object.entries(reemplazos).forEach(([n, texto]) => writeFileSync(join(dir, 'js', n), texto));
  return n => import(pathToFileURL(join(dir, 'js', n)).href);
}
