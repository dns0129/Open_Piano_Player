import{cj as An,d5 as Yt,s as F,A as ar,u as sr,v as Rn,aE as rr,cc as Nn,d6 as st,d7 as Zt,d8 as $e,w as Cn,d9 as Me,da as Oe,db as Pe,x as Fn,y as En,I as Dn,dc as Tn,bx as or,dd as ur,a as ve,M as On,bO as ir,de as cr,df as dr,dg as fe,dh as pr,di as _n,N as lr,dj as Pn,dk as Wn,dl as Bn,dm as mr,dn as fr,R as hr,S as gr,U as Vn,X as _r,dp as br,dq as Lt,dr as yr,ds as Ir,Y as Hn,dt as jn,du as rt,_ as Ln,a2 as wr,a3 as kr,a4 as $n,a5 as Un,dv as zn,a6 as qn,a9 as Gn,aa as Xn,aj as Sr,am as Mr,ao as vr,ap as xr,as as Ar,at as Kn,au as Rr,av as Nr,aw as Qn,ax as Jn,ay as Yn,az as Zn,dw as Cr,aA as Fr,dx as Er,aB as Dr,aC as Tr,aM as ea,aN as Or,aO as Pr,aQ as Wr,aT as Br,aU as Vr,aV as Hr,aW as jr,aY as ta,b2 as Lr,aZ as na,b3 as aa,b4 as sa,b5 as $r,b6 as ra,b9 as Ur,ba as zr,bb as oa,bc as ua,bd as ia,be as qr,bg as ca,bh as Gr,bi as Xr,dy as Kr,bj as da,bl as Qr,bm as pa,bn as la,bq as Jr,dz as Yr,bt as Zr,bv as eo,bw as to,by as ma,bA as fa,bC as ha,bD as ga,dA as no,bE as ao,bF as so,bG as _a,dB as ro,bI as oo,bK as uo,bM as io,bP as ba,bR as co,bS as po,dC as lo,dD as mo,dE as fo,bT as ya,dF as ho,dG as go,dH as _o,dI as bo,dJ as yo,dK as bn,dL as Io,dM as wo,dN as ko,bU as So,bV as Mo,bX as vo,dO as xo,bY as Ao,bZ as Ro,b_ as No,b$ as Ia,c0 as wa,dP as Co,dQ as Fo,c1 as Eo,dR as Do,c2 as To,dS as Oo,c3 as Po,dT as Wo,c4 as Bo,c5 as ka,c6 as Vo,c7 as Ho,c9 as Sa,ca as Ma,cb as va,ce as jo,ci as Lo,cQ as $o,e as qt,dU as Se,dV as yn,dW as xa,aJ as Uo,a7 as zo,cz as qo,dX as In,dY as wn,cr as Go,m as Xo,cO as Ko}from"./StringToHashBucketFast_impl-Dncwi67L.js";function Qo(s,n){return n.forEach(function(r){r&&typeof r!="string"&&!Array.isArray(r)&&Object.keys(r).forEach(function(o){if(o!=="default"&&!(o in s)){var a=Object.getOwnPropertyDescriptor(r,o);Object.defineProperty(s,o,a.get?a:{enumerable:!0,get:function(){return r[o]}})}})}),Object.freeze(s)}/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */var K;(function(s){s[s.float32=0]="float32",s[s.int32=1]="int32",s[s.bool=2]="bool",s[s.string=3]="string",s[s.complex64=4]="complex64"})(K||(K={}));var at;(function(s){s[s.linear=0]="linear",s[s.relu=1]="relu",s[s.relu6=2]="relu6",s[s.prelu=3]="prelu",s[s.leakyrelu=4]="leakyrelu",s[s.sigmoid=5]="sigmoid",s[s.elu=6]="elu"})(at||(at={}));/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Aa;function Jo(s){Aa=s.wasm.cwrap(An,null,["number","array","number","number","array","number","number","number","number","number","number","number","number"])}function Yo(s){const{inputs:n,backend:r,attrs:o}=s,{a,b:t,bias:u,preluActivationWeights:c}=n;if(a.dtype!=="float32"||t.dtype!=="float32")throw new Error("_FusedMatMul for non non-float32 tensors not yet supported.");const{transposeA:p,transposeB:d,activation:e,leakyreluAlpha:g}=o,_=r.dataIdMap.get(a.dataId).id,l=r.dataIdMap.get(t.dataId).id;let m=0;if(u!=null){const V=r.dataIdMap.get(u.dataId);if(V.shape.length!==1)throw new Error(`_FusedMatMul only supports rank-1 bias but got rank ${V.shape.length}.`);m=V.id}const f=c==null?0:r.dataIdMap.get(c.dataId).id,w=at[e];if(w==null)throw new Error(`${e} activation not yet supported for FusedConv2D in the wasm backend.`);const k=p?a.shape[2]:a.shape[1],I=d?t.shape[1]:t.shape[2],b=Yt(a.shape.slice(0,-2),t.shape.slice(0,-2)),x=r.makeOutput([...b,k,I],a.dtype),D=r.dataIdMap.get(x.dataId).id,C=new Uint8Array(new Int32Array(a.shape).buffer),O=new Uint8Array(new Int32Array(t.shape).buffer);return Aa(_,C,a.shape.length,l,O,t.shape.length,p,d,w,m,f,g||0,D),x}const Zo={kernelName:An,backendName:"wasm",setupFunc:Jo,kernelFunc:Yo};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function ee(s,n){let r;function o(t){r=t.wasm.cwrap(s,null,["number","number","number"])}function a(t){const{backend:u,inputs:{x:c}}=t,p=u.dataIdMap.get(c.dataId).id,d=u.makeOutput(c.shape,n||c.dtype),e=u.dataIdMap.get(d.dataId).id;return F(d.shape)===0||r(p,K[c.dtype],e),d}return{kernelName:s,backendName:"wasm",setupFunc:o,kernelFunc:a}}/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const eu=ee(ar);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function ne(s,n,r){let o;function a(u){o=u.wasm.cwrap(s,null,["number","array","number","number","array","number","number","number"])}function t(u){const{backend:c,inputs:p}=u,{a:d,b:e}=p,g=c.dataIdMap.get(d.dataId).id,_=c.dataIdMap.get(e.dataId).id,l=r??d.dtype,m=Yt(d.shape,e.shape),f=c.makeOutput(m,l);if(F(m)===0)return f;const w=new Uint8Array(new Int32Array(d.shape).buffer),k=new Uint8Array(new Int32Array(e.shape).buffer),I=c.dataIdMap.get(f.dataId).id;return o(g,w,d.shape.length,_,k,e.shape.length,K[d.dtype],I),f}return{kernelName:s,backendName:"wasm",setupFunc:a,kernelFunc:t}}/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const tu=ne(sr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ra;function nu(s){Ra=s.wasm.cwrap(Rn,null,["array","number","number","number"])}function au(s){const{inputs:n,backend:r}=s,o=r.makeOutput(n[0].shape,n[0].dtype);if(F(o.shape)===0)return o;const a=n.map(c=>r.dataIdMap.get(c.dataId).id),t=new Uint8Array(new Int32Array(a).buffer),u=r.dataIdMap.get(o.dataId).id;return Ra(t,a.length,K[o.dtype],u),o}const su={kernelName:Rn,backendName:"wasm",setupFunc:nu,kernelFunc:au};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Nt(s){const{inputs:{x:n},backend:r}=s,o=r.makeOutput(n.shape,n.dtype),a=r.typedArrayFromHeap(n);return r.typedArrayFromHeap(o).set(a),o}const ru={kernelName:rr,backendName:"wasm",kernelFunc:Nt};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Na;function ou(s){Na=s.wasm.cwrap(Nn,null,["number","array","number","number","number","array","number"])}function Ae(s){const{inputs:n,backend:r,attrs:o}=s,[a,t]=iu(n.x.shape,o.perm);let u=!0;for(let m=0;m<t.length;m++)t[m]!==m&&(u=!1);const c=uu(n.x.shape,o.perm),p={dataId:n.x.dataId,shape:a,dtype:n.x.dtype};if(u){const m=Nt({inputs:n,backend:r});return m.shape=c,m}const d=r.makeOutput(c,p.dtype),e=r.dataIdMap.get(p.dataId).id,g=r.dataIdMap.get(d.dataId).id,_=new Uint8Array(new Int32Array(t).buffer),l=new Uint8Array(new Int32Array(p.shape).buffer);return Na(e,l,p.shape.length,K[p.dtype],g,_,t.length),d}function uu(s,n){const r=new Array(s.length);for(let o=0;o<r.length;o++)r[o]=s[n[o]];return r}function iu(s,n){const r=[],o=[];for(let a=0;a<s.length;++a)s[a]!==1&&r.push(s[a]),s[n[a]]!==1&&o.push(n[a]);for(let a=0;a<o.length;++a){let t=-1;for(let u=0;u<o.length;++u)o[u]>=a&&(t===-1||o[t]>o[u])&&(t=u);o[t]=a}return[r,o]}const cu={kernelName:Nn,backendName:"wasm",kernelFunc:Ae,setupFunc:ou};/**
 * @license
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Re(s,n,r){const o=s.shape,a=s.shape.length,t=st(n,o);let u=t;const c=Zt(u,a);let p=null,d=!1;if(c!=null){const e=new Array(a);for(let l=0;l<e.length;l++)e[l]=o[c[l]];u=$e(u.length,a),p=Ae({inputs:{x:s},attrs:{perm:c},backend:r});const g=r.dataIdMap.get(s.dataId).id;r.dataIdMap.get(p.dataId).id!==g&&(d=!0)}return{transposed:p,originalAxes:t,axes:u,inputWasTransposed:d}}/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ca;function du(s){Ca=s.wasm.cwrap(Cn,null,["number, number, number"])}function pu(s){const{backend:n,inputs:r,attrs:o}=s,{axis:a,keepDims:t}=o,{x:u}=r;let p=n.dataIdMap.get(u.dataId).id,d=u;const{transposed:e,axes:g,originalAxes:_,inputWasTransposed:l}=Re(u,a,n);if(l){const b=n.dataIdMap.get(e.dataId).id;d=e,p=b}const m=d.shape.length;Me("all",g,m);const[f,w]=Oe(d.shape,g),k=F(w),I=n.makeOutput(f,u.dtype);if(F(d.shape)!==0){const b=n.dataIdMap.get(I.dataId).id;Ca(p,k,b)}if(l&&n.disposeData(e.dataId),t){const b=Pe(I.shape,_);I.shape=b}return I}const lu={kernelName:Cn,backendName:"wasm",setupFunc:du,kernelFunc:pu};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Fa;function mu(s){Fa=s.wasm.cwrap(Fn,null,["number, number, number"])}function fu(s){const{backend:n,inputs:r,attrs:o}=s,{axis:a,keepDims:t}=o,{x:u}=r;let p=n.dataIdMap.get(u.dataId).id,d=u;const{transposed:e,axes:g,originalAxes:_,inputWasTransposed:l}=Re(u,a,n);if(l){const b=n.dataIdMap.get(e.dataId).id;d=e,p=b}const m=d.shape.length;Me("any",g,m);const[f,w]=Oe(d.shape,g),k=F(w),I=n.makeOutput(f,u.dtype);if(F(d.shape)!==0){const b=n.dataIdMap.get(I.dataId).id;Fa(p,k,b)}if(l&&n.disposeData(e.dataId),t){const b=Pe(I.shape,_);I.shape=b}return I}const hu={kernelName:Fn,backendName:"wasm",setupFunc:mu,kernelFunc:fu};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ea;function gu(s){Ea=s.wasm.cwrap(En,null,["number","number","number","number","number"])}function _u(s){const{backend:n,inputs:r,attrs:o}=s,{axis:a}=o,{x:t}=r,u=n.dataIdMap.get(t.dataId).id;let c=u,p=t;const{transposed:d,axes:e,inputWasTransposed:g}=Re(t,a,n);if(g){const k=n.dataIdMap.get(d.dataId).id;k!==u&&(p=d,c=k)}const _=p.shape.slice(0,-1),l=n.makeOutput(_,"int32"),m=n.dataIdMap.get(l.dataId).id,f=F(l.shape),w=p.shape[e[0]];return Ea(c,K[p.dtype],f,w,m),g&&n.disposeData(d.dataId),l}const bu={kernelName:En,backendName:"wasm",kernelFunc:_u,setupFunc:gu};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Da;function yu(s){Da=s.wasm.cwrap(Dn,null,["number","number","number","number","number","number","number","number","number","number","number","number","number","number"])}function Iu(s){const{inputs:n,attrs:r,backend:o}=s,a=n.x,t=o.dataIdMap.get(a.dataId).id,{filterSize:u,strides:c,pad:p,dimRoundingMode:d}=r,e=Tn(a.shape,u,c,1,p,d),g=e.filterHeight,_=e.filterWidth,l=e.padInfo.top,m=e.padInfo.right,f=e.padInfo.bottom,w=e.padInfo.left,k=e.strideHeight,I=e.strideWidth,b=e.inChannels;if(e.dataFormat!=="channelsLast")throw new Error(`wasm backend does not support dataFormat:'${e.dataFormat}'. Please use 'channelsLast'.`);if(e.dilationWidth!==1||e.dilationHeight!==1)throw new Error(`was backend only supports average pooling with dilation = [1, 1], got [${e.dilationHeight}, ${e.dilationWidth}].`);const x=o.makeOutput(e.outShape,"float32"),D=o.dataIdMap.get(x.dataId).id;return Da(t,a.shape[0],a.shape[1],a.shape[2],g,_,l,m,f,w,k,I,b,D),x}const wu={kernelName:Dn,backendName:"wasm",setupFunc:yu,kernelFunc:Iu};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function ue(s){const{inputs:n,attrs:r}=s,{x:o}=n,{shape:a}=r,t=F(o.shape),u=ur(a,t);return ve(t===F(u),()=>`new shape: ${u}, old shape: ${o.shape}. New shape and old shape must have the same number of elements.`),s.backend.incRef(o.dataId),{dataId:o.dataId,shape:u,dtype:o.dtype}}const ku={kernelName:or,backendName:"wasm",kernelFunc:ue};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ta;function Su(s){Ta=s.wasm.cwrap(On,null,["number","array","number","number","array","number","number","number","number"])}function Mu(s){const{inputs:n,backend:r,attrs:o}=s,{a,b:t}=n,{transposeA:u,transposeB:c}=o;if(a.dtype!=="float32"||t.dtype!=="float32")throw new Error("BatchMatMul for non non-float32 tensors not yet supported.");const p=a.shape.length,d=t.shape.length,e=u?a.shape[p-2]:a.shape[p-1],g=c?t.shape[d-1]:t.shape[d-2],_=u?a.shape[p-1]:a.shape[p-2],l=c?t.shape[d-2]:t.shape[d-1],m=a.shape.slice(0,-2),f=t.shape.slice(0,-2),w=F(m),k=F(f),b=Yt(a.shape.slice(0,-2),t.shape.slice(0,-2)).concat([_,l]);ve(e===g,()=>`Error in matMul: inner shapes (${e}) and (${g}) of Tensors with shapes ${a.shape} and ${t.shape} and transposeA=${u} and transposeB=${c} must match.`);const x=u?[w,e,_]:[w,_,e],D=c?[k,l,g]:[k,g,l],C=ue({inputs:{x:a},backend:r,attrs:{shape:x}}),O=ue({inputs:{x:t},backend:r,attrs:{shape:D}}),V=r.dataIdMap.get(C.dataId).id,j=r.dataIdMap.get(O.dataId).id,W=u?C.shape[2]:C.shape[1],$=c?O.shape[1]:O.shape[2],z=Math.max(w,k),Q=r.makeOutput([z,W,$],C.dtype),oe=r.dataIdMap.get(Q.dataId).id,q=new Uint8Array(new Int32Array(C.shape).buffer),Z=new Uint8Array(new Int32Array(O.shape).buffer);return Ta(V,q,C.shape.length,j,Z,O.shape.length,u,c,oe),r.disposeData(C.dataId),r.disposeData(O.dataId),Q.shape=b,Q}const vu={kernelName:On,backendName:"wasm",setupFunc:Su,kernelFunc:Mu};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Te(s){const{inputs:{x:n},attrs:{begin:r,size:o},backend:a}=s,[t,u]=cr(n,r,o),c=dr(n.shape,t,u),p=a.readSync(n.dataId),d=a.makeOutput(u,n.dtype),e=fe(n.shape),g=a.dataIdMap.get(d.dataId);if(c){const m=pr(t,e);return n.dtype==="string"?g.stringBytes=p.slice(m,m+F(u)):a.typedArrayFromHeap(d).set(p.subarray(m,m+F(u))),d}if(n.dtype==="string"){const m=_n(p,t,u,n.shape,n.dtype);return g.stringBytes=m,d}const _=a.typedArrayFromHeap(d),l=n.shape.length;if(l===2)xu(p,e[0],_,t,u);else if(l===3)Au(p,e[0],e[1],_,t,u);else if(l===4)Ru(p,e[0],e[1],e[2],_,t,u);else{const m=_n(p,t,u,n.shape,n.dtype);_.set(m)}return d}function xu(s,n,r,o,a){let t=0;const u=o[0],c=o[1],p=u+a[0];for(let d=u;d<p;d++){const e=d*n+c;r.set(s.subarray(e,e+a[1]),t),t+=a[1]}}function Au(s,n,r,o,a,t){let u=0;const c=a[0],p=a[1],d=a[2],e=c+t[0],g=p+t[1];for(let _=c;_<e;_++)for(let l=p;l<g;l++){const m=_*n+l*r+d;o.set(s.subarray(m,m+t[2]),u),u+=t[2]}}function Ru(s,n,r,o,a,t,u){let c=0;const p=t[0],d=t[1],e=t[2],g=p+u[0],_=d+u[1],l=e+u[2],m=t[3];for(let f=p;f<g;f++)for(let w=d;w<_;w++)for(let k=e;k<l;k++){const I=f*n+w*r+k*o+m;a.set(s.subarray(I,I+u[3]),c),c+=u[3]}}const Nu={kernelName:ir,backendName:"wasm",kernelFunc:Te};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Cu(s){const{inputs:n,backend:r,attrs:o}=s,{x:a}=n,{blockShape:t,crops:u}=o,c=t.reduce((k,I)=>k*I),p=Pn(a.shape,t,c),d=Wn(p.length,t.length),e=Bn(a.shape,t,c),g=mr(u,t.length),_=fr(e,u,t.length),l=ue({inputs:{x:a},backend:r,attrs:{shape:p}}),m=Ae({inputs:{x:l},backend:r,attrs:{perm:d}}),f=ue({inputs:{x:m},backend:r,attrs:{shape:e}}),w=Te({inputs:{x:f},backend:r,attrs:{begin:g,size:_}});return r.disposeData(l.dataId),r.disposeData(m.dataId),r.disposeData(l.dataId),w}const Fu={kernelName:lr,backendName:"wasm",kernelFunc:Cu};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Ue(s){const{inputs:{x:n},attrs:{dtype:r},backend:o}=s,a=o.makeOutput(n.shape,r),t=o.typedArrayFromHeap(n);return o.typedArrayFromHeap(a).set(t),a}const Eu={kernelName:hr,backendName:"wasm",kernelFunc:Ue};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Du=ee(gr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Oa;function Tu(s){Oa=s.wasm.cwrap(Vn,null,["number","number","number","number"])}function Ou(s){const{inputs:n,backend:r,attrs:o}=s,{x:a}=n,{clipValueMin:t,clipValueMax:u}=o,c=r.dataIdMap.get(a.dataId).id,p=r.makeOutput(a.shape,a.dtype),d=r.dataIdMap.get(p.dataId).id;return Oa(c,t,u,d),p}const Pu={kernelName:Vn,backendName:"wasm",setupFunc:Tu,kernelFunc:Ou};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Pa(s){const{inputs:n,backend:r}=s,o=st(s.attrs.axis,n[0].shape)[0],a=n.map(l=>l.shape);br(a,o);let t=Lt(n.map(l=>l.shape),o);const u=n.filter(l=>F(l.shape)>0);if(u.length===1)return Nt({inputs:{x:u[0]},backend:r});const c=r.makeOutput(t,n[0].dtype);if(F(t)===0)return c;if(u[0].dtype==="string"){const l=u.map(b=>{const D=[-1,F(b.shape.slice(o))];return ue({inputs:{x:b},backend:r,attrs:{shape:D}})}),m=l.map(b=>({vals:r.readSync(b.dataId),shape:b.shape}));t=Lt(l.map(b=>b.shape),1);const f=l[0].shape[0]===1,w=yr(m,t,n[0].dtype,f),k=Lt(u.map(b=>b.shape),o);c.shape=k;const I=r.dataIdMap.get(c.dataId);return I.stringBytes=Ir(w),l.forEach(b=>r.disposeData(b.dataId)),c}const p=F(u[0].shape.slice(0,o));let d=0;const e=u.map(l=>{const m=F(l.shape.slice(o));return d+=m,m}),g=u.map(l=>r.typedArrayFromHeap(l)),_=r.typedArrayFromHeap(c);for(let l=0;l<p;l++){let m=l*d;for(let f=0;f<g.length;f++){const w=e[f],k=l*w,I=g[f].subarray(k,k+w);_.set(I,m),m+=w}}return c}const Wu={kernelName:_r,backendName:"wasm",kernelFunc:Pa};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Wa;function Bu(s){Wa=s.wasm.cwrap(Hn,null,["number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number"])}function Vu(s){const{inputs:n,attrs:r,backend:o}=s,{x:a,filter:t}=n,u=o.dataIdMap.get(a.dataId).id,c=o.dataIdMap.get(t.dataId).id,{strides:p,dilations:d,pad:e,dimRoundingMode:g,dataFormat:_}=r,l=jn(_),m=rt(a.shape,t.shape,p,d,e,g,!1,l),f=m.filterHeight,w=m.filterWidth,k=m.padInfo.top,I=m.padInfo.right,b=m.padInfo.bottom,x=m.padInfo.left,D=m.dilationHeight,C=m.dilationWidth,O=m.strideHeight,V=m.strideWidth,j=m.inChannels,W=m.outChannels,$=m.padInfo.type==="SAME"?1:0;if(m.dataFormat!=="channelsLast")throw new Error(`wasm backend Conv2D does not support dataFormat:'${m.dataFormat}'. Please use 'channelsLast'.`);const z=o.makeOutput(m.outShape,"float32"),Q=o.dataIdMap.get(z.dataId).id;return Wa(u,a.shape[0],a.shape[1],a.shape[2],c,f,w,k,I,b,x,$,D,C,O,V,j,W,Q),z}const Hu={kernelName:Hn,backendName:"wasm",setupFunc:Bu,kernelFunc:Vu};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ba;function ju(s){Ba=s.wasm.cwrap(Ln,null,["number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number"])}function Lu(s){const{backend:n,inputs:r,attrs:o}=s,{dy:a,filter:t}=r,{strides:u,pad:c,dataFormat:p,dimRoundingMode:d,inputShape:e}=o,g=1,_=jn(p),l=rt(e,t.shape,u,g,c,d,!1,_),{batchSize:m,filterHeight:f,filterWidth:w,inChannels:k,inHeight:I,inWidth:b,outChannels:x,outHeight:D,outWidth:C,strideHeight:O,strideWidth:V}=l,j=f-1-l.padInfo.top,W=w-1-l.padInfo.left,$=l.dataFormat==="channelsLast",z=fe(l.inShape),Q=fe(a.shape),[oe,q,Z]=fe(t.shape),pe=z[0],L=$?z[1]:z[2],he=$?z[2]:1,ie=$?1:z[1],ce=Q[0],_e=$?Q[1]:Q[2],te=$?Q[2]:1,We=$?1:Q[1],Be=n.makeOutput(l.inShape,"float32"),ze=n.dataIdMap.get(Be.dataId).id,qe=n.dataIdMap.get(a.dataId).id,J=n.dataIdMap.get(t.dataId).id;return Ba(qe,J,m,f,w,I,b,k,D,C,x,O,V,j,W,oe,q,Z,pe,L,he,ie,ce,_e,te,We,ze),Be}const $u={kernelName:Ln,backendName:"wasm",setupFunc:ju,kernelFunc:Lu};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Uu=ee(wr);/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const zu=ee(kr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */var Gt;(function(s){s[s.bilinear=0]="bilinear",s[s.nearest=1]="nearest"})(Gt||(Gt={}));let Va;function qu(s){Va=s.wasm.cwrap($n,null,["number","number","number","number","array","number","number","number","number","number"])}function Gu(s){const{backend:n,inputs:r,attrs:o}=s,{method:a,extrapolationValue:t,cropSize:u}=o,{image:c,boxes:p,boxInd:d}=r,e=p.shape[0],[g,_]=u,l=[e,g,_,c.shape[3]];let m=n.dataIdMap.get(c.dataId),f;c.dtype!=="float32"&&(f=Ue({backend:n,inputs:{x:c},attrs:{dtype:"float32"}}),m=n.dataIdMap.get(f.dataId));const w=m.id,k=n.dataIdMap.get(p.dataId).id,I=n.dataIdMap.get(d.dataId).id,b=n.makeOutput(l,"float32"),x=n.dataIdMap.get(b.dataId).id,D=new Uint8Array(new Int32Array(c.shape).buffer);return Va(w,k,I,e,D,g,_,Gt[a],t,x),f!=null&&n.disposeData(f.dataId),b}const Xu={kernelName:$n,backendName:"wasm",setupFunc:qu,kernelFunc:Gu};/**
 * @license
 * Copyright 2022 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ha;function Ku(s){Ha=s.wasm.cwrap(Un,null,["number","number","number","number","number","number"])}function Qu(s){const{inputs:n,backend:r,attrs:o}=s,{x:a}=n,{axis:t,exclusive:u,reverse:c}=o,p=a.shape.length;ve(a.dtype==="float32"||a.dtype==="int32",()=>`cumprod does not support ${a.dtype} tensors in the WASM backend`);const d=Zt([t],p);let e=a;d!==null&&(e=Ae({inputs:{x:a},attrs:{perm:d},backend:r}));const g=$e(1,p)[0];Me("cumprod",[g],p);const _=r.makeOutput(e.shape,e.dtype),l=e.shape[g],m=r.dataIdMap.get(e.dataId).id,f=r.dataIdMap.get(_.dataId).id;Ha(m,u?1:0,c?1:0,l,f,K[a.dtype]);let w=_;if(d!==null){const k=zn(d);w=Ae({inputs:{x:_},attrs:{perm:k},backend:r}),r.disposeData(e.dataId),r.disposeData(_.dataId)}return w}const Ju={kernelName:Un,backendName:"wasm",setupFunc:Ku,kernelFunc:Qu};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ja;function Yu(s){ja=s.wasm.cwrap(qn,null,["number","number","number","number","number","number"])}function Zu(s){const{inputs:n,backend:r,attrs:o}=s,{x:a}=n,{axis:t,exclusive:u,reverse:c}=o,p=a.shape.length;ve(a.dtype==="float32"||a.dtype==="int32",()=>`cumsum does not support ${a.dtype} tensors in the WASM backend`);const d=Zt([t],p);let e=a;d!==null&&(e=Ae({inputs:{x:a},attrs:{perm:d},backend:r}));const g=$e(1,p)[0];Me("cumsum",[g],p);const _=r.makeOutput(e.shape,e.dtype),l=e.shape[g],m=r.dataIdMap.get(e.dataId).id,f=r.dataIdMap.get(_.dataId).id;ja(m,u?1:0,c?1:0,l,f,K[a.dtype]);let w=_;if(d!==null){const k=zn(d);w=Ae({inputs:{x:_},attrs:{perm:k},backend:r}),r.disposeData(e.dataId),r.disposeData(_.dataId)}return w}const ei={kernelName:qn,backendName:"wasm",setupFunc:Yu,kernelFunc:Zu};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let La;function ti(s){La=s.wasm.cwrap(Gn,null,["number","number","number","array","number","array","array","number","number"])}function ni(s){const{backend:n,inputs:r,attrs:o}=s,{x:a}=r,{blockSize:t,dataFormat:u}=o,c=a.shape[0],p=u==="NHWC"?a.shape[1]:a.shape[2],d=u==="NHWC"?a.shape[2]:a.shape[3],e=u==="NHWC"?a.shape[3]:a.shape[1],g=p*t,_=d*t,l=e/(t*t),m=u==="NHWC"?[c,g,_,l]:[c,l,g,_],f=n.makeOutput(m,"float32"),k=n.dataIdMap.get(a.dataId).id,I=new Uint8Array(new Int32Array(fe(a.shape)).buffer),b=new Uint8Array(new Int32Array(m).buffer),x=new Uint8Array(new Int32Array(fe(m)).buffer),D=n.dataIdMap.get(f.dataId).id;return La(k,t,u==="NHWC"?1:0,I,a.shape.length-1,b,x,m.length,D),f}const ai={kernelName:Gn,backendName:"wasm",setupFunc:ti,kernelFunc:ni};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let $a;function si(s){$a=s.wasm.cwrap(Xn,null,["number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number"])}function ri(s){const{inputs:n,attrs:r,backend:o}=s,{x:a,filter:t}=n,u=o.dataIdMap.get(a.dataId).id,c=o.dataIdMap.get(t.dataId).id,{strides:p,dilations:d,pad:e,dimRoundingMode:g}=r,_=d??[1,1],l=rt(a.shape,t.shape,p,_,e,g,!0),m=l.filterHeight,f=l.filterWidth,w=l.padInfo.top,k=l.padInfo.right,I=l.padInfo.bottom,b=l.padInfo.left,x=l.dilationHeight,D=l.dilationWidth,C=l.strideHeight,O=l.strideWidth,V=l.inChannels,j=l.outChannels,W=l.padInfo.type==="SAME"?1:0;if(l.dataFormat!=="channelsLast")throw new Error(`wasm backend DepthwiseConv2dNative does not support dataFormat:'${l.dataFormat}'. Please use 'channelsLast'.`);const $=o.makeOutput(l.outShape,"float32"),z=o.dataIdMap.get($.dataId).id;return $a(u,a.shape[0],a.shape[1],a.shape[2],c,m,f,w,k,I,b,W,x,D,C,O,V,j,z),$}const oi={kernelName:Xn,backendName:"wasm",setupFunc:si,kernelFunc:ri};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const ui=ee(Sr);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const ii=!1,ci=ne(Mr,ii,"bool");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const di=ee(vr,"float32");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Xt(s){const{inputs:n,attrs:r,backend:o}=s,{input:a}=n,{dim:t}=r,u=a.shape.length,c=a.shape.slice();let p=t;return t<0&&(ve(-(u+1)<=t,()=>`Axis must be in the interval [${-(u+1)}, ${u}]`),p=u+t+1),c.splice(p,0,1),ue({inputs:{x:a},backend:o,attrs:{shape:c}})}const pi={kernelName:xr,backendName:"wasm",kernelFunc:Xt};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Ua(s){const{attrs:{shape:n,value:r,dtype:o},backend:a}=s,t=a.makeOutput(n,o);return a.typedArrayFromHeap(t).fill(r),t}const li={kernelName:Ar,backendName:"wasm",kernelFunc:Ua};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let za;function mi(s){za=s.wasm.cwrap(Kn,null,["number","number","number","number","number","number"])}function fi(s){const{inputs:n,backend:r}=s,{image:o}=n,a=r.makeOutput(o.shape,o.dtype),t=r.dataIdMap.get(o.dataId).id,u=r.dataIdMap.get(a.dataId).id,[c,p,d,e]=o.shape;return za(t,c,p,d,e,u),a}const hi={kernelName:Kn,backendName:"wasm",kernelFunc:fi,setupFunc:mi};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const gi=ee(Rr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const _i=ne(Nr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let qa;function bi(s){qa=s.wasm.cwrap(Qn,null,["number","number","number","number","number","number","number"])}function yi(s){const{backend:n,inputs:r,attrs:o}=s,{varianceEpsilon:a}=o,{x:t,mean:u,variance:c,offset:p,scale:d}=r,e=n.dataIdMap.get(t.dataId).id,g=n.dataIdMap.get(u.dataId).id,_=n.dataIdMap.get(c.dataId).id,l=p!=null?n.dataIdMap.get(p.dataId).id:0,m=d!=null?n.dataIdMap.get(d.dataId).id:0,f=n.makeOutput(t.shape,t.dtype);if(F(t.shape)===0)return f;const w=n.dataIdMap.get(f.dataId).id;return qa(e,g,_,l,m,a,w),f}const Ii={kernelName:Qn,backendName:"wasm",setupFunc:bi,kernelFunc:yi};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ga;function wi(s){Ga=s.wasm.cwrap(Jn,null,["number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number"])}function ki(s){const{inputs:n,attrs:r,backend:o}=s,{x:a,filter:t,bias:u,preluActivationWeights:c}=n,{strides:p,pad:d,dilations:e,dataFormat:g,dimRoundingMode:_,activation:l,leakyreluAlpha:m}=r,f=rt(a.shape,t.shape,p,e,d,_),w=at[l];if(w==null)throw new Error(`${l} activation not yet supported for FusedConv2D in the wasm backend.`);const k=o.dataIdMap.get(a.dataId).id,I=o.dataIdMap.get(t.dataId).id,b=f.outChannels;let x=0;if(u!=null){const te=o.dataIdMap.get(u.dataId);if(te.shape.length!==1)throw new Error(`FusedConv2D only supports rank-1 bias but got rank ${te.shape.length}.`);if(te.shape[0]!==b)throw new Error(`FusedConv2D bias shape (${te.shape}) does not match the number of output channels (${b})`);x=te.id}const D=f.filterHeight,C=f.filterWidth,O=f.padInfo.top,V=f.padInfo.right,j=f.padInfo.bottom,W=f.padInfo.left,$=f.dilationHeight,z=f.dilationWidth,Q=f.strideHeight,oe=f.strideWidth,q=f.inChannels,Z=f.padInfo.type==="SAME"?1:0,pe=f.batchSize,L=f.inHeight,he=f.inWidth;if(g!=="NHWC")throw new Error(`wasm backend FusedConv2D does not support dataFormat:'${g}'. Please use 'NHWC'.`);const ie=o.makeOutput(f.outShape,"float32"),ce=o.dataIdMap.get(ie.dataId).id,_e=c==null?0:o.dataIdMap.get(c.dataId).id;return Ga(k,pe,L,he,I,D,C,x,O,V,j,W,Z,$,z,Q,oe,q,b,w,_e,m||0,ce),ie}const Si={kernelName:Jn,backendName:"wasm",setupFunc:wi,kernelFunc:ki};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Xa;function Mi(s){Xa=s.wasm.cwrap(Yn,null,["number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number"])}function vi(s){const{inputs:n,attrs:r,backend:o}=s,{x:a,filter:t,bias:u,preluActivationWeights:c}=n,{strides:p,pad:d,dilations:e,dataFormat:g,dimRoundingMode:_,activation:l,leakyreluAlpha:m}=r,f=rt(a.shape,t.shape,p,e,d,_,!0),w=at[l];if(w==null)throw new Error(`${l} activation not yet supported for FusedDepthwiseConv2D in the wasm backend.`);const k=o.dataIdMap.get(a.dataId).id,I=o.dataIdMap.get(t.dataId).id,b=f.outChannels;let x=0;if(u!=null){const te=o.dataIdMap.get(u.dataId);if(te.shape.length!==1)throw new Error(`FusedDepthwiseConv2D only supports rank-1 bias but got rank ${te.shape.length}.`);if(te.shape[0]!==b)throw new Error(`FusedDepthwiseConv2D bias shape (${te.shape}) does not match the number of output channels (${b})`);x=te.id}const D=f.filterHeight,C=f.filterWidth,O=f.padInfo.top,V=f.padInfo.right,j=f.padInfo.bottom,W=f.padInfo.left,$=f.dilationHeight,z=f.dilationWidth,Q=f.strideHeight,oe=f.strideWidth,q=f.inChannels,Z=f.padInfo.type==="SAME"?1:0,pe=f.batchSize,L=f.inHeight,he=f.inWidth;if(g!=="NHWC")throw new Error(`wasm backend FusedDepthwiseConv2D does not support dataFormat:'${g}'. Please use 'NHWC'.`);const ie=o.makeOutput(f.outShape,"float32"),ce=o.dataIdMap.get(ie.dataId).id,_e=c==null?0:o.dataIdMap.get(c.dataId).id;return Xa(k,pe,L,he,I,D,C,x,O,V,j,W,Z,$,z,Q,oe,q,b,w,_e,m||0,ce),ie}const xi={kernelName:Yn,backendName:"wasm",setupFunc:Mi,kernelFunc:vi};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ka;function Ai(s){Ka=s.wasm.cwrap(Zn,null,["number","number","number","number","number","number","array","number"])}function Ri(s){const{backend:n,inputs:r}=s,{params:o,indices:a}=r,[t,u,c,p]=Cr(o,a),d=n.makeOutput(t,o.dtype);if(u===0)return d;const e=a.shape,g=e[e.length-1],l=n.dataIdMap.get(o.dataId).id,f=n.dataIdMap.get(a.dataId).id,w=new Uint8Array(new Int32Array(p).buffer),k=n.dataIdMap.get(d.dataId).id;return Ka(l,K[o.dtype],f,u,g,c,w,k),d}const Ni={kernelName:Zn,backendName:"wasm",setupFunc:Ai,kernelFunc:Ri};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Qa;function Ci(s){Qa=s.wasm.cwrap("Gather",null,["number","number","array","number","number","number","array","number"])}function Fi(s){const{backend:n,inputs:r,attrs:o}=s,{x:a,indices:t}=r,{axis:u,batchDims:c}=o,p=st(u,a.shape)[0],d=n.readSync(t.dataId),e=a.shape[p];for(let j=0;j<d.length;++j){const W=d[j];ve(W<=e-1&&W>=0,()=>`GatherV2: the index value ${W} is not in [0, ${e-1}]`)}const g=Er(a,t,p,c),_=ue({inputs:{x:a},attrs:{shape:[g.batchSize,g.outerSize,g.dimSize,g.sliceSize]},backend:n}),l=F(t.shape),m=ue({inputs:{x:t},attrs:{shape:[g.batchSize,l/g.batchSize]},backend:n}),f=[g.batchSize,g.outerSize,l/g.batchSize,g.sliceSize],w=n.makeOutput(f,a.dtype);if(F(a.shape)===0)return w;const k=_.shape.length-1,b=n.dataIdMap.get(_.dataId).id,D=n.dataIdMap.get(m.dataId).id,C=n.dataIdMap.get(w.dataId).id,O=new Uint8Array(new Int32Array(fe(_.shape)).buffer),V=new Uint8Array(new Int32Array(fe(f)).buffer);return Qa(b,K[a.dtype],O,k,D,g.batchSize,V,C),n.disposeData(_.dataId),n.disposeData(m.dataId),w.shape=g.outputShape,w}const Ei={kernelName:Fr,backendName:"wasm",setupFunc:Ci,kernelFunc:Fi};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Di=!1,Ti=ne(Dr,Di,"bool");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Oi=!1,Pi=ne(Tr,Oi,"bool");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ja;function Wi(s){Ja=s.wasm.cwrap(ea,null,["number","number","number","number"])}function Bi(s){const{inputs:{x:n},attrs:{alpha:r},backend:o}=s,a=o.dataIdMap.get(n.dataId).id,t=o.makeOutput(n.shape,"float32");if(F(n.shape)!==0){const u=o.dataIdMap.get(t.dataId).id;Ja(a,K[n.dtype],r,u)}return t}const Vi={kernelName:ea,backendName:"wasm",setupFunc:Wi,kernelFunc:Bi};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Hi=!1,ji=ne(Or,Hi,"bool");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Li=!1,$i=ne(Pr,Li,"bool");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Ui=ee(Wr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const zi=!1,qi=ne(Br,zi,"bool");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Gi=ee(Vr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Xi=!1,Ki=ne(Hr,Xi,"bool");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Qi=!1,Ji=ne(jr,Qi,"bool");/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ya;function Yi(s){Ya=s.wasm.cwrap(ta,null,["number","number","number","number"])}function Zi(s){const{backend:n,inputs:r,attrs:o}=s,{reductionIndices:a,keepDims:t}=o,{x:u}=r;let p=n.dataIdMap.get(u.dataId).id,d=u;const{transposed:e,axes:g,originalAxes:_,inputWasTransposed:l}=Re(u,a,n);if(l){const b=n.dataIdMap.get(e.dataId).id;d=e,p=b}const m=d.shape.length;Me("max",g,m);const[f,w]=Oe(d.shape,g),k=F(w),I=n.makeOutput(f,u.dtype);if(F(d.shape)!==0){const b=n.dataIdMap.get(I.dataId).id;Ya(p,K[u.dtype],k,b)}if(l&&n.disposeData(e.dataId),t){const b=Pe(I.shape,_);I.shape=b}return I}const ec={kernelName:ta,backendName:"wasm",setupFunc:Yi,kernelFunc:Zi};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const tc=ne(Lr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Za;function nc(s){Za=s.wasm.cwrap(na,null,["number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number","number"])}function ac(s){const{inputs:n,attrs:r,backend:o}=s,a=n.x,t=o.dataIdMap.get(a.dataId).id;ve(a.dtype==="float32",()=>`Error in MaxPool: only float32 input is supported. Got ${a.dtype}.`);const{filterSize:u,strides:c,pad:p,dimRoundingMode:d}=r,e=Tn(a.shape,u,c,1,p,d),g=e.filterHeight,_=e.filterWidth,l=e.padInfo.top,m=e.padInfo.right,f=e.padInfo.bottom,w=e.padInfo.left,k=e.dilationHeight,I=e.dilationWidth,b=e.strideHeight,x=e.strideWidth,D=e.inChannels,C=e.outChannels;if(e.dataFormat!=="channelsLast")throw new Error(`wasm backend does not support dataFormat:'${e.dataFormat}'. Please use 'channelsLast'.`);const O=o.makeOutput(e.outShape,"float32"),V=o.dataIdMap.get(O.dataId).id;return Za(t,a.shape[0],a.shape[1],a.shape[2],g,_,l,m,f,w,k,I,b,x,D,C,V),O}const sc={kernelName:na,backendName:"wasm",setupFunc:nc,kernelFunc:ac};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let es;function rc(s){es=s.wasm.cwrap(aa,null,["number, number, number"])}function oc(s){const{backend:n,inputs:r,attrs:o}=s,{axis:a,keepDims:t}=o,{x:u}=r,c=n.dataIdMap.get(u.dataId).id;let p=c,d=u;const{transposed:e,axes:g,originalAxes:_,inputWasTransposed:l}=Re(u,a,n);let m=g;if(l){const x=n.dataIdMap.get(e.dataId).id;x!==c&&(d=e,p=x,m=$e(m.length,d.shape.length))}Me("mean",m,d.shape.length);const[f,w]=Oe(d.shape,m),k=F(w);let I=d;d.dtype!=="float32"&&(I=Ue({backend:n,inputs:{x:d},attrs:{dtype:"float32"}}),p=n.dataIdMap.get(I.dataId).id);const b=n.makeOutput(f,"float32");if(F(d.shape)!==0){const x=n.dataIdMap.get(b.dataId).id;es(p,k,x)}if(l&&n.disposeData(e.dataId),t){const x=Pe(b.shape,_);b.shape=x}return d.dtype!=="float32"&&n.disposeData(I.dataId),b}const uc={kernelName:aa,backendName:"wasm",setupFunc:rc,kernelFunc:oc};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ts;function ic(s){ts=s.wasm.cwrap(sa,null,["number","number","number","number"])}function cc(s){const{backend:n,inputs:r,attrs:o}=s,{axis:a,keepDims:t}=o,{x:u}=r,c=n.dataIdMap.get(u.dataId).id;let p=c,d=u;const{transposed:e,axes:g,originalAxes:_,inputWasTransposed:l}=Re(u,a,n);if(l){const b=n.dataIdMap.get(e.dataId).id;b!==c&&(d=e,p=b)}const m=d.shape.length;Me("min",g,m);const[f,w]=Oe(d.shape,g),k=F(w),I=n.makeOutput(f,d.dtype);if(F(d.shape)!==0){const b=n.dataIdMap.get(I.dataId).id;ts(p,K[u.dtype],k,b)}if(l&&n.disposeData(e.dataId),t){const b=Pe(I.shape,_);I.shape=b}return I}const dc={kernelName:sa,backendName:"wasm",setupFunc:ic,kernelFunc:cc};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const pc=ne($r);/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */var Kt;(function(s){s[s.reflect=0]="reflect",s[s.symmetric=1]="symmetric"})(Kt||(Kt={}));let ns;function lc(s){ns=s.wasm.cwrap(ra,null,["number","array","number","number","array","array","number","number"])}function mc(s){const{inputs:{x:n},backend:r,attrs:{paddings:o,mode:a}}=s,t=o.map((m,f)=>m[0]+n.shape[f]+m[1]),u=r.dataIdMap.get(n.dataId).id,c=r.makeOutput(t,n.dtype),p=r.dataIdMap.get(c.dataId).id,d=new Uint8Array(new Int32Array(n.shape).buffer),e=o.map(m=>m[0]),g=o.map(m=>m[1]),_=new Uint8Array(new Int32Array(e).buffer),l=new Uint8Array(new Int32Array(g).buffer);return ns(u,d,n.shape.length,K[n.dtype],_,l,Kt[a],p),c}const fc={kernelName:ra,backendName:"wasm",kernelFunc:mc,setupFunc:lc};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const hc=ne(Ur);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const gc=ee(zr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function en(s,n){const r=new Int32Array(s.wasm.HEAPU8.buffer,n,4),o=r[0],a=r[1],t=r[2],u=r[3];return s.wasm._free(n),{pSelectedIndices:o,selectedSize:a,pSelectedScores:t,pValidOutputs:u}}/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let as;function _c(s){as=s.wasm.cwrap(oa,"number",["number","number","number","number","number"])}function bc(s){const{backend:n,inputs:r,attrs:o}=s,{iouThreshold:a,maxOutputSize:t,scoreThreshold:u}=o,{boxes:c,scores:p}=r,d=n.dataIdMap.get(c.dataId).id,e=n.dataIdMap.get(p.dataId).id,g=as(d,e,t,a,u),{pSelectedIndices:_,selectedSize:l,pSelectedScores:m,pValidOutputs:f}=en(n,g);return n.wasm._free(m),n.wasm._free(f),n.makeOutput([l],"int32",_)}const yc={kernelName:oa,backendName:"wasm",setupFunc:_c,kernelFunc:bc};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ss;function Ic(s){ss=s.wasm.cwrap(ua,"number",["number","number","number","number","number","bool"])}function wc(s){const{backend:n,inputs:r,attrs:o}=s,{iouThreshold:a,maxOutputSize:t,scoreThreshold:u,padToMaxOutputSize:c}=o,{boxes:p,scores:d}=r,e=n.dataIdMap.get(p.dataId).id,g=n.dataIdMap.get(d.dataId).id,_=ss(e,g,t,a,u,c),{pSelectedIndices:l,selectedSize:m,pSelectedScores:f,pValidOutputs:w}=en(n,_);n.wasm._free(f);const k=n.makeOutput([m],"int32",l),I=n.makeOutput([],"int32",w);return[k,I]}const kc={kernelName:ua,backendName:"wasm",setupFunc:Ic,kernelFunc:wc};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let rs;function Sc(s){rs=s.wasm.cwrap(ia,"number",["number","number","number","number","number","number"])}function Mc(s){const{backend:n,inputs:r,attrs:o}=s,{iouThreshold:a,maxOutputSize:t,scoreThreshold:u,softNmsSigma:c}=o,{boxes:p,scores:d}=r,e=n.dataIdMap.get(p.dataId).id,g=n.dataIdMap.get(d.dataId).id,_=rs(e,g,t,a,u,c),{pSelectedIndices:l,selectedSize:m,pSelectedScores:f,pValidOutputs:w}=en(n,_);n.wasm._free(w);const k=n.makeOutput([m],"int32",l),I=n.makeOutput([m],"float32",f);return[k,I]}const vc={kernelName:ia,backendName:"wasm",setupFunc:Sc,kernelFunc:Mc};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const xc=!1,Ac=ne(qr,xc,"bool");/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let os;function Rc(s){os=s.wasm.cwrap(ca,null,["number","number","number","number","number"])}function Nc(s){const{inputs:n,backend:r,attrs:o}=s,{indices:a}=n,{dtype:t,depth:u,onValue:c,offValue:p}=o,d=r.makeOutput([...a.shape,u],t),e=r.dataIdMap.get(d.dataId).id,_=r.dataIdMap.get(a.dataId).id;return os(_,u,c,p,e),d}const Cc={kernelName:ca,backendName:"wasm",setupFunc:Rc,kernelFunc:Nc};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Fc(s){const{inputs:{x:n},backend:r}=s,o=r.makeOutput(n.shape,n.dtype);return r.typedArrayFromHeap(o).fill(1),o}const Ec={kernelName:Gr,backendName:"wasm",kernelFunc:Fc};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Dc(s){const{inputs:n,backend:r,attrs:o}=s,{axis:a}=o;if(n.length===1)return Xt({inputs:{input:n[0]},backend:r,attrs:{dim:a}});const t=n[0].shape,u=n[0].dtype;n.forEach(e=>{Kr(t,e.shape,"All tensors passed to stack must have matching shapes"),ve(u===e.dtype,()=>"All tensors passed to stack must have matching dtypes")});const c=[],p=n.map(e=>{const g=Xt({inputs:{input:e},backend:r,attrs:{dim:a}});return c.push(g),g}),d=Pa({inputs:p,backend:r,attrs:{axis:a}});return c.forEach(e=>r.disposeData(e.dataId)),d}const Tc={kernelName:Xr,backendName:"wasm",kernelFunc:Dc};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let us;function Oc(s){us=s.wasm.cwrap(da,null,["number","array","number","number","array","array","number","number"])}function Pc(s){const{inputs:{x:n},backend:r,attrs:{paddings:o,constantValue:a}}=s,t=o.map((f,w)=>f[0]+n.shape[w]+f[1]);if(F(n.shape)===0)return Ua({backend:r,attrs:{shape:t,value:a,dtype:n.dtype}});const u=r.dataIdMap.get(n.dataId).id,c=r.makeOutput(t,n.dtype),d=r.dataIdMap.get(c.dataId).id,e=new Uint8Array(new Int32Array(n.shape).buffer),g=o.map(f=>f[0]),_=o.map(f=>f[1]),l=new Uint8Array(new Int32Array(g).buffer),m=new Uint8Array(new Int32Array(_).buffer);return us(u,e,n.shape.length,K[n.dtype],l,m,a,d),c}const is={kernelName:da,backendName:"wasm",kernelFunc:Pc,setupFunc:Oc};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Wc=ne(Qr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let cs;function Bc(s){cs=s.wasm.cwrap(pa,null,["number","number","number"])}function Vc(s){const{inputs:n,backend:r}=s,{x:o,alpha:a}=n,t=r.dataIdMap.get(o.dataId).id,u=r.dataIdMap.get(a.dataId).id;let c=t;const p=o;let d=p;p.dtype!=="float32"&&(d=Ue({backend:r,inputs:{x:o},attrs:{dtype:"float32"}}),c=r.dataIdMap.get(d.dataId).id);const e=r.makeOutput(o.shape,"float32"),g=r.dataIdMap.get(e.dataId).id;return cs(c,u,g),p.dtype!=="float32"&&r.disposeData(d.dataId),e}const Hc={kernelName:pa,backendName:"wasm",setupFunc:Bc,kernelFunc:Vc};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ds;function jc(s){ds=s.wasm.cwrap(la,null,["number","number","number","number"])}function Lc(s){const{backend:n,inputs:r,attrs:o}=s,{axis:a,keepDims:t}=o,{x:u}=r,c=n.dataIdMap.get(u.dataId).id;let p=c,d=u;const{transposed:e,axes:g,originalAxes:_,inputWasTransposed:l}=Re(u,a,n);let m=g;if(l){const b=n.dataIdMap.get(e.dataId).id;b!==c&&(d=e,p=b,m=$e(m.length,d.shape.length))}Me("prod",m,d.shape.length);const[f,w]=Oe(d.shape,m),k=F(w),I=n.makeOutput(f,d.dtype);if(F(d.shape)!==0){const b=n.dataIdMap.get(I.dataId).id;ds(p,k,K[I.dtype],b)}if(l&&n.disposeData(e.dataId),t){const b=Pe(I.shape,_);I.shape=b}return I}const $c={kernelName:la,backendName:"wasm",setupFunc:jc,kernelFunc:Lc};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Uc=s=>{const{backend:n,attrs:r}=s,{start:o,stop:a,step:t,dtype:u}=r,c=Yr(o,a,t,u),p=n.makeOutput([c.length],u);return n.typedArrayFromHeap(p).set(c),p},zc={kernelName:Jr,backendName:"wasm",kernelFunc:Uc};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const qc=ne(Zr);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Gc=ee(eo);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Xc=ee(to);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ps;function Kc(s){ps=s.wasm.cwrap(ma,null,["number","number","number","number","number","number","number","number","number","number"])}function Qc(s){const{backend:n,inputs:r,attrs:o}=s,{images:a}=r,{alignCorners:t,halfPixelCenters:u,size:c}=o,[p,d]=c,[e,g,_,l]=a.shape,m=[e,p,d,l];let f=n.dataIdMap.get(a.dataId),w;f.dtype!=="float32"&&(w=Ue({backend:n,inputs:{x:a},attrs:{dtype:"float32"}}),f=n.dataIdMap.get(w.dataId));const k=f.id,I=n.makeOutput(m,"float32");if(F(a.shape)===0)return I;const b=n.dataIdMap.get(I.dataId).id;return ps(k,e,g,_,l,p,d,t?1:0,u?1:0,b),w!=null&&n.disposeData(w.dataId),I}const Jc={kernelName:ma,backendName:"wasm",setupFunc:Kc,kernelFunc:Qc};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ls;function Yc(s){ls=s.wasm.cwrap(fa,null,["number","number","number","number","number","number","number","number","number","number"])}function Zc(s){const{backend:n,inputs:r,attrs:o}=s,{images:a}=r,{alignCorners:t,halfPixelCenters:u,size:c}=o,[p,d]=c,[e,g,_,l]=a.shape,m=[e,p,d,l],f=n.makeOutput(m,"float32");if(F(a.shape)===0)return f;let w=n.dataIdMap.get(a.dataId),k;w.dtype!=="float32"&&(k=Ue({backend:n,inputs:{x:a},attrs:{dtype:"float32"}}),w=n.dataIdMap.get(k.dataId));const I=w.id,b=n.dataIdMap.get(f.dataId).id;return ls(I,e,g,_,l,p,d,t?1:0,u?1:0,b),k!=null&&n.disposeData(k.dataId),f}const ed={kernelName:fa,backendName:"wasm",setupFunc:Yc,kernelFunc:Zc};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ms;function td(s){ms=s.wasm.cwrap(ha,null,["number","array","number","array","number","number"])}function nd(s){const{inputs:n,backend:r,attrs:o}=s,{x:a}=n,{dims:t}=o,u=st(t,a.shape);if(a.shape.length===0)return Nt({inputs:{x:a},backend:r});const c=r.makeOutput(a.shape,a.dtype),p=r.dataIdMap.get(a.dataId).id,d=r.dataIdMap.get(c.dataId).id,e=new Uint8Array(new Int32Array(u).buffer),g=new Uint8Array(new Int32Array(a.shape).buffer);ms(p,e,u.length,g,a.shape.length,d);const _=ue({inputs:{x:c},attrs:{shape:a.shape},backend:r});return r.disposeData(c.dataId),_}const ad={kernelName:ha,backendName:"wasm",kernelFunc:nd,setupFunc:td};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let fs;function sd(s){fs=s.wasm.cwrap(ga,null,["number","number","number","number","number","number","number","number","array","number","number"])}function rd(s){const{inputs:n,backend:r,attrs:o}=s,{image:a}=n,{radians:t,fillValue:u,center:c}=o,p=r.makeOutput(a.shape,a.dtype),d=r.dataIdMap.get(a.dataId).id,e=r.dataIdMap.get(p.dataId).id,[g,_,l,m]=a.shape,[f,w]=no(c,_,l),k=u===0,I=255,b=typeof u=="number"?[u,u,u,k?0:I]:[...u,I],x=new Uint8Array(new Int32Array(b).buffer);return fs(d,g,_,l,m,t,f,w,x,b.length,e),p}const od={kernelName:ga,backendName:"wasm",kernelFunc:rd,setupFunc:sd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const ud=ee(ao);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const id=ee(so);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let hs;function cd(s){hs=s.wasm.cwrap(_a,null,["number","number","number","number","number","number","array","number","number"])}function dd(s){const{backend:n,inputs:r,attrs:o}=s,{indices:a,updates:t}=r,{shape:u}=o,c=n.makeOutput(u,t.dtype);if(F(u)===0)return c;const{sliceRank:p,numUpdates:d,sliceSize:e,strides:g,outputSize:_}=ro(t,a,u),m=n.dataIdMap.get(a.dataId).id,w=n.dataIdMap.get(t.dataId).id,k=new Uint8Array(new Int32Array(g).buffer),I=n.dataIdMap.get(c.dataId).id;return hs(m,w,K[t.dtype],p,d,e,k,_,I),c}const pd={kernelName:_a,backendName:"wasm",setupFunc:cd,kernelFunc:dd};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let gs;function ld(s){gs=s.wasm.cwrap("SelectV2",null,["number","number","number","number","number"])}function md(s){const{inputs:n,backend:r}=s,{condition:o,t:a,e:t}=n,u=r.dataIdMap.get(o.dataId).id,c=r.dataIdMap.get(a.dataId).id,p=r.dataIdMap.get(t.dataId).id,d=r.makeOutput(a.shape,a.dtype),e=r.dataIdMap.get(d.dataId).id,g=o.shape.length,_=a.shape.length,l=g===0||g>1||_===1?1:F(a.shape.slice(1));return gs(u,c,p,l,e),d}const fd={kernelName:oo,backendName:"wasm",kernelFunc:md,setupFunc:ld};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let _s;function hd(s){_s=s.wasm.cwrap(uo,null,["number","number"])}function gd(s){const{backend:n,inputs:{x:r}}=s,o=n.dataIdMap.get(r.dataId).id,a=n.makeOutput(r.shape,r.dtype),t=n.dataIdMap.get(a.dataId).id;return F(a.shape)===0||_s(o,t),a}const _d={kernelName:"Sigmoid",backendName:"wasm",setupFunc:hd,kernelFunc:gd};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const bd=ee(io);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let bs;function yd(s){bs=s.wasm.cwrap(ba,null,["number","number","number","number"])}function Id(s){const{backend:n,inputs:{logits:r},attrs:{dim:o}}=s,a=n.dataIdMap.get(r.dataId).id,t=n.makeOutput(r.shape,r.dtype),u=n.dataIdMap.get(t.dataId).id,c=r.shape[o],p=F(r.shape)/c;return F(t.shape)===0||bs(a,u,c,p),t}const wd={kernelName:ba,backendName:"wasm",setupFunc:yd,kernelFunc:Id};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function kd(s){const{inputs:n,backend:r,attrs:o}=s,{x:a}=n,{blockShape:t,paddings:u}=o,c=F(t),p=[[0,0]];p.push(...u);for(let C=1+t.length;C<a.shape.length;++C)p.push([0,0]);const d=is.kernelFunc({inputs:{x:a},backend:r,attrs:{paddings:p,constantValue:0}}),e=Pn(d.shape,t,c,!1),g=Wn(e.length,t.length,!1),_=Bn(d.shape,t,c,!1),f=ue({inputs:{x:d},backend:r,attrs:{shape:e}}),I=Ae({inputs:{x:f},backend:r,attrs:{perm:g}}),D=ue({inputs:{x:I},backend:r,attrs:{shape:_}});return r.disposeData(d.dataId),r.disposeData(f.dataId),r.disposeData(I.dataId),D}const Sd={kernelName:co,backendName:"wasm",kernelFunc:kd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ys;function Md(s){ys=s.wasm.cwrap("SparseFillEmptyRows","number",["number","number","number","number","number","number","number","number","number","number","number","number"])}function vd(s){const{backend:n,inputs:r}=s,{indices:o,values:a,denseShape:t,defaultValue:u}=r,c=o.shape[0],p=o.shape[1],d=n.readSync(t.dataId)[0],e=[c+d,p],g=n.dataIdMap.get(o.dataId).id,_=n.dataIdMap.get(a.dataId).id,l=n.dataIdMap.get(u.dataId).id,m=n.makeOutput(e,o.dtype),f=n.dataIdMap.get(m.dataId).id,w=n.makeOutput(e.slice(0,1),a.dtype),k=n.dataIdMap.get(w.dataId).id,I=n.makeOutput([d],"bool"),b=n.dataIdMap.get(I.dataId).id,x=n.makeOutput([c],o.dtype),D=n.dataIdMap.get(x.dataId).id,C=n.makeOutput([4],"int32"),O=n.dataIdMap.get(C.dataId).id,V=ys(g,_,K[a.dtype],c,d,p,l,f,k,b,D,O),j=n.readSync(C.dataId);let W;switch(j[0]){case 1:{W=fo(j[1]);break}case 2:{W=mo(j[1],j[2]);break}case 3:W=lo(j[1],j[2],j[3]);break;default:W=""}if(n.disposeData(C.dataId),W)throw n.disposeData(m.dataId),n.disposeData(w.dataId),n.disposeData(I.dataId),n.disposeData(x.dataId),new Error(W);let $=m,z=w;return V!==e[0]&&($=Te({inputs:{x:m},attrs:{begin:0,size:[V,p]},backend:n}),z=Te({inputs:{x:w},attrs:{begin:0,size:V},backend:n}),n.disposeData(m.dataId),n.disposeData(w.dataId)),[$,z,I,x]}const xd={kernelName:po,backendName:"wasm",setupFunc:Md,kernelFunc:vd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Is;function Ad(s){Is=s.wasm.cwrap(ya,null,["number","number","number","number","number","number","number"])}function Rd(s){const{backend:n,inputs:r}=s,{inputIndices:o,inputShape:a,newShape:t}=r;if(o.shape.length!==2)throw new Error(`Input indices should be a matrix but received shape
        ${o.shape}`);if(a.shape.length!==1)throw new Error(`Input shape should be a vector but received shape
        ${a.shape}`);if(t.shape.length!==1)throw new Error(`Target shape should be a vector but received shape ${t.shape}`);const u=n.dataIdMap.get(o.dataId).id,c=n.dataIdMap.get(a.dataId).id,p=n.dataIdMap.get(t.dataId).id,d=o.shape[0],e=F(t.shape),g=n.makeOutput([d,e],o.dtype),_=n.dataIdMap.get(g.dataId).id,l=n.makeOutput([e],t.dtype),m=n.dataIdMap.get(l.dataId).id,f=n.makeOutput([3],"int32"),w=n.dataIdMap.get(f.dataId).id;Is(u,c,p,d,_,m,w);const k=n.readSync(f.dataId);let I;switch(k[0]){case 0:{I=bo(k[1],k[2]);break}case 1:{I=_o(k[1],k[2]);break}case 2:I=yo();break;case 3:{const b=Array.from(n.readSync(a.dataId)),x=Array.from(n.readSync(l.dataId));I=go(b,x);break}case 4:{const b=Array.from(n.readSync(a.dataId)),x=Array.from(n.readSync(l.dataId));I=ho(b,x);break}default:I=""}if(n.disposeData(f.dataId),I)throw n.disposeData(g.dataId),n.disposeData(l.dataId),new Error(I);return[g,l]}const Nd={kernelName:ya,backendName:"wasm",setupFunc:Ad,kernelFunc:Rd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let ws;function ks(s){ws=s.wasm.cwrap("SparseSegmentReduction",null,["number","number","number","number","number","number","number","number","number"])}function Ss(s,n){const{backend:r,inputs:o}=s,{data:a,indices:t,segmentIds:u}=o,c=t.shape[0],p=r.readSync(u.dataId,c-1,c)[0],e=c>0?p+1:0;if(e<0)throw new Error(bn());const g=a.shape.slice();g[0]=e;const _=r.dataIdMap.get(a.dataId).id,l=r.dataIdMap.get(t.dataId).id,m=r.dataIdMap.get(u.dataId).id,f=r.makeOutput(g,a.dtype),w=r.dataIdMap.get(f.dataId).id,k=r.makeOutput([4],"int32"),I=r.dataIdMap.get(k.dataId).id;ws(_,K[a.dtype],a.shape[0],l,m,w,I,n,0);const b=r.readSync(k.dataId);let x;switch(b[0]){case 0:{x=bn();break}case 1:{x=ko();break}case 2:x=wo(b[1],b[2]);break;case 3:x=Io(b[1],b[2],b[3]);break;default:x=""}if(r.disposeData(k.dataId),x)throw r.disposeData(f.dataId),new Error(x);return f}/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Cd(s){return Ss(s,!0)}const Fd={kernelName:So,backendName:"wasm",setupFunc:ks,kernelFunc:Cd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Ed(s){return Ss(s,!1)}const Dd={kernelName:Mo,backendName:"wasm",setupFunc:ks,kernelFunc:Ed};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Td(s){const{inputs:n,attrs:r,backend:o}=s,{x:a}=n,{numOrSizeSplits:t,axis:u}=r,c=st(u,a.shape)[0],p=xo(a,t,c),d=new Array(a.shape.length).fill(0),e=a.shape.slice();return p.map(g=>{const _=[...e];_[c]=g;const l=Te({inputs:{x:a},attrs:{begin:d,size:_},backend:o});return d[c]+=g,l})}const Od={kernelName:vo,backendName:"wasm",kernelFunc:Td};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Pd=ee(Ao);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Wd=ee(Ro);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Bd=ne(No);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ms;function Vd(s){Ms=s.wasm.cwrap(Ia,null,["number","number","number","number"])}function Hd(s){const{backend:n,inputs:r,attrs:o}=s,{alpha:a}=o,{x:t}=r,u=n.dataIdMap.get(t.dataId).id,c=n.makeOutput(t.shape,t.dtype),p=n.dataIdMap.get(c.dataId).id;return Ms(u,a,K[t.dtype],p),c}const jd={kernelName:Ia,backendName:"wasm",setupFunc:Vd,kernelFunc:Hd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let vs;function Ld(s){vs=s.wasm.cwrap(wa,null,["number","array","number","array","array","array","array","array","number","number"])}function $d(s){const{backend:n,inputs:r,attrs:o}=s,{x:a}=r,{begin:t,end:u,strides:c,beginMask:p,endMask:d,ellipsisMask:e,newAxisMask:g,shrinkAxisMask:_}=o,{finalShapeSparse:l,finalShape:m,isIdentity:f,sliceDim0:w,isSimpleSlice:k,begin:I,end:b,strides:x}=Co(a.shape,t,u,c,p,d,e,g,_);let D;if(f)D=ue({inputs:{x:a},backend:n,attrs:{shape:m}});else if(w||k){ve(a.shape.length>=1,()=>`Input must have rank at least 1, got: ${a.shape.length}`);const C=Fo(I,b,x),O=Te({inputs:{x:a},backend:n,attrs:{begin:I,size:C}});D=ue({inputs:{x:O},backend:n,attrs:{shape:m}}),n.disposeData(O.dataId)}else{const C=n.makeOutput(l,"float32"),O=n.dataIdMap.get(a.dataId).id,V=new Uint8Array(new Int32Array(fe(a.shape)).buffer),j=new Uint8Array(new Int32Array(I).buffer),W=new Uint8Array(new Int32Array(b).buffer),$=new Uint8Array(new Int32Array(x).buffer),z=new Uint8Array(new Int32Array(l).buffer),Q=new Uint8Array(new Int32Array(fe(l)).buffer),oe=n.dataIdMap.get(C.dataId).id;vs(O,V,a.shape.length,j,W,$,z,Q,l.length,oe),D=ue({inputs:{x:C},backend:n,attrs:{shape:m}}),n.disposeData(C.dataId)}return D}const Ud={kernelName:wa,backendName:"wasm",setupFunc:Ld,kernelFunc:$d};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function zd(s){const{backend:n,inputs:r,attrs:o}=s,{data:a,dataSplits:t}=r,{separator:u,nGramWidths:c,leftPad:p,rightPad:d,padWidth:e,preserveShortSequences:g}=o,_=n.readSync(a.dataId),l=n.readSync(t.dataId),[m,f]=Do(_,l,u,c,p,d,e,g),w=n.makeOutput([m.length],"string"),k=n.dataIdMap.get(w.dataId);k.stringBytes=m;const I=n.makeOutput(t.shape,"int32");return n.typedArrayFromHeap(I).set(f),[w,I]}const qd={kernelName:Eo,backendName:"wasm",kernelFunc:zd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Gd(s){const{backend:n,inputs:r,attrs:o}=s,{input:a,delimiter:t}=r,{skipEmpty:u}=o,c=n.readSync(a.dataId),p=n.readSync(t.dataId),[d,e,g]=Oo(c,p[0],u),_=e.length,l=n.makeOutput([_,2],"int32");n.typedArrayFromHeap(l).set(d);const f=n.makeOutput([_],"string"),w=n.dataIdMap.get(f.dataId);w.stringBytes=e;const k=n.makeOutput([2],"int32");return n.typedArrayFromHeap(k).set(g),[l,f,k]}const Xd={kernelName:To,backendName:"wasm",kernelFunc:Gd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Kd(s){const{backend:n,inputs:r,attrs:o}=s,{input:a}=r,{numBuckets:t}=o,u=n.readSync(a.dataId),c=Wo(u,t),p=n.makeOutput(a.shape,"int32");return n.typedArrayFromHeap(p).set(c),p}const Qd={kernelName:Po,backendName:"wasm",kernelFunc:Kd};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Jd=ne(Bo);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let xs;function Yd(s){xs=s.wasm.cwrap(ka,null,["number","number","number","number"])}function Zd(s){const{backend:n,inputs:r,attrs:o}=s,{axis:a,keepDims:t}=o,{x:u}=r,c=n.dataIdMap.get(u.dataId).id;let p=c,d=u;const{transposed:e,axes:g,originalAxes:_,inputWasTransposed:l}=Re(u,a,n);let m=g;if(l){const b=n.dataIdMap.get(e.dataId).id;b!==c&&(d=e,p=b,m=$e(m.length,d.shape.length))}Me("sum",m,d.shape.length);const[f,w]=Oe(d.shape,m),k=F(w),I=n.makeOutput(f,d.dtype);if(F(d.shape)!==0){const b=n.dataIdMap.get(I.dataId).id;xs(p,k,K[I.dtype],b)}if(l&&n.disposeData(e.dataId),t){const b=Pe(I.shape,_);I.shape=b}return I}const ep={kernelName:ka,backendName:"wasm",setupFunc:Yd,kernelFunc:Zd};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const tp=ee(Vo);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const np=ee(Ho);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let As;function ap(s){As=s.wasm.cwrap(Sa,null,["number","array","number","array","number","number"])}function sp(s){const{inputs:n,backend:r,attrs:o}=s,{x:a}=n,t=r.dataIdMap.get(a.dataId).id,{reps:u}=o,c=new Array(a.shape.length);for(let _=0;_<c.length;_++)c[_]=a.shape[_]*u[_];const p=new Uint8Array(new Int32Array(a.shape).buffer),d=new Uint8Array(new Int32Array(c).buffer),e=r.makeOutput(c,a.dtype),g=r.dataIdMap.get(e.dataId).id;return As(t,p,a.shape.length,d,c.length,K[e.dtype],g),e}const rp={kernelName:Sa,backendName:"wasm",setupFunc:ap,kernelFunc:sp};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Rs;function op(s){Rs=s.wasm.cwrap(Ma,null,["number","array","number","number","number","bool","number","number"])}const up=({inputs:s,backend:n,attrs:r})=>{const{x:o}=s,{k:a,sorted:t}=r,u=n.dataIdMap.get(o.dataId).id,c=new Uint8Array(new Int32Array(o.shape).buffer),p=o.shape.slice();p[p.length-1]=a;const d=n.makeOutput(p,o.dtype),e=n.dataIdMap.get(d.dataId).id,g=n.makeOutput(p,"int32"),_=n.dataIdMap.get(g.dataId).id;return Rs(u,c,o.shape.length,K[o.dtype],a,t,e,_),[d,g]},ip={kernelName:Ma,backendName:"wasm",setupFunc:op,kernelFunc:up};/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */let Ns;function cp(s){Ns=s.wasm.cwrap(va,null,["number","number","bool","number","number","number","number","number","number","array","number","array","number","number","number","number","number"])}function dp(s){const{backend:n,inputs:r,attrs:o}=s,{image:a,transforms:t}=r,{interpolation:u,fillMode:c,fillValue:p,outputShape:d}=o,[e,g,_,l]=a.shape,[m,f]=d??[g,_],w=[e,m,f,l],k=new Uint8Array(new Int32Array(fe(a.shape)).buffer),I=new Uint8Array(new Int32Array(fe(w)).buffer),b=n.makeOutput(w,a.dtype),x=n.dataIdMap.get(b.dataId).id,C=n.dataIdMap.get(a.dataId).id,V=n.dataIdMap.get(t.dataId).id,j=u==="nearest"?1:2;let W;switch(c){case"constant":W=1;break;case"reflect":W=2;break;case"wrap":W=3;break;case"nearest":W=4;break;default:W=1;break}return Ns(C,V,t.shape[0]>1,e,m,f,l,_,g,k,a.shape.length-1,I,w.length-1,j,W,p,x),b}const pp={kernelName:va,backendName:"wasm",setupFunc:cp,kernelFunc:dp};/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function lp(s){const{inputs:n,backend:r,attrs:o}=s,{value:a}=n;let{axis:t}=o;t<0&&(t+=a.shape.length);const u=a.shape[t],c=a.shape.length,p=new Array(c-1);let d=0;for(let l=0;l<c;l++)l!==t&&(p[d++]=a.shape[l]);const e=new Array(u),g=new Array(c).fill(0),_=a.shape.slice();_[t]=1;for(let l=0;l<e.length;l++)g[t]=l,e[l]=Te({inputs:{x:a},attrs:{begin:g,size:_},backend:r});return e.map(({dataId:l,dtype:m})=>({dataId:l,dtype:m,shape:p}))}const mp={kernelName:jo,backendName:"wasm",kernelFunc:lp};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function fp(s){const{inputs:{x:n},backend:r}=s,o=r.makeOutput(n.shape,n.dtype);return r.typedArrayFromHeap(o).fill(0),o}const hp={kernelName:Lo,backendName:"wasm",kernelFunc:fp};/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const gp=[Zo,eu,tu,su,lu,hu,bu,wu,vu,Fu,Eu,Du,Pu,Wu,Hu,$u,Uu,zu,Xu,Ju,ei,ai,oi,ui,ci,di,pi,li,hi,gi,_i,Ii,Si,xi,Ni,Ei,Ti,Pi,ru,Vi,ji,$i,Ui,qi,Gi,Ki,Ji,ec,tc,sc,uc,dc,pc,fc,hc,gc,yc,kc,vc,Ac,Cc,Ec,Tc,is,Wc,Hc,$c,zc,qc,Gc,Xc,ku,Jc,ed,ad,od,ud,id,pd,fd,_d,bd,Nu,wd,Sd,xd,Nd,Fd,Dd,Od,Pd,Wd,Bd,jd,Ud,qd,Xd,Qd,Jd,ep,tp,np,rp,ip,pp,cu,mp,hp];for(const s of gp)$o(s);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Qt=qt();Qt.registerFlag("WASM_HAS_SIMD_SUPPORT",async()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,9,1,7,0,65,0,253,15,26,11]))}catch{return!1}});Qt.registerFlag("WASM_HAS_MULTITHREAD_SUPPORT",async()=>{if(Qt.get("IS_NODE"))return!1;try{return new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)),WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]))}catch{return!1}});function Cs(s){throw new Error('Could not dynamically require "'+s+'". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.')}var $t={exports:{}},kn;function _p(){return kn||(kn=1,(function(s,n){var r=(()=>{var o=typeof document<"u"&&document.currentScript?document.currentScript.src:void 0;return typeof __filename<"u"&&(o=o||__filename),(function(a){a=a||{};function t(){return L.buffer!=J&&ge(L.buffer),xe}function u(){return L.buffer!=J&&ge(L.buffer),ot}function c(){return L.buffer!=J&&ge(L.buffer),ut}function p(){return L.buffer!=J&&ge(L.buffer),Ne}function d(){return L.buffer!=J&&ge(L.buffer),it}var e=typeof a<"u"?a:{},g,_;e.ready=new Promise(function(i,h){g=i,_=h});var l;typeof process<"u"&&process.listeners&&(l={uncaughtException:process.listeners("uncaughtException"),unhandledRejection:process.listeners("unhandledRejection")});var m=Object.assign({},e),f=(i,h)=>{throw h},w=typeof window=="object",k=typeof importScripts=="function",I=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string",b=e.ENVIRONMENT_IS_PTHREAD||!1,x="";function D(i){return e.locateFile?e.locateFile(i,x):x+i}var C,O,V;function j(i){if(i instanceof ye)return;q("exiting due to exception: "+i)}if(I){k?x=Se.dirname(x)+"/":x=__dirname+"/";var W,$;typeof Cs=="function"&&(W=Se,$=Se),C=(h,S)=>(h=$.normalize(h),W.readFileSync(h,S?void 0:"utf8")),V=h=>{var S=C(h,!0);return S.buffer||(S=new Uint8Array(S)),S},O=(h,S,A)=>{h=$.normalize(h),W.readFile(h,function(R,H){R?A(R):S(H.buffer)})},process.argv.length>1&&process.argv[1].replace(/\\/g,"/"),process.argv.slice(2),process.on("uncaughtException",function(h){if(!(h instanceof ye))throw h}),process.on("unhandledRejection",function(h){throw h}),f=(h,S)=>{if(Ve())throw process.exitCode=h,S;j(S),process.exit(h)},e.inspect=function(){return"[Emscripten Module object]"};let i;try{i=Se}catch(h){throw console.error('The "worker_threads" module is not supported in this node.js build - perhaps a newer version is needed?'),h}yn.Worker=i.Worker}else(w||k)&&(k?x=self.location.href:typeof document<"u"&&document.currentScript&&(x=document.currentScript.src),typeof o<"u"&&o&&(x=o),x.indexOf("blob:")!==0?x=x.substr(0,x.replace(/[?#].*/,"").lastIndexOf("/")+1):x="",I||(C=i=>{var h=new XMLHttpRequest;return h.open("GET",i,!1),h.send(null),h.responseText},k&&(V=i=>{var h=new XMLHttpRequest;return h.open("GET",i,!1),h.responseType="arraybuffer",h.send(null),new Uint8Array(h.response)}),O=(i,h,S)=>{var A=new XMLHttpRequest;A.open("GET",i,!0),A.responseType="arraybuffer",A.onload=()=>{if(A.status==200||A.status==0&&A.response){h(A.response);return}S()},A.onerror=S,A.send(null)}));I&&typeof performance>"u"&&(yn.performance=Se.performance);var z=console.log.bind(console),Q=console.warn.bind(console);I&&(z=i=>W.writeSync(1,i+`
`),Q=i=>W.writeSync(2,i+`
`));var oe=e.print||z,q=e.printErr||Q;Object.assign(e,m),m=null,e.arguments&&e.arguments,e.thisProgram&&e.thisProgram,e.quit&&(f=e.quit);var Z;e.wasmBinary&&(Z=e.wasmBinary);var pe=e.noExitRuntime||!0;typeof WebAssembly!="object"&&Fe("no native wasm support detected");var L,he,ie=!1,ce;function _e(i,h){i||Fe(h)}var te=typeof TextDecoder<"u"?new TextDecoder("utf8"):void 0;function We(i,h,S){for(var A=h+S,R=h;i[R]&&!(R>=A);)++R;if(R-h>16&&i.buffer&&te)return te.decode(i.buffer instanceof SharedArrayBuffer?i.slice(h,R):i.subarray(h,R));for(var H="";h<R;){var E=i[h++];if(!(E&128)){H+=String.fromCharCode(E);continue}var T=i[h++]&63;if((E&224)==192){H+=String.fromCharCode((E&31)<<6|T);continue}var Y=i[h++]&63;if((E&240)==224?E=(E&15)<<12|T<<6|Y:E=(E&7)<<18|T<<12|Y<<6|i[h++]&63,E<65536)H+=String.fromCharCode(E);else{var me=E-65536;H+=String.fromCharCode(55296|me>>10,56320|me&1023)}}return H}function Be(i,h){return i?We(u(),i,h):""}function ze(i,h,S,A){if(!(A>0))return 0;for(var R=S,H=S+A-1,E=0;E<i.length;++E){var T=i.charCodeAt(E);if(T>=55296&&T<=57343){var Y=i.charCodeAt(++E);T=65536+((T&1023)<<10)|Y&1023}if(T<=127){if(S>=H)break;h[S++]=T}else if(T<=2047){if(S+1>=H)break;h[S++]=192|T>>6,h[S++]=128|T&63}else if(T<=65535){if(S+2>=H)break;h[S++]=224|T>>12,h[S++]=128|T>>6&63,h[S++]=128|T&63}else{if(S+3>=H)break;h[S++]=240|T>>18,h[S++]=128|T>>12&63,h[S++]=128|T>>6&63,h[S++]=128|T&63}}return h[S]=0,S-R}function qe(i,h,S){return ze(i,u(),h,S)}var J,xe,ot,ut,Ne,it;b&&(J=e.buffer);function ge(i){J=i,e.HEAP8=xe=new Int8Array(i),e.HEAP16=new Int16Array(i),e.HEAP32=ut=new Int32Array(i),e.HEAPU8=ot=new Uint8Array(i),e.HEAPU16=new Uint16Array(i),e.HEAPU32=Ne=new Uint32Array(i),e.HEAPF32=new Float32Array(i),e.HEAPF64=it=new Float64Array(i)}var Ge=e.INITIAL_MEMORY||16777216;if(b)L=e.wasmMemory,J=e.buffer;else if(e.wasmMemory)L=e.wasmMemory;else if(L=new WebAssembly.Memory({initial:Ge/65536,maximum:32768,shared:!0}),!(L.buffer instanceof SharedArrayBuffer))throw q("requested a shared WebAssembly.Memory but the returned buffer is not a SharedArrayBuffer, indicating that while the browser has SharedArrayBuffer it does not have WebAssembly threads support - you may need to set a flag"),I&&console.log("(on node you may need: --experimental-wasm-threads --experimental-wasm-bulk-memory and also use a recent version)"),Error("bad memory");L&&(J=L.buffer),Ge=J.byteLength,ge(J);var ae,Xe=[],ct=[],dt=[];function Ve(){return pe}function Ke(){if(e.preRun)for(typeof e.preRun=="function"&&(e.preRun=[e.preRun]);e.preRun.length;)lt(e.preRun.shift());U(Xe)}function pt(){b||U(ct)}function Ct(){if(!b){if(e.postRun)for(typeof e.postRun=="function"&&(e.postRun=[e.postRun]);e.postRun.length;)Et(e.postRun.shift());U(dt)}}function lt(i){Xe.unshift(i)}function Ft(i){ct.unshift(i)}function Et(i){dt.unshift(i)}var be=0,Ce=null;function Dt(i){be++,e.monitorRunDependencies&&e.monitorRunDependencies(be)}function Tt(i){if(be--,e.monitorRunDependencies&&e.monitorRunDependencies(be),be==0&&Ce){var h=Ce;Ce=null,h()}}function Fe(i){b?postMessage({cmd:"onAbort",arg:i}):e.onAbort&&e.onAbort(i),i="Aborted("+i+")",q(i),ie=!0,ce=1,i+=". Build with -sASSERTIONS for more info.";var h=new WebAssembly.RuntimeError(i);throw _(h),h}var Ot="data:application/octet-stream;base64,";function mt(i){return i.startsWith(Ot)}function Qe(i){return i.startsWith("file://")}var se;se="tfjs-backend-wasm-threaded-simd.wasm",mt(se)||(se=D(se));function ft(i){try{if(i==se&&Z)return new Uint8Array(Z);if(V)return V(i);throw"both async and sync fetching of the wasm failed"}catch(h){Fe(h)}}function ht(){if(!Z&&(w||k)){if(typeof fetch=="function"&&!Qe(se))return fetch(se,{credentials:"same-origin"}).then(function(i){if(!i.ok)throw"failed to load wasm binary file at '"+se+"'";return i.arrayBuffer()}).catch(function(){return ft(se)});if(O)return new Promise(function(i,h){O(se,function(S){i(new Uint8Array(S))},h)})}return Promise.resolve().then(function(){return ft(se)})}function gt(){var i={env:un,wasi_snapshot_preview1:un};function h(E,T){var Y=E.exports;if(e.asm=Y,It(e.asm._emscripten_tls_init),ae=e.asm.__indirect_function_table,Ft(e.asm.__wasm_call_ctors),he=T,!b){var me=v.unusedWorkers.length;v.unusedWorkers.forEach(function(ke){v.loadWasmModuleToWorker(ke,function(){--me||Tt()})})}}b||Dt();function S(E){h(E.instance,E.module)}function A(E){return ht().then(function(T){return WebAssembly.instantiate(T,i)}).then(function(T){return T}).then(E,function(T){q("failed to asynchronously prepare wasm: "+T),Fe(T)})}function R(){return!Z&&typeof WebAssembly.instantiateStreaming=="function"&&!mt(se)&&!Qe(se)&&!I&&typeof fetch=="function"?fetch(se,{credentials:"same-origin"}).then(function(E){var T=WebAssembly.instantiateStreaming(E,i);return T.then(S,function(Y){return q("wasm streaming compile failed: "+Y),q("falling back to ArrayBuffer instantiation"),A(S)})}):A(S)}if(e.instantiateWasm)try{var H=e.instantiateWasm(i,h);return H}catch(E){q("Module.instantiateWasm callback failed with error: "+E),_(E)}return R().catch(_),{}}var _t={};function ye(i){this.name="ExitStatus",this.message="Program terminated with exit("+i+")",this.status=i}function He(i){var h=v.pthreads[i];delete v.pthreads[i],h.terminate(),Vt(i),v.runningWorkers.splice(v.runningWorkers.indexOf(h),1),h.pthread_ptr=0}function bt(i){var h=v.pthreads[i];h.postMessage({cmd:"cancel"})}function Ee(i){var h=v.pthreads[i];_e(h),v.returnWorkerToPool(h)}function De(i){var h=v.getNewWorker();if(!h)return 6;v.runningWorkers.push(h),v.pthreads[i.pthread_ptr]=h,h.pthread_ptr=i.pthread_ptr;var S={cmd:"run",start_routine:i.startRoutine,arg:i.arg,pthread_ptr:i.pthread_ptr};return h.runPthread=()=>{S.time=performance.now(),h.postMessage(S,i.transferList)},h.loaded&&(h.runPthread(),delete h.runPthread),0}function yt(i){if(b)return je(1,1,i);ce=i,Ve()||(v.terminateAllThreads(),e.onExit&&e.onExit(i),ie=!0),f(i,new ye(i))}function y(i,h){if(ce=i,!h&&b)throw P(i),"unwind";yt(i)}var M=y;function N(i){if(i instanceof ye||i=="unwind")return ce;f(1,i)}var v={unusedWorkers:[],runningWorkers:[],tlsInitFunctions:[],pthreads:{},init:function(){b?v.initWorker():v.initMainThread()},initMainThread:function(){for(var i=8;i--;)v.allocateUnusedWorker()},initWorker:function(){pe=!1},setExitStatus:function(i){ce=i},terminateAllThreads:function(){for(var i of Object.values(v.pthreads))v.returnWorkerToPool(i);for(var i of v.unusedWorkers)i.terminate();v.unusedWorkers=[]},returnWorkerToPool:function(i){var h=i.pthread_ptr;delete v.pthreads[h],v.unusedWorkers.push(i),v.runningWorkers.splice(v.runningWorkers.indexOf(i),1),i.pthread_ptr=0,Vt(h)},receiveObjectTransfer:function(i){},threadInitTLS:function(){v.tlsInitFunctions.forEach(i=>i())},loadWasmModuleToWorker:function(i,h){i.onmessage=S=>{var A=S.data,R=A.cmd;if(i.pthread_ptr&&(v.currentProxiedOperationCallerThread=i.pthread_ptr),A.targetThread&&A.targetThread!=kt()){var H=v.pthreads[A.targetThread];H?H.postMessage(A,A.transferList):q('Internal error! Worker sent a message "'+R+'" to target pthread '+A.targetThread+", but that thread no longer exists!"),v.currentProxiedOperationCallerThread=void 0;return}R==="processProxyingQueue"?Wt(A.queue):R==="spawnThread"?De(A):R==="cleanupThread"?Ee(A.thread):R==="killThread"?He(A.thread):R==="cancelThread"?bt(A.thread):R==="loaded"?(i.loaded=!0,h&&h(i),i.runPthread&&(i.runPthread(),delete i.runPthread)):R==="print"?oe("Thread "+A.threadId+": "+A.text):R==="printErr"?q("Thread "+A.threadId+": "+A.text):R==="alert"?alert("Thread "+A.threadId+": "+A.text):A.target==="setimmediate"?i.postMessage(A):R==="onAbort"?e.onAbort&&e.onAbort(A.arg):R&&q("worker sent an unknown command "+R),v.currentProxiedOperationCallerThread=void 0},i.onerror=S=>{var A="worker sent an error!";throw q(A+" "+S.filename+":"+S.lineno+": "+S.message),S},I&&(i.on("message",function(S){i.onmessage({data:S})}),i.on("error",function(S){i.onerror(S)}),i.on("detachedExit",function(){})),i.postMessage({cmd:"load",urlOrBlob:e.mainScriptUrlOrBlob||o,wasmMemory:L,wasmModule:he})},allocateUnusedWorker:function(){var i=D("tfjs-backend-wasm-threaded-simd.worker.js");v.unusedWorkers.push(new Worker(i))},getNewWorker:function(){return v.unusedWorkers.length==0&&(v.allocateUnusedWorker(),v.loadWasmModuleToWorker(v.unusedWorkers[0])),v.unusedWorkers.pop()}};e.PThread=v;function U(i){for(;i.length>0;)i.shift()(e)}function G(i){var h=Ht(),S=i();return St(h),S}function B(){var i=kt(),h=c()[i+44>>2],S=c()[i+48>>2],A=h-S;mn(h,A),St(h)}e.establishStackSpace=B;function P(i){if(b)return je(2,0,i);try{M(i)}catch(h){N(h)}}var X=[];function le(i){var h=X[i];return h||(i>=X.length&&(X.length=i+1),X[i]=h=ae.get(i)),h}function Ie(i,h){var S=le(i)(h);Ve()?v.setExitStatus(S):ln(S)}e.invokeEntryPoint=Ie;function It(i){v.tlsInitFunctions.push(i)}function Je(i,h){t().set(i,h)}function Pt(i){cn(i,!k,1,!w),v.threadInitTLS()}function re(i){b?postMessage({cmd:"cleanupThread",thread:i}):Ee(i)}function we(i,h,S,A){return b?je(3,1,i,h,S,A):Ye(i,h,S,A)}function Ye(i,h,S,A){if(typeof SharedArrayBuffer>"u")return q("Current environment does not support SharedArrayBuffer, pthreads are not available!"),6;var R=[],H=0;if(b&&(R.length===0||H))return we(i,h,S,A);var E={startRoutine:S,pthread_ptr:i,arg:A,transferList:R};return b?(E.cmd="spawnThread",postMessage(E,R),0):De(E)}function Os(){return 2097152}var Ps=!0;function Ws(){return Ps}function Wt(i){Atomics.store(c(),i>>2,1),kt()&&pn(i),Atomics.compareExchange(c(),i>>2,1,0)}e.executeNotifiedProxyingQueue=Wt;function Bs(i,h,S,A){if(i==h)setTimeout(()=>Wt(A));else if(b)postMessage({targetThread:i,cmd:"processProxyingQueue",queue:A});else{var R=v.pthreads[i];if(!R)return;R.postMessage({cmd:"processProxyingQueue",queue:A})}return 1}function Vs(i,h,S){return-1}function Hs(){Fe("")}function Ze(i){Ze.shown||(Ze.shown={}),Ze.shown[i]||(Ze.shown[i]=1,I&&(i="warning: "+i),q(i))}function js(){I||k||Ze("Blocking on the main thread is very dangerous, see https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread")}function Ls(){return Date.now()}function nn(){return 2147483648}function $s(){return nn()}var wt;I?wt=()=>{var i=process.hrtime();return i[0]*1e3+i[1]/1e6}:b?wt=()=>performance.now()-e.__performance_now_clock_drift:wt=()=>performance.now();function Us(i,h,S){u().copyWithin(i,h,h+S)}function zs(){return I?Se.cpus().length:navigator.hardwareConcurrency}function je(i,h){var S=arguments.length-2,A=arguments;return G(()=>{for(var R=S,H=Mt(R*8),E=H>>3,T=0;T<S;T++){var Y=A[2+T];d()[E+T]=Y}return dn(i,R,H,h)})}var Bt=[];function qs(i,h,S){Bt.length=h;for(var A=S>>3,R=0;R<h;R++)Bt[R]=d()[A+R];var H=i<0,E=H?_t[-i-1]:er[i];return E.apply(null,Bt)}function Gs(i){try{return L.grow(i-J.byteLength+65535>>>16),ge(L.buffer),1}catch{}}function Xs(i){var h=u().length;if(i=i>>>0,i<=h)return!1;var S=nn();if(i>S)return!1;let A=(Y,me)=>Y+(me-Y%me)%me;for(var R=1;R<=4;R*=2){var H=h*(1+.2/R);H=Math.min(H,i+100663296);var E=Math.min(S,A(Math.max(i,H),65536)),T=Gs(E);if(T)return!0}return!1}function Ks(){throw"unwind"}function an(i){return b?je(4,1,i):52}function sn(i,h,S,A,R){return b?je(5,1,i,h,S,A,R):70}var Qs=[null,[],[]];function Js(i,h){var S=Qs[i];h===0||h===10?((i===1?oe:q)(We(S,0)),S.length=0):S.push(h)}function rn(i,h,S,A){if(b)return je(6,1,i,h,S,A);for(var R=0,H=0;H<S;H++){var E=p()[h>>2],T=p()[h+4>>2];h+=8;for(var Y=0;Y<T;Y++)Js(i,u()[E+Y]);R+=T}return p()[A>>2]=R,0}function on(i){var h=e["_"+i];return h}function Ys(i,h,S,A,R){var H={string:de=>{var Le=0;if(de!=null&&de!==0){var gn=(de.length<<2)+1;Le=Mt(gn),qe(de,Le,gn)}return Le},array:de=>{var Le=Mt(de.length);return Je(de,Le),Le}};function E(de){return h==="string"?Be(de):h==="boolean"?!!de:de}var T=on(i),Y=[],me=0;if(A)for(var ke=0;ke<A.length;ke++){var hn=H[S[ke]];hn?(me===0&&(me=Ht()),Y[ke]=hn(A[ke])):Y[ke]=A[ke]}var jt=T.apply(null,Y);function nr(de){return me!==0&&St(me),E(de)}return jt=nr(jt),jt}function Zs(i,h,S,A){S=S||[];var R=S.every(E=>E==="number"||E==="boolean"),H=h!=="string";return H&&R&&!A?on(i):function(){return Ys(i,h,S,arguments)}}v.init();var er=[null,yt,P,we,an,sn,rn],un={__emscripten_init_main_thread_js:Pt,__emscripten_thread_cleanup:re,__pthread_create_js:Ye,_emscripten_default_pthread_stack_size:Os,_emscripten_get_now_is_monotonic:Ws,_emscripten_notify_task_queue:Bs,_emscripten_set_offscreencanvas_size:Vs,abort:Hs,emscripten_check_blocking_allowed:js,emscripten_date_now:Ls,emscripten_get_heap_max:$s,emscripten_get_now:wt,emscripten_memcpy_big:Us,emscripten_num_logical_cores:zs,emscripten_receive_on_main_thread_js:qs,emscripten_resize_heap:Xs,emscripten_unwind_to_js_event_loop:Ks,exit:M,fd_close:an,fd_seek:sn,fd_write:rn,memory:L||e.wasmMemory};gt(),e.___wasm_call_ctors=function(){return(e.___wasm_call_ctors=e.asm.__wasm_call_ctors).apply(null,arguments)},e._init=function(){return(e._init=e.asm.init).apply(null,arguments)},e._init_with_threads_count=function(){return(e._init_with_threads_count=e.asm.init_with_threads_count).apply(null,arguments)},e._get_threads_count=function(){return(e._get_threads_count=e.asm.get_threads_count).apply(null,arguments)},e._register_tensor=function(){return(e._register_tensor=e.asm.register_tensor).apply(null,arguments)},e._dispose_data=function(){return(e._dispose_data=e.asm.dispose_data).apply(null,arguments)},e._dispose=function(){return(e._dispose=e.asm.dispose).apply(null,arguments)},e._Abs=function(){return(e._Abs=e.asm.Abs).apply(null,arguments)},e._Add=function(){return(e._Add=e.asm.Add).apply(null,arguments)},e._AddN=function(){return(e._AddN=e.asm.AddN).apply(null,arguments)},e._All=function(){return(e._All=e.asm.All).apply(null,arguments)},e._Any=function(){return(e._Any=e.asm.Any).apply(null,arguments)},e._ArgMax=function(){return(e._ArgMax=e.asm.ArgMax).apply(null,arguments)},e._AvgPool=function(){return(e._AvgPool=e.asm.AvgPool).apply(null,arguments)},e._BatchMatMul=function(){return(e._BatchMatMul=e.asm.BatchMatMul).apply(null,arguments)},e._Ceil=function(){return(e._Ceil=e.asm.Ceil).apply(null,arguments)},e._ClipByValue=function(){return(e._ClipByValue=e.asm.ClipByValue).apply(null,arguments)},e._Conv2D=function(){return(e._Conv2D=e.asm.Conv2D).apply(null,arguments)},e._Conv2DBackpropInput=function(){return(e._Conv2DBackpropInput=e.asm.Conv2DBackpropInput).apply(null,arguments)},e._Cos=function(){return(e._Cos=e.asm.Cos).apply(null,arguments)},e._Cosh=function(){return(e._Cosh=e.asm.Cosh).apply(null,arguments)},e._CropAndResize=function(){return(e._CropAndResize=e.asm.CropAndResize).apply(null,arguments)},e._Cumprod=function(){return(e._Cumprod=e.asm.Cumprod).apply(null,arguments)},e._Cumsum=function(){return(e._Cumsum=e.asm.Cumsum).apply(null,arguments)},e._DepthToSpace=function(){return(e._DepthToSpace=e.asm.DepthToSpace).apply(null,arguments)},e._DepthwiseConv2dNative=function(){return(e._DepthwiseConv2dNative=e.asm.DepthwiseConv2dNative).apply(null,arguments)},e._Elu=function(){return(e._Elu=e.asm.Elu).apply(null,arguments)},e._Equal=function(){return(e._Equal=e.asm.Equal).apply(null,arguments)},e._Exp=function(){return(e._Exp=e.asm.Exp).apply(null,arguments)},e._FlipLeftRight=function(){return(e._FlipLeftRight=e.asm.FlipLeftRight).apply(null,arguments)},e._Floor=function(){return(e._Floor=e.asm.Floor).apply(null,arguments)},e._FloorDiv=function(){return(e._FloorDiv=e.asm.FloorDiv).apply(null,arguments)},e._FusedBatchNorm=function(){return(e._FusedBatchNorm=e.asm.FusedBatchNorm).apply(null,arguments)},e._FusedConv2D=function(){return(e._FusedConv2D=e.asm.FusedConv2D).apply(null,arguments)},e._FusedDepthwiseConv2D=function(){return(e._FusedDepthwiseConv2D=e.asm.FusedDepthwiseConv2D).apply(null,arguments)},e._Gather=function(){return(e._Gather=e.asm.Gather).apply(null,arguments)},e._GatherNd=function(){return(e._GatherNd=e.asm.GatherNd).apply(null,arguments)},e._Greater=function(){return(e._Greater=e.asm.Greater).apply(null,arguments)},e._GreaterEqual=function(){return(e._GreaterEqual=e.asm.GreaterEqual).apply(null,arguments)},e._LeakyRelu=function(){return(e._LeakyRelu=e.asm.LeakyRelu).apply(null,arguments)},e._Less=function(){return(e._Less=e.asm.Less).apply(null,arguments)},e._LessEqual=function(){return(e._LessEqual=e.asm.LessEqual).apply(null,arguments)},e._Log=function(){return(e._Log=e.asm.Log).apply(null,arguments)},e._LogicalAnd=function(){return(e._LogicalAnd=e.asm.LogicalAnd).apply(null,arguments)},e._LogicalNot=function(){return(e._LogicalNot=e.asm.LogicalNot).apply(null,arguments)},e._LogicalOr=function(){return(e._LogicalOr=e.asm.LogicalOr).apply(null,arguments)},e._LogicalXor=function(){return(e._LogicalXor=e.asm.LogicalXor).apply(null,arguments)},e._Max=function(){return(e._Max=e.asm.Max).apply(null,arguments)},e._MaxPool=function(){return(e._MaxPool=e.asm.MaxPool).apply(null,arguments)},e._Maximum=function(){return(e._Maximum=e.asm.Maximum).apply(null,arguments)},e._Mean=function(){return(e._Mean=e.asm.Mean).apply(null,arguments)},e._Min=function(){return(e._Min=e.asm.Min).apply(null,arguments)},e._Minimum=function(){return(e._Minimum=e.asm.Minimum).apply(null,arguments)},e._MirrorPad=function(){return(e._MirrorPad=e.asm.MirrorPad).apply(null,arguments)},e._Multiply=function(){return(e._Multiply=e.asm.Multiply).apply(null,arguments)},e._Neg=function(){return(e._Neg=e.asm.Neg).apply(null,arguments)},e._NonMaxSuppressionV3=function(){return(e._NonMaxSuppressionV3=e.asm.NonMaxSuppressionV3).apply(null,arguments)},e._NonMaxSuppressionV4=function(){return(e._NonMaxSuppressionV4=e.asm.NonMaxSuppressionV4).apply(null,arguments)},e._NonMaxSuppressionV5=function(){return(e._NonMaxSuppressionV5=e.asm.NonMaxSuppressionV5).apply(null,arguments)},e._NotEqual=function(){return(e._NotEqual=e.asm.NotEqual).apply(null,arguments)},e._OneHot=function(){return(e._OneHot=e.asm.OneHot).apply(null,arguments)},e._PadV2=function(){return(e._PadV2=e.asm.PadV2).apply(null,arguments)},e._Pow=function(){return(e._Pow=e.asm.Pow).apply(null,arguments)},e._Prelu=function(){return(e._Prelu=e.asm.Prelu).apply(null,arguments)},e._Prod=function(){return(e._Prod=e.asm.Prod).apply(null,arguments)},e._RealDiv=function(){return(e._RealDiv=e.asm.RealDiv).apply(null,arguments)},e._Relu=function(){return(e._Relu=e.asm.Relu).apply(null,arguments)},e._Relu6=function(){return(e._Relu6=e.asm.Relu6).apply(null,arguments)},e._ResizeBilinear=function(){return(e._ResizeBilinear=e.asm.ResizeBilinear).apply(null,arguments)},e._ResizeNearestNeighbor=function(){return(e._ResizeNearestNeighbor=e.asm.ResizeNearestNeighbor).apply(null,arguments)},e._Reverse=function(){return(e._Reverse=e.asm.Reverse).apply(null,arguments)},e._RotateWithOffset=function(){return(e._RotateWithOffset=e.asm.RotateWithOffset).apply(null,arguments)},e._Round=function(){return(e._Round=e.asm.Round).apply(null,arguments)},e._Rsqrt=function(){return(e._Rsqrt=e.asm.Rsqrt).apply(null,arguments)},e._ScatterNd=function(){return(e._ScatterNd=e.asm.ScatterNd).apply(null,arguments)},e._SelectV2=function(){return(e._SelectV2=e.asm.SelectV2).apply(null,arguments)},e._Sigmoid=function(){return(e._Sigmoid=e.asm.Sigmoid).apply(null,arguments)},e._Sin=function(){return(e._Sin=e.asm.Sin).apply(null,arguments)},e._Softmax=function(){return(e._Softmax=e.asm.Softmax).apply(null,arguments)},e._SparseFillEmptyRows=function(){return(e._SparseFillEmptyRows=e.asm.SparseFillEmptyRows).apply(null,arguments)},e._SparseReshape=function(){return(e._SparseReshape=e.asm.SparseReshape).apply(null,arguments)},e._SparseSegmentReduction=function(){return(e._SparseSegmentReduction=e.asm.SparseSegmentReduction).apply(null,arguments)},e._Sqrt=function(){return(e._Sqrt=e.asm.Sqrt).apply(null,arguments)},e._Square=function(){return(e._Square=e.asm.Square).apply(null,arguments)},e._SquaredDifference=function(){return(e._SquaredDifference=e.asm.SquaredDifference).apply(null,arguments)},e._Step=function(){return(e._Step=e.asm.Step).apply(null,arguments)},e._StridedSlice=function(){return(e._StridedSlice=e.asm.StridedSlice).apply(null,arguments)},e._Sub=function(){return(e._Sub=e.asm.Sub).apply(null,arguments)},e._Sum=function(){return(e._Sum=e.asm.Sum).apply(null,arguments)},e._Tan=function(){return(e._Tan=e.asm.Tan).apply(null,arguments)},e._Tanh=function(){return(e._Tanh=e.asm.Tanh).apply(null,arguments)},e._Tile=function(){return(e._Tile=e.asm.Tile).apply(null,arguments)},e._TopK=function(){return(e._TopK=e.asm.TopK).apply(null,arguments)},e._Transform=function(){return(e._Transform=e.asm.Transform).apply(null,arguments)},e._Transpose=function(){return(e._Transpose=e.asm.Transpose).apply(null,arguments)},e.__FusedMatMul=function(){return(e.__FusedMatMul=e.asm._FusedMatMul).apply(null,arguments)},e._malloc=function(){return(e._malloc=e.asm.malloc).apply(null,arguments)},e._free=function(){return(e._free=e.asm.free).apply(null,arguments)},e.__emscripten_tls_init=function(){return(e.__emscripten_tls_init=e.asm._emscripten_tls_init).apply(null,arguments)};var kt=e._pthread_self=function(){return(kt=e._pthread_self=e.asm.pthread_self).apply(null,arguments)};e.___errno_location=function(){return(e.___errno_location=e.asm.__errno_location).apply(null,arguments)};var cn=e.__emscripten_thread_init=function(){return(cn=e.__emscripten_thread_init=e.asm._emscripten_thread_init).apply(null,arguments)};e.__emscripten_thread_crashed=function(){return(e.__emscripten_thread_crashed=e.asm._emscripten_thread_crashed).apply(null,arguments)},e._emscripten_main_thread_process_queued_calls=function(){return(e._emscripten_main_thread_process_queued_calls=e.asm.emscripten_main_thread_process_queued_calls).apply(null,arguments)},e._emscripten_main_browser_thread_id=function(){return(e._emscripten_main_browser_thread_id=e.asm.emscripten_main_browser_thread_id).apply(null,arguments)};var dn=e._emscripten_run_in_main_runtime_thread_js=function(){return(dn=e._emscripten_run_in_main_runtime_thread_js=e.asm.emscripten_run_in_main_runtime_thread_js).apply(null,arguments)};e._emscripten_dispatch_to_thread_=function(){return(e._emscripten_dispatch_to_thread_=e.asm.emscripten_dispatch_to_thread_).apply(null,arguments)};var pn=e.__emscripten_proxy_execute_task_queue=function(){return(pn=e.__emscripten_proxy_execute_task_queue=e.asm._emscripten_proxy_execute_task_queue).apply(null,arguments)},Vt=e.__emscripten_thread_free_data=function(){return(Vt=e.__emscripten_thread_free_data=e.asm._emscripten_thread_free_data).apply(null,arguments)},ln=e.__emscripten_thread_exit=function(){return(ln=e.__emscripten_thread_exit=e.asm._emscripten_thread_exit).apply(null,arguments)},mn=e._emscripten_stack_set_limits=function(){return(mn=e._emscripten_stack_set_limits=e.asm.emscripten_stack_set_limits).apply(null,arguments)},Ht=e.stackSave=function(){return(Ht=e.stackSave=e.asm.stackSave).apply(null,arguments)},St=e.stackRestore=function(){return(St=e.stackRestore=e.asm.stackRestore).apply(null,arguments)},Mt=e.stackAlloc=function(){return(Mt=e.stackAlloc=e.asm.stackAlloc).apply(null,arguments)};e.dynCall_iijjiiii=function(){return(e.dynCall_iijjiiii=e.asm.dynCall_iijjiiii).apply(null,arguments)},e.dynCall_jiji=function(){return(e.dynCall_jiji=e.asm.dynCall_jiji).apply(null,arguments)},e.keepRuntimeAlive=Ve,e.wasmMemory=L,e.cwrap=Zs,e.ExitStatus=ye,e.PThread=v;var vt;Ce=function i(){vt||fn(),vt||(Ce=i)};function fn(i){if(be>0)return;if(b){g(e),pt(),postMessage({cmd:"loaded"});return}if(Ke(),be>0)return;function h(){vt||(vt=!0,e.calledRun=!0,!ie&&(pt(),g(e),e.onRuntimeInitialized&&e.onRuntimeInitialized(),Ct()))}e.setStatus?(e.setStatus("Running..."),setTimeout(function(){setTimeout(function(){e.setStatus("")},1),h()},1)):h()}if(e.preInit)for(typeof e.preInit=="function"&&(e.preInit=[e.preInit]);e.preInit.length>0;)e.preInit.pop()();fn();var xt;l&&(xt={uncaughtException:process.listeners("uncaughtException").filter(function(i){return!l.uncaughtException.indexOf(i)>-1}),unhandledRejection:process.listeners("unhandledRejection").filter(function(i){return!l.unhandledRejection.indexOf(i)>-1})});var At;if(typeof WasmBackendModule<"u")At=WasmBackendModule;else if(typeof a<"u")At=a;else throw new Error("Could not find wasm module in post.js");if(xt){var tr=At._dispose;At._dispose=function(){tr(),xt.uncaughtException.forEach(function(i){process.removeListener("uncaughtException",i)}),xt.unhandledRejection.forEach(function(i){process.removeListener("unhandledRejection",i)})}}return a.ready})})();s.exports=r})($t)),$t.exports}var Fs=_p(),Es=xa(Fs),bp=Qo({__proto__:null,default:Es},[Fs]),Ut={},Sn;function yp(){return Sn||(Sn=1,Ut.wasmWorkerContents=`"use strict";var Module={};var ENVIRONMENT_IS_NODE=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string";if(ENVIRONMENT_IS_NODE){var nodeWorkerThreads=require("worker_threads");var parentPort=nodeWorkerThreads.parentPort;parentPort.on("message",data=>onmessage({data:data}));var fs=require("fs");Object.assign(global,{self:global,require:require,Module:Module,location:{href:__filename},Worker:nodeWorkerThreads.Worker,importScripts:function(f){(0,eval)(fs.readFileSync(f,"utf8"))},postMessage:function(msg){parentPort.postMessage(msg)},performance:global.performance||{now:function(){return Date.now()}}})}var initializedJS=false;var pendingNotifiedProxyingQueues=[];function threadPrintErr(){var text=Array.prototype.slice.call(arguments).join(" ");if(ENVIRONMENT_IS_NODE){fs.writeSync(2,text+"
");return}console.error(text)}function threadAlert(){var text=Array.prototype.slice.call(arguments).join(" ");postMessage({cmd:"alert",text:text,threadId:Module["_pthread_self"]()})}var err=threadPrintErr;self.alert=threadAlert;Module["instantiateWasm"]=(info,receiveInstance)=>{var instance=new WebAssembly.Instance(Module["wasmModule"],info);receiveInstance(instance);Module["wasmModule"]=null;return instance.exports};self.onunhandledrejection=e=>{throw e.reason??e};self.onmessage=e=>{try{if(e.data.cmd==="load"){Module["wasmModule"]=e.data.wasmModule;Module["wasmMemory"]=e.data.wasmMemory;Module["buffer"]=Module["wasmMemory"].buffer;Module["ENVIRONMENT_IS_PTHREAD"]=true;if(typeof e.data.urlOrBlob=="string"){importScripts(e.data.urlOrBlob)}else{var objectUrl=URL.createObjectURL(e.data.urlOrBlob);importScripts(objectUrl);URL.revokeObjectURL(objectUrl)}WasmBackendModuleThreadedSimd(Module).then(function(instance){Module=instance})}else if(e.data.cmd==="run"){Module["__performance_now_clock_drift"]=performance.now()-e.data.time;Module["__emscripten_thread_init"](e.data.pthread_ptr,0,0,1);Module["establishStackSpace"]();Module["PThread"].receiveObjectTransfer(e.data);Module["PThread"].threadInitTLS();if(!initializedJS){pendingNotifiedProxyingQueues.forEach(queue=>{Module["executeNotifiedProxyingQueue"](queue)});pendingNotifiedProxyingQueues=[];initializedJS=true}try{Module["invokeEntryPoint"](e.data.start_routine,e.data.arg)}catch(ex){if(ex!="unwind"){if(ex instanceof Module["ExitStatus"]){if(Module["keepRuntimeAlive"]()){}else{Module["__emscripten_thread_exit"](ex.status)}}else{throw ex}}}}else if(e.data.cmd==="cancel"){if(Module["_pthread_self"]()){Module["__emscripten_thread_exit"](-1)}}else if(e.data.target==="setimmediate"){}else if(e.data.cmd==="processProxyingQueue"){if(initializedJS){Module["executeNotifiedProxyingQueue"](e.data.queue)}else{pendingNotifiedProxyingQueues.push(e.data.queue)}}else if(e.data.cmd){err("worker.js received unknown command "+e.data.cmd);err(e.data)}}catch(ex){if(Module["__emscripten_thread_crashed"]){Module["__emscripten_thread_crashed"]()}throw ex}};`),Ut}var Ip=yp(),zt={exports:{}},Mn;function wp(){return Mn||(Mn=1,(function(s,n){var r=(()=>{var o=typeof document<"u"&&document.currentScript?document.currentScript.src:void 0;return typeof __filename<"u"&&(o=o||__filename),(function(a){a=a||{};var t=typeof a<"u"?a:{},u,c;t.ready=new Promise(function(y,M){u=y,c=M});var p;typeof process<"u"&&process.listeners&&(p={uncaughtException:process.listeners("uncaughtException"),unhandledRejection:process.listeners("unhandledRejection")});var d=Object.assign({},t),e=typeof window=="object",g=typeof importScripts=="function",_=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string",l="";function m(y){return t.locateFile?t.locateFile(y,l):l+y}var f,w,k;if(_){g?l=Se.dirname(l)+"/":l=__dirname+"/";var I,b;typeof Cs=="function"&&(I=Se,b=Se),f=(y,M)=>(y=b.normalize(y),I.readFileSync(y,M?void 0:"utf8")),k=y=>{var M=f(y,!0);return M.buffer||(M=new Uint8Array(M)),M},w=(y,M,N)=>{y=b.normalize(y),I.readFile(y,function(v,U){v?N(v):M(U.buffer)})},process.argv.length>1&&process.argv[1].replace(/\\/g,"/"),process.argv.slice(2),process.on("uncaughtException",function(y){if(!(y instanceof Ve))throw y}),process.on("unhandledRejection",function(y){throw y}),t.inspect=function(){return"[Emscripten Module object]"}}else(e||g)&&(g?l=self.location.href:typeof document<"u"&&document.currentScript&&(l=document.currentScript.src),o&&(l=o),l.indexOf("blob:")!==0?l=l.substr(0,l.replace(/[?#].*/,"").lastIndexOf("/")+1):l="",f=y=>{var M=new XMLHttpRequest;return M.open("GET",y,!1),M.send(null),M.responseText},g&&(k=y=>{var M=new XMLHttpRequest;return M.open("GET",y,!1),M.responseType="arraybuffer",M.send(null),new Uint8Array(M.response)}),w=(y,M,N)=>{var v=new XMLHttpRequest;v.open("GET",y,!0),v.responseType="arraybuffer",v.onload=()=>{if(v.status==200||v.status==0&&v.response){M(v.response);return}N()},v.onerror=N,v.send(null)});var x=t.print||console.log.bind(console),D=t.printErr||console.warn.bind(console);Object.assign(t,d),d=null,t.arguments&&t.arguments,t.thisProgram&&t.thisProgram,t.quit&&t.quit;var C;t.wasmBinary&&(C=t.wasmBinary),t.noExitRuntime,typeof WebAssembly!="object"&&Ne("no native wasm support detected");var O,V=!1,j=typeof TextDecoder<"u"?new TextDecoder("utf8"):void 0;function W(y,M,N){for(var v=M+N,U=M;y[U]&&!(U>=v);)++U;if(U-M>16&&y.buffer&&j)return j.decode(y.subarray(M,U));for(var G="";M<U;){var B=y[M++];if(!(B&128)){G+=String.fromCharCode(B);continue}var P=y[M++]&63;if((B&224)==192){G+=String.fromCharCode((B&31)<<6|P);continue}var X=y[M++]&63;if((B&240)==224?B=(B&15)<<12|P<<6|X:B=(B&7)<<18|P<<12|X<<6|y[M++]&63,B<65536)G+=String.fromCharCode(B);else{var le=B-65536;G+=String.fromCharCode(55296|le>>10,56320|le&1023)}}return G}function $(y,M){return y?W(Z,y,M):""}function z(y,M,N,v){if(!(v>0))return 0;for(var U=N,G=N+v-1,B=0;B<y.length;++B){var P=y.charCodeAt(B);if(P>=55296&&P<=57343){var X=y.charCodeAt(++B);P=65536+((P&1023)<<10)|X&1023}if(P<=127){if(N>=G)break;M[N++]=P}else if(P<=2047){if(N+1>=G)break;M[N++]=192|P>>6,M[N++]=128|P&63}else if(P<=65535){if(N+2>=G)break;M[N++]=224|P>>12,M[N++]=128|P>>6&63,M[N++]=128|P&63}else{if(N+3>=G)break;M[N++]=240|P>>18,M[N++]=128|P>>12&63,M[N++]=128|P>>6&63,M[N++]=128|P&63}}return M[N]=0,N-U}function Q(y,M,N){return z(y,Z,M,N)}var oe,q,Z,pe;function L(y){oe=y,t.HEAP8=q=new Int8Array(y),t.HEAP16=new Int16Array(y),t.HEAP32=new Int32Array(y),t.HEAPU8=Z=new Uint8Array(y),t.HEAPU16=new Uint16Array(y),t.HEAPU32=pe=new Uint32Array(y),t.HEAPF32=new Float32Array(y),t.HEAPF64=new Float64Array(y)}t.INITIAL_MEMORY;var he=[],ie=[],ce=[];function _e(){if(t.preRun)for(typeof t.preRun=="function"&&(t.preRun=[t.preRun]);t.preRun.length;)Be(t.preRun.shift());Ke(he)}function te(){Ke(ie)}function We(){if(t.postRun)for(typeof t.postRun=="function"&&(t.postRun=[t.postRun]);t.postRun.length;)qe(t.postRun.shift());Ke(ce)}function Be(y){he.unshift(y)}function ze(y){ie.unshift(y)}function qe(y){ce.unshift(y)}var J=0,xe=null;function ot(y){J++,t.monitorRunDependencies&&t.monitorRunDependencies(J)}function ut(y){if(J--,t.monitorRunDependencies&&t.monitorRunDependencies(J),J==0&&xe){var M=xe;xe=null,M()}}function Ne(y){t.onAbort&&t.onAbort(y),y="Aborted("+y+")",D(y),V=!0,y+=". Build with -sASSERTIONS for more info.";var M=new WebAssembly.RuntimeError(y);throw c(M),M}var it="data:application/octet-stream;base64,";function ge(y){return y.startsWith(it)}function Ge(y){return y.startsWith("file://")}var ae;ae="tfjs-backend-wasm.wasm",ge(ae)||(ae=m(ae));function Xe(y){try{if(y==ae&&C)return new Uint8Array(C);if(k)return k(y);throw"both async and sync fetching of the wasm failed"}catch(M){Ne(M)}}function ct(){if(!C&&(e||g)){if(typeof fetch=="function"&&!Ge(ae))return fetch(ae,{credentials:"same-origin"}).then(function(y){if(!y.ok)throw"failed to load wasm binary file at '"+ae+"'";return y.arrayBuffer()}).catch(function(){return Xe(ae)});if(w)return new Promise(function(y,M){w(ae,function(N){y(new Uint8Array(N))},M)})}return Promise.resolve().then(function(){return Xe(ae)})}function dt(){var y={env:ht,wasi_snapshot_preview1:ht};function M(B,P){var X=B.exports;t.asm=X,O=t.asm.memory,L(O.buffer),t.asm.__indirect_function_table,ze(t.asm.__wasm_call_ctors),ut()}ot();function N(B){M(B.instance)}function v(B){return ct().then(function(P){return WebAssembly.instantiate(P,y)}).then(function(P){return P}).then(B,function(P){D("failed to asynchronously prepare wasm: "+P),Ne(P)})}function U(){return!C&&typeof WebAssembly.instantiateStreaming=="function"&&!ge(ae)&&!Ge(ae)&&!_&&typeof fetch=="function"?fetch(ae,{credentials:"same-origin"}).then(function(B){var P=WebAssembly.instantiateStreaming(B,y);return P.then(N,function(X){return D("wasm streaming compile failed: "+X),D("falling back to ArrayBuffer instantiation"),v(N)})}):v(N)}if(t.instantiateWasm)try{var G=t.instantiateWasm(y,M);return G}catch(B){D("Module.instantiateWasm callback failed with error: "+B),c(B)}return U().catch(c),{}}function Ve(y){this.name="ExitStatus",this.message="Program terminated with exit("+y+")",this.status=y}function Ke(y){for(;y.length>0;)y.shift()(t)}function pt(y,M){q.set(y,M)}function Ct(){Ne("")}function lt(){return 2147483648}function Ft(){return lt()}function Et(y,M,N){Z.copyWithin(y,M,M+N)}function be(y){try{return O.grow(y-oe.byteLength+65535>>>16),L(O.buffer),1}catch{}}function Ce(y){var M=Z.length;y=y>>>0;var N=lt();if(y>N)return!1;let v=(X,le)=>X+(le-X%le)%le;for(var U=1;U<=4;U*=2){var G=M*(1+.2/U);G=Math.min(G,y+100663296);var B=Math.min(N,v(Math.max(y,G),65536)),P=be(B);if(P)return!0}return!1}function Dt(y){return 52}function Tt(y,M,N,v,U){return 70}var Fe=[null,[],[]];function Ot(y,M){var N=Fe[y];M===0||M===10?((y===1?x:D)(W(N,0)),N.length=0):N.push(M)}function mt(y,M,N,v){for(var U=0,G=0;G<N;G++){var B=pe[M>>2],P=pe[M+4>>2];M+=8;for(var X=0;X<P;X++)Ot(y,Z[B+X]);U+=P}return pe[v>>2]=U,0}function Qe(y){var M=t["_"+y];return M}function se(y,M,N,v,U){var G={string:re=>{var we=0;if(re!=null&&re!==0){var Ye=(re.length<<2)+1;we=ye(Ye),Q(re,we,Ye)}return we},array:re=>{var we=ye(re.length);return pt(re,we),we}};function B(re){return M==="string"?$(re):M==="boolean"?!!re:re}var P=Qe(y),X=[],le=0;if(v)for(var Ie=0;Ie<v.length;Ie++){var It=G[N[Ie]];It?(le===0&&(le=gt()),X[Ie]=It(v[Ie])):X[Ie]=v[Ie]}var Je=P.apply(null,X);function Pt(re){return le!==0&&_t(le),B(re)}return Je=Pt(Je),Je}function ft(y,M,N,v){N=N||[];var U=N.every(B=>B==="number"||B==="boolean"),G=M!=="string";return G&&U&&!v?Qe(y):function(){return se(y,M,N,arguments)}}var ht={abort:Ct,emscripten_get_heap_max:Ft,emscripten_memcpy_big:Et,emscripten_resize_heap:Ce,fd_close:Dt,fd_seek:Tt,fd_write:mt};dt(),t.___wasm_call_ctors=function(){return(t.___wasm_call_ctors=t.asm.__wasm_call_ctors).apply(null,arguments)},t._init=function(){return(t._init=t.asm.init).apply(null,arguments)},t._init_with_threads_count=function(){return(t._init_with_threads_count=t.asm.init_with_threads_count).apply(null,arguments)},t._get_threads_count=function(){return(t._get_threads_count=t.asm.get_threads_count).apply(null,arguments)},t._register_tensor=function(){return(t._register_tensor=t.asm.register_tensor).apply(null,arguments)},t._dispose_data=function(){return(t._dispose_data=t.asm.dispose_data).apply(null,arguments)},t._dispose=function(){return(t._dispose=t.asm.dispose).apply(null,arguments)},t._Abs=function(){return(t._Abs=t.asm.Abs).apply(null,arguments)},t._Add=function(){return(t._Add=t.asm.Add).apply(null,arguments)},t._AddN=function(){return(t._AddN=t.asm.AddN).apply(null,arguments)},t._All=function(){return(t._All=t.asm.All).apply(null,arguments)},t._Any=function(){return(t._Any=t.asm.Any).apply(null,arguments)},t._ArgMax=function(){return(t._ArgMax=t.asm.ArgMax).apply(null,arguments)},t._AvgPool=function(){return(t._AvgPool=t.asm.AvgPool).apply(null,arguments)},t._BatchMatMul=function(){return(t._BatchMatMul=t.asm.BatchMatMul).apply(null,arguments)},t._Ceil=function(){return(t._Ceil=t.asm.Ceil).apply(null,arguments)},t._ClipByValue=function(){return(t._ClipByValue=t.asm.ClipByValue).apply(null,arguments)},t._Conv2D=function(){return(t._Conv2D=t.asm.Conv2D).apply(null,arguments)},t._Conv2DBackpropInput=function(){return(t._Conv2DBackpropInput=t.asm.Conv2DBackpropInput).apply(null,arguments)},t._Cos=function(){return(t._Cos=t.asm.Cos).apply(null,arguments)},t._Cosh=function(){return(t._Cosh=t.asm.Cosh).apply(null,arguments)},t._CropAndResize=function(){return(t._CropAndResize=t.asm.CropAndResize).apply(null,arguments)},t._Cumprod=function(){return(t._Cumprod=t.asm.Cumprod).apply(null,arguments)},t._Cumsum=function(){return(t._Cumsum=t.asm.Cumsum).apply(null,arguments)},t._DepthToSpace=function(){return(t._DepthToSpace=t.asm.DepthToSpace).apply(null,arguments)},t._DepthwiseConv2dNative=function(){return(t._DepthwiseConv2dNative=t.asm.DepthwiseConv2dNative).apply(null,arguments)},t._Elu=function(){return(t._Elu=t.asm.Elu).apply(null,arguments)},t._Equal=function(){return(t._Equal=t.asm.Equal).apply(null,arguments)},t._Exp=function(){return(t._Exp=t.asm.Exp).apply(null,arguments)},t._FlipLeftRight=function(){return(t._FlipLeftRight=t.asm.FlipLeftRight).apply(null,arguments)},t._Floor=function(){return(t._Floor=t.asm.Floor).apply(null,arguments)},t._FloorDiv=function(){return(t._FloorDiv=t.asm.FloorDiv).apply(null,arguments)},t._FusedBatchNorm=function(){return(t._FusedBatchNorm=t.asm.FusedBatchNorm).apply(null,arguments)},t._FusedConv2D=function(){return(t._FusedConv2D=t.asm.FusedConv2D).apply(null,arguments)},t._FusedDepthwiseConv2D=function(){return(t._FusedDepthwiseConv2D=t.asm.FusedDepthwiseConv2D).apply(null,arguments)},t._Gather=function(){return(t._Gather=t.asm.Gather).apply(null,arguments)},t._GatherNd=function(){return(t._GatherNd=t.asm.GatherNd).apply(null,arguments)},t._Greater=function(){return(t._Greater=t.asm.Greater).apply(null,arguments)},t._GreaterEqual=function(){return(t._GreaterEqual=t.asm.GreaterEqual).apply(null,arguments)},t._LeakyRelu=function(){return(t._LeakyRelu=t.asm.LeakyRelu).apply(null,arguments)},t._Less=function(){return(t._Less=t.asm.Less).apply(null,arguments)},t._LessEqual=function(){return(t._LessEqual=t.asm.LessEqual).apply(null,arguments)},t._Log=function(){return(t._Log=t.asm.Log).apply(null,arguments)},t._LogicalAnd=function(){return(t._LogicalAnd=t.asm.LogicalAnd).apply(null,arguments)},t._LogicalNot=function(){return(t._LogicalNot=t.asm.LogicalNot).apply(null,arguments)},t._LogicalOr=function(){return(t._LogicalOr=t.asm.LogicalOr).apply(null,arguments)},t._LogicalXor=function(){return(t._LogicalXor=t.asm.LogicalXor).apply(null,arguments)},t._Max=function(){return(t._Max=t.asm.Max).apply(null,arguments)},t._MaxPool=function(){return(t._MaxPool=t.asm.MaxPool).apply(null,arguments)},t._Maximum=function(){return(t._Maximum=t.asm.Maximum).apply(null,arguments)},t._Mean=function(){return(t._Mean=t.asm.Mean).apply(null,arguments)},t._Min=function(){return(t._Min=t.asm.Min).apply(null,arguments)},t._Minimum=function(){return(t._Minimum=t.asm.Minimum).apply(null,arguments)},t._MirrorPad=function(){return(t._MirrorPad=t.asm.MirrorPad).apply(null,arguments)},t._Multiply=function(){return(t._Multiply=t.asm.Multiply).apply(null,arguments)},t._Neg=function(){return(t._Neg=t.asm.Neg).apply(null,arguments)},t._NonMaxSuppressionV3=function(){return(t._NonMaxSuppressionV3=t.asm.NonMaxSuppressionV3).apply(null,arguments)},t._NonMaxSuppressionV4=function(){return(t._NonMaxSuppressionV4=t.asm.NonMaxSuppressionV4).apply(null,arguments)},t._NonMaxSuppressionV5=function(){return(t._NonMaxSuppressionV5=t.asm.NonMaxSuppressionV5).apply(null,arguments)},t._NotEqual=function(){return(t._NotEqual=t.asm.NotEqual).apply(null,arguments)},t._OneHot=function(){return(t._OneHot=t.asm.OneHot).apply(null,arguments)},t._PadV2=function(){return(t._PadV2=t.asm.PadV2).apply(null,arguments)},t._Pow=function(){return(t._Pow=t.asm.Pow).apply(null,arguments)},t._Prelu=function(){return(t._Prelu=t.asm.Prelu).apply(null,arguments)},t._Prod=function(){return(t._Prod=t.asm.Prod).apply(null,arguments)},t._RealDiv=function(){return(t._RealDiv=t.asm.RealDiv).apply(null,arguments)},t._Relu=function(){return(t._Relu=t.asm.Relu).apply(null,arguments)},t._Relu6=function(){return(t._Relu6=t.asm.Relu6).apply(null,arguments)},t._ResizeBilinear=function(){return(t._ResizeBilinear=t.asm.ResizeBilinear).apply(null,arguments)},t._ResizeNearestNeighbor=function(){return(t._ResizeNearestNeighbor=t.asm.ResizeNearestNeighbor).apply(null,arguments)},t._Reverse=function(){return(t._Reverse=t.asm.Reverse).apply(null,arguments)},t._RotateWithOffset=function(){return(t._RotateWithOffset=t.asm.RotateWithOffset).apply(null,arguments)},t._Round=function(){return(t._Round=t.asm.Round).apply(null,arguments)},t._Rsqrt=function(){return(t._Rsqrt=t.asm.Rsqrt).apply(null,arguments)},t._ScatterNd=function(){return(t._ScatterNd=t.asm.ScatterNd).apply(null,arguments)},t._SelectV2=function(){return(t._SelectV2=t.asm.SelectV2).apply(null,arguments)},t._Sigmoid=function(){return(t._Sigmoid=t.asm.Sigmoid).apply(null,arguments)},t._Sin=function(){return(t._Sin=t.asm.Sin).apply(null,arguments)},t._Softmax=function(){return(t._Softmax=t.asm.Softmax).apply(null,arguments)},t._SparseFillEmptyRows=function(){return(t._SparseFillEmptyRows=t.asm.SparseFillEmptyRows).apply(null,arguments)},t._SparseReshape=function(){return(t._SparseReshape=t.asm.SparseReshape).apply(null,arguments)},t._SparseSegmentReduction=function(){return(t._SparseSegmentReduction=t.asm.SparseSegmentReduction).apply(null,arguments)},t._Sqrt=function(){return(t._Sqrt=t.asm.Sqrt).apply(null,arguments)},t._Square=function(){return(t._Square=t.asm.Square).apply(null,arguments)},t._SquaredDifference=function(){return(t._SquaredDifference=t.asm.SquaredDifference).apply(null,arguments)},t._Step=function(){return(t._Step=t.asm.Step).apply(null,arguments)},t._StridedSlice=function(){return(t._StridedSlice=t.asm.StridedSlice).apply(null,arguments)},t._Sub=function(){return(t._Sub=t.asm.Sub).apply(null,arguments)},t._Sum=function(){return(t._Sum=t.asm.Sum).apply(null,arguments)},t._Tan=function(){return(t._Tan=t.asm.Tan).apply(null,arguments)},t._Tanh=function(){return(t._Tanh=t.asm.Tanh).apply(null,arguments)},t._Tile=function(){return(t._Tile=t.asm.Tile).apply(null,arguments)},t._TopK=function(){return(t._TopK=t.asm.TopK).apply(null,arguments)},t._Transform=function(){return(t._Transform=t.asm.Transform).apply(null,arguments)},t._Transpose=function(){return(t._Transpose=t.asm.Transpose).apply(null,arguments)},t.__FusedMatMul=function(){return(t.__FusedMatMul=t.asm._FusedMatMul).apply(null,arguments)},t._malloc=function(){return(t._malloc=t.asm.malloc).apply(null,arguments)},t._free=function(){return(t._free=t.asm.free).apply(null,arguments)},t.___errno_location=function(){return(t.___errno_location=t.asm.__errno_location).apply(null,arguments)};var gt=t.stackSave=function(){return(gt=t.stackSave=t.asm.stackSave).apply(null,arguments)},_t=t.stackRestore=function(){return(_t=t.stackRestore=t.asm.stackRestore).apply(null,arguments)},ye=t.stackAlloc=function(){return(ye=t.stackAlloc=t.asm.stackAlloc).apply(null,arguments)};t.dynCall_iijjiiii=function(){return(t.dynCall_iijjiiii=t.asm.dynCall_iijjiiii).apply(null,arguments)},t.dynCall_jiji=function(){return(t.dynCall_jiji=t.asm.dynCall_jiji).apply(null,arguments)},t.cwrap=ft;var He;xe=function y(){He||bt(),He||(xe=y)};function bt(y){if(J>0||(_e(),J>0))return;function M(){He||(He=!0,t.calledRun=!0,!V&&(te(),u(t),t.onRuntimeInitialized&&t.onRuntimeInitialized(),We()))}t.setStatus?(t.setStatus("Running..."),setTimeout(function(){setTimeout(function(){t.setStatus("")},1),M()},1)):M()}if(t.preInit)for(typeof t.preInit=="function"&&(t.preInit=[t.preInit]);t.preInit.length>0;)t.preInit.pop()();bt();var Ee;p&&(Ee={uncaughtException:process.listeners("uncaughtException").filter(function(y){return!p.uncaughtException.indexOf(y)>-1}),unhandledRejection:process.listeners("unhandledRejection").filter(function(y){return!p.unhandledRejection.indexOf(y)>-1})});var De;if(typeof a<"u")De=a;else if(typeof WasmBackendModuleThreadedSimd<"u")De=WasmBackendModuleThreadedSimd;else throw new Error("Could not find wasm module in post.js");if(Ee){var yt=De._dispose;De._dispose=function(){yt(),Ee.uncaughtException.forEach(function(y){process.removeListener("uncaughtException",y)}),Ee.unhandledRejection.forEach(function(y){process.removeListener("unhandledRejection",y)})}}return a.ready})})();s.exports=r})(zt)),zt.exports}var kp=wp(),Ds=xa(kp),Sp=Object.freeze({__proto__:null,default:Ds});/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const vn=Es||bp,Mp=Ds||Sp;class vp extends Uo{constructor(n){super(),this.wasm=n,this.dataIdNextNumber=1,this.wasm.tfjs.initWithThreadsCount(Ts),Jt=this.wasm.tfjs.getThreadsCount(),this.dataIdMap=new zo(this,qo())}write(n,r,o){const a={id:this.dataIdNextNumber++};return this.move(a,n,r,o,1),a}numDataIds(){return this.dataIdMap.numDataIds()}async time(n){const r=In();return n(),{kernelMs:In()-r}}move(n,r,o,a,t){const u=this.dataIdNextNumber++;if(a==="string"){const e=r;this.dataIdMap.set(n,{id:u,stringBytes:e,shape:o,dtype:a,memoryOffset:null,refCount:t});return}const c=F(o),p=c*wn(a),d=this.wasm._malloc(p);this.dataIdMap.set(n,{id:u,memoryOffset:d,shape:o,dtype:a,refCount:t}),this.wasm.tfjs.registerTensor(u,c,d),r!=null&&this.wasm.HEAPU8.set(new Uint8Array(r.buffer,r.byteOffset,p),d)}async read(n){return this.readSync(n)}readSync(n,r,o){const{memoryOffset:a,dtype:t,shape:u,stringBytes:c}=this.dataIdMap.get(n);if(t==="string")return(r==null||r===0)&&(o==null||o>=c.length)?c:c.slice(r,o);r=r||0,o=o||F(u);const p=wn(t),d=this.wasm.HEAPU8.slice(a+r*p,a+o*p);return Rp(d.buffer,t)}disposeData(n,r=!1){if(this.dataIdMap.has(n)){const o=this.dataIdMap.get(n);if(o.refCount--,!r&&o.refCount>0)return!1;this.wasm._free(o.memoryOffset),this.wasm.tfjs.disposeData(o.id),this.dataIdMap.delete(n)}return!0}refCount(n){return this.dataIdMap.has(n)?this.dataIdMap.get(n).refCount:0}incRef(n){const r=this.dataIdMap.get(n);r!=null&&r.refCount++}floatPrecision(){return 32}getMemoryOffset(n){return this.dataIdMap.get(n).memoryOffset}dispose(){this.wasm.tfjs.dispose(),"PThread"in this.wasm&&this.wasm.PThread.terminateAllThreads(),this.wasm=null}memory(){return{unreliable:!1}}makeOutput(n,r,o){let a;if(o==null)a=this.write(null,n,r);else{const t=this.dataIdNextNumber++;a={id:t},this.dataIdMap.set(a,{id:t,memoryOffset:o,shape:n,dtype:r,refCount:1});const u=F(n);this.wasm.tfjs.registerTensor(t,u,o)}return{dataId:a,shape:n,dtype:r}}typedArrayFromHeap({shape:n,dtype:r,dataId:o}){const a=this.wasm.HEAPU8.buffer,{memoryOffset:t}=this.dataIdMap.get(o),u=F(n);switch(r){case"float32":return new Float32Array(a,t,u);case"int32":return new Int32Array(a,t,u);case"bool":return new Uint8Array(a,t,u);default:throw new Error(`Unknown dtype ${r}`)}}}function xp(s){return(n,r)=>(Xo(s,{credentials:"same-origin"}).then(o=>{o.ok||n.env.a(`failed to load wasm binary file at '${s}'`),o.arrayBuffer().then(a=>{WebAssembly.instantiate(a,n).then(t=>{r(t.instance,t.module)})})}),{})}function xn(s,n,r){if(Rt!=null)return Rt;let o="tfjs-backend-wasm.wasm";return s&&n?o="tfjs-backend-wasm-threaded-simd.wasm":s&&(o="tfjs-backend-wasm-simd.wasm"),tt!=null&&tt[o]!=null?tt[o]:r+o}async function Ap(){const[s,n]=await Promise.all([qt().getAsync("WASM_HAS_SIMD_SUPPORT"),qt().getAsync("WASM_HAS_MULTITHREAD_SUPPORT")]);return new Promise((r,o)=>{const a={};a.locateFile=(c,p)=>{if(c.endsWith(".worker.js")){const d=Ip.wasmWorkerContents.replace(/\n/g,"\\n"),e=new Blob([d],{type:"application/javascript"});return URL.createObjectURL(e)}return c.endsWith(".wasm")?xn(s,n,et??p):p+c},tn&&(a.instantiateWasm=xp(xn(s,n,et??"")));let t=!1;a.onAbort=()=>{if(t||nt)return;nt=!0,o({message:"Make sure the server can serve the `.wasm` file relative to the bundled js file. For more details see https://github.com/tensorflow/tfjs/blob/master/tfjs-backend-wasm/README.md#using-bundlers"})};let u;n&&s&&Rt==null?(a.mainScriptUrlOrBlob=new Blob(["var WasmBackendModuleThreadedSimd = "+vn.toString()],{type:"text/javascript"}),u=vn(a)):u=Mp(a),u.then(c=>{t=!0,nt=!1;const p=null;c.tfjs={init:c.cwrap("init",null,[]),initWithThreadsCount:c.cwrap("init_with_threads_count",null,["number"]),getThreadsCount:c.cwrap("get_threads_count","number",[]),registerTensor:c.cwrap("register_tensor",null,["number","number","number"]),disposeData:c.cwrap("dispose_data",p,["number"]),dispose:c.cwrap("dispose",p,[])},r({wasm:c})}).catch(o)})}function Rp(s,n){switch(n){case"float32":return new Float32Array(s);case"int32":return new Int32Array(s);case"bool":return new Uint8Array(s);default:throw new Error(`Unknown dtype ${n}`)}}const Np=["tfjs-backend-wasm.wasm","tfjs-backend-wasm-simd.wasm","tfjs-backend-wasm-threaded-simd.wasm"];let Rt=null,et=null,tt={},nt=!1,tn=!1;function Ep(s,n=!1){if(Go("setWasmPath has been deprecated in favor of setWasmPaths and will be removed in a future release."),nt)throw new Error("The WASM backend was already initialized. Make sure you call `setWasmPath()` before you call `tf.setBackend()` or `tf.ready()`");Rt=s,tn=n}function Dp(s,n=!1){if(nt)throw new Error("The WASM backend was already initialized. Make sure you call `setWasmPaths()` before you call `tf.setBackend()` or `tf.ready()`");if(typeof s=="string")et=s;else{tt=s;const r=Np.filter(o=>tt[o]==null);if(r.length>0)throw new Error(`There were no entries found for the following binaries: ${r.join(",")}. Please either call setWasmPaths with a map providing a path for each binary, or with a string indicating the directory where all the binaries can be found.`)}tn=n}let Ts=-1,Jt=-1;function Tp(s){Ts=s}function Op(){if(Jt===-1)throw new Error("WASM backend not initialized.");return Jt}/** @license See the LICENSE file. */const Pp="3.21.0";/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Cp=2;Ko("wasm",async()=>{const{wasm:s}=await Ap();return new vp(s)},Cp);export{vp as BackendWasm,Op as getThreadsCount,Tp as setThreadsCount,Ep as setWasmPath,Dp as setWasmPaths,Pp as version_wasm};
