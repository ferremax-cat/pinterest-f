import json
from collections import Counter

d = json.load(open('json/productos.json', encoding='utf-8'))
# Prefijos de la tabla EXCEPCIONES_PISO de js/imprimir-hojas.js.
# Al agregar una regla nueva, sumar su prefijo aca para revisar que abarca.
prefijos = ['CRE', 'SB', 'GAG', 'ROCKY', 'PRO', 'PERF', 'TM', 'KO', 'UMI',
            'MOI', 'PLASTI', 'TORN', 'ALI', 'LOU', 'MIC', 'EA', 'LH']

for p in prefijos:
    rubros = Counter(v.get('category', '') for k, v in d.items() if k.upper().startswith(p))
    print(f'\n{p}: {sum(rubros.values())} productos')
    for rubro, n in sorted(rubros.items()):
        print(f'   {n:4}  {rubro}')