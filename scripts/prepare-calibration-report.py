"""Write comparison CSV for the *locally evaluated subset* (not bundled in app)."""
import sys,json,csv
import numpy as np
from pathlib import Path
from importlib.machinery import SourceFileLoader
here=Path(__file__).resolve().parent
f=SourceFileLoader('fit_accuracy',str(here/'fit-accuracy-v1016.py')).load_module()
root=Path(sys.argv[1])
games=json.load(open(root/'chess-vs-bots-v1016-evals-combined.private.json'))
features=f.load(str(root/'chess-vs-bots-v1016-features.private.json'))
p=f.pack(features)
old=f.prediction([.1073,.38],p,'simple')
new=f.prediction([.1010956,.2443476,1.0801004],p,'power')
assert len(new)==len(games)*2
out=root/'chess-vs-bots-v1.0.16-comparison.csv'
with out.open('w',newline='',encoding='utf8') as file:
 w=csv.writer(file)
 w.writerow(['chess_com_game_id','account','group','time_class','side','chess_com_accuracy','v1_0_15','v1_0_16','v15_abs_error','v16_abs_error','budget_ms'])
 for i,g in enumerate(games):
  for j,(side,key) in enumerate([('white','accuracy_white'),('black','accuracy_black')]):
   k=2*i+j;target=g[key]
   w.writerow([g['url'].rsplit('/',1)[-1],g.get('account',''),g['split'],g['time_class'],side,
               round(target,2),round(old[k],2),round(new[k],2),round(abs(old[k]-target),2),round(abs(new[k]-target),2),20])
print(out,'rows',len(new))
