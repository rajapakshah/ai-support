export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type OutputFormat = "png" | "jpeg" | "webp";
export interface JobRecord {
  id:string; status:JobStatus; original_key:string; result_key:string|null; original_name:string;
  input_type:string; output_type:string; scale:2|4; input_bytes:number; output_bytes:number|null;
  input_width:number|null; input_height:number|null; output_width:number|null; output_height:number|null;
  error_code:string|null; error_message:string|null; created_at:string; updated_at:string; expires_at:string;
}
export interface UpscaleMessage { jobId:string }
export interface ImageInfo { width:number; height:number; format?:string; fileSize?:number }
export interface ImageOutput { response(options?:{headers?:HeadersInit}):Response }
export interface ImageHandle { transform(options:Record<string,unknown>):ImageHandle; output(options:Record<string,unknown>):Promise<ImageOutput> }
export interface ImagesBindingLike { input(stream:ReadableStream):ImageHandle; info(stream:ReadableStream):Promise<ImageInfo> }
export interface Env {
  ASSETS:Fetcher; BUCKET:R2Bucket; DB:D1Database; UPSCALE_QUEUE:Queue<UpscaleMessage>; IMAGES:ImagesBindingLike;
  APP_NAME?:string; MAX_UPLOAD_MB?:string; RETENTION_HOURS?:string;
  UPSCALE_PROVIDER?:"cloudflare-images"|"remote"; UPSCALE_API_URL?:string; UPSCALE_API_TOKEN?:string;
  TURNSTILE_SECRET?:string; TURNSTILE_SITE_KEY?:string;
}
