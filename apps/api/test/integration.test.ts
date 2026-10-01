import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
const base=process.env.INTEGRATION_URL;
test('PostgreSQL integration: auth, access control, concurrency, webhook integrity and refresh replay', {skip:!base}, async()=>{
 const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
 const cookies=new Map<string,string>();
 async function call(path:string,method='GET',body?:unknown,extra:Record<string,string>={},authenticated=true){
  const r=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(authenticated?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'X-CSRF-Token':cookies.get('tt_csrf')||''}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
  if(authenticated)for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');cookies.set(k,v)}
  const data=await r.json();return {status:r.status,data};
 }
 const email=`integration-${randomUUID()}@example.invalid`,password=`Test-${randomUUID()}`;
 let r=await call('/auth/register','POST',{name:'Integration test',email,password});assert.equal(r.status,201);
 r=await call('/auth/verify','POST',{token:r.data.devVerifyToken});assert.equal(r.status,201);
 r=await call('/auth/login','POST',{email,password});assert.equal(r.status,201);
 assert(cookies.get('tt_access'));assert(cookies.get('tt_refresh'));
 r=await call('/admin/users');assert.equal(r.status,403,'reader cannot access admin');
 r=await call('/stories/van-dao-truong-sinh/chapters/6');assert.equal(r.status,200);assert.equal(r.data.content,undefined,'paid text must never leak');const chapterId=r.data.id;
 r=await call(`/purchases/${chapterId}`,'POST',undefined,{'Idempotency-Key':randomUUID()});assert.equal(r.status,402);
 r=await call('/wallet/orders','POST',{packageIndex:0},{'Idempotency-Key':randomUUID(),'X-CSRF-Token':'wrong'});assert.equal(r.status,403,'CSRF rejected');
 r=await call('/wallet/orders','POST',{packageIndex:0},{'Idempotency-Key':randomUUID()});assert.equal(r.status,201);const orderId=r.data.id;
 r=await call(`/wallet/orders/${orderId}/simulate`,'POST');assert.equal(r.status,201);assert.equal(r.data.balance,200);
 r=await call(`/wallet/orders/${orderId}/simulate`,'POST');assert.equal(r.data.duplicate,true);
 const buys=await Promise.all(Array.from({length:6},()=>call(`/purchases/${chapterId}`,'POST',undefined,{'Idempotency-Key':randomUUID()})));
 for(const result of buys)assert.equal(result.status,201,JSON.stringify(result));
 r=await call('/auth/me');assert.equal(r.data.balance,180,'concurrent requests debit only once');
 r=await call('/stories/van-dao-truong-sinh/chapters/6');assert.equal(typeof r.data.content,'string');
 r=await call('/stories/van-dao-truong-sinh/chapters/6','GET',undefined,{},false);assert.equal(r.data.content,undefined,'guest cannot reuse purchased content');
 r=await call('/wallet/transactions');assert.equal(r.data.filter((t:any)=>t.type==='PURCHASE').length,1);assert.equal(r.data.filter((t:any)=>t.type==='TOPUP').length,1);
 r=await call('/payments/webhook','POST',{orderId,providerTxnId:'fake',amountVnd:20000},{'X-Payment-Signature':'fake'},false);assert.equal(r.status,401);
 const oldRefresh=cookies.get('tt_refresh')!;
 r=await call('/auth/refresh','POST');assert.equal(r.status,201);
 const newRefresh=cookies.get('tt_refresh')!;assert.notEqual(oldRefresh,newRefresh);
 r=await call('/auth/refresh','POST',undefined,{Cookie:`tt_refresh=${oldRefresh}; tt_csrf=${cookies.get('tt_csrf')}`});assert.equal(r.status,401);
 r=await call('/auth/me');assert.equal(r.status,401,'replay revokes every session');
});
