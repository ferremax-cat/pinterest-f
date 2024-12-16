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


            // Cargar grupos y promociones
            const promotions = await this.loadPromotions(clientData.account);
        
            // Extraer grupos únicos de las promociones
            const groups = [...new Set(promotions.map(promo => promo.grupos))];
            
            // Si encontramos el cliente, guardar en localStorage
            if (clientData) {
                const dataToStore = {
                    account: clientData.account,
                    name: clientData.name,
                    categories: clientData.categories,
                    priceList: clientData.priceList,
                    groups: groups,           // Agregamos los grupos
                    promotions: promotions,
                    lastLogin: new Date().toISOString()
                };
                
                // Guardar en localStorage
                localStorage.setItem('clientData', JSON.stringify(dataToStore));
                console.log('Datos guardados en localStorage:', dataToStore);
            }


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
                    // SECCIÓN 1: PROCESAMIENTO DE GRUPOS
                    console.log('Procesando grupos para cliente:', clientAccount);
                    
                    //  Cargar grupos del cliente desde GRUPOS_CLIENTES
                    const gruposUrl = `${this.sheetsUrl}/${config.gruposId}/gviz/tq?tqx=out:json`;
                    console.log('URL grupos:', gruposUrl);
                    
                    const gruposResponse = await fetch(gruposUrl);
                    const gruposData = await gruposResponse.text();
                    const gruposJson = JSON.parse(gruposData.substr(47).slice(0, -2));
            
                    console.log('Datos de grupos recibidos:', gruposJson);
                    console.log('Estructura de tabla:', gruposJson.table);
                    console.log('Primera fila:', gruposJson.table.rows[0]);
            
                    // Encontrar grupos del cliente    
                    const clientGroups = [];
                    gruposJson.table.rows.forEach((row, index) => {

                        // Logs detallados de la estructura de cada fila
                    console.log('----------------------');
                    console.log(`Procesando fila ${index}:`);
                    console.log('Fila completa:', row);
                    console.log('Columnas (row.c):', row.c);
                    console.log('Primera columna (row.c[0]):', row.c[0]);
                    console.log('Segunda columna (row.c[1]):', row.c[1]);
                    console.log('Valor primera columna:', row.c[0]?.v);
                    console.log('Valor segunda columna:', row.c[1]?.v);
                    console.log('Tipo de dato segunda columna:', typeof row.c[1]?.v);

                        
                        if (row.c[1]?.v) {
                            // Primero reemplazar puntos por comas
                            const clientesString = row.c[1].v.toString().replace(/\./g, ',');
                            console.log('String convertido:', clientesString);

                            // Separar clientes y convertir a números
                            const clientesGrupo = row.c[1].v.toString().replace(/\./g, ',')
                                .split(',')          // Separar por coma
                                .map(c => c.trim())  // Quitar espacios
                                .map(Number);        // Convertir a números
                                
                            console.log('Array de cuentas:', clientesGrupo); // ej: [20246, 958, 12345]    
                            const clienteNumero = Number(clientAccount);
                            
                            console.log('Lista de clientes procesada:', clientesGrupo);
                            console.log('Buscando cliente:', clienteNumero);

                            // Agregar logs para ver la comparación
                            clientesGrupo.forEach(cliente => {
                                console.log(`Comparando ${cliente} (${typeof cliente}) con ${clienteNumero} (${typeof clienteNumero})`);
                                console.log('Son iguales?:', cliente === clienteNumero);
                            });
                            
                            // Buscar coincidencia exacta
                            if (clientesGrupo.includes(clienteNumero)) {
                                clientGroups.push(row.c[0]?.v);
                                console.log('Cliente encontrado en grupo:', row.c[0]?.v);
                            }
                        }    
                    });
            
                    
    
            console.log('Grupos del cliente:', clientGroups);

            // SECCIÓN 2: PROCESAMIENTO DE PROMOCIONES
            console.log('Procesando promociones...');        
            //  Cargar promociones desde PROMOCIONES
            const promoUrl = `${this.sheetsUrl}/${config.promocionesId}/gviz/tq?tqx=out:json`;
            const promoResponse = await fetch(promoUrl);
            const promoData = await promoResponse.text();
            const promoJson = JSON.parse(promoData.substr(47).slice(0, -2));

            console.log('Datos promociones:', promoJson);
    

            // SECCIÓN 3: FILTRADO Y MAPEO FINAL
            console.log('Aplicando filtros y formato...');       
            // Filtrar promociones aplicables y mapear a formato amigable
            const today = new Date();
            
            const promocionesFiltered = promoJson.table.rows

            .filter(row => {
                const vigenciaStr = row.c[3]?.v; // Viene como "31/12/2024"
                console.log('Fecha original:', vigenciaStr);
               
                //convertir fecha
                console.log('---------');
                const fechaStr = vigenciaStr; 
                const dateParams = fechaStr.match(/Date\((\d+),(\d+),(\d+)\)/);
                 if (dateParams) { const [_, year, month, day] = dateParams; 
                const fecha = new Date(year, month, day); 
                const dia2 = String(fecha.getDate()).padStart(2, '0'); // Día con dos dígitos 
                const mes2 = String(fecha.getMonth() + 1).padStart(2, '0'); // Mes con dos dígitos (agregamos 1 porque los meses en Date empiezan desde 0) 
                const anio2 = fecha.getFullYear(); 
                const fechaFormateada = `${dia2}/${mes2}/${anio2}`;
                console.log(fechaFormateada); // Debería imprimir "31/12/2024"
                if (today > fechaFormateada) {
                    console.log('Promoción vencida');
                    return false;
                    }
                 }
                console.log('---------');

               const grupoPromo = row.c[4]?.v;
               console.log('Grupo de promoción:', grupoPromo);
               console.log('Grupos del cliente:', clientGroups);
               
               return clientGroups.includes(grupoPromo);
           })


                .map(row => ({
                    codigo: row.c[0]?.v,
                    tipoLista: row.c[1]?.v,
                    precio: row.c[2]?.v,
                    vigencia: row.c[3]?.v,
                    grupos: row.c[4]?.v
                }));
    
            console.log('Promociones encontradas:', promocionesFiltered);
            return promocionesFiltered;
    
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