// LoginManager.js

class LoginManager {
    constructor() {
        this.cacheManager = new CacheManager();
        this.productManager = new ProductManager({ cacheManager: this.cacheManager });
        this.imageLoader = new ImageLoader({ 
            cacheManager: this.cacheManager,
            sheetId: config.sheetId
        });
    }

    async processLogin(inputClave) {
        try {
            // 1. Verificar si la clave existe en CLIENTES_PERMISOS
            const clientData = await this.validateClient(inputClave);
            if (!clientData) {
                console.log('Cliente no encontrado');
                return false;
            }
            console.log('Cliente validado:', clientData);

            // 2. Obtener configuración completa del cliente
            const clientConfig = await this.loadClientConfig(clientData);
            if (!clientConfig) {
                console.log('Error obteniendo configuración del cliente');
                return false;
            }
            console.log('Configuración del cliente cargada:', clientConfig);

            // 3. Buscar promociones aplicables al cliente
            const promotions = await this.loadPromotions(clientData.account);
            console.log('Promociones cargadas:', promotions);

            // 4. Guardar datos completos en localStorage
            const completeClientData = {
                ...clientConfig,
                promotions: promotions,
                lastLogin: new Date().toISOString()
            };
            localStorage.setItem('clientData', JSON.stringify(completeClientData));

            // 5. Inicializar gestores con los datos completos
            await this.productManager.initialize(completeClientData);
            await this.imageLoader.initialize();

            // 6. Guardar instancias para acceso global
            window.productManager = this.productManager;
            window.imageLoader = this.imageLoader;

            console.log('Login exitoso:', clientConfig.account);
            return true;

        } catch (error) {
            console.error('Error en proceso de login:', error);
            return false;
        }
    }

    async validateClient(clave) {
        try {
            const sheetUrl = `${this.sheetsUrl}/${config.clientesPermisosId}/gviz/tq?tqx=out:json`;
            const response = await fetch(sheetUrl);
            const text = await response.text();
            const json = JSON.parse(text.substr(47).slice(0, -2));

            let clientData = null;
            json.table.rows.forEach(row => {
                const cuentaValue = row.c[0]?.v;
                if (Number(cuentaValue) === Number(clave)) {
                    clientData = {
                        account: cuentaValue,
                        name: row.c[1]?.v,
                        categories: row.c[2]?.v,
                        priceList: row.c[3]?.v
                    };
                }
            });

            return clientData;
        } catch (error) {
            console.error('Error validando cliente:', error);
            return null;
        }
    }

    async loadClientConfig(clientData) {
        try {
            const gruposUrl = `${this.sheetsUrl}/${config.gruposId}/gviz/tq?tqx=out:json`;
            const gruposResponse = await fetch(gruposUrl);
            const gruposData = await gruposResponse.text();
            const gruposJson = JSON.parse(gruposData.substr(47).slice(0, -2));

            // Encontrar grupos del cliente
            const clientGroups = [];
            gruposJson.table.rows.forEach(row => {
                if (row.c[1]?.v) {
                    const clientesString = row.c[1].v.toString().replace(/\./g, ',');
                    const clientesGrupo = clientesString.split(',')
                        .map(c => c.trim())
                        .map(Number);
                    
                    const clienteNumero = Number(clientData.account);
                    if (clientesGrupo.includes(clienteNumero)) {
                        clientGroups.push(row.c[0]?.v);
                    }
                }
            });

            return {
                account: clientData.account,
                name: clientData.name,
                categories: clientData.categories.split(',').map(cat => cat.trim()),
                priceList: clientData.priceList,
                groups: clientGroups
            };
        } catch (error) {
            console.error('Error cargando configuración del cliente:', error);
            return null;
        }
    }

    async loadPromotions(clientAccount) {
        try {
            const promoUrl = `${this.sheetsUrl}/${config.promocionesId}/gviz/tq?tqx=out:json`;
            const promoResponse = await fetch(promoUrl);
            const promoData = await promoResponse.text();
            const promoJson = JSON.parse(promoData.substr(47).slice(0, -2));

            const today = new Date();
            
            return promoJson.table.rows
                .filter(row => {
                    // Verificar fecha de vigencia
                    const vigenciaStr = row.c[3]?.v;
                    const vigencia = new Date(vigenciaStr);
                    
                    // Verificar grupo
                    const grupoPromo = row.c[4]?.v;
                    const clientGroups = this.clientConfig?.groups || [];
                    
                    return today <= vigencia && clientGroups.includes(grupoPromo);
                })
                .map(row => ({
                    codigo: row.c[0]?.v,
                    tipoLista: row.c[1]?.v,
                    precio: row.c[2]?.v,
                    vigencia: row.c[3]?.v,
                    grupos: row.c[4]?.v
                }));

        } catch (error) {
            console.error('Error cargando promociones:', error);
            return [];
        }
    }

    /**
     * Utilidad para cargar y parsear hojas de Google Sheets
     * @param {string} sheetName - Nombre de la hoja a cargar
     * @returns {Promise<Array>} Datos procesados de la hoja
     */
    async loadSheet(sheetName) {
        try {
            // Determinar qué ID usar según el sheet que queremos
            const sheetId = sheetName === 'CLIENTES_PERMISOS' 
                ? config.clientesPermisosId 
                : config.sheetId;
            // Log para debugging
            console.log(`Cargando sheet: ${sheetName} con ID: ${sheetId}`);
        
            // Construir URL completa para acceder al Sheet
            const sheetUrl = `${this.sheetsUrl}/${sheetId}/gviz/tq?tqx=out:json`;

            // Realizar petición HTTP
            const response = await fetch(sheetUrl);
            // Verificar si la respuesta es exitosa
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
            
            // Obtener el texto de la respuesta
            const text = await response.text();
            // Convertir la respuesta de Google Sheets a JSON (removiendo caracteres extra)
            const json = JSON.parse(text.substr(47).slice(0, -2));
            
            // Convertir datos a formato usable usando parseSheetData
            return this.parseSheetData(json);
 
        } catch (error) {
            // Registrar error y propagar para manejo superior
            console.error(`Error cargando hoja ${sheetName}:`, error);
            throw error;
        }
    }
 
    /**
     * Método auxiliar para parsear datos de las hojas
     * @param {Object} json - Datos JSON de Google Sheets
     * @returns {Array} Datos formateados
     */
    parseSheetData(json) {
        // Obtener nombres de columnas del sheet
        const headers = json.table.cols.map(col => col.label);
        
        // Convertir filas a objetos con nombres de columnas
        return json.table.rows.map(row => {
            // Crear objeto para almacenar datos de la fila
            const rowData = {};
            // Iterar por cada columna usando los headers como keys
            headers.forEach((header, index) => {
                // Asignar valor de la celda o cadena vacía si no existe
                rowData[header] = row.c[index]?.v || '';
            });
            return rowData;
        });
    }

}

export default LoginManager;