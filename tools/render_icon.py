from pathlib import Path
import math
from PIL import Image,ImageDraw
size=2048
image=Image.new('RGB',(size,size));pixels=image.load()
for y in range(size):
 for x in range(size):
  t=(x+y)/(2*size);pixels[x,y]=(round(34*(1-t)+16*t),round(44*(1-t)+21*t),round(51*(1-t)+27*t))
draw=ImageDraw.Draw(image)
for angle in [-90,30,150]:
 a=math.radians(angle);r=524;dx=r*math.cos(a);dy=r*math.sin(a)
 points=[(1024-dx,1024-dy),(1024+dx,1024+dy)];draw.line(points,fill=(184,221,202),width=134)
 for x,y in points:draw.ellipse((x-67,y-67,x+67,y+67),fill=(184,221,202))
image.resize((1024,1024),Image.Resampling.LANCZOS).save(Path(__file__).parent.parent/'ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon.png')
print('Rendered code-native app icon, 1024 RGB')
