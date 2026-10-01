import { createHmac, timingSafeEqual } from 'crypto';
export function splitRevenue(price:number,rate:number){if(!Number.isSafeInteger(price)||price<0||!Number.isInteger(rate)||rate<0||rate>100)throw new Error('Invalid money');const author=Math.floor(price*rate/100);return {author,platform:price-author}}
export function validSignature(body:Buffer,signature:string,secret:string){if(!/^[a-f0-9]{64}$/i.test(signature))return false;return timingSafeEqual(createHmac('sha256',secret).update(body).digest(),Buffer.from(signature,'hex'))}
export function canRead(isFree:boolean,purchased:boolean){return isFree||purchased}
export function levelFor(levels:any[],count:number){return [...levels].reverse().find(l=>count>=l[1])||levels[0]}
export function wordCount(text:string){return text.trim().split(/\s+/u).filter(Boolean).length}
export function safeNext(value:string){return value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/'}
