const vscode = acquireVsCodeApi();
const $ = selector => document.querySelector(selector);
const canvas = $('#canvas');
const stage = $('#stage');
const ctx = canvas.getContext('2d');
const palette = $('.palette');

const catalog = [['text','text-outline','Text'],['button','radio-button-on-outline','Button'],['image','image-outline','Image'],['input','create-outline','Input'],['panel','browsers-outline','Panel'],['checkbox','checkbox-outline','Checkbox']];
const defaults = {
    text:{width:180,height:36,text:'Text',fontSize:24,fontFamily:'sans-serif',fontWeight:'400',fontStyle:'normal',textAlign:'center',verticalAlign:'middle',color:'#ffffff',background:'transparent'},
    button:{width:160,height:44,text:'Button',fontSize:16,fontFamily:'sans-serif',fontWeight:'400',fontStyle:'normal',textAlign:'center',verticalAlign:'middle',color:'#ffffff',background:'#6857ff',enabled:true,previewState:'normal',hoverColor:'#ffffff',hoverBackground:'#796aff',pressedColor:'#ffffff',pressedBackground:'#5142d9',disabledColor:'#9a9a9a',disabledBackground:'#3f4148'},
    image:{width:180,height:120,text:'',fontSize:14,color:'#ffffff',background:'transparent',source:''},
    input:{width:220,height:40,text:'Input',fontSize:14,fontFamily:'sans-serif',fontWeight:'400',fontStyle:'normal',textAlign:'left',verticalAlign:'middle',color:'#ffffff',background:'#272a31'},
    panel:{width:280,height:180,text:'',fontSize:14,color:'#ffffff',background:'#242730'},
    checkbox:{width:150,height:30,text:'Checkbox',fontSize:14,fontFamily:'sans-serif',fontWeight:'400',fontStyle:'normal',textAlign:'left',verticalAlign:'middle',color:'#ffffff',background:'transparent'}
};
let data, selectedId, interaction;
let view = {x:80,y:70,z:.75};
let dirty = false, history = [], future = [], dpr = 1;
const imageCache = new Map();
const textureSources = new Map();
const loadedFonts = new Set();
const uid = () => crypto.randomUUID();
const selected = () => data?.elements.find(item => item.id === selectedId);
const snapshot = () => JSON.stringify(data);
const worldPoint = (x,y) => ({x:(x-view.x)/view.z,y:(y-view.y)/view.z});
const theme = (name,fallback) => getComputedStyle(document.documentElement).getPropertyValue(`--vscode-${name}`).trim() || fallback;
function normalizeTextStyle(item) {
    if(['panel','image'].includes(item.type))return;
    item.fontFamily??='sans-serif';item.fontWeight??='400';item.fontStyle??='normal';item.textAlign??=item.type==='input'||item.type==='checkbox'?'left':'center';item.verticalAlign??='middle';
}
function normalizeButtonStyle(item) {
    if(item.type!=='button')return;
    item.enabled??=true;item.previewState??='normal';item.hoverColor??=item.color;item.hoverBackground??=item.background;item.pressedColor??=item.color;item.pressedBackground??=item.background;item.disabledColor??='#9a9a9a';item.disabledBackground??='#3f4148';
}

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
    const resolvedSource=textureSources.get(source)||source;
    if(!imageCache.has(resolvedSource)) {
        const image=new Image(); image.onload=draw; image.onerror=draw; image.src=resolvedSource;
        imageCache.set(resolvedSource,image);
    }
    return imageCache.get(resolvedSource);
}
function drawText(item,text,align='center') {
    align=item.textAlign||align;const vertical=item.verticalAlign||'middle';ctx.fillStyle=item.color||'#fff'; ctx.font=`${item.fontStyle||'normal'} ${item.fontWeight||'400'} ${item.fontSize||14}px ${item.fontFamily||'sans-serif'}`; ctx.textBaseline=vertical==='top'?'top':vertical==='bottom'?'bottom':'middle'; ctx.textAlign=align;
    ctx.save(); ctx.beginPath(); ctx.rect(item.x,item.y,item.width,item.height); ctx.clip();
    const x=align==='left'?item.x+10:align==='right'?item.x+item.width-10:item.x+item.width/2,y=vertical==='top'?item.y+6:vertical==='bottom'?item.y+item.height-6:item.y+item.height/2;ctx.fillText(text,x,y,Math.max(0,item.width-16)); ctx.restore();
}
function drawElement(item) {
    if(item.type==='button'){
        const state=item.enabled===false?'disabled':item.previewState||'normal';
        if(state!=='normal')item={...item,color:item[`${state}Color`]??item.color,background:item[`${state}Background`]??item.background};
    }
    ctx.globalAlpha=item.opacity??1;
    if(item.background&&item.background!=='transparent') { pathRect(item.x,item.y,item.width,item.height,item.radius); ctx.fillStyle=item.background; ctx.fill(); }
    if(item.type==='input') { pathRect(item.x,item.y,item.width,item.height,item.radius); ctx.strokeStyle='#ffffff35'; ctx.lineWidth=1/view.z; ctx.stroke(); drawText(item,item.text,'left'); }
    else if(item.type==='checkbox') { ctx.strokeStyle=item.color; ctx.lineWidth=1.5/view.z; ctx.strokeRect(item.x+3,item.y+item.height/2-7,14,14); ctx.fillStyle=item.color; ctx.font=`${item.fontStyle||'normal'} ${item.fontWeight||'400'} ${item.fontSize||14}px ${item.fontFamily||'sans-serif'}`; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(item.text,item.x+25,item.y+item.height/2,item.width-28); }
    else if(item.type==='image') { const image=imageFor(item.source); if(image?.complete&&image.naturalWidth) ctx.drawImage(image,item.x,item.y,item.width,item.height); else { ctx.strokeStyle='#ffffff55'; ctx.lineWidth=1/view.z; ctx.setLineDash([5/view.z,4/view.z]); ctx.strokeRect(item.x,item.y,item.width,item.height); ctx.setLineDash([]); ctx.fillStyle='#b6bac4'; ctx.font='24px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('▧',item.x+item.width/2,item.y+item.height/2); } }
    else if(item.type!=='panel') drawText(item,item.text);
    ctx.globalAlpha=1;
}
function isDisplayed(item) {
    const visited=new Set();let current=item;
    while(current){if(current.display==='none'||current.display===false)return false;if(visited.has(current.id))return false;visited.add(current.id);current=current.parent?data.elements.find(entry=>entry.id===current.parent):null;}
    return true;
}
function draw() {
    if(!data) return;
    const width=canvas.width/dpr,height=canvas.height/dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle=theme('editor-background','#17191e'); ctx.fillRect(0,0,width,height);
    const gap=24*view.z,startX=((view.x%gap)+gap)%gap,startY=((view.y%gap)+gap)%gap; ctx.fillStyle=theme('editorIndentGuide-background1','#353842');
    if(gap>=8) for(let x=startX;x<width;x+=gap) for(let y=startY;y<height;y+=gap) ctx.fillRect(Math.round(x),Math.round(y),1,1);
    ctx.save(); ctx.translate(view.x,view.y); ctx.scale(view.z,view.z);
    ctx.strokeStyle=theme('widget-border',theme('panel-border','#808080')); ctx.lineWidth=1/view.z; ctx.strokeRect(0,0,data.canvas.width,data.canvas.height);
    [...data.elements].sort((a,b)=>(a.z||0)-(b.z||0)).filter(isDisplayed).forEach(drawElement);
    const item=selected(); if(item&&isDisplayed(item)) { ctx.strokeStyle='#4da3ff'; ctx.lineWidth=2/view.z; ctx.strokeRect(item.x,item.y,item.width,item.height); const h=9/view.z; ctx.fillStyle='#fff'; ctx.fillRect(item.x+item.width-h/2,item.y+item.height-h/2,h,h); ctx.strokeStyle='#4da3ff'; ctx.strokeRect(item.x+item.width-h/2,item.y+item.height-h/2,h,h); }
    ctx.restore(); ctx.fillStyle=theme('descriptionForeground','#999'); ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.fillText(`${data.canvas.width} × ${data.canvas.height}`,view.x+data.canvas.width*view.z/2,view.y+data.canvas.height*view.z+18);
}
function hitTest(point) { return [...data.elements].sort((a,b)=>(b.z||0)-(a.z||0)).filter(isDisplayed).find(i=>point.x>=i.x&&point.x<=i.x+i.width&&point.y>=i.y&&point.y<=i.y+i.height); }
function isResize(item,p) {
    const s=14/view.z,right=item.x+item.width,bottom=item.y+item.height;
    return p.x>=right-s&&p.x<=right+s&&p.y>=bottom-s&&p.y<=bottom+s;
}
function onArtboard(p) { return p.x>=0&&p.y>=0&&p.x<=data.canvas.width&&p.y<=data.canvas.height; }
function descendantsOf(parentId) {
    const descendants=[];
    const pending=[parentId];
    while(pending.length){const id=pending.pop();for(const item of data.elements){if(item.parent===id){descendants.push(item);pending.push(item.id);}}}
    return descendants;
}
function arrangeChildren(parent) {
    if(!parent||parent.type!=='panel'||!['row','column','grid'].includes(parent.display))return;
    const children=data.elements.filter(item=>item.parent===parent.id).sort((a,b)=>(a.z||0)-(b.z||0));
    const padding=12,gap=8;
    if(parent.display==='row'){
        let x=parent.x+padding;
        for(const child of children){child.x=x;child.y=parent.y+padding;x+=child.width+gap;}
        return;
    }
    if(parent.display==='column'){
        let y=parent.y+padding;
        for(const child of children){child.x=parent.x+padding;child.y=y;y+=child.height+gap;}
        return;
    }
    const columns=Math.max(1,Math.ceil(Math.sqrt(children.length)));
    const cellWidth=Math.max(1,(parent.width-padding*2-gap*(columns-1))/columns);
    children.forEach((child,index)=>{const column=index%columns,row=Math.floor(index/columns);child.x=parent.x+padding+column*(cellWidth+gap);child.y=parent.y+padding+row*(child.height+gap);});
}

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
function deleteSelected() { const item=selected();if(!item)return;const before=snapshot();for(const child of data.elements){if(child.parent===item.id)child.parent=item.parent??null;}data.elements=data.elements.filter(entry=>entry.id!==item.id);selectedId=null;commit(before); }
function zoomLabel() { const value=Math.round(view.z*100); $('#zoom').value=value; $('#zoom-value').textContent=`${value}%`; }
function setPaletteVisible(visible) { palette.hidden=!visible; $('#toggle-palette').classList.toggle('active',visible); $('#toggle-palette').setAttribute('aria-pressed',String(visible)); }
function fit() { if(!data)return; view.z=Math.max(.25,Math.min(1.5,(stage.clientWidth-80)/data.canvas.width,(stage.clientHeight-80)/data.canvas.height)); view.x=(stage.clientWidth-data.canvas.width*view.z)/2; view.y=(stage.clientHeight-data.canvas.height*view.z)/2; zoomLabel(); draw(); }
function addWidget(type,sx,sy) { const base=defaults[type]; if(!base)return; const before=snapshot(),p=worldPoint(sx,sy),number=data.elements.filter(i=>i.type===type).length+1; const item={id:uid(),type,name:`${type[0].toUpperCase()}${type.slice(1)} ${number}`,parent:null,events:[],display:type==='panel'?'block':undefined,x:Math.round(Math.max(0,Math.min(data.canvas.width-base.width,p.x-base.width/2))),y:Math.round(Math.max(0,Math.min(data.canvas.height-base.height,p.y-base.height/2))),opacity:1,radius:type==='button'?4:0,z:data.elements.length,...base}; data.elements.push(item); selectedId=item.id; commit(before); }

$('#widget-list').innerHTML=catalog.map(([type,icon,label])=>`<div class="widget" draggable="true" data-widget="${type}"><ion-icon class="widget-icon" name="${icon}"></ion-icon><span>${label}</span></div>`).join('');
$('#widget-list').addEventListener('dragstart',e=>e.dataTransfer.setData('application/x-iug-widget',e.target.closest('.widget')?.dataset.widget||''));
canvas.addEventListener('dragover',e=>{e.preventDefault();canvas.classList.add('drop-target');}); canvas.addEventListener('dragleave',()=>canvas.classList.remove('drop-target'));
canvas.addEventListener('drop',e=>{e.preventDefault();canvas.classList.remove('drop-target');const r=canvas.getBoundingClientRect();addWidget(e.dataTransfer.getData('application/x-iug-widget'),e.clientX-r.left,e.clientY-r.top);});
canvas.addEventListener('pointerdown',e=>{ canvas.focus(); const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top,p=worldPoint(sx,sy),resizeItem=selected(),resizing=Boolean(resizeItem&&isResize(resizeItem,p)),item=resizing?resizeItem:hitTest(p),pan=e.button===1||e.button===2||!item; if(pan){if(e.button===0&&onArtboard(p)){selectedId=null;renderUI();} interaction={kind:'pan',startX:sx,startY:sy,viewX:view.x,viewY:view.y};canvas.classList.add('panning');}else{selectedId=item.id;interaction={kind:resizing?'resize':'move',before:snapshot(),startX:p.x,startY:p.y,x:item.x,y:item.y,width:item.width,height:item.height,descendants:descendantsOf(item.id).map(child=>({id:child.id,x:child.x,y:child.y}))};renderUI();} canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top,p=worldPoint(sx,sy);if(!interaction){canvas.style.cursor=selected()&&isResize(selected(),p)?'nwse-resize':'';return;}if(interaction.kind==='pan'){view.x=interaction.viewX+sx-interaction.startX;view.y=interaction.viewY+sy-interaction.startY;draw();return;}const item=selected(),dx=p.x-interaction.startX,dy=p.y-interaction.startY;if(interaction.kind==='resize'){item.width=Math.max(12,Math.round(interaction.width+dx));item.height=Math.max(12,Math.round(interaction.height+dy));arrangeChildren(item);}else{item.x=Math.round(Math.max(0,Math.min(data.canvas.width-item.width,interaction.x+dx)));item.y=Math.round(Math.max(0,Math.min(data.canvas.height-item.height,interaction.y+dy)));const movedX=item.x-interaction.x,movedY=item.y-interaction.y;for(const start of interaction.descendants??[]){const child=data.elements.find(entry=>entry.id===start.id);if(child){child.x=start.x+movedX;child.y=start.y+movedY;}}}draw();});
canvas.addEventListener('pointerup',()=>{if(interaction?.before)commit(interaction.before);interaction=null;canvas.classList.remove('panning');}); canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top,p=worldPoint(sx,sy);view.z=Math.max(.25,Math.min(1.5,view.z*Math.exp(-e.deltaY*.001)));view.x=sx-p.x*view.z;view.y=sy-p.y*view.z;zoomLabel();draw();},{passive:false});

$('#zoom').addEventListener('input',e=>{const old=view.z;view.z=Number(e.target.value)/100;view.x=stage.clientWidth/2-(stage.clientWidth/2-view.x)*view.z/old;view.y=stage.clientHeight/2-(stage.clientHeight/2-view.y)*view.z/old;zoomLabel();draw();});
$('#fit').addEventListener('click',fit); $('#toggle-palette').addEventListener('click',()=>setPaletteVisible(palette.hidden)); $('#close-palette').addEventListener('click',()=>setPaletteVisible(false)); $('#undo').addEventListener('click',()=>history.length&&restore(history.pop(),future)); $('#redo').addEventListener('click',()=>future.length&&restore(future.pop(),history)); $('#save').addEventListener('click',()=>vscode.postMessage({type:'save',data})); window.addEventListener('resize',resizeCanvas);
window.addEventListener('keydown',e=>{const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();if(dirty)vscode.postMessage({type:'save',data});}if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?$('#redo').click():$('#undo').click();}if((e.key==='Delete'||e.key==='Backspace')&&selectedId&&!e.target.matches('input,textarea')){e.preventDefault();deleteSelected();}});
window.addEventListener('message',e=>{if(e.data.type==='load'){if(dirty)return;textureSources.clear();for(const texture of e.data.textures??[])textureSources.set(texture.id,texture.image);for(const font of e.data.fonts??[]){if(!loadedFonts.has(font.id)){loadedFonts.add(font.id);const face=new FontFace(font.family,`url(${font.source})`);face.load().then(loaded=>{document.fonts.add(loaded);draw();}).catch(()=>loadedFonts.delete(font.id));}}imageCache.clear();data=structuredClone(e.data.asset.data);data.canvas.type??='menu';for(const item of data.elements??[]){if(item.type==='image'&&item.background==='#292c34')item.background='transparent';if(item.type==='panel'&&!['none','block','row','column','grid'].includes(item.display))item.display='block';item.events??=[];normalizeTextStyle(item);normalizeButtonStyle(item);}$('#graph-title').textContent=e.data.asset.name||'UI Editor';history=[];future=[];selectedId=null;setDirty(false);resizeCanvas();fit();renderUI();}if(e.data.type==='selectElement'){selectedId=e.data.id??null;renderUI();}if(e.data.type==='reparentElement'){const child=data.elements.find(item=>item.id===e.data.elementId);if(child){const before=snapshot();child.parent=e.data.parentId??null;selectedId=child.id;arrangeChildren(data.elements.find(item=>item.id===child.parent));commit(before);}}if(e.data.type==='updateGraphProperty'){if(e.data.property==='__delete'&&selectedId){deleteSelected();}else{const before=snapshot(),target=e.data.selectionType==='uiCanvas'?data.canvas:selected();if(target&&Object.hasOwn(target,e.data.property)){target[e.data.property]=e.data.value;arrangeChildren(target);commit(before);}}}if(e.data.type==='deleteSelection'&&selectedId)deleteSelected();if(e.data.type==='saved')setDirty(false);if(e.data.type==='error')$('#status').textContent=`Error: ${e.data.message}`;});
vscode.postMessage({type:'ready'});
