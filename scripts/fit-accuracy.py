#!/usr/bin/env python3
"""Train/test evaluation of the Chess vs Bots aggregate-accuracy parameters.

Usage:
  python scripts/fit-accuracy.py shallow-features.json [deep-features.json]

Private game data is kept outside the distributable source archives. Only the
2 global parameters (exponential decay and volatility share) may enter the
app, never game IDs, PGNs, ratings or accuracy targets. The dataset-supplied
train/test split is preserved; *test is only reported, never fitted*.

Install research dependencies separately: pip install numpy scipy
"""
import json, sys, numpy as np
from scipy.optimize import minimize

def read(path):
    rows=json.load(open(path,encoding='utf-8'))
    samples=[]
    for g in rows:
        for side,field in [('w','white'),('b','black')]:
            m=g['groups'][side]
            if not m['loss']: continue
            samples.append((g['split'],g['time_class'],float(g[field]),np.asarray(m['loss']),np.asarray(m['wt'])))
    return samples

def calc(sample,p):
    decay,vol=p
    _,_,_,loss,weight=sample
    move=np.clip(103.1668100711649*np.exp(-decay*loss)-2.166924740191411,0,100)
    mixed=vol*weight+(1-vol)*np.mean(weight)
    return float(np.sum(move*mixed)/np.sum(mixed))

def errors(samples,p):return np.array([calc(s,p)-s[2] for s in samples])

def stat(samples,p):
    if not samples: return {'n':0}
    e=errors(samples,p)
    return dict(n=len(e),mae=round(float(np.mean(abs(e))),3),bias=round(float(e.mean()),3),rmse=round(float(np.sqrt(np.mean(e*e))),3),p90=round(float(np.percentile(abs(e),90)),3),worst=round(float(max(abs(e))),3))

def fit(shallow, deep, deep_weight=24):
    train_s=[s for s in shallow if s[0]=='train']
    train_d=[s for s in deep if s[0]=='train']
    def objective(params):
        es=errors(train_s,params)
        ed=errors(train_d,params) if train_d else []
        # Smooth absolute error; chosen before looking at the held-out test scores.
        return (sum(np.sqrt(es*es+4))+deep_weight*sum(np.sqrt(np.asarray(ed)**2+4)))/(len(es)+deep_weight*len(ed))
    result=min((minimize(objective,x0,method='Nelder-Mead',bounds=[(.05,.22),(0,1)],options={'maxiter':250,'xatol':1e-8,'fatol':1e-8})
                for x0 in [(0.11,0.2),(0.13,0.45),(0.14,0.0)]),key=lambda x:x.fun)
    return result.x

if __name__=='__main__':
    shallow=read(sys.argv[1]);deep=read(sys.argv[2]) if len(sys.argv)>2 else []
    train_s=[s for s in shallow if s[0]=='train'];test_s=[s for s in shallow if s[0]=='test']
    train_d=[s for s in deep if s[0]=='train'];test_d=[s for s in deep if s[0]=='test']
    print('Shallow train/test players:',len(train_s),len(test_s),'; deep train/test players:',len(train_d),len(test_d))
    for label,p in [('v1.0.14',(.14,.45)),('shallow-train-only',fit(shallow,[],0)),('combined-training',fit(shallow,deep))]:
        print('\n',label,'decay',round(p[0],6),'volatility_share',round(p[1],6))
        for src,tr,te in [('Shallow',train_s,test_s),('350ms',train_d,test_d)]:
            print(src,'train',stat(tr,p),'test',stat(te,p))
            if tr and te:
                for tc in ('blitz','rapid'):
                    st=[s for s in te if s[1]==tc]
                    if st: print(' test',tc,stat(st,p))
