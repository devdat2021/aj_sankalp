export async function api(path,token,method='GET',body){
 const r=await fetch((import.meta.env.VITE_API_BASE_URL||'')+'/api'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok){let error=await r.json();throw Error(typeof error.detail==='string'?error.detail:JSON.stringify(error.detail))} return r.json();
}
