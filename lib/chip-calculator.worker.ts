import { recommend } from './chip-calculator';
self.onmessage = ({data}) => {try{self.postMessage({alternatives:recommend(data)});}catch(e){self.postMessage({error:e instanceof Error?e.message:'No se pudo calcular el reparto.'});}};
