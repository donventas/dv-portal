/* Partial form documents preserve exact text, including deselected option notes. */
(function(root,factory){
  const api=factory(typeof module==='object' ? require('./hybrid-demo.js') : root.DVHybridCore);
  if(typeof module==='object') module.exports=api;
  else root.DVDraftContract=api;
})(typeof window==='undefined'?null:window,function(core){
  'use strict';
  const fields={};
  for(const name of ['name','offer','audience','objective']) fields[name]={type:'string',max:500};
  for(const name of ['channels','tone','restrictions']) fields[name]={type:'string',max:2000};
  fields.welcome_skipped={type:'boolean'};
  fields.welcome_section={type:'string',values:['negocio','objetivo','clientes','identidad','profundizar']};
  fields.brand_status={type:'string',values:['','ready','organize','none']};
  for(const name of ['brand_primary','brand_secondary','brand_background']) fields[name]={type:'string',max:100};
  fields.brand_fonts={type:'string',max:500};
  fields.brand_context={type:'string',max:2000};
  for(const name of ['brand_logo','brand_logo_light','brand_logo_dark','brand_manual']) fields[name]={type:'string',max:36};
  for(const q of core.questions) for(const [id] of q.options){
    fields['q_'+q.id+'_'+id]={type:'boolean'};
    fields['qnote_'+q.id+'_'+id]={type:'string',max:1500};
  }
  for(const q of core.insightQuestions){
    fields['it_'+q.id]={type:'string',max:1500};
    fields['is_'+q.id]={type:'string',max:300};
    fields['ib_'+q.id]={type:'string',values:['hypothesis','observed','pending']};
  }
  function validate(doc){
    const fail=()=>{throw Error('DRAFT_INVALID');};
    if(!doc||Array.isArray(doc)||Object.keys(doc).sort().join(',')!=='fields,schema,stage'||doc.schema!==1||!['marca','identidad','contexto','panel'].includes(doc.stage)||!doc.fields||Array.isArray(doc.fields)||typeof doc.fields!=='object')fail();
    for(const [key,value] of Object.entries(doc.fields)){
      const rule=Object.hasOwn(fields,key)&&fields[key];
      if(!rule||typeof value!==rule.type||(rule.max&&value.length>rule.max)||(rule.values&&!rule.values.includes(value))||typeof value==='string'&&value.includes('\u0000'))fail();
    }
    return JSON.parse(JSON.stringify(doc));
  }
  const sections=[
    {id:'negocio',title:'Tu negocio',hint:'Nombre y lo que ofreces.',keys:k=>['name','offer'].includes(k)||/^q(note)?_offerTypes_/.test(k)},
    {id:'objetivo',title:'Tu objetivo',hint:'Qué te gustaría resolver.',keys:k=>k==='objective'||/^q(note)?_needs_/.test(k)},
    {id:'clientes',title:'Tus clientes',hint:'A quién quieres llegar.',keys:k=>k==='audience'||/^q(note)?_audiences_/.test(k)},
    {id:'identidad',title:'Tu identidad visual',hint:'Logo, colores y materiales, si los tienes.',keys:k=>k.startsWith('brand_')},
    {id:'profundizar',title:'Profundizar',hint:'Canales, tono y contexto adicional.',keys:k=>['channels','tone','restrictions'].includes(k)||/^q(note)?_channels_|^i[tsb]_/.test(k)}
  ];
  function sectionState(id,current,saved){
    const section=sections.find(s=>s.id===id),pick=f=>Object.fromEntries(Object.entries(f).filter(([k,v])=>section.keys(k)&&v!==''&&v!==false));
    const a=pick(current),b=pick(saved),keys=[...new Set([...Object.keys(a),...Object.keys(b)])];
    if(keys.some(k=>a[k]!==b[k]))return 'Cambios sin guardar';
    return Object.keys(a).length?'Con información guardada':'Sin empezar';
  }
  return {fields,sections,sectionState,validate,empty:()=>({schema:1,stage:'marca',fields:{}})};
});
