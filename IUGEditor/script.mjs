const vscode = acquireVsCodeApi();
const $ = selector => document.querySelector(selector);
const canvas = $('#canvas');
const stage = $('#stage');
const ctx = canvas.getContext('2d');
const palette = $('.palette');

const catalog = [['text','text-outline','Text'],['button','radio-button-on-outline','Button'],['image','image-outline','Image'],['input','create-outline','Input'],['panel','browsers-outline','Panel'],['checkbox','checkbox-outline','Checkbox']];
const defaults = {
    text:{width:180,height:36,text:'Text',fontSize:24,color:'#ffffff',background:'transparent'},
    button:{width:160,height:44,text:'Button',fontSize:16,color:'#ffffff',background:'#6857ff'},
    image:{width:180,height:120,text:'',fontSize:14,color:'#ffffff',background:'#292c34',source:''},
    input:{width:220,height:40,text:'Input',fontSize:14,color:'#ffffff',background:'#272a31'},
    panel:{width:280,height:180,text:'',fontSize:14,color:'#ffffff',background:'#242730'},
    checkbox:{width:150,height:30,text:'Checkbox',fontSize:14,color:'#ffffff',background:'transparent'}
};
let data, selectedId, interaction;
let view = {x:80,y:70,z:.75};
let dirty = false, history = [], future = [], dpr = 1;
const imageCache = new Map();
const uid = () => crypto.randomUUID();
const selected = () => data?.elements.find(item => item.id === selectedId);
const snapshot = () => JSON.stringify(data);
const worldPoint = (x,y) => ({x:(x-view.x)/view.z,y:(y-view.y)/view.z});
const theme = (name,fallback) => getComputedStyle(document.documentElement).getPropertyValue(`--vscode-${name}`).trim() || fallback;

function esc(value) { return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function setDirty(value) { dirty=value; $('#save').disabled=!value; $('#status').textContent=value?'Unsaved changes':'Saved'; }
function commit(before=snapshot()) { if(before===snapshot()) return; history.push(before); if(history.length>100) history.shift(); future=[]; setDirty(true); renderUI(); }
function restore(serialized,destination) { destination.push(snapshot()); data=JSON.parse(serialized); if(!selected()) selectedId=null; setDirty(true); renderUI(); }

function resizeCanvas() {
    const rect=stage.getBoundingClientRect(); dpr=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.floor(rect.width*dpr)); canvas.height=Math.max(1,Math.floor(rect.height*dpr));
    canvas.style.width=`${rect.width}px`; canvas.style.height=`${rect.height}px`; draw();
}
function pathRect(x,y,w,h,r=0) { ctx.beginPath(); ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2)); }
function imageFor(source) {
    if(!source) return null;
    if(!imageCache.has(source)) {
        const image=new Image(); image.onload=draw; image.onerror=draw; image.src=source;
        imageCache.set(source,image);
    }
    return imageCache.get(source);
}
function drawText(item,text,align='center') {
    ctx.fillStyle=item.color||'#fff'; ctx.font=`${item.fontSize||14}px sans-serif`; ctx.textBaseline='middle'; ctx.textAlign=align;
    ctx.save(); ctx.beginPath(); ctx.rect(item.x,item.y,item.width,item.height); ctx.clip();
    ctx.fillText(text,align==='left'?item.x+10:item.x+item.width/2,item.y+item.height/2,Math.max(0,item.width-16)); ctx.restore();
}
function drawElement(item) {
    ctx.globalAlpha=item.opacity??1;
    if(item.background&&item.background!=='transparent') { pathRect(item.x,item.y,item.width,item.height,item.radius); ctx.fillStyle=item.background; ctx.fill(); }
    if(item.type==='input') { pathRect(item.x,item.y,item.width,item.height,item.radius); ctx.strokeStyle='#ffffff35'; ctx.lineWidth=1/view.z; ctx.stroke(); drawText(item,item.text,'left'); }
    else if(item.type==='checkbox') { ctx.strokeStyle=item.color; ctx.lineWidth=1.5/view.z; ctx.strokeRect(item.x+3,item.y+item.height/2-7,14,14); ctx.fillStyle=item.color; ctx.font=`${item.fontSize||14}px sans-serif`; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(item.text,item.x+25,item.y+item.height/2,item.width-28); }
    else if(item.type==='image') { const image=imageFor(item.source); if(image?.complete&&image.naturalWidth) ctx.drawImage(image,item.x,item.y,item.width,item.height); else { ctx.strokeStyle='#ffffff55'; ctx.lineWidth=1/view.z; ctx.setLineDash([5/view.z,4/view.z]); ctx.strokeRect(item.x,item.y,item.width,item.height); ctx.setLineDash([]); ctx.fillStyle='#b6bac4'; ctx.font='24px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('▧',item.x+item.width/2,item.y+item.height/2); } }
    else if(item.type!=='panel') drawText(item,item.text);
    ctx.globalAlpha=1;
}
function draw() {
    if(!data) return;
    const width=canvas.width/dpr,height=canvas.height/dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle=theme('editor-background','#17191e'); ctx.fillRect(0,0,width,height);
    const gap=24*view.z,startX=((view.x%gap)+gap)%gap,startY=((view.y%gap)+gap)%gap; ctx.fillStyle=theme('editorIndentGuide-background1','#353842');
    if(gap>=8) for(let x=startX;x<width;x+=gap) for(let y=startY;y<height;y+=gap) ctx.fillRect(Math.round(x),Math.round(y),1,1);
    ctx.save(); ctx.translate(view.x,view.y); ctx.scale(view.z,view.z);
    ctx.shadowColor='#00000088'; ctx.shadowBlur=28/view.z; ctx.shadowOffsetY=10/view.z; ctx.fillStyle=data.canvas.background; ctx.fillRect(0,0,data.canvas.width,data.canvas.height); ctx.shadowColor='transparent';
    ctx.strokeStyle='#ffffff28'; ctx.lineWidth=1/view.z; ctx.strokeRect(0,0,data.canvas.width,data.canvas.height);
    [...data.elements].sort((a,b)=>(a.z||0)-(b.z||0)).forEach(drawElement);
    const item=selected(); if(item) { ctx.strokeStyle='#4da3ff'; ctx.lineWidth=2/view.z; ctx.strokeRect(item.x,item.y,item.width,item.height); const h=9/view.z; ctx.fillStyle='#fff'; ctx.fillRect(item.x+item.width-h/2,item.y+item.height-h/2,h,h); ctx.strokeStyle='#4da3ff'; ctx.strokeRect(item.x+item.width-h/2,item.y+item.height-h/2,h,h); }
    ctx.restore(); ctx.fillStyle=theme('descriptionForeground','#999'); ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.fillText(`${data.canvas.width} × ${data.canvas.height}`,view.x+data.canvas.width*view.z/2,view.y+data.canvas.height*view.z+18);
}
function hitTest(point) { return [...data.elements].sort((a,b)=>(b.z||0)-(a.z||0)).find(i=>point.x>=i.x&&point.x<=i.x+i.width&&point.y>=i.y&&point.y<=i.y+i.height); }
function isResize(item,p) { const s=14/view.z; return p.x>=item.x+item.width-s&&p.y>=item.y+item.height-s; }
function onArtboard(p) { return p.x>=0&&p.y>=0&&p.x<=data.canvas.width&&p.y<=data.canvas.height; }

function postSelection() {
    if (!data) return;
    const item = selected();
    vscode.postMessage({
        type: 'selection',
        selectedId: selectedId ?? null,
        data,
        selection: item ? {
            type: 'uiElement',
            id: item.id,
            name: item.name,
            value: structuredClone(item)
        } : {
            type: 'uiCanvas',
            id: 'canvas',
            name: 'Canvas',
            value: structuredClone(data.canvas)
        }
    });
}
function renderUI() { if(!data)return; draw(); $('#undo').disabled=!history.length; $('#redo').disabled=!future.length; postSelection(); }
function zoomLabel() { const value=Math.round(view.z*100); $('#zoom').value=value; $('#zoom-value').textContent=`${value}%`; }
function setPaletteVisible(visible) { palette.hidden=!visible; $('#toggle-palette').classList.toggle('active',visible); $('#toggle-palette').setAttribute('aria-pressed',String(visible)); }
function fit() { if(!data)return; view.z=Math.max(.25,Math.min(1.5,(stage.clientWidth-80)/data.canvas.width,(stage.clientHeight-80)/data.canvas.height)); view.x=(stage.clientWidth-data.canvas.width*view.z)/2; view.y=(stage.clientHeight-data.canvas.height*view.z)/2; zoomLabel(); draw(); }
function addWidget(type,sx,sy) { const base=defaults[type]; if(!base)return; const before=snapshot(),p=worldPoint(sx,sy),number=data.elements.filter(i=>i.type===type).length+1; const item={id:uid(),type,name:`${type[0].toUpperCase()}${type.slice(1)} ${number}`,x:Math.round(Math.max(0,Math.min(data.canvas.width-base.width,p.x-base.width/2))),y:Math.round(Math.max(0,Math.min(data.canvas.height-base.height,p.y-base.height/2))),opacity:1,radius:type==='button'?4:0,z:data.elements.length,...base}; data.elements.push(item); selectedId=item.id; commit(before); }

$('#widget-list').innerHTML=catalog.map(([type,icon,label])=>`<div class="widget" draggable="true" data-widget="${type}"><ion-icon class="widget-icon" name="${icon}"></ion-icon><span>${label}</span></div>`).join('');
$('#widget-list').addEventListener('dragstart',e=>e.dataTransfer.setData('application/x-iug-widget',e.target.closest('.widget')?.dataset.widget||''));
canvas.addEventListener('dragover',e=>{e.preventDefault();canvas.classList.add('drop-target');}); canvas.addEventListener('dragleave',()=>canvas.classList.remove('drop-target'));
canvas.addEventListener('drop',e=>{e.preventDefault();canvas.classList.remove('drop-target');const r=canvas.getBoundingClientRect();addWidget(e.dataTransfer.getData('application/x-iug-widget'),e.clientX-r.left,e.clientY-r.top);});
canvas.addEventListener('pointerdown',e=>{ canvas.focus(); const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top,p=worldPoint(sx,sy),item=hitTest(p),pan=e.button===1||e.button===2||!item; if(pan){if(e.button===0&&onArtboard(p)){selectedId=null;renderUI();} interaction={kind:'pan',startX:sx,startY:sy,viewX:view.x,viewY:view.y};canvas.classList.add('panning');}else{selectedId=item.id;interaction={kind:isResize(item,p)?'resize':'move',before:snapshot(),startX:p.x,startY:p.y,x:item.x,y:item.y,width:item.width,height:item.height};renderUI();} canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove',e=>{if(!interaction)return;const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;if(interaction.kind==='pan'){view.x=interaction.viewX+sx-interaction.startX;view.y=interaction.viewY+sy-interaction.startY;draw();return;}const p=worldPoint(sx,sy),item=selected(),dx=p.x-interaction.startX,dy=p.y-interaction.startY;if(interaction.kind==='resize'){item.width=Math.max(12,Math.round(interaction.width+dx));item.height=Math.max(12,Math.round(interaction.height+dy));}else{item.x=Math.round(Math.max(0,Math.min(data.canvas.width-item.width,interaction.x+dx)));item.y=Math.round(Math.max(0,Math.min(data.canvas.height-item.height,interaction.y+dy)));}draw();});
canvas.addEventListener('pointerup',()=>{if(interaction?.before)commit(interaction.before);interaction=null;canvas.classList.remove('panning');}); canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top,p=worldPoint(sx,sy);view.z=Math.max(.25,Math.min(1.5,view.z*Math.exp(-e.deltaY*.001)));view.x=sx-p.x*view.z;view.y=sy-p.y*view.z;zoomLabel();draw();},{passive:false});

$('#zoom').addEventListener('input',e=>{const old=view.z;view.z=Number(e.target.value)/100;view.x=stage.clientWidth/2-(stage.clientWidth/2-view.x)*view.z/old;view.y=stage.clientHeight/2-(stage.clientHeight/2-view.y)*view.z/old;zoomLabel();draw();});
$('#fit').addEventListener('click',fit); $('#toggle-palette').addEventListener('click',()=>setPaletteVisible(palette.hidden)); $('#close-palette').addEventListener('click',()=>setPaletteVisible(false)); $('#undo').addEventListener('click',()=>history.length&&restore(history.pop(),future)); $('#redo').addEventListener('click',()=>future.length&&restore(future.pop(),history)); $('#save').addEventListener('click',()=>vscode.postMessage({type:'save',data})); window.addEventListener('resize',resizeCanvas);
window.addEventListener('keydown',e=>{const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();if(dirty)vscode.postMessage({type:'save',data});}if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?$('#redo').click():$('#undo').click();}if((e.key==='Delete'||e.key==='Backspace')&&selectedId&&!e.target.matches('input,textarea')){e.preventDefault();const before=snapshot();data.elements=data.elements.filter(i=>i.id!==selectedId);selectedId=null;commit(before);}});
window.addEventListener('message',e=>{if(e.data.type==='load'){if(dirty)return;data=structuredClone(e.data.asset.data);$('#graph-title').textContent=e.data.asset.name||'UI Editor';history=[];future=[];selectedId=null;setDirty(false);resizeCanvas();fit();renderUI();}if(e.data.type==='selectElement'){selectedId=e.data.id??null;renderUI();}if(e.data.type==='updateGraphProperty'){const before=snapshot();if(e.data.property==='__delete'&&selectedId){data.elements=data.elements.filter(i=>i.id!==selectedId);selectedId=null;commit(before);}else{const target=e.data.selectionType==='uiCanvas'?data.canvas:selected();if(target&&Object.hasOwn(target,e.data.property)){target[e.data.property]=e.data.value;commit(before);}}}if(e.data.type==='deleteSelection'&&selectedId){const before=snapshot();data.elements=data.elements.filter(i=>i.id!==selectedId);selectedId=null;commit(before);}if(e.data.type==='saved')setDirty(false);if(e.data.type==='error')$('#status').textContent=`Error: ${e.data.message}`;});
vscode.postMessage({type:'ready'});
