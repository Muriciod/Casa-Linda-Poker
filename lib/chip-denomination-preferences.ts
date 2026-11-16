import type { Config } from './chip-calculator';
export const DENOMINATION_STORAGE_KEY='casa-linda:case2-denominations:v1';
export function denominationPreferences(config:Config){
 const values=config.chipValues;
 if(config.caseId!==2||!Array.isArray(values)||values.length!==5||!values.every((v,i)=>Number.isSafeInteger(v)&&v>0&&(i===0||v>values[i-1])))return null;
 return {autoValues:config.autoValues===true,chipValues:[...values]};
}
export function restoreDenominationPreferences(config:Config,raw:string|null):Config{
 if(config.caseId!==2)return config;
 const fallback={...config,autoValues:config.autoValues===true};
 try{if(!raw)return fallback;const saved=JSON.parse(raw);if(typeof saved?.autoValues!=='boolean')return fallback;
 const preferences=denominationPreferences({...config,chipValues:saved.chipValues,autoValues:saved.autoValues});
 return preferences?{...fallback,...preferences}:fallback;
 }catch{return fallback;}
}
