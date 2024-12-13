// js/loginManager.js

// Clase que maneja la autenticación y carga inicial de datos del cliente
class LoginManager {
    constructor() {
        // Obtener configuración global
        this.sheetId = config.sheetId;
        this.sheetsUrl = config.apiEndpoints.sheets;
        // Flag para control de inicialización
        this.initialized = false;
    }
 
    // Método principal que maneja todo el proceso de login
    async processLogin(inputClave) {
        try {
            // 1. Verificar si la clave existe en CLIENTES_PERMISOS
            const clientData = await this.validateClient(inputClave);
            if (!clientData) {
                console.log('Cliente no encontrado');
                return false;
            }
 
            // 2. Obtener configuración completa del cliente
            const clientConfig = await this.loadClientConfig(clientData);
 
            // 3. Buscar promociones aplicables al cliente
            const promotions = await this.loadPromotions(clientData.CUENTA);
 
            // 4. Guardar datos completos en localStorage
            localStorage.setItem('clientData', JSON.stringify({
                ...clientConfig,
                promotions: promotions,
                lastLogin: new Date().toISOString()
            }));
 
            console.log('Login exitoso:', clientConfig.account);
            return true;
 
        } catch (error) {
            console.error('Error en proceso de login:', error);
            return false;
        }
    }
 
    // Valida la existencia del cliente en CLIENTES_PERMISOS
    async validateClient(clave) {
        try {
            // Log de inicio, mostrando valor y tipo de clave recibida
            console.log('1. Inicio validación con clave:', clave, typeof clave);
            
            // Construir URL para acceder al Google Sheet usando ID de configuración
            const sheetUrl = `${this.sheetsUrl}/${config.clientesPermisosId}/gviz/tq?tqx=out:json`;
            // Realizar petición HTTP al Sheet
            const response = await fetch(sheetUrl);

            // Obtener respuesta como texto
            const text = await response.text();
            // Convertir respuesta a JSON (removiendo caracteres extra de Google)
            const json = JSON.parse(text.substr(47).slice(0, -2));
    
            // Log de datos recibidos para debugging
            console.log('2. Datos recibidos de la tabla:', json.table);
            console.log('3. Primera fila de datos:', json.table.rows[0]);
            
             // Variable para almacenar datos del cliente si se encuentra
            let clientData = null;
            // Recorrer cada fila del Sheet
            json.table.rows.forEach((row, index) => {
                // Obtener valor de la columna CUENTA
                const cuentaValue = row.c[0]?.v;

                // Log de comparación para cada fila
                console.log(`4. Fila ${index}: Comparando cuenta ${cuentaValue} (${typeof cuentaValue}) con clave ${clave} (${typeof clave})`);
                
                // Comparar valores convertidos a número
                if (Number(cuentaValue) === Number(clave)) {
                    clientData = {
                        account: cuentaValue,      // Número de cuenta
                        name: row.c[1]?.v,         // Nombre del cliente
                        categories: row.c[2]?.v,    // Categorías permitidas
                        priceList: row.c[3]?.v     // Lista de precios asignada
                    };
                    console.log('5. Cliente encontrado:', clientData);
                }
            });
    
            // Log del resultado final
            console.log('6. Resultado final:', clientData);
            return clientData;
    
        } catch (error) {
            // Log si ocurre algún error durante el proceso
            console.error('Error en validateClient:', error);
            return null;
        }
    }
 
    // Carga y procesa la configuración completa del cliente
    async loadClientConfig(clientData) {
        return {
            account: clientData.CUENTA,          // Código de cuenta
            name: clientData.NOMBRE,             // Nombre del cliente
            categories: clientData.CATEGORIAS.split(',').map(cat => cat.trim()),  // Categorías permitidas
            priceList: clientData.LISTA_PRECIOS  // Lista de precios asignada
        };
    }
 
    // Carga las promociones aplicables al cliente
    async loadPromotions(clientAccount) {
        try {
            // 1. Cargar grupos del cliente desde GRUPOS_CLIENTES
            const grupos = await this.loadSheet('GRUPOS_CLIENTES');
            
            // Encontrar grupos a los que pertenece el cliente
            const clientGroups = grupos
                .filter(grupo => grupo.CLIENTES.includes(clientAccount))
                .map(grupo => grupo.NOMBRE_GRUPO);
 
            if (clientGroups.length === 0) {
                console.log('Cliente sin grupos asignados');
                return [];
            }
 
            // 2. Cargar promociones desde PROMOCIONES
            const promociones = await this.loadSheet('PROMOCIONES');
            
            // Filtrar promociones aplicables según grupos del cliente
            const today = new Date();
            return promociones.filter(promo => {
                // Verificar vigencia de la promoción
                const vigenciaHasta = new Date(promo.VIGENCIA_HASTA);
                if (today > vigenciaHasta) return false;
 
                // Verificar si algún grupo del cliente está en la promoción
                const gruposPromo = promo.GRUPOS.split(',').map(g => g.trim());
                return gruposPromo.some(grupo => clientGroups.includes(grupo));
            });
 
        } catch (error) {
            console.error('Error cargando promociones:', error);
            return [];
        }
    }
 
    // Utilidad para cargar y parsear hojas de Excel
    async loadSheet(sheetName) {
        try {
            // Construir URL de la hoja
            // Determinar qué ID usar según el sheet que queremos
            const sheetId = sheetName === 'CLIENTES_PERMISOS' 
            ? config.clientesPermisosId 
            : config.sheetId;

            // Log para debug
            console.log(`Cargando sheet: ${sheetName} con ID: ${sheetId}`);
        
            const sheetUrl = `${this.sheetsUrl}/${sheetId}/gviz/tq?tqx=out:json`;


            // Realizar petición
            const response = await fetch(sheetUrl);
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
            
            // Procesar respuesta
            const text = await response.text();
            const json = JSON.parse(text.substr(47).slice(0, -2));
            
            // Convertir datos a formato usable
            return this.parseSheetData(json);
 
        } catch (error) {
            console.error(`Error cargando hoja ${sheetName}:`, error);
            throw error;
        }
    }
 
    // Método auxiliar para parsear datos de las hojas
    parseSheetData(json) {
        // Obtener nombres de columnas
        const headers = json.table.cols.map(col => col.label);
        
        // Convertir filas a objetos con nombres de columnas
        return json.table.rows.map(row => {
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = row.c[index]?.v || '';
            });
            return rowData;
        });
    }
 }