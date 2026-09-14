import type { Env, JobRecord, OutputFormat, UpscaleMessage } from "./types";
import { UpscaleError, upscale } from "./upscale";
import { SUPPORTED_INPUT_TYPES,errorResponse,extensionFor,getJobId,isLikelyImage,json,parseFormat,parseScale,publicJob,safeDownloadName } from "./utils";

async function getJob(env:Env,id:string){return env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRecord>();}

async function verifyTurnstile(request:Request,env:Env,token:string|null){
  if(!env.TURNSTILE_SECRET)return true;if(!token)return false;
  const form=new FormData();form.set("secret",env.TURNSTILE_SECRET);form.set("response",token);
  const ip=request.headers.get("CF-Connecting-IP");if(ip)form.set("remoteip",ip);
  const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
  const result=await response.json<{success?:boolean}>();return result.success===true;
}

async function createJob(request:Request,env:Env):Promise<Response>{
  const form=await request.formData().catch(()=>null);if(!form)return errorResponse(400,"INVALID_FORM","Send multipart/form-data with an image.");
  if(!await verifyTurnstile(request,env,form.get("turnstileToken")?.toString()||null))return errorResponse(403,"CHALLENGE_FAILED","Please complete the verification challenge and try again.");
  const image=form.get("image"),scale=parseScale(form.get("scale")),format=parseFormat(form.get("format"));
  if(!(image instanceof File))return errorResponse(400,"IMAGE_REQUIRED","Choose an image to upscale.");
  if(!scale)return errorResponse(400,"INVALID_SCALE","Scale must be 2 or 4.");
  if(!format)return errorResponse(400,"INVALID_FORMAT","Format must be png, jpeg, or webp.");
  if(!SUPPORTED_INPUT_TYPES.has(image.type))return errorResponse(415,"UNSUPPORTED_TYPE","Use a PNG, JPEG, or WebP image.");
  const maxMb=Math.max(1,Number(env.MAX_UPLOAD_MB||10)),maxBytes=maxMb*1024*1024;
  if(image.size<=0||image.size>maxBytes)return errorResponse(413,"FILE_TOO_LARGE",`The image must be no larger than ${maxMb} MB.`);
  const bytes=await image.arrayBuffer();
  if(!isLikelyImage(new Uint8Array(bytes.slice(0,16)),image.type))return errorResponse(415,"INVALID_IMAGE","The file contents do not match the selected image type.");
  const id=crypto.randomUUID(),now=new Date(),retention=Math.max(1,Number(env.RETENTION_HOURS||24));
  const expires=new Date(now.getTime()+retention*3600000),originalKey=`jobs/${id}/original`;
  await env.BUCKET.put(originalKey,bytes,{httpMetadata:{contentType:image.type},customMetadata:{originalName:image.name,jobId:id}});
  try{
    await env.DB.prepare(`INSERT INTO jobs (id,status,original_key,original_name,input_type,output_type,scale,input_bytes,created_at,updated_at,expires_at) VALUES (?,'queued',?,?,?,?,?,?,?,?,?)`).bind(id,originalKey,image.name.slice(0,255),image.type,format,scale,image.size,now.toISOString(),now.toISOString(),expires.toISOString()).run();
    await env.UPSCALE_QUEUE.send({jobId:id});
  }catch(error){await Promise.all([env.BUCKET.delete(originalKey),env.DB.prepare("DELETE FROM jobs WHERE id=?").bind(id).run().catch(()=>undefined)]);console.error("create_job_failed",{id,error});return errorResponse(500,"CREATE_FAILED","The upscale job could not be created. Please try again.");}
  const job=await getJob(env,id);return json({job:job?publicJob(job):{id,status:"queued"}},{status:202});
}

async function serveObject(object:R2ObjectBody,downloadName?:string){
  const headers=new Headers({"x-content-type-options":"nosniff"});object.writeHttpMetadata(headers);headers.set("etag",object.httpEtag);headers.set("cache-control","private, max-age=300");if(downloadName)headers.set("content-disposition",`attachment; filename="${downloadName}"`);return new Response(object.body,{headers});
}

async function handleJobRoute(request:Request,env:Env,url:URL):Promise<Response>{
  const parsed=getJobId(url.pathname);if(!parsed)return errorResponse(404,"NOT_FOUND","Route not found.");
  const job=await getJob(env,parsed.id);if(!job||new Date(job.expires_at).getTime()<=Date.now())return errorResponse(404,"JOB_NOT_FOUND","This job does not exist or has expired.");
  if(request.method==="DELETE"&&!parsed.resource){await Promise.all([env.BUCKET.delete(job.original_key),job.result_key?env.BUCKET.delete(job.result_key):Promise.resolve()]);await env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(job.id).run();return new Response(null,{status:204});}
  if(request.method!=="GET")return errorResponse(405,"METHOD_NOT_ALLOWED","Method not allowed.");
  if(!parsed.resource)return json({job:publicJob(job)});
  const key=parsed.resource==="original"?job.original_key:job.result_key;
  if(!key||(parsed.resource==="result"&&job.status!=="completed"))return errorResponse(409,"RESULT_NOT_READY","The result is not ready yet.");
  const object=await env.BUCKET.get(key);if(!object)return errorResponse(404,"FILE_NOT_FOUND","The image file is unavailable.");
  const download=parsed.resource==="result"&&url.searchParams.get("download")==="1"?safeDownloadName(job.original_name,job.scale,job.output_type as OutputFormat):undefined;
  return serveObject(object,download);
}

async function api(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,service:env.APP_NAME||"PixelLift"});
  if(url.pathname==="/api/config"&&request.method==="GET")return json({appName:env.APP_NAME||"PixelLift",maxUploadMb:Number(env.MAX_UPLOAD_MB||10),retentionHours:Number(env.RETENTION_HOURS||24),turnstileSiteKey:env.TURNSTILE_SITE_KEY||null});
  if(url.pathname==="/api/jobs"&&request.method==="POST")return createJob(request,env);
  if(url.pathname.startsWith("/api/jobs/"))return handleJobRoute(request,env,url);
  return errorResponse(404,"NOT_FOUND","Route not found.");
}

async function processJob(env:Env,jobId:string){
  const job=await getJob(env,jobId);if(!job||job.status==="completed")return;
  await env.DB.prepare("UPDATE jobs SET status='processing',updated_at=?,error_code=NULL,error_message=NULL WHERE id=?").bind(new Date().toISOString(),jobId).run();
  const original=await env.BUCKET.get(job.original_key);if(!original)throw new UpscaleError("SOURCE_MISSING","The original image is missing.");
  const format=job.output_type as OutputFormat,result=await upscale(env,await original.arrayBuffer(),job.input_type,job.scale,format),resultKey=`jobs/${job.id}/result.${extensionFor(format)}`;
  const stored=await env.BUCKET.put(resultKey,result.body,{httpMetadata:{contentType:result.contentType},customMetadata:{jobId:job.id,sourceKey:job.original_key}});
  await env.DB.prepare(`UPDATE jobs SET status='completed',result_key=?,output_bytes=?,input_width=?,input_height=?,output_width=?,output_height=?,updated_at=? WHERE id=?`).bind(resultKey,stored.size,result.inputWidth,result.inputHeight,result.outputWidth,result.outputHeight,new Date().toISOString(),job.id).run();
}

async function failJob(env:Env,jobId:string,error:unknown){const code=error instanceof UpscaleError?error.code:"PROCESSING_FAILED",message=error instanceof Error?error.message.slice(0,500):"Image processing failed.";await env.DB.prepare("UPDATE jobs SET status='failed',error_code=?,error_message=?,updated_at=? WHERE id=?").bind(code,message,new Date().toISOString(),jobId).run();}
async function cleanup(env:Env){const expired=await env.DB.prepare("SELECT id,original_key,result_key FROM jobs WHERE expires_at<=? LIMIT 100").bind(new Date().toISOString()).all<Pick<JobRecord,"id"|"original_key"|"result_key">>();for(const job of expired.results){await Promise.all([env.BUCKET.delete(job.original_key),job.result_key?env.BUCKET.delete(job.result_key):Promise.resolve()]);await env.DB.prepare("DELETE FROM jobs WHERE id=?").bind(job.id).run();}}

export default {
  async fetch(request:Request,env:Env){const url=new URL(request.url);try{return url.pathname.startsWith("/api/")?await api(request,env):env.ASSETS.fetch(request);}catch(error){console.error("request_failed",{path:url.pathname,error});return errorResponse(500,"INTERNAL_ERROR","Something went wrong. Please try again.");}},
  async queue(batch:MessageBatch<UpscaleMessage>,env:Env){for(const message of batch.messages){try{await processJob(env,message.body.jobId);message.ack();}catch(error){console.error("job_failed",{jobId:message.body.jobId,attempts:message.attempts,error});if(message.attempts<3)message.retry({delaySeconds:Math.min(60,5*2**message.attempts)});else{await failJob(env,message.body.jobId,error);message.ack();}}}},
  async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(cleanup(env));}
};
