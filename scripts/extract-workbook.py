"""Extract the reference rubric without executing Excel macros (stdlib only)."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
with ZipFile(ROOT / 'Evaluation TB Grilles et protocole.xlsm') as z:
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    strings = [''.join(s.itertext()) for s in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    def cells(sheet):
        result = {}
        for c in ET.fromstring(z.read(f'xl/worksheets/sheet{sheet}.xml')).findall('.//m:c', ns):
            v = c.find('m:v', ns)
            if v is not None:
                result[c.attrib['r']] = strings[int(v.text)] if c.get('t') == 's' else v.text
        return result
    grid, oral, acronyms = cells(3), cells(5), cells(1)
    criteria = []
    for i, row in enumerate([16, 19, 21, 23, 25]):
        label = grid[f'A{row}'].split('. ', 1)[1]
        title, detail = label.split(' (', 1)
        criteria.append({'id': ['intermediate', 'personal', 'report', 'work', 'defense'][i], 'title': title, 'description': detail.rstrip(')'), 'minimum': round(float(grid[f'L{row}']) * 100)})
    oral_criteria = [{'id': f'oral-{i+1}', 'title': oral[f'A{row}'], 'max': int(oral[f'D{row}']), 'group': 'expression' if row < 31 else 'subject'} for i, row in enumerate([11,15,19,23,27,41,45,49,53,57,61,65])]
    data = {'source': 'Evaluation TB Grilles et protocole.xlsm', 'criteria': criteria, 'oralCriteria': oral_criteria, 'programs': [{'code': 'GE' if acronyms[f'A{r}'] == 'ELCI' else acronyms[f'A{r}'], 'label': 'Génie Électrique' if acronyms[f'A{r}'] == 'ELCI' else acronyms[f'B{r}']} for r in range(2,6)], 'orientations': [{'code': acronyms[f'C{r}'], 'label': acronyms[f'D{r}']} for r in range(2,10)]}
    (ROOT/'shared/rubric.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
