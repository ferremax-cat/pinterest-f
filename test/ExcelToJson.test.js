// test/ExcelToJson.test.js
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

describe('Excel to JSON Conversion Tests', () => {
    test('should validate CLIENTES_PERMISOS structure', () => {
        const jsonPath = path.join(__dirname, '../json/clientes_permisos.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // Verificar que cada cliente tiene la estructura correcta
        jsonData.forEach(cliente => {
            expect(cliente).toHaveProperty('CUENTA');
            expect(cliente).toHaveProperty('NOMBRE');
            expect(cliente).toHaveProperty('CATEGORIAS');
            expect(cliente).toHaveProperty('LISTA_PRECIOS');
            
            // Verificar que LISTA_PRECIOS sea válida
            expect(['LISTA_D', 'LISTA_E', 'LISTA_F']).toContain(cliente.LISTA_PRECIOS);
        });
    });

    test('should validate GRUPOS_CLIENTES structure', () => {
        const jsonPath = path.join(__dirname, '../json/grupos_clientes.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        jsonData.forEach(grupo => {
            expect(grupo).toHaveProperty('NOMBRE_GRUPO');
            expect(grupo).toHaveProperty('CLIENTES');
            // Verificar que CLIENTES sea una lista separada por comas
            expect(grupo.CLIENTES).toMatch(/^[A-Z0-9,]+$/);
        });
    });

    test('should validate PRODUCTOS structure', () => {
        const jsonPath = path.join(__dirname, '../json/productos.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        jsonData.forEach(producto => {
            expect(producto).toHaveProperty('CODIGO');
            expect(producto).toHaveProperty('ARTICULO');
            expect(producto).toHaveProperty('RUBRO');
            expect(producto).toHaveProperty('BULTO');
            expect(producto).toHaveProperty('P_LISTA_D');
            expect(producto).toHaveProperty('P_LISTA_E');
            expect(producto).toHaveProperty('P_LISTA_F');

            // Verificar que los precios sean números
            expect(typeof producto.P_LISTA_D).toBe('number');
            expect(typeof producto.P_LISTA_E).toBe('number');
            expect(typeof producto.P_LISTA_F).toBe('number');
            expect(typeof producto.BULTO).toBe('number');
        });
    });

    test('should validate PROMOCIONES structure', () => {
        const jsonPath = path.join(__dirname, '../json/promociones.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        jsonData.forEach(promocion => {
            expect(promocion).toHaveProperty('CODIGO_PRODUCTO');
            expect(promocion).toHaveProperty('TIPO_LISTA');
            expect(promocion).toHaveProperty('PRECIO_ESPECIAL');
            expect(promocion).toHaveProperty('VIGENCIA_HASTA');
            expect(promocion).toHaveProperty('GRUPOS');

            // Verificar que PRECIO_ESPECIAL sea número
            expect(typeof promocion.PRECIO_ESPECIAL).toBe('number');
            // Verificar formato de fecha
            expect(promocion.VIGENCIA_HASTA).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            // Verificar que TIPO_LISTA sea válido
            expect(['LISTA_D', 'LISTA_E', 'LISTA_F']).toContain(promocion.TIPO_LISTA);
        });
    });

    test('should handle data relationships correctly', () => {
        // Cargar todos los archivos JSON
        const clientesData = JSON.parse(fs.readFileSync(path.join(__dirname, '../json/clientes_permisos.json'), 'utf8'));
        const gruposData = JSON.parse(fs.readFileSync(path.join(__dirname, '../json/grupos_clientes.json'), 'utf8'));
        const productosData = JSON.parse(fs.readFileSync(path.join(__dirname, '../json/productos.json'), 'utf8'));
        const promocionesData = JSON.parse(fs.readFileSync(path.join(__dirname, '../json/promociones.json'), 'utf8'));

        // Verificar relaciones entre entidades
        promocionesData.forEach(promocion => {
            // Verificar que el producto existe
            const productoExiste = productosData.some(p => p.CODIGO === promocion.CODIGO_PRODUCTO);
            expect(productoExiste).toBe(true);

            // Verificar que los grupos existen
            const grupos = promocion.GRUPOS.split(',');
            grupos.forEach(grupo => {
                const grupoExiste = gruposData.some(g => g.NOMBRE_GRUPO === grupo);
                expect(grupoExiste).toBe(true);
            });
        });
    });

    test('should handle special characters and data types', () => {
        const productosData = JSON.parse(fs.readFileSync(path.join(__dirname, '../json/productos.json'), 'utf8'));

        productosData.forEach(producto => {
            // Verificar formato del código
            expect(producto.CODIGO).toMatch(/^[A-Z0-9]+$/);
            // Verificar que los precios sean positivos
            expect(producto.P_LISTA_D).toBeGreaterThan(0);
            expect(producto.P_LISTA_E).toBeGreaterThan(0);
            expect(producto.P_LISTA_F).toBeGreaterThan(0);
            // Verificar que BULTO sea entero positivo
            expect(Number.isInteger(producto.BULTO)).toBe(true);
            expect(producto.BULTO).toBeGreaterThan(0);
        });
    });
});