#!/usr/bin/env python3
"""Reproducible train / held-out calibration of the Chess vs Bots accuracy curve.

Usage: python scripts/fit-accuracy-v1016.py features.json deep-features.json

Engine features contain user-supplied reference labels and must NOT be shipped
with app builds. Trains only on the `train` split. The `test` split and the
`profile-test` split are reported for independent verification, never fitted.
The current model families are predeclared and chosen solely on `validation`.
"""
import sys, json
import numpy as np
from scipy.optimize import minimize

ROOT='/mnt/data'

def load(fname):
    rows=json.load(open(fname,encoding='utf8'))
    samples=[]
    for g in rows:
        for side,field in [('w','white'),('b','black')]:
            x=g['groups'][side]
            if not x['loss']: continue
            samples.append(dict(split=g['split'],account=g.get('account','old-martin'),tc=g.get('time_class',''),
                target=float(g[field]),loss=np.array(x['loss'],dtype=float),wt=np.array(x['wt'],dtype=float)))
    return samples

def pack(rows):
    if not rows: return None
    n=len(rows);maxlen=max(len(r['loss']) for r in rows)
    L=np.zeros((n,maxlen));W=np.zeros((n,maxlen));M=np.zeros((n,maxlen))
    for i,r in enumerate(rows):
        m=len(r['loss']);L[i,:m]=r['loss'];W[i,:m]=r['wt'];M[i,:m]=1
    return dict(L=L,W=W,M=M,targets=np.array([r['target'] for r in rows]),rows=rows)

def prediction(p, data, mode):
    decay,vol=p[:2]
    L,W,M=data['L'],data['W'],data['M']
    if mode=='power':
        scaled=np.power(np.maximum(L,0),p[2]);s=np.clip(103.1668100711649*np.exp(-decay*scaled)-2.166924740191411,0,100)
    else:
        s=np.clip(103.1668100711649*np.exp(-decay*L)-2.166924740191411,0,100)
    mw=np.sum(W*M,axis=1,keepdims=True)/np.sum(M,axis=1,keepdims=True)
    weights=(vol*W+(1-vol)*mw)*M
    raw=np.sum(s*weights,axis=1)/np.sum(weights,axis=1)
    if mode in ('affine','quadratic'):
        raw=raw+p[2]+p[3]*(raw-80)
    if mode=='quadratic':
        raw=raw+p[4]*((raw-80)**2)/100
    return np.clip(raw,0,100)

def stats(p,data,mode):
    if data is None:return None
    err=prediction(p,data,mode)-data['targets']
    return dict(n=len(err),mae=round(float(np.mean(abs(err))),3),rmse=round(float(np.sqrt(np.mean(err**2))),3),
        bias=round(float(np.mean(err)),3),p90=round(float(np.percentile(abs(err),90)),3),worst=round(float(np.max(abs(err))),3))

specs={
 'simple': (np.array([.1073,.38]),[(.06,.22),(0,1)]),
 'affine': (np.array([.1073,.38,0.,0.]),[(.06,.22),(0,1),(-8,8),(-.2,.2)]),
 'power': (np.array([.1073,.38,1.]),[(.025,.3),(0,1),(.7,1.3)]),
 'quadratic': (np.array([.1073,.38,0.,0.,0.]),[(.06,.22),(0,1),(-8,8),(-.2,.2),(-.1,.1)])
}

def fit(mode,train,deep):
    start,bounds=specs[mode]
    # The regularizer pulls the fit towards established, sensible global
    # parameters and discourages a fitted per-game correction from overfitting.
    def obj(x):
        a=prediction(x,train,mode)-train['targets']
        def huber(v):return np.mean(np.sqrt(v*v+9))
        val=huber(a)
        if deep:
            d=prediction(x,deep,mode)-deep['targets']
            val=.78*val+.22*huber(d) # higher value for 350ms runtime
        penalty=.06*((x[0]-.1073)/.03)**2+.025*((x[1]-.38)/.3)**2
        if mode in ('affine','quadratic'):penalty+=.03*(x[2]/3)**2+.03*(x[3]/.1)**2
        if mode=='power':penalty+=.04*((x[2]-1)/.2)**2
        if mode=='quadratic':penalty+=.05*(x[4]/.03)**2
        return val+penalty
    opts={'maxiter':140,'ftol':1e-9}
    res=min((minimize(obj,start,method='L-BFGS-B',bounds=bounds,options=opts),
             minimize(obj,start,method='Powell',bounds=bounds,options={'maxiter':130})),key=lambda r:r.fun)
    return res.x

if __name__=='__main__':
    shallow=load(sys.argv[1]);deep=load(sys.argv[2]) if len(sys.argv)>2 else []
    train=pack([r for r in shallow if r['split']=='train'])
    validation=pack([r for r in shallow if r['split']=='test'])
    profile=pack([r for r in shallow if r['split']=='profile-test'])
    deeptrain=pack([r for r in deep if r['split']=='train'])
    deepvalid=pack([r for r in deep if r['split']=='test'])
    deepprofile=pack([r for r in deep if r['split']=='profile-test'])
    print('Rows train/validation/profile:',len(train['rows']),len(validation['rows']),len(profile['rows']))
    if deeptrain: print('Deep train/validation/profile:',len(deeptrain['rows']),len(deepvalid['rows']) if deepvalid else 0,len(deepprofile['rows']) if deepprofile else 0)
    records=[]
    models=[('v1.0.15','simple',np.array([.1073,.38]))]
    for m in specs:models.append((m,m,fit(m,train,deeptrain)))
    for label,mode,p in models:
        rec=dict(model=label,parameters=[round(float(v),7) for v in p],
            train=stats(p,train,mode),validation=stats(p,validation,mode),profile_test=stats(p,profile,mode),
            deep_train=stats(p,deeptrain,mode),deep_validation=stats(p,deepvalid,mode),deep_profile=stats(p,deepprofile,mode))
        records.append(rec)
        print('\n',label,rec)
    # Select using validation (previously unexposed *new* games, outside the old
    # calibration corpus). Test profile is displayed only after selection.
    candidates=records[1:]
    def valkey(r):
        v=r['validation']['mae']
        d=r['deep_validation']['mae'] if r['deep_validation'] else 5
        return v+0.3*d
    winning=min(candidates,key=valkey)
    baseline=records[0]
    if valkey(winning)>valkey(baseline)-.10:winning=baseline
    print('\nSELECTED (validation-only)',winning['model'],winning['parameters'])
    report={'models':records,'selected':winning['model'],'selected_parameters':winning['parameters'],
            'dataset_counts':{'train_players':len(train['rows']),'validation_players':len(validation['rows']),
                              'profile_holdout_players':len(profile['rows'])}}
    json.dump(report,open(ROOT+'/chess-vs-bots-v1016-fit-results.json','w'),indent=2)
