"""Build the two submission PDFs. Dependencies: reportlab, Pillow. No API keys."""
from pathlib import Path
import re, json, html
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether, Flowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/pdf'; OUT.mkdir(parents=True,exist_ok=True)
font_dir=Path('C:/Windows/Fonts')
if not (font_dir/'arial.ttf').exists():
    font_dir=Path('/usr/share/fonts/truetype/dejavu')
    normal,bold='DejaVuSans.ttf','DejaVuSans-Bold.ttf'
else: normal,bold='arial.ttf','arialbd.ttf'
pdfmetrics.registerFont(TTFont('Body',str(font_dir/normal)))
pdfmetrics.registerFont(TTFont('BodyBold',str(font_dir/bold)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='BodyBold',italic='Body',boldItalic='BodyBold')
GREEN=colors.HexColor('#007b50'); PURPLE=colors.HexColor('#71398d'); INK=colors.HexColor('#29232f')
styles=getSampleStyleSheet()
for name in ('Normal','BodyText','Title','Heading1','Heading2','Heading3','Bullet','Code'):
    styles[name].fontName='Body'
styles['BodyText'].fontSize=10.4; styles['BodyText'].leading=15.4; styles['BodyText'].spaceAfter=8
styles['BodyText'].textColor=INK
styles['Heading1'].fontName='BodyBold';styles['Heading1'].fontSize=20;styles['Heading1'].leading=26;styles['Heading1'].textColor=GREEN;styles['Heading1'].spaceBefore=20;styles['Heading1'].spaceAfter=12
styles['Heading2'].fontName='BodyBold';styles['Heading2'].fontSize=15;styles['Heading2'].leading=20;styles['Heading2'].textColor=PURPLE;styles['Heading2'].spaceBefore=16;styles['Heading2'].spaceAfter=9
styles['Heading3'].fontName='BodyBold';styles['Heading3'].fontSize=12;styles['Heading3'].leading=17
for name in ('Heading1','Heading2','Heading3'): styles[name].keepWithNext=True
styles.add(ParagraphStyle(name='Cell',fontName='Body',fontSize=8.1,leading=11.4,textColor=INK,spaceAfter=1))
styles.add(ParagraphStyle(name='Caption',fontName='Body',fontSize=8.5,leading=12,textColor=colors.HexColor('#665a70'),spaceBefore=6,spaceAfter=15))
styles.add(ParagraphStyle(name='CoverTitle',fontName='BodyBold',fontSize=31,leading=37,textColor=GREEN,spaceAfter=24))

def inline(s):
    s=html.escape(s.replace('\u2011','-').replace('\u2013','-').replace('\u2014','-'))
    s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',lambda m:f'<link href="{m[2]}" color="#71398d">{m[1]}</link>' if m[2].startswith('http') else m[1],s)
    s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`([^`]+)`',r'<font size="9">\1</font>',s)
    s=re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)',r'\1',s)
    # Recover spacing in source notes without damaging URLs, paths or numbers.
    return s

def para(s,style='BodyText'): return Paragraph(inline(s),styles[style])

class Architecture(Flowable):
    def __init__(self): super().__init__();self.width=505;self.height=195
    def draw(self):
        c=self.canv
        boxes=[(0,132,'Запрос и материалы','Чат / голос / файл'),(178,132,'Node API','Чтение / расчёты / выбор'),(356,132,'GigaChat','Анализ и стратегия'),(0,30,'Состояние дела','Материалы / SHA-256 / версии'),(178,30,'Решение человека','Вариант / владелец / пересмотр'),(356,30,'Речевой CPU','ASR / Silero TTS')]
        for x,y,title,sub in boxes:
            c.setFillColor(colors.HexColor('#f2f7f4'));c.setStrokeColor(colors.HexColor('#c9dfd2'));c.roundRect(x,y,150,62,8,fill=1,stroke=1)
            c.setFillColor(GREEN);c.setFont('BodyBold',10);c.drawString(x+10,y+40,title)
            p=para(sub,'Caption');p.wrapOn(c,130,35);p.drawOn(c,x+10,y+10)
        c.setStrokeColor(PURPLE);c.setLineWidth(1.3)
        for x,y,x2,y2 in [(151,163,176,163),(329,163,354,163),(253,130,253,94),(430,130,430,94),(177,61,152,61)]:
            c.line(x,y,x2,y2)
        c.setFont('Body',8);c.setFillColor(INK);c.drawString(0,3,'Секреты находятся на сервере. Предыдущий ответ не превращается в факт.')

def table(rows,width=505):
    cols=len(rows[0]); maxes=[max(len(r[i]) if i<len(r) else 0 for r in rows) for i in range(cols)]
    if cols==7: widths=[151]+[59]*6
    elif cols==3: widths=[105,185,215]
    elif cols==4: widths=[100,135,135,135]
    elif cols==2: widths=[170,335]
    else: widths=[width/cols]*cols
    data=[]
    for j,r in enumerate(rows):
        data.append([Paragraph(('<b>'+inline(v)+'</b>') if j==0 else inline(v),styles['Cell']) for v in r])
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e9f3ed')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.8,GREEN),('LINEBELOW',(0,1),(-1,-1),.35,colors.HexColor('#ded9e3')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    return t

def parse_md(path):
    lines=path.read_text(encoding='utf-8').splitlines();out=[];i=0
    while i<len(lines):
        s=lines[i].strip()
        if not s:i+=1;continue
        if s.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[:\- ]+',x or '-') for x in cells):rows.append(cells)
                i+=1
            if rows:out.extend([table(rows),Spacer(1,12)])
            continue
        im=re.match(r'!\[([^]]+)\]\(([^)]+)\)',s)
        if im:
            file=(path.parent/im[2]).resolve()
            if not file.exists():raise FileNotFoundError(file)
            pic=Image(str(file));pic.drawWidth=505;pic.drawHeight=505*pic.imageHeight/pic.imageWidth
            if pic.drawHeight>390:pic.drawWidth*=390/pic.drawHeight;pic.drawHeight=390
            out.extend([pic,para(im[1],'Caption')]);i+=1;continue
        head=re.match(r'^(#{1,6})\s+(.+)',s)
        if head:
            level=len(head[1]);title=head[2]
            if level==1:out.append(para(title,'Heading1'))
            elif level==2:
                if title.startswith('Часть '):out.append(PageBreak())
                out.append(para(title,'Heading1'))
            else:out.append(para(title,'Heading2'))
            if title.startswith('1. Архитектура'):out.append(Architecture())
            if title.startswith('6. Время'):
                summary=json.loads((ROOT/'examples/megafon-brief/run-summary.json').read_text(encoding='utf-8'))
                out.append(para(f"Суммарно в сохранённых попытках: {summary['seconds']:.3f} с; {summary['usage']['prompt_tokens']} входных и {summary['usage']['completion_tokens']} выходных токенов. Время первой блокировки восстановлено по контрольной точке; это указано в JSON."))
                out.append(table([['Шаг','Секунды','Токены','Результат']]+[[r['step'],str(round(r.get('seconds') or 0,3)),str(r.get('usage',{}).get('total_tokens','нет')),'Блокировка' if r.get('blocked') else 'Ответ получен'] for r in summary['records']]))
            i+=1;continue
        if s.startswith('>'):s=s.lstrip('> ').strip()
        elif re.match(r'^[-*]\s',s):s='• '+s[2:]
        # Only join ordinary paragraph lines, never tables, headings or lists.
        while i+1<len(lines) and lines[i+1].strip() and not re.match(r'^(?:[|#>]|!\[|[-*]\s|\d+\.)',lines[i+1].strip()):
            i+=1;s+=' '+lines[i].strip()
        out.append(para(s));i+=1
    return out

def footer(c,doc):
    c.saveState();c.setStrokeColor(colors.HexColor('#dfd9e5'));c.line(45,40,550,40);c.setFont('Body',8);c.setFillColor(colors.HexColor('#746a7b'));c.drawString(45,26,'КОНТУР РЕШЕНИЯ  /  Материалы для жюри  /  21.11.2026');c.drawRightString(550,26,str(doc.page));c.restoreState()

def build(name,title,subtitle,source):
    story=[Spacer(1,45),para('КОНТУР РЕШЕНИЯ','Heading2'),Spacer(1,25),para(title,'CoverTitle'),para(subtitle),Spacer(1,25)]
    summary=json.loads((ROOT/'examples/megafon-brief/run-summary.json').read_text(encoding='utf-8'))
    story.append(table([['Основа','Свидетельство'],['Официальный бриф','11 страниц; 29 458 символов извлечённого текста'],['Фактический прогон',f"{summary['calls']} обращений с сохранёнными ответами, включая блокировки; {summary['usage']['total_tokens']:,} токенов".replace(',',' ')],['Статус результата','Учебная стратегия с проверкой и редактурой; реального пилота не было'],['Как проверить','Открытые исходники, запросы, JSON, расчёты и перечень исправлений']]))
    story.extend([Spacer(1,25),para('https://decision-contour.vercel.app'),para('https://github.com/blad3r81/contour-product-strategist'),PageBreak()])
    story+=parse_md(source)
    SimpleDocTemplate(str(OUT/name),pagesize=(595.28,841.89),rightMargin=45,leftMargin=45,topMargin=45,bottomMargin=55,title=title,author='Контур решения',pageCompression=1).build(story,onFirstPage=footer,onLaterPages=footer)
    print(name)

build('official-strategy.pdf','Стратегия: связь для близких и устройств','Демонстрационный проект. Один документ из пяти частей: от клиентской ситуации до экономики, плана и решения руководителя.',ROOT/'examples/megafon-brief/strategy.md')
build('work-description.pdf','Как устроен агент и что проверено','Описание работы по требованиям подачи: архитектура, модели и инструменты, инструкции, возможности, измерения, ошибки и ограничения. Со скриншотами фактического интерфейса.',ROOT/'docs/submission/work-description.md')
for name in ('official-strategy.pdf','work-description.pdf'):
    import shutil
    shutil.copyfile(OUT/name,ROOT/'public/submission'/name)
