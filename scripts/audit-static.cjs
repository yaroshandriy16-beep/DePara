const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const errors=[];
for(const page of ['index.html','reborn-preview/index.html']){
 const html=fs.readFileSync(page,'utf8');
 const base=page==='index.html'?'reborn-preview':path.dirname(page);
 for(const match of html.matchAll(/<(script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)){
  const kind=match[1],ref=match[2];
  if(/^(https?:|data:)/.test(ref))continue;
  const target=path.normalize(path.join(base,ref.split('?')[0]));
  if(!fs.existsSync(target)){errors.push(page+': missing '+target);continue}
  if(kind==='script'&&target.endsWith('.js'))try{new vm.Script(fs.readFileSync(target,'utf8'),{filename:target})}catch(e){errors.push(String(e))}
 }
 if(/data-page="study"|data-page="social"/.test(html))errors.push(page+': legacy navigation');
}
for(const p of ['data/catalog.json','data/campus/free-classrooms.json','data/teachers/catalog.json','data/groups/3641.json'])try{JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){errors.push(p+': '+e.message)}
for(const p of ['reborn-preview/app-reborn46.js','reborn-preview/schedule-share-v43.js']){
 const s=fs.readFileSync(p,'utf8');
 if(/workers\.dev|\/api\/(?:auth|sync|share)/.test(s))errors.push(p+': Cloudflare API dependency');
}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Static audit passed');
