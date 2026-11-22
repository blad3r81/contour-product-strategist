from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import os, subprocess
p=Path('tmp/video-check'); p.mkdir(parents=True,exist_ok=True)
font=Path('C:/Windows/Fonts/arial.ttf')
f=ImageFont.truetype(str(font) if font.exists() else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',42)
for i,n in enumerate([20,15,10,5]):
 im=Image.new('RGB',(640,360),'#eef7f2'); d=ImageDraw.Draw(im)
 d.text((35,35),'SYNTHETIC TEST',font=f,fill='#71398d')
 for j,t in enumerate([f'Week {i+1}', 'Users: 100',f'Repeat: {n}']): d.text((35,100+j*70),t,font=f,fill='#006f4b')
 im.save(p/f'{i+1}.png')
(p/'concat.txt').write_text(''.join(f"file '{i}.png'\nduration 2.5\n" for i in range(1,5))+"file '4.png'\n")
subprocess.run([os.environ.get('FFMPEG','ffmpeg'),'-y','-loglevel','error','-f','concat','-safe','0','-i',str(p/'concat.txt'),'-t','10','-vf','fps=10','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','examples/video-check/cohorts.mp4'],check=True)
