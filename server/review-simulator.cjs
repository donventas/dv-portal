'use strict';
// Deterministic fixture, explicitly NOT model-generated analysis or AVOS activation.
function simulate(job){
 const keys=['name','offer','audience','objective'];
 return {requestId:job.requestId,draftVersion:job.draftVersion,mode:'simulation',method:'dv-review-simulator-v1',
  summary:'Simulación de revisión interna. Requiere evaluación del equipo.',
  facts:keys.filter(k=>Object.hasOwn(job.snapshot,k)).map(field=>({field,value:job.snapshot[field]})),
  hypotheses:[],missing:keys.filter(k=>!job.snapshot[k]),
  recommendation:'Revisar el contexto y confirmar la prioridad antes de definir alcance, precio o fecha.',
  proposedReturn:'Gracias por compartir tu contexto. El equipo revisará lo enviado y te propondrá el siguiente paso.'};
}
module.exports={simulate};
