export const MAX_FILES=80, MAX_BYTES=750_000;
export function validateFiles(files){
 if(!Array.isArray(files)||files.length<1||files.length>MAX_FILES)throw Error('Files limit: 1-'+MAX_FILES);
 let sum=0;const seen=new Set();return files.map(f=>{
  const path=String(f?.path||''),content=f?.content;
  if(!path||path.length>180||path.startsWith('/')||path.includes('\\')||path.split('/').some(s=>!s||s==='.'||s==='..')||/\0/.test(path))throw Error('Unsafe path: '+path);
  if(typeof content!=='string'||seen.has(path))throw Error('Duplicate or invalid file: '+path);
  if(path.split('/').some(x=>x==='node_modules'||x==='.git'||x==='.env'||x.startsWith('.env.')))throw Error('Forbidden path: '+path);
  seen.add(path);sum+=Buffer.byteLength(content,'utf8');if(sum>MAX_BYTES)throw Error('Workspace upload too large');return {path,content};
 });
}
export function validateCommand(cmd){if(typeof cmd!=='string'||!cmd.trim()||cmd.length>1200||/[\0\r]/.test(cmd))throw Error('Invalid command');return cmd;}
