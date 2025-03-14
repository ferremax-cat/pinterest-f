// LoginManager.js

import { config } from './config.js';
//import CacheManager from './cacheManager.js';
import ProductManager from './productManager.js';
import ImageLoader from './imageLoader.js';


class LoginManager {

    static #instance = null;

    static getInstance() {
        if (!LoginManager.#instance) {
            LoginManager.#instance = new LoginManager();
        }
        return LoginManager.#instance;
    }


    constructor() {

        if (LoginManager.#instance) {
            return LoginManager.#instance;
        }

        // Ya no necesitamos CacheManager aquí
        this.productManager = ProductManager.getInstance();
        this.imageLoader = ImageLoader.getInstance({ 
            sheetId: config.sheetId
        });
        this.sheetsUrl = config.apiEndpoints.sheets;
        LoginManager.#instance = this;
    }

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
            if (!clientConfig) {
                console.log('Error obteniendo configuración del cliente');
                return false;
            }


              // 3. Buscar promociones aplicables al cliente
              const promotions = await this.loadPromotions(clientData.account);
              console.log('Promociones cargadas:', promotions);


                // 4. Guardar datos completos en localStorage

                const response = await fetch('/json/catalogo_grupos.json');
                const catalogoGrupos = await response.json();

                console.log('3. Catálogo de grupos cargado:', catalogoGrupos);
                console.log('4. Grupos del cliente:', clientConfig.groups);

                console.log('Grupo del cliente:', clientConfig.groups[0]); // Debería mostrar "GRUPO_SINPAR"
                console.log('Códigos permitidos:', catalogoGrupos["GRUPO_SINPAR"]); // Debería mostrar el array de códigos

                console.log('Datos guardados en localStorage:', JSON.parse(localStorage.getItem('clientData')));
            
                // Obtener productos para los grupos del cliente
                const productCodes = [];
                if (clientConfig.groups) {
                    clientConfig.groups.forEach(group => {
                        if (catalogoGrupos[group]) {
                            console.log('5. Códigos encontrados para grupo:', catalogoGrupos[group]);
                            productCodes.push(...catalogoGrupos[group]);
                        }
                    });
                }
            
                 // 5. Crear objeto con datos completos    
                const completeClientData = {
                ...clientConfig,
                promotions: promotions,
                lastLogin: new Date().toISOString(),
                productCodes: catalogoGrupos[clientConfig.groups[0]] || []// Agregar esta línea
                };


            localStorage.setItem('clientData', JSON.stringify(completeClientData));

                // 6. Inicializar gestores con los datos completos
                try {
                    await Promise.all([
                    this.productManager.initialize(completeClientData),
                    this.imageLoader.initialize()
                ]);
                
                // Marcar que los managers están inicializados
                sessionStorage.setItem('managersInitialized', 'true');
            } catch (error) {
                console.error('Error inicializando managers:', error);
                return false;
            }

            console.log('Login exitoso:', clientConfig.account);
            return true;

        } catch (error) {
            console.error('Error en proceso de login:', error);
            return false;
        }
    }




    async validateClient(clave) {
        try {
            console.log('Clave ingresada:', clave, 'tipo:', typeof clave);
            
            // 1. Primero intentar obtener del localStorage
            const cachedData = localStorage.getItem('clientData');

            if (cachedData) {
                console.log('Datos encontrados en localStorage');
                const clientesData = JSON.parse(cachedData);
               
                 // Buscar cliente con formato "numero.numero"
                    for (const [key, clientData] of Object.entries(clientesData)) {
                        if (key.includes('.') && key.split('.').includes(clave.toString())) {
                            console.log('Cliente encontrado en cache:', clientData);
                            return {
                                account: key,
                                ...clientData
                            };
                        }
                    }   

                /* if (clientesData[clave]) {
                    console.log('Cliente encontrado en cache:', clientesData[clave]);
                    return {
                        account: clave,
                        ...clientesData[clave]
                    };
                } */

            }
            
            // 2. Si no está en cache, buscar en el archivo JSON generado por Python
            console.log('Cliente no encontrado en cache, buscando en JSON...');
            
            try {
                const response = await fetch('/json/clientes_permisos.json');
                const clientesData = await response.json();
                
                // Convertir la clave a string para la comparación
                const claveStr = String(clave).trim();
                
                // Buscar el cliente
                if (clientesData[claveStr]) {
                    const clientData = {
                        account: claveStr,
                        name: clientesData[claveStr].name,
                        categories: clientesData[claveStr].categories,
                        priceList: clientesData[claveStr].priceList
                    };
                    
                    // Guardar en localStorage para futuras consultas
                    const dataToCache = {
                        [claveStr]: {
                            name: clientData.name,
                            categories: clientData.categories,
                            priceList: clientData.priceList
                        }
                    };
                    
                    // Actualizar o agregar al localStorage
                    const existingCache = localStorage.getItem('clientData');
                    const updatedCache = existingCache 
                        ? { ...JSON.parse(existingCache), ...dataToCache }
                        : dataToCache;
                        
                    localStorage.setItem('clientData', JSON.stringify(updatedCache));
                    
                    return clientData;
                }
                
                return null; // Cliente no encontrado
                
            } catch (error) {
                console.error('Error leyendo archivo JSON:', error);
                return null;
            }
            
        } catch (error) {
            console.error('Error validando cliente:', error);
            return null;
        }
    }

    
    async loadClientConfig(clientData) {
        try {
            /* const gruposUrl = `${this.sheetsUrl}/${config.gruposId}/gviz/tq?tqx=out:json`;
            const gruposResponse = await fetch(gruposUrl);
            const gruposData = await gruposResponse.text();
            const gruposJson = JSON.parse(gruposData.substr(47).slice(0, -2)); */

            // Encontrar grupos del cliente


            /* const clientGroups = [];
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
            }); */

        // 1. Cargar grupos_clientes.json local
        const response = await fetch('/json/grupos_clientes.json');
        const gruposData = await response.json();
        console.log('1. Datos de grupos cargados:', gruposData);

        // Encontrar grupos del cliente
        const clientGroups = [];
        const clienteNumero = Number(clientData.account);
        console.log('2. Buscando cliente número:', clienteNumero);
        
        // Buscar cliente en los grupos
        for (const [group, accounts] of Object.entries(gruposData.groups)) {
            console.log('3. Revisando grupo:', group, 'cuentas:', accounts);

            //const clienteCompleto = accounts.find(acc => acc.startsWith(clienteNumero.toString()));

            // Modificar esta parte para buscar el número en cualquier parte después del punto
            const clienteCompleto = accounts.some(acc => {
                const partes = acc.split('.');
                return partes.includes(clienteNumero.toString());
            });

            if (clienteCompleto) {
                console.log('4. Cliente encontrado en grupo:', group);
                clientGroups.push(group);
            }
        }
        console.log('5. Grupos del cliente:', clientGroups);

        // 2. Cargar catálogo_grupos.json para obtener productos
        const catalogoGruposResponse = await fetch('/json/catalogo_grupos.json');
        const catalogoGrupos = await catalogoGruposResponse.json();
        console.log('6. Catálogo de grupos cargado:', catalogoGrupos);

        // Obtener los códigos de productos para los grupos del cliente
        const productCodes = [];
        clientGroups.forEach(group => {
            console.log('7. Buscando productos para grupo:', group);
            if (catalogoGrupos[group]) {
                console.log('8. Productos encontrados:', catalogoGrupos[group]);
                productCodes.push(...catalogoGrupos[group]);
            }
        });

        console.log('9. Total productos permitidos:', productCodes);


        const resultado = {
            account: clientData.account,
            name: clientData.name,
            categories: clientData.categories.split(',').map(cat => cat.trim()),
            priceList: clientData.priceList,
            groups: clientGroups,
            productCodes: productCodes
        };
        console.log('10. Datos finales:', resultado);

        return resultado;

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