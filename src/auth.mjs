import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.mjs";
import { query } from "./db.mjs";
const scrypt=promisify(scryptCallback);
const ttl=14*86400;
export function getCookie(req,name="insidir_sid") {
  return (req.headers.cookie || "").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1) || null;
}
const digest=s=>createHash("sha256").update(s).digest("hex");
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw Object.assign(new Error("Password must be 12–128 characters"),{status:400});
  const salt=randomBytes(16).toString("hex");
  const key=await scrypt(password,salt,64);
  return "scrypt$"+salt+"$"+key.toString("hex");
}
export async function verifyPassword(password,encoded) {
  if(typeof password!=="string"||typeof encoded!=="string")return false;
  const [scheme,salt,key]=encoded.split("$");
  if(scheme!=="scrypt"||!/^[a-f0-9]{32}$/.test(salt||"")||!/^[a-f0-9]{128}$/.test(key||""))return false;
  const check=await scrypt(password,salt,64);
  return timingSafeEqual(check,Buffer.from(key,"hex"));
}
export async function newSession(userId){
  const token=randomBytes(32).toString("hex");
  await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '14 days')",[digest(token),userId]);
  return token;
}
export function sessionCookie(token){
  return "insidir_sid="+token+"; HttpOnly; SameSite=Lax; Path=/; Max-Age="+ttl+(config.cookieSecure?"; Secure":"");
}
export function clearCookie(){
  return "insidir_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"+(config.cookieSecure?"; Secure":"");
}
export async function currentUser(req) {
  const token=getCookie(req);
  if(!token || !/^[a-f0-9]{64}$/.test(token))return null;
  const result=await query("SELECT u.id,u.email FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",[digest(token)]);
  return result.rows[0]||null;
}
export async function revokeSession(req) {
  const token=getCookie(req);
  if(token && /^[a-f0-9]{64}$/.test(token))await query("DELETE FROM sessions WHERE token_hash=$1",[digest(token)]);
}
export async function register(email,password) {
  if(!config.allowSignup)throw Object.assign(new Error("Account registration is not enabled"),{status:403});
  const e=typeof email==="string"?email.trim().toLowerCase():"";
  if(!/^[^@\s]{1,100}@[^@\s]{1,150}\.[^@\s]{2,20}$/.test(e))throw Object.assign(new Error("Invalid email"),{status:400});
  const hash=await hashPassword(password);
  try{
    const result=await query("INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email",[e,hash]);
    const user=result.rows[0],token=await newSession(user.id);
    return {user,token};
  }catch(err){if(err.code==="23505")throw Object.assign(new Error("An account with this email already exists"),{status:409});throw err}
}
export async function login(email,password) {
  const e=typeof email==="string"?email.trim().toLowerCase():"";
  const bad=Object.assign(new Error("Invalid email or password"),{status:401});
  if(!e || !password)throw bad;
  const res=await query("SELECT id,email,password_hash FROM users WHERE email=$1",[e]);
  if(!res.rows[0] || !await verifyPassword(password,res.rows[0].password_hash))throw bad;
  const user={id:res.rows[0].id,email:res.rows[0].email};
  return {user,token:await newSession(user.id)};
}
export function checkOrigin(req) {
  const origin=req.headers.origin;
  if(!origin)return false;
  try{
    const parsed=new URL(origin);
    const host=req.headers.host;
    const own=parsed.protocol==="https:" && parsed.host===host;
    return own || config.origins.has(parsed.origin);
  }catch{return false}
}
