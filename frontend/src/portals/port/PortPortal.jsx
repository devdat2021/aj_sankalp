import {lazy,Suspense} from 'react';
const CrisisSimulator=lazy(()=>import('./CrisisSimulator'));
import './crisis.css';
import {useState,useEffect,useCallback} from 'react';
import {useAuth} from '../../components/AuthContext';
import Cargo from '../../components/Cargo';
import Requests from '../../components/Requests';
import Weather from '../../components/Weather';
import {Alerts, Incidents, Capacity} from '../../components/Operations';
import {ActionButton} from '../../components/Forms';
import {api} from '../../services/api';import ControlTowerMap from './components/ControlTowerMap';
export default function PortPortal(){
 const {token,user,logout}=useAuth();
 const [data,setData]=useState(null),[tab,setTab]=useState('Overview'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[query,setQuery]=useState('');
 const refresh=useCallback(async ()=>{try{setData(await api('/port/dashboard',token));setError('')}catch(e){setError(e.message)}},[token]);
 useEffect(()=>{if(!token)return;const initial=setTimeout(refresh,0);const id=setInterval(refresh,8000);return()=>{clearTimeout(initial);clearInterval(id)}},[token,refresh]);
 async function act(path,method,body){setBusy(true);try{const r=await api(path,token,method,body);await refresh();return r}catch(e){setError(e.message);throw e}finally{setBusy(false)}}
 const table=(rows,fields)=><div className="tablewrap"><table><thead><tr>{fields.map(f=><th key={f}>{f.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{rows.filter(r=>JSON.stringify(r).toLowerCase().includes(query.toLowerCase())).map(r=><tr key={r.id}>{fields.map(f=><td key={f}>{String(r[f]??'—')}</td>)}</tr>)}</tbody></table>{!rows.length&&<p>No records yet.</p>}</div>;
 return <div className="layout"><aside><div className="brand">◈ COASTWATCH<span>PORT AUTHORITY</span></div><small>WORKSPACE</small>{['Overview','Arrivals & trucks','Cargo','Incidents','Requests','Alerts','Weather','Crisis Simulator','Simulation','Audit trail'].map(t=><button className={t===tab?'active':''} onClick={()=>{setTab(t);setQuery('')}} key={t}>{t}</button>)}<div className="asidebottom">New Mangalore Port<br/><small>NMP · Karnataka, India</small><ActionButton action={logout}>Sign out</ActionButton></div></aside><main><header><span>Operations / {tab}</span><span className="badge">SIMULATED TELEMETRY</span></header><div className="title"><div><p className="eyebrow">COASTAL OPERATIONS CENTER</p><h1>{tab==='Overview'?'Port control tower':tab}</h1><p>New Mangalore Port · Shared operational picture</p></div><button onClick={refresh}>Refresh data</button></div>{error&&<div className="error" role="alert">{error}</div>}{!data?<p>Loading operations…</p>:<>
 {tab==='Crisis Simulator'&&<div className="crisis-workspace"><Suspense fallback={<p>Loading simulator...</p>}><CrisisSimulator /></Suspense></div>}
 {tab==='Overview'&&<><div className="stats">{[['Active shipments',data.shipments.length],['Vessels tracked',data.vessels.length],['Open incidents',data.incidents.filter(i=>['reported','confirmed'].includes(i.status)).length],['Pending decisions',[...data.port_requests,...data.docking_requests].filter(r=>r.status==='pending').length]].map(([k,v])=><article key={k}><p>{k}</p><strong>{v}</strong><small>Current demo snapshot</small></article>)}</div><div className="split"><section><h2>Coastal network <span>Vessels · Trucks · Incidents</span></h2><ControlTowerMap data={data}/><p className="muted">Teal: vessels · Blue: trucks · Orange: incidents. Positions are seeded, not live AIS/GPS.</p></section><div className="workflow-content"><Capacity data={data} user={user} mutate={act}/><p>{[...data.port_requests,...data.docking_requests].filter(r=>r.status==='pending').length} port requests await review.</p><button onClick={()=>setTab('Requests')}>Review requests</button></div></div><section><h2>Cargo in motion</h2>{table(data.shipments,['id','cargo','status','destination','eta_hours'])}</section></>}
 {tab==='Arrivals & trucks'&&<section><input aria-label="Search records" placeholder="Search records…" value={query} onChange={e=>setQuery(e.target.value)}/><><h2>Vessel arrivals</h2>{table(data.vessels,['id','name','status','eta'])}<h2>Truck operations</h2>{table(data.vehicles,['id','name','status'])}</></section>}
 <div className="workflow-content">
 {tab==='Cargo'&&<Cargo data={data} user={user} mutate={act}/>}
 {tab==='Requests'&&<Requests data={data} user={user} mutate={act}/>}
 {tab==='Incidents'&&<Incidents data={data} user={user} mutate={act}/>}
 {tab==='Alerts'&&<Alerts data={data} user={user} mutate={act}/>}
 {tab==='Weather'&&<Weather port={data.port} token={token}/>}
 </div>
 {tab==='Simulation'&&<section><h2>What if port operations are disrupted?</h2><p>Estimate downstream delay and cold-chain exposure without changing operational records.</p><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.target);try{setResult(await act('/simulation/run','POST',{duration_hours:Number(f.get('hours')),severity:f.get('severity')}))}catch{/* Error is shown by act. */}}}><label>Duration (hours)<input name="hours" type="number" min="1" max="168" defaultValue="12" required/></label><label>Severity<select name="severity"><option>low</option><option>medium</option><option>high</option></select></label><button disabled={busy}>Run simulation</button></form>{result&&<><h2>Estimated impact</h2>{table(result.impacts.map(i=>({...i,id:i.shipment_id})),['shipment_id','delay_hours','cold_chain_risk','cost'])}{result.assumptions.map(a=><p className="muted" key={a}>{a}</p>)}</>}</section>}
 {tab==='Audit trail'&&<section><h2>Authority decision history</h2>{table(data.audit.map((a,i)=>({...a,id:i})),['actor','action','record_id','created_at'])}</section>}
 </>}<footer>CoastWatch-SCM · Demonstration workspace · Estimates require operational review</footer></main></div>
}
