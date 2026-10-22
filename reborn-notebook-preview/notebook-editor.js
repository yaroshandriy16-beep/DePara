/* Safe rich text adapter. Notes remain portable plain-text Markdown in storage. */
(()=>{'use strict';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=file=>/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(file?.data||'');
const inline=text=>escape(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/==([^=]+)==/g,'<mark>$1</mark>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
function picture(file,index){return '<figure contenteditable="false" data-file-index="'+index+'"><img src="'+escape(file.data)+'" alt="'+escape(file.name)+'"><figcaption>'+escape(file.name)+'</figcaption></figure>';}
function render(body,files=[]){
 let html='',list='';
 for(const line of String(body||'').split('\n')){
  const token=line.match(/^\[\[image:(\d+)\]\]$/),item=line.match(/^(- |\d+\. )(.*)$/),kind=item?(item[1]==='- '?'ul':'ol'):'';
  if(list&&list!==kind){html+='</'+list+'>';list='';}
  if(item){if(!list){html+='<'+kind+'>';list=kind;}html+='<li>'+inline(item[2])+'</li>';continue;}
  if(token&&image(files[Number(token[1])]))html+=picture(files[Number(token[1])],Number(token[1]));
  else if(/^#{1,3} /.test(line))html+='<h2>'+inline(line.replace(/^#{1,3} /,''))+'</h2>';
  else html+='<div>'+inline(line||'')+(line?'':'<br>')+'</div>';
 }
 return html+(list?'</'+list+'>':'');
}
function serialize(root){
 function walk(node){
  if(node.nodeType===3)return node.nodeValue.replace(/\u00a0/g,' ');
  if(node.nodeType!==1)return '';
  const tag=node.tagName.toLowerCase();
  if(tag==='figure'&&node.hasAttribute('data-file-index'))return '\n[[image:'+Number(node.dataset.fileIndex)+']]\n';
  if(tag==='br')return '\n';
  if(['script','style','iframe','object','img'].includes(tag))return '';
  let text=[...node.childNodes].map(walk).join('');
  if(tag==='b'||tag==='strong')return '**'+text+'**';
  if(tag==='i'||tag==='em')return '*'+text+'*';
  if(tag==='mark'||tag==='span'&&node.style.backgroundColor&&node.style.backgroundColor!=='transparent')return '=='+text+'==';
  if(/^h[1-6]$/.test(tag))return '## '+text.replace(/\n+$/,'')+'\n';
  if(tag==='li'){const number=node.parentElement?.tagName==='OL'?[...node.parentElement.children].indexOf(node)+1:null;return (number?number+'. ':'- ')+text.replace(/\n+$/,'')+'\n';}
  if(['div','p','ul','ol','blockquote'].includes(tag))return text.replace(/\n$/,'')+'\n';
  return text;
 }
 return [...root.childNodes].map(walk).join('').replace(/\n{3,}/g,'\n\n').replace(/^\n|\n$/g,'');
}
let saved=null;
const editor=()=>document.getElementById('dp-nb-body');
function remember(){const root=editor(),selection=getSelection();if(root?.isContentEditable&&selection?.rangeCount&&root.contains(selection.anchorNode)&&root.contains(selection.focusNode))saved=selection.getRangeAt(0).cloneRange();}
function restore(){const root=editor(),selection=getSelection();if(!root||!selection)return null;root.focus({preventScroll:true});if(saved&&root.contains(saved.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(saved);}else{const range=document.createRange();range.selectNodeContents(root);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}return root;}
function format(value){const root=restore();if(!root)return;const command={'**':['bold'], '*':['italic'],'==':['hiliteColor','#dfce79'],'# ':['formatBlock','h2'],'- ':['insertUnorderedList'],'1. ':['insertOrderedList']}[value];if(command)document.execCommand(command[0],false,command[1]);remember();root.dispatchEvent(new Event('input',{bubbles:true}));}
function insertImage(file,index){const root=restore();if(!root||!image(file))return null;const range=getSelection().getRangeAt(0),fragment=document.createRange().createContextualFragment(picture(file,index)+'<div><br></div>'),last=fragment.lastChild;range.deleteContents();range.insertNode(fragment);range.setStart(last,0);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);remember();return serialize(root);}
document.addEventListener('selectionchange',remember);
document.addEventListener('pointerdown',e=>{if(e.target.closest('#dp-nb [data-action="format"]')){remember();e.preventDefault();}});
document.addEventListener('paste',e=>{const root=e.target.closest('#dp-nb-body');if(!root?.isContentEditable)return;e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'';document.execCommand('insertText',false,text);});
window.DeParaNoteEditor={render,serialize,format,insertImage};
})();
