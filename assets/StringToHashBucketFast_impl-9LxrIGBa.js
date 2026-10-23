import{g as Kn,a as Zn}from"./_commonjsHelpers-D6-XlEtG.js";function Xn(e,t){for(var n=0;n<t.length;n++){const r=t[n];if(typeof r!="string"&&!Array.isArray(r)){for(const s in r)if(s!=="default"&&!(s in e)){const o=Object.getOwnPropertyDescriptor(r,s);o&&Object.defineProperty(e,s,o.get?o:{enumerable:!0,get:()=>r[s]})}}}return Object.freeze(Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}))}/**
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
 */const Yn=1e-7,Jn=1e-4;class qi{constructor(t,n){this.backend=t,this.dataMover=n,this.data=new WeakMap,this.dataIdsCount=0}get(t){return this.data.has(t)||this.dataMover.moveData(this.backend,t),this.data.get(t)}set(t,n){this.dataIdsCount++,this.data.set(t,n)}has(t){return this.data.has(t)}delete(t){return this.dataIdsCount--,this.data.delete(t)}numDataIds(){return this.dataIdsCount}}class Qn{refCount(t){return Z("refCount")}incRef(t){return Z("incRef")}timerAvailable(){return!0}time(t){return Z("time")}read(t){return Z("read")}readSync(t){return Z("readSync")}readToGPU(t,n){return Z("readToGPU")}numDataIds(){return Z("numDataIds")}disposeData(t,n){return Z("disposeData")}write(t,n,r){return Z("write")}move(t,n,r,s,o){return Z("move")}memory(){return Z("memory")}floatPrecision(){return Z("floatPrecision")}epsilon(){return this.floatPrecision()===32?Yn:Jn}dispose(){return Z("dispose")}}function Z(e){throw new Error(`'${e}' not yet implemented or not found in the registry. This kernel may not be supported by the tfjs backend you have chosen`)}/**
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
 */function qe(e){let t=e.length,n=0;for(;t>0;)n=Math.random()*t|0,t--,Lt(e,t,n)}function tr(e,t){if(e.length!==t.length)throw new Error(`Array sizes must match to be shuffled together First array length was ${e.length}Second array length was ${t.length}`);let n=e.length,r=0;for(;n>0;)r=Math.random()*n|0,n--,Lt(e,n,r),Lt(t,n,r)}function Ft(e,t,n){return Math.max(e,Math.min(t,n))}function er(e){return e%2===0?e:e+1}function Lt(e,t,n){const r=e[t];e[t]=e[n],e[n]=r}function nr(e){let t=0;for(let n=0;n<e.length;n++)t+=e[n];return t}function rr(e,t){const n=Math.random();return t*n+(1-n)*e}function sr(e,t){let n=0;for(let r=0;r<e.length;r++){const s=Number(e[r])-Number(t[r]);n+=s*s}return n}function k(e,t){if(!e)throw new Error(typeof t=="string"?t:t())}function je(e,t,n=""){k(Vt(e,t),()=>n+` Shapes ${e} and ${t} must match`)}function or(e){k(e!=null,()=>"The input to the tensor constructor must be a non-null value.")}function _t(e,t=[],n=!1){if(t==null&&(t=[]),Array.isArray(e)||rt(e)&&!n)for(let r=0;r<e.length;++r)_t(e[r],t,n);else t.push(e);return t}function O(e){if(e.length===0)return 1;let t=e[0];for(let n=1;n<e.length;n++)t*=e[n];return t}function ir(e){return e.length===0}function Vt(e,t){if(e===t)return!0;if(e==null||t==null||e.length!==t.length)return!1;for(let n=0;n<e.length;n++)if(e[n]!==t[n])return!1;return!0}function Pt(e){return e%1===0}function ar(e){if(Math.tanh!=null)return Math.tanh(e);if(e===1/0)return 1;if(e===-1/0)return-1;{const t=Math.exp(2*e);return(t-1)/(t+1)}}function lr(e){const t=Math.ceil(Math.sqrt(e));return[t,Math.ceil(e/t)]}function cr(e){const t=new Uint32Array(e);for(let n=0;n<e;++n)t[n]=n;return qe(t),t}function $t(e,t){return t<=e.length?e:e+" ".repeat(t-e.length)}function ur(e,t=s=>0,n,r=setTimeout){return new Promise((s,o)=>{let i=0;const a=()=>{if(e()){s();return}i++;const l=t(i);if(n!=null&&i>=n){o();return}r(a,l)};a()})}function fr(e,t){let n=1,r=-1;for(let o=0;o<e.length;++o)if(e[o]>=0)n*=e[o];else if(e[o]===-1){if(r!==-1)throw Error(`Shapes can only have 1 implicit size. Found -1 at dim ${r} and dim ${o}`);r=o}else if(e[o]<0)throw Error(`Shapes can not be < 0. Found ${e[o]} at dim ${o}`);if(r===-1){if(t>0&&t!==n)throw Error(`Size(${t}) must match the product of shape ${e}`);return e}if(n===0)throw Error(`Cannot infer the missing size in [${e}] when there are 0 elements`);if(t%n!==0)throw Error(`The implicit shape can't be a fractional number. Got ${t} / ${n}`);const s=e.slice();return s[r]=t/n,s}function He(e,t){const n=t.length;return e=e==null?t.map((r,s)=>s):[].concat(e),k(e.every(r=>r>=-n&&r<n),()=>`All values in axis param must be in range [-${n}, ${n}) but got axis ${e}`),k(e.every(r=>Pt(r)),()=>`All values in axis param must be integers but got axis ${e}`),e.map(r=>r<0?n+r:r)}function hr(e,t){const n=[],r=[],s=t!=null&&Array.isArray(t)&&t.length===0,o=t==null||s?null:He(t,e).sort();let i=0;for(let a=0;a<e.length;++a){if(o!=null){if(o[i]===a&&e[a]!==1)throw new Error(`Can't squeeze axis ${a} since its dim '${e[a]}' is not 1`);(o[i]==null||o[i]>a)&&e[a]===1&&(n.push(e[a]),r.push(a)),o[i]<=a&&i++}e[a]!==1&&(n.push(e[a]),r.push(a))}return{newShape:n,keptDims:r}}function dr(e,t){let n=null;if(e==null||e==="float32")n=new Float32Array(t);else if(e==="int32")n=new Int32Array(t);else if(e==="bool")n=new Uint8Array(t);else throw new Error(`Unknown data type ${e}`);return n}function It(e,t){let n=null;if(e==null||e==="float32")n=new Float32Array(t);else if(e==="int32")n=new Int32Array(t);else if(e==="bool")n=new Uint8Array(t);else if(e==="string")n=new Array(t);else throw new Error(`Unknown data type ${e}`);return n}function Ke(e,t){for(let n=0;n<e.length;n++){const r=e[n];if(isNaN(r)||!isFinite(r))throw Error(`A tensor of type ${t} being uploaded contains ${r}.`)}}function Ze(e){return e==="bool"||e==="complex64"||e==="float32"||e==="int32"||e==="string"}function gr(e,t){return!(t==="complex64"||t==="float32"&&e!=="complex64"||t==="int32"&&e!=="float32"&&e!=="complex64"||t==="bool"&&e==="bool")}function rt(e){return e instanceof Float32Array||e instanceof Int32Array||e instanceof Uint8Array||e instanceof Uint8ClampedArray}function te(e){if(e==="float32"||e==="int32")return 4;if(e==="complex64")return 8;if(e==="bool")return 1;throw new Error(`Unknown dtype ${e}`)}function Xe(e){if(e==null)return 0;let t=0;return e.forEach(n=>t+=n.length),t}function zt(e){return typeof e=="string"||e instanceof String}function Ye(e){return typeof e=="boolean"}function Je(e){return typeof e=="number"}function qt(e){return Array.isArray(e)?qt(e[0]):e instanceof Float32Array?"float32":e instanceof Int32Array||e instanceof Uint8Array||e instanceof Uint8ClampedArray?"int32":Je(e)?"float32":zt(e)?"string":Ye(e)?"bool":"float32"}function ee(e){return!!(e&&e.constructor&&e.call&&e.apply)}function Ct(e,t){for(let n=t;n<e;++n)if(e%n===0)return n;return e}function gt(e){const t=e.length;if(t<2)return[];const n=new Array(t-1);n[t-2]=e[t-1];for(let r=t-3;r>=0;--r)n[r]=n[r+1]*e[r+1];return n}function Qe(e,t,n,r=!1){const s=new Array;if(t.length===1){const o=t[0]*(r?2:1);for(let i=0;i<o;i++)s[i]=n[e+i]}else{const o=t[0],i=t.slice(1),a=i.reduce((l,u)=>l*u)*(r?2:1);for(let l=0;l<o;l++)s[l]=Qe(e+l*a,i,n,r)}return s}function wt(e,t,n=!1){if(e.length===0)return t[0];const r=e.reduce((s,o)=>s*o)*(n?2:1);if(r===0)return[];if(r!==t.length)throw new Error(`[${e}] does not match the input size ${t.length}${n?" for a complex tensor":""}.`);return Qe(0,e,t,n)}function tn(e,t){const n=Mt(e,t);for(let r=0;r<n.length;r++)n[r]=1;return n}function Mt(e,t){if(t==null||t==="float32"||t==="complex64")return new Float32Array(e);if(t==="int32")return new Int32Array(e);if(t==="bool")return new Uint8Array(e);throw new Error(`Unknown data type ${t}`)}function pr(e,t){const n=e.reduce((r,s)=>r*s,1);if(t==null||t==="float32")return wt(e,new Float32Array(n));if(t==="int32")return wt(e,new Int32Array(n));if(t==="bool")return wt(e,new Uint8Array(n));throw new Error(`Unknown data type ${t}`)}function we(e){e.forEach(t=>{k(Number.isInteger(t)&&t>=0,()=>`Tensor must have a shape comprised of positive integers but got shape [${e}].`)})}function mr(e,t,n){if(t===0)return 0;if(t===1)return e[0];let r=e[e.length-1];for(let s=0;s<e.length-1;++s)r+=n[s]*e[s];return r}function wr(e,t,n){if(t===0)return[];if(t===1)return[e];const r=new Array(t);for(let s=0;s<r.length-1;++s)r[s]=Math.floor(e/n[s]),e-=r[s]*n[s];return r[r.length-1]=e,r}function ye(e){return e&&e.then&&typeof e.then=="function"}/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */const _e="tfjsflags";class yr{constructor(t){this.global=t,this.flags={},this.flagRegistry={},this.urlFlags={},this.getQueryParams=br,this.populateURLFlags()}setPlatform(t,n){this.platform!=null&&(F().getBool("IS_TEST")||F().getBool("PROD")||console.warn(`Platform ${this.platformName} has already been set. Overwriting the platform with ${t}.`)),this.platformName=t,this.platform=n}registerFlag(t,n,r){if(this.flagRegistry[t]={evaluationFn:n,setHook:r},this.urlFlags[t]!=null){const s=this.urlFlags[t];F().getBool("IS_TEST")||F().getBool("PROD")||console.warn(`Setting feature override from URL ${t}: ${s}.`),this.set(t,s)}}async getAsync(t){return t in this.flags?this.flags[t]:(this.flags[t]=await this.evaluateFlag(t),this.flags[t])}get(t){if(t in this.flags)return this.flags[t];const n=this.evaluateFlag(t);if(ye(n))throw new Error(`Flag ${t} cannot be synchronously evaluated. Please use getAsync() instead.`);return this.flags[t]=n,this.flags[t]}getNumber(t){return this.get(t)}getBool(t){return this.get(t)}getFlags(){return this.flags}get features(){return this.flags}set(t,n){if(this.flagRegistry[t]==null)throw new Error(`Cannot set flag ${t} as it has not been registered.`);this.flags[t]=n,this.flagRegistry[t].setHook!=null&&this.flagRegistry[t].setHook(n)}evaluateFlag(t){if(this.flagRegistry[t]==null)throw new Error(`Cannot evaluate flag '${t}': no evaluation function found.`);return this.flagRegistry[t].evaluationFn()}setFlags(t){this.flags=Object.assign({},t)}reset(){this.flags={},this.urlFlags={},this.populateURLFlags()}populateURLFlags(){if(typeof this.global>"u"||typeof this.global.location>"u"||typeof this.global.location.search>"u")return;const t=this.getQueryParams(this.global.location.search);_e in t&&t[_e].split(",").forEach(r=>{const[s,o]=r.split(":");this.urlFlags[s]=Er(s,o)})}}function br(e){const t={};return e.replace(/[?&]([^=?&]+)(?:=([^&]*))?/g,(n,...r)=>(Sr(t,r[0],r[1]),r.join("="))),t}function Sr(e,t,n){e[decodeURIComponent(t)]=decodeURIComponent(n||"")}function Er(e,t){if(t=t.toLowerCase(),t==="true"||t==="false")return t==="true";if(`${+t}`===t)return+t;throw new Error(`Could not parse value flag value ${t} for flag ${e}.`)}function F(){return en}let en=null;function Ir(e){en=e}/**
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
 */let Ht;function nn(){if(Ht==null){let e;if(typeof window<"u")e=window;else if(typeof global<"u")e=global;else if(typeof process<"u")e=process;else if(typeof self<"u")e=self;else throw new Error("Could not find a global object");Ht=e}return Ht}function kr(){const e=nn();return e._tfGlobals==null&&(e._tfGlobals=new Map),e._tfGlobals}function be(e,t){const n=kr();if(n.has(e))return n.get(e);{const r=t();return n.set(e,r),n.get(e)}}const ji="Abs",Hi="Acos",Ki="Acosh",Tr="Add",Zi="AddN",Xi="All",Yi="Any",Ji="ArgMax",Qi="ArgMin",ta="Asin",ea="Asinh",na="Atan",ra="Atanh",sa="Atan2",oa="AvgPool",ia="AvgPoolGrad",aa="AvgPool3D",la="AvgPool3DGrad",ca="BatchMatMul",ua="BatchToSpaceND",fa="Bincount",ha="BroadcastTo",da="BroadcastArgs",rn="Cast",ga="Ceil",pa="ClipByValue",Ar="Complex",ma="ComplexAbs",wa="Concat",ya="Conv2D",ba="Conv2DBackpropFilter",Sa="Conv2DBackpropInput",Ea="Conv3D",Ia="Conv3DBackpropFilterV2",ka="Conv3DBackpropInputV2",Ta="Cos",Aa="Cosh",$a="Cumprod",Fa="Cumsum",Ma="CropAndResize",va="DenseBincount",xa="DepthToSpace",_a="DepthwiseConv2dNative",Da="DepthwiseConv2dNativeBackpropFilter",Ba="DepthwiseConv2dNativeBackpropInput",Ra="Diag",Na="Dilation2D",Oa="Dilation2DBackpropInput",La="Dilation2DBackpropFilter",Pa="RealDiv",Ca="Einsum",$r="Elu",Ua="EluGrad",Ga="Erf",Wa="Equal",Va="Exp",za="ExpandDims",qa="Expm1",ja="FFT",Ha="Fill",Ka="FlipLeftRight",Za="Floor",Xa="FloorDiv",Ya="FusedBatchNorm",Ja="GatherV2",Qa="GatherNd",tl="Greater",el="GreaterEqual",sn="Identity",nl="IFFT",rl="Imag",sl="IsFinite",ol="IsInf",il="IsNan",Fr="LeakyRelu",al="Less",ll="LessEqual",cl="LinSpace",ul="Log",fl="Log1p",hl="LogicalAnd",dl="LogicalNot",gl="LogicalOr",pl="LogicalXor",ml="LogSoftmax",wl="LowerBound",yl="LRN",bl="LRNGrad",Sl="Max",El="Maximum",Il="MaxPool",kl="MaxPoolGrad",Tl="MaxPool3D",Al="MaxPool3DGrad",$l="MaxPoolWithArgmax",Fl="Mean",Ml="Min",vl="Minimum",xl="MirrorPad",_l="Mod",Dl="Multinomial",Mr="Multiply",Bl="Neg",Rl="NotEqual",Nl="NonMaxSuppressionV3",Ol="NonMaxSuppressionV4",Ll="NonMaxSuppressionV5",Pl="OnesLike",Cl="OneHot",Ul="Pack",Gl="PadV2",Wl="Pool",Vl="Pow",vr="Prelu",zl="Prod",ql="RaggedGather",jl="RaggedTensorToTensor",Hl="Range",Kl="Real",Zl="Reciprocal",xr="Relu",_r="Reshape",Xl="ResizeNearestNeighbor",Yl="ResizeNearestNeighborGrad",Jl="ResizeBilinear",Ql="ResizeBilinearGrad",Dr="Relu6",tc="Reverse",ec="Round",nc="Rsqrt",rc="ScatterNd",sc="SearchSorted",oc="Select",ic="Selu",Br="Slice",ac="Sin",lc="Sinh",cc="Sign",Rr="Sigmoid",uc="Softplus",fc="Sqrt",Nr="Sum",hc="SpaceToBatchND",dc="SplitV",gc="Softmax",pc="SparseFillEmptyRows",mc="SparseReshape",wc="SparseSegmentMean",yc="SparseSegmentSum",bc="SparseToDense",Sc="SquaredDifference",Ec="Square",Ic="StridedSlice",kc="StringNGrams",Tc="StringSplit",Ac="StringToHashBucketFast",$c="Sub",Fc="Tan",Mc="Tanh",vc="Tile",xc="TopK",_c="Transform",Dc="Transpose",Bc="Unique",Rc="Unpack",Nc="UnsortedSegmentSum",Oc="UpperBound",Lc="ZerosLike",Or="Step",Pc="FromPixels",Cc="RotateWithOffset",Uc="_FusedMatMul",Gc="FusedConv2D",Wc="FusedDepthwiseConv2D";/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function st(...e){F().getBool("IS_TEST")||F().getBool("PROD")||console.warn(...e)}function Lr(...e){F().getBool("IS_TEST")||F().getBool("PROD")||console.log(...e)}/**
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
 */const St=be("kernelRegistry",()=>new Map),vt=be("gradRegistry",()=>new Map);function De(e,t){const n=Se(e,t);return St.get(n)}function Be(e){return vt.get(e)}function ne(e){const t=St.entries(),n=[];for(;;){const{done:r,value:s}=t.next();if(r)break;const[o,i]=s,[a]=o.split("_");a===e&&n.push(i)}return n}function Pr(e){const{kernelName:t,backendName:n}=e,r=Se(t,n);St.has(r)&&st(`The kernel '${t}' for backend '${n}' is already registered`),St.set(r,e)}function Vc(e){const{kernelName:t}=e;vt.has(t)&&F().getBool("DEBUG")&&st(`Overriding the gradient for '${t}'`),vt.set(t,e)}function zc(e,t){const n=Se(e,t);if(!St.has(n))throw new Error(`The kernel '${e}' for backend '${t}' is not registered`);St.delete(n)}function qc(e){if(!vt.has(e))throw new Error(`The gradient '${e}' for backend is not registered`);vt.delete(e)}function jc(e,t){ne(e).forEach(r=>{const s=Object.assign({},r,{backendName:t});Pr(s)})}function Se(e,t){return`${t}_${e}`}var Kt,Re;function Cr(){if(Re)return Kt;Re=1,Kt=t;var e=null;try{e=new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0,1,13,2,96,0,1,127,96,4,127,127,127,127,1,127,3,7,6,0,1,1,1,1,1,6,6,1,127,1,65,0,11,7,50,6,3,109,117,108,0,1,5,100,105,118,95,115,0,2,5,100,105,118,95,117,0,3,5,114,101,109,95,115,0,4,5,114,101,109,95,117,0,5,8,103,101,116,95,104,105,103,104,0,0,10,191,1,6,4,0,35,0,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,126,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,127,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,128,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,129,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,130,34,4,66,32,135,167,36,0,32,4,167,11])),{}).exports}catch{}function t(p,c,E){this.low=p|0,this.high=c|0,this.unsigned=!!E}t.prototype.__isLong__,Object.defineProperty(t.prototype,"__isLong__",{value:!0});function n(p){return(p&&p.__isLong__)===!0}t.isLong=n;var r={},s={};function o(p,c){var E,A,D;return c?(p>>>=0,(D=0<=p&&p<256)&&(A=s[p],A)?A:(E=a(p,(p|0)<0?-1:0,!0),D&&(s[p]=E),E)):(p|=0,(D=-128<=p&&p<128)&&(A=r[p],A)?A:(E=a(p,p<0?-1:0,!1),D&&(r[p]=E),E))}t.fromInt=o;function i(p,c){if(isNaN(p))return c?T:S;if(c){if(p<0)return T;if(p>=y)return q}else{if(p<=-w)return B;if(p+1>=w)return z}return p<0?i(-p,c).neg():a(p%g|0,p/g|0,c)}t.fromNumber=i;function a(p,c,E){return new t(p,c,E)}t.fromBits=a;var l=Math.pow;function u(p,c,E){if(p.length===0)throw Error("empty string");if(p==="NaN"||p==="Infinity"||p==="+Infinity"||p==="-Infinity")return S;if(typeof c=="number"?(E=c,c=!1):c=!!c,E=E||10,E<2||36<E)throw RangeError("radix");var A;if((A=p.indexOf("-"))>0)throw Error("interior hyphen");if(A===0)return u(p.substring(1),c,E).neg();for(var D=i(l(E,8)),v=S,L=0;L<p.length;L+=8){var j=Math.min(8,p.length-L),Y=parseInt(p.substring(L,L+j),E);if(j<8){var G=i(l(E,j));v=v.mul(G).add(i(Y))}else v=v.mul(D),v=v.add(i(Y))}return v.unsigned=c,v}t.fromString=u;function d(p,c){return typeof p=="number"?i(p,c):typeof p=="string"?u(p,c):a(p.low,p.high,typeof c=="boolean"?c:p.unsigned)}t.fromValue=d;var f=65536,h=1<<24,g=f*f,y=g*g,w=y/2,I=o(h),S=o(0);t.ZERO=S;var T=o(0,!0);t.UZERO=T;var b=o(1);t.ONE=b;var M=o(1,!0);t.UONE=M;var x=o(-1);t.NEG_ONE=x;var z=a(-1,2147483647,!1);t.MAX_VALUE=z;var q=a(-1,-1,!0);t.MAX_UNSIGNED_VALUE=q;var B=a(0,-2147483648,!1);t.MIN_VALUE=B;var m=t.prototype;return m.toInt=function(){return this.unsigned?this.low>>>0:this.low},m.toNumber=function(){return this.unsigned?(this.high>>>0)*g+(this.low>>>0):this.high*g+(this.low>>>0)},m.toString=function(c){if(c=c||10,c<2||36<c)throw RangeError("radix");if(this.isZero())return"0";if(this.isNegative())if(this.eq(B)){var E=i(c),A=this.div(E),D=A.mul(E).sub(this);return A.toString(c)+D.toInt().toString(c)}else return"-"+this.neg().toString(c);for(var v=i(l(c,6),this.unsigned),L=this,j="";;){var Y=L.div(v),G=L.sub(Y.mul(v)).toInt()>>>0,N=G.toString(c);if(L=Y,L.isZero())return N+j;for(;N.length<6;)N="0"+N;j=""+N+j}},m.getHighBits=function(){return this.high},m.getHighBitsUnsigned=function(){return this.high>>>0},m.getLowBits=function(){return this.low},m.getLowBitsUnsigned=function(){return this.low>>>0},m.getNumBitsAbs=function(){if(this.isNegative())return this.eq(B)?64:this.neg().getNumBitsAbs();for(var c=this.high!=0?this.high:this.low,E=31;E>0&&(c&1<<E)==0;E--);return this.high!=0?E+33:E+1},m.isZero=function(){return this.high===0&&this.low===0},m.eqz=m.isZero,m.isNegative=function(){return!this.unsigned&&this.high<0},m.isPositive=function(){return this.unsigned||this.high>=0},m.isOdd=function(){return(this.low&1)===1},m.isEven=function(){return(this.low&1)===0},m.equals=function(c){return n(c)||(c=d(c)),this.unsigned!==c.unsigned&&this.high>>>31===1&&c.high>>>31===1?!1:this.high===c.high&&this.low===c.low},m.eq=m.equals,m.notEquals=function(c){return!this.eq(c)},m.neq=m.notEquals,m.ne=m.notEquals,m.lessThan=function(c){return this.comp(c)<0},m.lt=m.lessThan,m.lessThanOrEqual=function(c){return this.comp(c)<=0},m.lte=m.lessThanOrEqual,m.le=m.lessThanOrEqual,m.greaterThan=function(c){return this.comp(c)>0},m.gt=m.greaterThan,m.greaterThanOrEqual=function(c){return this.comp(c)>=0},m.gte=m.greaterThanOrEqual,m.ge=m.greaterThanOrEqual,m.compare=function(c){if(n(c)||(c=d(c)),this.eq(c))return 0;var E=this.isNegative(),A=c.isNegative();return E&&!A?-1:!E&&A?1:this.unsigned?c.high>>>0>this.high>>>0||c.high===this.high&&c.low>>>0>this.low>>>0?-1:1:this.sub(c).isNegative()?-1:1},m.comp=m.compare,m.negate=function(){return!this.unsigned&&this.eq(B)?B:this.not().add(b)},m.neg=m.negate,m.add=function(c){n(c)||(c=d(c));var E=this.high>>>16,A=this.high&65535,D=this.low>>>16,v=this.low&65535,L=c.high>>>16,j=c.high&65535,Y=c.low>>>16,G=c.low&65535,N=0,J=0,C=0,K=0;return K+=v+G,C+=K>>>16,K&=65535,C+=D+Y,J+=C>>>16,C&=65535,J+=A+j,N+=J>>>16,J&=65535,N+=E+L,N&=65535,a(C<<16|K,N<<16|J,this.unsigned)},m.subtract=function(c){return n(c)||(c=d(c)),this.add(c.neg())},m.sub=m.subtract,m.multiply=function(c){if(this.isZero())return S;if(n(c)||(c=d(c)),e){var E=e.mul(this.low,this.high,c.low,c.high);return a(E,e.get_high(),this.unsigned)}if(c.isZero())return S;if(this.eq(B))return c.isOdd()?B:S;if(c.eq(B))return this.isOdd()?B:S;if(this.isNegative())return c.isNegative()?this.neg().mul(c.neg()):this.neg().mul(c).neg();if(c.isNegative())return this.mul(c.neg()).neg();if(this.lt(I)&&c.lt(I))return i(this.toNumber()*c.toNumber(),this.unsigned);var A=this.high>>>16,D=this.high&65535,v=this.low>>>16,L=this.low&65535,j=c.high>>>16,Y=c.high&65535,G=c.low>>>16,N=c.low&65535,J=0,C=0,K=0,Bt=0;return Bt+=L*N,K+=Bt>>>16,Bt&=65535,K+=v*N,C+=K>>>16,K&=65535,K+=L*G,C+=K>>>16,K&=65535,C+=D*N,J+=C>>>16,C&=65535,C+=v*G,J+=C>>>16,C&=65535,C+=L*Y,J+=C>>>16,C&=65535,J+=A*N+D*G+v*Y+L*j,J&=65535,a(K<<16|Bt,J<<16|C,this.unsigned)},m.mul=m.multiply,m.divide=function(c){if(n(c)||(c=d(c)),c.isZero())throw Error("division by zero");if(e){if(!this.unsigned&&this.high===-2147483648&&c.low===-1&&c.high===-1)return this;var E=(this.unsigned?e.div_u:e.div_s)(this.low,this.high,c.low,c.high);return a(E,e.get_high(),this.unsigned)}if(this.isZero())return this.unsigned?T:S;var A,D,v;if(this.unsigned){if(c.unsigned||(c=c.toUnsigned()),c.gt(this))return T;if(c.gt(this.shru(1)))return M;v=T}else{if(this.eq(B)){if(c.eq(b)||c.eq(x))return B;if(c.eq(B))return b;var L=this.shr(1);return A=L.div(c).shl(1),A.eq(S)?c.isNegative()?b:x:(D=this.sub(c.mul(A)),v=A.add(D.div(c)),v)}else if(c.eq(B))return this.unsigned?T:S;if(this.isNegative())return c.isNegative()?this.neg().div(c.neg()):this.neg().div(c).neg();if(c.isNegative())return this.div(c.neg()).neg();v=S}for(D=this;D.gte(c);){A=Math.max(1,Math.floor(D.toNumber()/c.toNumber()));for(var j=Math.ceil(Math.log(A)/Math.LN2),Y=j<=48?1:l(2,j-48),G=i(A),N=G.mul(c);N.isNegative()||N.gt(D);)A-=Y,G=i(A,this.unsigned),N=G.mul(c);G.isZero()&&(G=b),v=v.add(G),D=D.sub(N)}return v},m.div=m.divide,m.modulo=function(c){if(n(c)||(c=d(c)),e){var E=(this.unsigned?e.rem_u:e.rem_s)(this.low,this.high,c.low,c.high);return a(E,e.get_high(),this.unsigned)}return this.sub(this.div(c).mul(c))},m.mod=m.modulo,m.rem=m.modulo,m.not=function(){return a(~this.low,~this.high,this.unsigned)},m.and=function(c){return n(c)||(c=d(c)),a(this.low&c.low,this.high&c.high,this.unsigned)},m.or=function(c){return n(c)||(c=d(c)),a(this.low|c.low,this.high|c.high,this.unsigned)},m.xor=function(c){return n(c)||(c=d(c)),a(this.low^c.low,this.high^c.high,this.unsigned)},m.shiftLeft=function(c){return n(c)&&(c=c.toInt()),(c&=63)===0?this:c<32?a(this.low<<c,this.high<<c|this.low>>>32-c,this.unsigned):a(0,this.low<<c-32,this.unsigned)},m.shl=m.shiftLeft,m.shiftRight=function(c){return n(c)&&(c=c.toInt()),(c&=63)===0?this:c<32?a(this.low>>>c|this.high<<32-c,this.high>>c,this.unsigned):a(this.high>>c-32,this.high>=0?0:-1,this.unsigned)},m.shr=m.shiftRight,m.shiftRightUnsigned=function(c){if(n(c)&&(c=c.toInt()),c&=63,c===0)return this;var E=this.high;if(c<32){var A=this.low;return a(A>>>c|E<<32-c,E>>>c,this.unsigned)}else return c===32?a(E,0,this.unsigned):a(E>>>c-32,0,this.unsigned)},m.shru=m.shiftRightUnsigned,m.shr_u=m.shiftRightUnsigned,m.toSigned=function(){return this.unsigned?a(this.low,this.high,!1):this},m.toUnsigned=function(){return this.unsigned?this:a(this.low,this.high,!0)},m.toBytes=function(c){return c?this.toBytesLE():this.toBytesBE()},m.toBytesLE=function(){var c=this.high,E=this.low;return[E&255,E>>>8&255,E>>>16&255,E>>>24,c&255,c>>>8&255,c>>>16&255,c>>>24]},m.toBytesBE=function(){var c=this.high,E=this.low;return[c>>>24,c>>>16&255,c>>>8&255,c&255,E>>>24,E>>>16&255,E>>>8&255,E&255]},t.fromBytes=function(c,E,A){return A?t.fromBytesLE(c,E):t.fromBytesBE(c,E)},t.fromBytesLE=function(c,E){return new t(c[0]|c[1]<<8|c[2]<<16|c[3]<<24,c[4]|c[5]<<8|c[6]<<16|c[7]<<24,E)},t.fromBytesBE=function(c,E){return new t(c[4]<<24|c[5]<<16|c[6]<<8|c[7],c[0]<<24|c[1]<<16|c[2]<<8|c[3],E)},Kt}var on=Cr();const an=Kn(on),Ur=Xn({__proto__:null,default:an},[on]);/**
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
 */const lt=an||Ur;function Dt(e){return lt.fromString(e,!0,16)}const ln=Dt("c3a5c85c97cb3127"),at=Dt("b492b66fbe98f273"),V=Dt("9ae16a3b2f90404f");function re(e){return e.xor(e.shru(47))}function cn(e,t,n){const r=e.slice(t,t+n);return lt.fromBytes(Array.from(r),!0,!0)}function _(e,t){return cn(e,t,8)}function Ne(e,t){return cn(e,t,4)}function P(e,t){return t===0?e:e.shru(t).or(e.shl(64-t))}function it(e,t,n=Dt("9ddfea08eb382d69")){let r=e.xor(t).mul(n);r=r.xor(r.shru(47));let s=t.xor(r).mul(n);return s=s.xor(s.shru(47)),s=s.mul(n),s}function Gr(e,t,n,r,s,o){s=s.add(e),o=P(o.add(s).add(r),21);const i=s;return s=s.add(t),s=s.add(n),o=o.add(P(s,44)),[s.add(r),o.add(i)]}function Rt(e,t,n,r){return Gr(_(e,t),_(e,t+8),_(e,t+16),_(e,t+24),n,r)}function Wr(e,t=e.length){if(t>=8){const n=V.add(t*2),r=_(e,0).add(V),s=_(e,t-8),o=P(s,37).mul(n).add(r),i=P(r,25).add(s).mul(n);return it(o,i,n)}if(t>=4){const n=V.add(t*2),r=Ne(e,0);return it(r.shl(3).add(t),Ne(e,t-4),n)}if(t>0){const n=e[0],r=e[t>>1],s=e[t-1],o=n+(r<<8),i=t+(s<<2);return re(V.mul(o).xor(ln.mul(i))).mul(V)}return V}function Vr(e,t=e.length){const n=V.add(t*2),r=_(e,0).mul(at),s=_(e,8),o=_(e,t-8).mul(n),i=_(e,t-16).mul(V);return it(P(r.add(s),43).add(P(o,30)).add(i),r.add(P(s.add(V),18)).add(o),n)}function zr(e,t=e.length){const n=V.add(t*2),r=_(e,0).mul(V),s=_(e,8),o=_(e,t-8).mul(n),i=_(e,t-16).mul(V),a=P(r.add(s),43).add(P(o,30)).add(i),l=it(a,r.add(P(s.add(V),18)).add(o),n),u=_(e,16).mul(n),d=_(e,24),f=a.add(_(e,t-32)).mul(n),h=l.add(_(e,t-24)).mul(n);return it(P(u.add(d),43).add(P(f,30)).add(h),u.add(P(d.add(r),18)).add(f),n)}function un(e,t=e.length){const n=lt.fromNumber(81,!0);if(t<=32)return t<=16?Wr(e,t):Vr(e,t);if(t<=64)return zr(e,t);let r=n,s=n.mul(at).add(113),o=re(s.mul(V).add(113)).mul(V),i=[lt.UZERO,lt.UZERO],a=[lt.UZERO,lt.UZERO];r=r.mul(V).add(_(e,0));let l=0;const u=(t-1>>6)*64,d=u+(t-1&63)-63;do r=P(r.add(s).add(i[0]).add(_(e,l+8)),37).mul(at),s=P(s.add(i[1]).add(_(e,l+48)),42).mul(at),r=r.xor(a[1]),s=s.add(i[0]).add(_(e,l+40)),o=P(o.add(a[0]),33).mul(at),i=Rt(e,l,i[1].mul(at),r.add(a[0])),a=Rt(e,l+32,o.add(a[1]),s.add(_(e,l+16))),[o,r]=[r,o],l+=64;while(l!==u);const f=at.add(o.and(255).shl(1));return l=d,a[0]=a[0].add(t-1&63),i[0]=i[0].add(a[0]),a[0]=a[0].add(i[0]),r=P(r.add(s).add(i[0]).add(_(e,l+8)),37).mul(f),s=P(s.add(i[1]).add(_(e,l+48)),42).mul(f),r=r.xor(a[1].mul(9)),s=s.add(i[0].mul(9).add(_(e,l+40))),o=P(o.add(a[0]),33).mul(f),i=Rt(e,l,i[1].mul(f),r.add(a[0])),a=Rt(e,l+32,o.add(a[1]),s.add(_(e,l+16))),[o,r]=[r,o],it(it(i[0],a[0],f).add(re(s).mul(ln)).add(o),it(i[1],a[1],f).add(r),f)}/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */function qr(e,t){return t==="string"?ut(e):jt([e],t)}function jr(e,t){return e instanceof Float32Array&&t==="float32"||e instanceof Int32Array&&t==="int32"||e instanceof Uint8Array&&t==="bool"}function jt(e,t){if(t==="string")throw new Error("Cannot convert a string[] to a TypedArray");if(Array.isArray(e)&&(e=_t(e)),F().getBool("DEBUG")&&Ke(e,t),jr(e,t))return e;if(t==null||t==="float32"||t==="complex64")return new Float32Array(e);if(t==="int32")return new Int32Array(e);if(t==="bool"){const n=new Uint8Array(e.length);for(let r=0;r<n.length;++r)Math.round(e[r])!==0&&(n[r]=1);return n}else throw new Error(`Unknown data type ${t}`)}function xt(){return F().platform.now()}function Hr(e,t){return F().platform.fetch(e,t)}function ut(e,t="utf-8"){return t=t||"utf-8",F().platform.encode(e,t)}function Ut(e,t="utf-8"){return t=t||"utf-8",F().platform.decode(e,t)}const Hc=Object.freeze(Object.defineProperty({__proto__:null,arraysEqual:Vt,assert:k,assertNonNegativeIntegerDimensions:we,assertNonNull:or,assertShapesMatch:je,bytesFromStringArray:Xe,bytesPerElement:te,checkConversionForErrors:Ke,clamp:Ft,computeStrides:gt,createScalarValue:qr,createShuffledIndices:cr,decodeString:Ut,distSquared:sr,encodeString:ut,fetch:Hr,fingerPrint64:un,flatten:_t,getArrayFromDType:It,getTypedArrayFromDType:dr,hasEncodingLoss:gr,hexToLong:Dt,indexToLoc:wr,inferDtype:qt,inferFromImplicitShape:fr,isBoolean:Ye,isFunction:ee,isInt:Pt,isNumber:Je,isPromise:ye,isScalarShape:ir,isString:zt,isTypedArray:rt,isValidDtype:Ze,locToIndex:mr,makeOnesTypedArray:tn,makeZerosNestedTypedArray:pr,makeZerosTypedArray:Mt,nearestDivisor:Ct,nearestLargerEven:er,now:xt,parseAxisParam:He,randUniform:rr,repeatedTry:ur,rightPad:$t,shuffle:qe,shuffleCombo:tr,sizeFromShape:O,sizeToSquarishShape:lr,squeezeShape:hr,sum:nr,swap:Lt,tanh:ar,toNestedArray:wt,toTypedArray:jt},Symbol.toStringTag,{value:"Module"}));/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */class Kr{constructor(t,n){this.backendTimer=t,this.logger=n,n==null&&(this.logger=new Xr)}profileKernel(t,n,r){let s;const o=()=>{s=r()};let i;const a=xt();if(this.backendTimer.timerAvailable())i=this.backendTimer.time(o);else{o();for(const u of s)u.dataSync();i=Promise.resolve({kernelMs:xt()-a})}if(F().getBool("CHECK_COMPUTATION_FOR_ERRORS"))for(let u=0;u<s.length;u++){const d=s[u];d.data().then(f=>{Zr(f,d.dtype,t)})}return{kernelName:t,outputs:s,inputs:n,timeMs:i.then(u=>u.kernelMs),extraInfo:i.then(u=>u.getExtraProfileInfo!=null?u.getExtraProfileInfo():"")}}logKernelProfile(t){const{kernelName:n,outputs:r,timeMs:s,inputs:o,extraInfo:i}=t;r.forEach(a=>{Promise.all([a.data(),s,i]).then(l=>{this.logger.logKernelProfile(n,a,l[0],l[1],o,l[2])})})}}function Zr(e,t,n){if(t!=="float32")return!1;for(let r=0;r<e.length;r++){const s=e[r];if(isNaN(s)||!isFinite(s))return console.warn(`Found ${s} in the result of '${n}'`),!0}return!1}class Xr{logKernelProfile(t,n,r,s,o,i){const a=typeof s=="number"?$t(`${s}ms`,9):s.error,l=$t(t,25),u=n.rank,d=n.size,f=$t(n.shape.toString(),14);let h="";for(const g in o){const y=o[g];if(y!=null){const w=y.shape||n.shape,I=w.length;h+=`${g}: ${I}D ${I>0?w:""} `}}console.log(`%c${l}	%c${a}	%c${u}D ${f}	%c${d}	%c${h}	%c${i}`,"font-weight:bold","color:red","color:blue","color: orange","color: green","color: steelblue")}}/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */function Yr(e,t,n){const r={},s={};for(let l=0;l<t.length;l++)r[t[l].id]=!0;for(let l=0;l<e.length;l++){const u=e[l],d=u.inputs;for(const f in d){const h=d[f];let g=!1;for(let y=0;y<t.length;y++)if(r[h.id]){u.outputs.forEach(w=>r[w.id]=!0),g=!0,s[u.id]=!0;break}if(g)break}}const o={};o[n.id]=!0;const i={};for(let l=e.length-1;l>=0;l--){const u=e[l],d=u.inputs;for(let f=0;f<u.outputs.length;f++)if(o[u.outputs[f].id]){for(const h in d)o[d[h].id]=!0,i[u.id]=!0;break}}const a=[];for(let l=0;l<e.length;l++){const u=e[l];if(s[u.id]&&i[u.id]){const d={};for(const h in u.inputs){const g=u.inputs[h];r[g.id]&&(d[h]=g)}const f=Object.assign({},u);f.inputs=d,f.outputs=u.outputs,a.push(f)}}return a}function Jr(e,t,n,r){for(let s=t.length-1;s>=0;s--){const o=t[s],i=[];if(o.outputs.forEach(l=>{const u=e[l.id];u!=null?i.push(u):i.push(null)}),o.gradient==null)throw new Error(`Cannot compute gradient: gradient function not found for ${o.kernelName}.`);const a=o.gradient(i);for(const l in o.inputs){if(!(l in a))throw new Error(`Cannot backprop through input ${l}. Available gradients found: ${Object.keys(a)}.`);const u=n(()=>a[l]());if(u.dtype!=="float32")throw new Error(`Error in gradient for op ${o.kernelName}. The gradient of input ${l} must have 'float32' dtype, but has '${u.dtype}'`);const d=o.inputs[l];if(!Vt(u.shape,d.shape))throw new Error(`Error in gradient for op ${o.kernelName}. The gradient of input '${l}' has shape '${u.shape}', which does not match the shape of the input '${d.shape}'`);if(e[d.id]==null)e[d.id]=u;else{const f=e[d.id];e[d.id]=r(f,u),f.dispose()}}}}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const Oe=20,kt=3,Zt=7;function Qr(e,t,n,r){const s=gt(t),o=ts(e,t,n,s),i=t.length,a=Nt(e,t,n,s,o),l=["Tensor"];return r&&(l.push(`  dtype: ${n}`),l.push(`  rank: ${i}`),l.push(`  shape: [${t}]`),l.push("  values:")),l.push(a.map(u=>"    "+u).join(`
`)),l.join(`
`)}function ts(e,t,n,r){const s=O(t),o=r[r.length-1],i=new Array(o).fill(0),a=t.length,l=n==="complex64"?At(e):e;if(a>1)for(let u=0;u<s/o;u++){const d=u*o;for(let f=0;f<o;f++)i[f]=Math.max(i[f],Tt(l[d+f],0,n).length)}return i}function Tt(e,t,n){let r;return Array.isArray(e)?r=`${parseFloat(e[0].toFixed(Zt))} + ${parseFloat(e[1].toFixed(Zt))}j`:zt(e)?r=`'${e}'`:n==="bool"?r=fn(e):r=parseFloat(e.toFixed(Zt)).toString(),$t(r,t)}function fn(e){return e===0?"false":"true"}function Nt(e,t,n,r,s,o=!0){const i=n==="complex64"?2:1,a=t[0],l=t.length;if(l===0){if(n==="complex64"){const w=At(e);return[Tt(w[0],0,n)]}return n==="bool"?[fn(e[0])]:[e[0].toString()]}if(l===1){if(a>Oe){const I=kt*i;let S=Array.from(e.slice(0,I)),T=Array.from(e.slice((a-kt)*i,a*i));return n==="complex64"&&(S=At(S),T=At(T)),["["+S.map((b,M)=>Tt(b,s[M],n)).join(", ")+", ..., "+T.map((b,M)=>Tt(b,s[a-kt+M],n)).join(", ")+"]"]}return["["+(n==="complex64"?At(e):Array.from(e)).map((I,S)=>Tt(I,s[S],n)).join(", ")+"]"]}const u=t.slice(1),d=r.slice(1),f=r[0]*i,h=[];if(a>Oe){for(let w=0;w<kt;w++){const I=w*f,S=I+f;h.push(...Nt(e.slice(I,S),u,n,d,s,!1))}h.push("...");for(let w=a-kt;w<a;w++){const I=w*f,S=I+f;h.push(...Nt(e.slice(I,S),u,n,d,s,w===a-1))}}else for(let w=0;w<a;w++){const I=w*f,S=I+f;h.push(...Nt(e.slice(I,S),u,n,d,s,w===a-1))}const g=l===2?",":"";h[0]="["+h[0]+g;for(let w=1;w<h.length-1;w++)h[w]=" "+h[w]+g;let y=`,
`;for(let w=2;w<l;w++)y+=`
`;return h[h.length-1]=" "+h[h.length-1]+"]"+(o?"":y),h}function At(e){const t=[];for(let n=0;n<e.length;n+=2)t.push([e[n],e[n+1]]);return t}/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */class es{constructor(t,n,r){if(this.dtype=n,this.shape=t.slice(),this.size=O(t),r!=null){const s=r.length;k(s===this.size,()=>`Length of values '${s}' does not match the size inferred by the shape '${this.size}'.`)}if(n==="complex64")throw new Error("complex64 dtype TensorBuffers are not supported. Please create a TensorBuffer for the real and imaginary parts separately and call tf.complex(real, imag).");this.values=r||It(n,this.size),this.strides=gt(t)}set(t,...n){n.length===0&&(n=[0]),k(n.length===this.rank,()=>`The number of provided coordinates (${n.length}) must match the rank (${this.rank})`);const r=this.locToIndex(n);this.values[r]=t}get(...t){t.length===0&&(t=[0]);let n=0;for(const s of t){if(s<0||s>=this.shape[n]){const o=`Requested out of range element at ${t}.   Buffer shape=${this.shape}`;throw new Error(o)}n++}let r=t[t.length-1];for(let s=0;s<t.length-1;++s)r+=this.strides[s]*t[s];return this.values[r]}locToIndex(t){if(this.rank===0)return 0;if(this.rank===1)return t[0];let n=t[t.length-1];for(let r=0;r<t.length-1;++r)n+=this.strides[r]*t[r];return n}indexToLoc(t){if(this.rank===0)return[];if(this.rank===1)return[t];const n=new Array(this.shape.length);for(let r=0;r<n.length-1;++r)n[r]=Math.floor(t/this.strides[r]),t-=n[r]*this.strides[r];return n[n.length-1]=t,n}get rank(){return this.shape.length}toTensor(){return tt().makeTensor(this.values,this.shape,this.dtype)}}let tt=null,pt=null;function ns(e){tt=e}function rs(e){pt=e}class Q{constructor(t,n,r,s){this.kept=!1,this.isDisposedInternal=!1,this.shape=t.slice(),this.dtype=n||"float32",this.size=O(t),this.strides=gt(t),this.dataId=r,this.id=s,this.rankType=this.rank<5?this.rank.toString():"higher"}get rank(){return this.shape.length}async buffer(){const t=await this.data();return pt.buffer(this.shape,this.dtype,t)}bufferSync(){return pt.buffer(this.shape,this.dtype,this.dataSync())}async array(){const t=await this.data();return wt(this.shape,t,this.dtype==="complex64")}arraySync(){return wt(this.shape,this.dataSync(),this.dtype==="complex64")}async data(){this.throwIfDisposed();const t=tt().read(this.dataId);if(this.dtype==="string"){const n=await t;try{return n.map(r=>Ut(r))}catch{throw new Error("Failed to decode the string bytes into utf-8. To get the original bytes, call tensor.bytes().")}}return t}dataToGPU(t){return this.throwIfDisposed(),tt().readToGPU(this.dataId,t)}dataSync(){this.throwIfDisposed();const t=tt().readSync(this.dataId);if(this.dtype==="string")try{return t.map(n=>Ut(n))}catch{throw new Error("Failed to decode the string bytes into utf-8. To get the original bytes, call tensor.bytes().")}return t}async bytes(){this.throwIfDisposed();const t=await tt().read(this.dataId);return this.dtype==="string"?t:new Uint8Array(t.buffer)}dispose(){this.isDisposed||(tt().disposeTensor(this),this.isDisposedInternal=!0)}get isDisposed(){return this.isDisposedInternal}throwIfDisposed(){if(this.isDisposed)throw new Error("Tensor is disposed.")}print(t=!1){return pt.print(this,t)}clone(){return this.throwIfDisposed(),pt.clone(this)}toString(t=!1){const n=this.dataSync();return Qr(n,this.shape,this.dtype,t)}cast(t){return this.throwIfDisposed(),pt.cast(this,t)}variable(t=!0,n,r){return this.throwIfDisposed(),tt().makeVariable(this,t,n,r)}}Object.defineProperty(Q,Symbol.hasInstance,{value:e=>!!e&&e.data!=null&&e.dataSync!=null&&e.throwIfDisposed!=null});function ss(){return be("Tensor",()=>Q)}ss();class se extends Q{constructor(t,n,r,s){super(t.shape,t.dtype,t.dataId,s),this.trainable=n,this.name=r}assign(t){if(t.dtype!==this.dtype)throw new Error(`dtype of the new value (${t.dtype}) and previous value (${this.dtype}) must match`);if(!Vt(t.shape,this.shape))throw new Error(`shape of the new value (${t.shape}) and previous value (${this.shape}) must match`);tt().disposeTensor(this),this.dataId=t.dataId,tt().incRef(this,null)}dispose(){tt().disposeVariable(this),this.isDisposedInternal=!0}}Object.defineProperty(se,Symbol.hasInstance,{value:e=>e instanceof Q&&e.assign!=null&&e.assign instanceof Function});/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */var Le;(function(e){e.R0="R0",e.R1="R1",e.R2="R2",e.R3="R3",e.R4="R4",e.R5="R5",e.R6="R6"})(Le||(Le={}));var oe;(function(e){e.float32="float32",e.int32="int32",e.bool="int32",e.complex64="complex64"})(oe||(oe={}));var ie;(function(e){e.float32="float32",e.int32="int32",e.bool="bool",e.complex64="complex64"})(ie||(ie={}));var ae;(function(e){e.float32="float32",e.int32="float32",e.bool="float32",e.complex64="complex64"})(ae||(ae={}));var le;(function(e){e.float32="complex64",e.int32="complex64",e.bool="complex64",e.complex64="complex64"})(le||(le={}));const os={float32:ae,int32:oe,bool:ie,complex64:le};function Ee(e,t){if(e==="string"||t==="string"){if(e==="string"&&t==="string")return"string";throw new Error(`Can not upcast ${e} with ${t}`)}return os[e][t]}function Kc(e){return Ee(e,"int32")}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function hn(e,t){if(e.dtype===t.dtype)return[e,t];const n=Ee(e.dtype,t.dtype);return[e.cast(n),t.cast(n)]}function is(e,t){k(e.dtype===t.dtype,()=>`The dtypes of the first(${e.dtype}) and second(${t.dtype}) input must match`)}function as(e,t){return t.some(n=>n.id===e.id)}function Ie(e){const t=[];return dn(e,t,new Set),t}function dn(e,t,n){if(e==null)return;if(e instanceof Q){t.push(e);return}if(!ls(e))return;const r=e;for(const s in r){const o=r[s];n.has(o)||(n.add(o),dn(o,t,n))}}function ls(e){return Array.isArray(e)||typeof e=="object"}const Zc=Object.freeze(Object.defineProperty({__proto__:null,assertTypesMatch:is,getTensorsInContainer:Ie,isTensorInList:as,makeTypesMatch:hn},Symbol.toStringTag,{value:"Module"}));/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function Xt(e){return e.kernelName!=null}class Pe{constructor(){this.registeredVariables={},this.nextTapeNodeId=0,this.numBytes=0,this.numTensors=0,this.numStringTensors=0,this.numDataBuffers=0,this.gradientDepth=0,this.kernelDepth=0,this.scopeStack=[],this.numDataMovesStack=[],this.nextScopeId=0,this.tensorInfo=new WeakMap,this.profiling=!1,this.activeProfile={newBytes:0,newTensors:0,peakBytes:0,kernels:[],result:null,get kernelNames(){return Array.from(new Set(this.kernels.map(t=>t.name)))}}}dispose(){for(const t in this.registeredVariables)this.registeredVariables[t].dispose()}}class Et{constructor(t){this.ENV=t,this.registry={},this.registryFactory={},this.pendingBackendInitId=0,this.state=new Pe}async ready(){if(this.pendingBackendInit!=null)return this.pendingBackendInit.then(()=>{});if(this.backendInstance!=null)return;const t=this.getSortedBackends();for(let n=0;n<t.length;n++){const r=t[n];if(await this.initializeBackend(r).success){await this.setBackend(r);return}}throw new Error("Could not initialize any backends, all backend initializations failed.")}get backend(){if(this.pendingBackendInit!=null)throw new Error(`Backend '${this.backendName}' has not yet been initialized. Make sure to await tf.ready() or await tf.setBackend() before calling other methods`);if(this.backendInstance==null){const{name:t,asyncInit:n}=this.initializeBackendsAndReturnBest();if(n)throw new Error(`The highest priority backend '${t}' has not yet been initialized. Make sure to await tf.ready() or await tf.setBackend() before calling other methods`);this.setBackend(t)}return this.backendInstance}backendNames(){return Object.keys(this.registryFactory)}findBackend(t){if(!(t in this.registry))if(t in this.registryFactory){const{asyncInit:n}=this.initializeBackend(t);if(n)return null}else return null;return this.registry[t]}findBackendFactory(t){return t in this.registryFactory?this.registryFactory[t].factory:null}registerBackend(t,n,r=1){return t in this.registryFactory?(st(`${t} backend was already registered. Reusing existing backend factory.`),!1):(this.registryFactory[t]={factory:n,priority:r},!0)}async setBackend(t){if(this.registryFactory[t]==null)throw new Error(`Backend name '${t}' not found in registry`);if(this.backendName=t,this.registry[t]==null){this.backendInstance=null;const{success:n,asyncInit:r}=this.initializeBackend(t);if(!(r?await n:n))return!1}return this.backendInstance=this.registry[t],this.setupRegisteredKernels(),this.profiler=new Kr(this.backendInstance),!0}setupRegisteredKernels(){ne(this.backendName).forEach(n=>{n.setupFunc!=null&&n.setupFunc(this.backendInstance)})}disposeRegisteredKernels(t){ne(t).forEach(r=>{r.disposeFunc!=null&&r.disposeFunc(this.registry[t])})}initializeBackend(t){const n=this.registryFactory[t];if(n==null)throw new Error(`Cannot initialize backend ${t}, no registration found.`);try{const r=n.factory();if(r&&!(r instanceof Qn)&&typeof r.then=="function"){const s=++this.pendingBackendInitId,o=r.then(i=>s<this.pendingBackendInitId?!1:(this.registry[t]=i,this.pendingBackendInit=null,!0)).catch(i=>(s<this.pendingBackendInitId||(this.pendingBackendInit=null,st(`Initialization of backend ${t} failed`),st(i.stack||i.message)),!1));return this.pendingBackendInit=o,{success:o,asyncInit:!0}}else return this.registry[t]=r,{success:!0,asyncInit:!1}}catch(r){return st(`Initialization of backend ${t} failed`),st(r.stack||r.message),{success:!1,asyncInit:!1}}}removeBackend(t){if(!(t in this.registryFactory))throw new Error(`${t} backend not found in registry`);this.backendName===t&&this.pendingBackendInit!=null&&this.pendingBackendInitId++,t in this.registry&&(this.disposeRegisteredKernels(t),this.registry[t].dispose(),delete this.registry[t]),delete this.registryFactory[t],this.backendName===t&&(this.pendingBackendInit=null,this.backendName=null,this.backendInstance=null)}getSortedBackends(){if(Object.keys(this.registryFactory).length===0)throw new Error("No backend found in registry.");return Object.keys(this.registryFactory).sort((t,n)=>this.registryFactory[n].priority-this.registryFactory[t].priority)}initializeBackendsAndReturnBest(){const t=this.getSortedBackends();for(let n=0;n<t.length;n++){const r=t[n],{success:s,asyncInit:o}=this.initializeBackend(r);if(o||s)return{name:r,asyncInit:o}}throw new Error("Could not initialize any backends, all backend initializations failed.")}moveData(t,n){const r=this.state.tensorInfo.get(n),s=r.backend,o=this.readSync(n),i=s.refCount(n);s.disposeData(n,!0),r.backend=t,t.move(n,o,r.shape,r.dtype,i),this.shouldCheckForMemLeaks()&&this.state.numDataMovesStack[this.state.numDataMovesStack.length-1]++}tidy(t,n){let r=null;if(n==null){if(typeof t!="function")throw new Error("Please provide a function to tidy()");n=t}else{if(typeof t!="string"&&!(t instanceof String))throw new Error("When calling with two arguments, the first argument to tidy() must be a string");if(typeof n!="function")throw new Error("When calling with two arguments, the 2nd argument to tidy() must be a function");r=t}let s;return this.scopedRun(()=>this.startScope(r),()=>this.endScope(s),()=>(s=n(),s instanceof Promise&&console.error("Cannot return a Promise inside of tidy."),s))}scopedRun(t,n,r){t();try{const s=r();return n(),s}catch(s){throw n(),s}}nextTensorId(){return Et.nextTensorId++}nextVariableId(){return Et.nextVariableId++}clone(t){const n=$.runKernel(sn,{x:t}),r={x:t},s=i=>({x:()=>{const a="float32",l={x:i},u={dtype:a};return $.runKernel(rn,l,u)}}),o=[];return this.addTapeNode(this.state.activeScope.name,r,[n],s,o,{}),n}runKernel(t,n,r){if(this.backendName==null&&this.backend,!(De(t,this.backendName)!=null))throw new Error(`Kernel '${t}' not registered for backend '${this.backendName}'`);return this.runKernelFunc({kernelName:t,inputs:n,attrs:r})}shouldCheckForMemLeaks(){return this.ENV.getBool("IS_TEST")}checkKernelForMemLeak(t,n,r){const s=this.backend.numDataIds();let o=0;r.forEach(l=>{o+=l.dtype==="complex64"?3:1});const i=this.state.numDataMovesStack[this.state.numDataMovesStack.length-1],a=s-n-o-i;if(a>0)throw new Error(`Backend '${this.backendName}' has an internal memory leak (${a} data ids) after running '${t}'`)}runKernelFunc(t){let n,r=[];const s=this.isTapeOn(),o=this.state.numBytes,i=this.state.numTensors;this.shouldCheckForMemLeaks()&&this.state.numDataMovesStack.push(0);let a;this.backendName==null&&this.backend;let l;const u=Xt(t)?t.kernelName:this.state.activeScope!=null?this.state.activeScope.name:"";if(Xt(t)){const{kernelName:y,inputs:w,attrs:I}=t;this.backendName==null&&this.backend;const S=De(y,this.backendName);k(S!=null,()=>`Cannot find registered kernel '${y}' for backend '${this.backendName}'`),a=()=>{const T=this.backend.numDataIds();l=S.kernelFunc({inputs:w,attrs:I,backend:this.backend});const b=Array.isArray(l)?l:[l];this.shouldCheckForMemLeaks()&&this.checkKernelForMemLeak(y,T,b);const M=b.map(x=>x.rank!=null?x:this.makeTensorFromTensorInfo(x));if(s){const x=this.getTensorsForGradient(y,w,M);r=this.saveTensorsForBackwardMode(x)}return M}}else{const{forwardFunc:y}=t,w=I=>{s&&(r=I.map(S=>this.keep(this.clone(S))))};a=()=>{const I=this.backend.numDataIds();l=this.tidy(()=>y(this.backend,w));const S=Array.isArray(l)?l:[l];return this.shouldCheckForMemLeaks()&&this.checkKernelForMemLeak(u,I,S),S}}const{inputs:d,attrs:f}=t,h=Xt(t)?null:t.backwardsFunc;let g;return this.scopedRun(()=>this.state.kernelDepth++,()=>this.state.kernelDepth--,()=>{!this.ENV.getBool("DEBUG")&&!this.state.profiling?n=a():(g=this.profiler.profileKernel(u,d,()=>a()),this.ENV.getBool("DEBUG")&&this.profiler.logKernelProfile(g),n=g.outputs)}),s&&this.addTapeNode(u,d,n,h,r,f),this.state.profiling&&this.state.activeProfile.kernels.push({name:u,bytesAdded:this.state.numBytes-o,totalBytesSnapshot:this.state.numBytes,tensorsAdded:this.state.numTensors-i,totalTensorsSnapshot:this.state.numTensors,inputShapes:Object.keys(d).map(y=>d[y]!=null?d[y].shape:null),outputShapes:n.map(y=>y.shape),kernelTimeMs:g.timeMs,extraInfo:g.extraInfo}),Array.isArray(l)?n:n[0]}saveTensorsForBackwardMode(t){return t.map(r=>this.keep(this.clone(r)))}getTensorsForGradient(t,n,r){const s=Be(t);if(s!=null){const o=s.inputsToSave||[],i=s.outputsToSave||[];let a;s.saveAllInputs?(k(Array.isArray(n),()=>"saveAllInputs is true, expected inputs to be an array."),a=Object.keys(n).map(u=>n[u])):a=o.map(u=>n[u]);const l=r.filter((u,d)=>i[d]);return a.concat(l)}return[]}makeTensor(t,n,r,s){if(t==null)throw new Error("Values passed to engine.makeTensor() are null");r=r||"float32",s=s||this.backend;let o=t;r==="string"&&zt(t[0])&&(o=t.map(l=>ut(l)));const i=s.write(o,n,r),a=new Q(n,r,i,this.nextTensorId());if(this.trackTensor(a,s),r==="string"){const l=this.state.tensorInfo.get(i),u=Xe(o);this.state.numBytes+=u-l.bytes,l.bytes=u}return a}makeTensorFromDataId(t,n,r,s){r=r||"float32";const o={dataId:t,shape:n,dtype:r};return this.makeTensorFromTensorInfo(o,s)}makeTensorFromTensorInfo(t,n){const{dataId:r,shape:s,dtype:o}=t,i=new Q(s,o,r,this.nextTensorId());return this.trackTensor(i,n),i}makeVariable(t,n=!0,r,s){r=r||this.nextVariableId().toString(),s!=null&&s!==t.dtype&&(t=t.cast(s));const o=new se(t,n,r,this.nextTensorId());if(this.state.registeredVariables[o.name]!=null)throw new Error(`Variable with name ${o.name} was already registered`);return this.state.registeredVariables[o.name]=o,this.incRef(o,this.backend),o}trackTensor(t,n){this.state.numTensors++,t.dtype==="string"&&this.state.numStringTensors++;let r=0;t.dtype!=="complex64"&&t.dtype!=="string"&&(r=t.size*te(t.dtype)),this.state.numBytes+=r,this.state.tensorInfo.has(t.dataId)||(this.state.numDataBuffers++,this.state.tensorInfo.set(t.dataId,{backend:n||this.backend,dtype:t.dtype,shape:t.shape,bytes:r})),t instanceof se||this.track(t)}incRef(t,n){this.trackTensor(t,n),this.backend.incRef(t.dataId)}removeDataId(t,n){this.state.tensorInfo.has(t)&&this.state.tensorInfo.get(t).backend===n&&(this.state.tensorInfo.delete(t),this.state.numDataBuffers--)}disposeTensor(t){if(!this.state.tensorInfo.has(t.dataId))return;const n=this.state.tensorInfo.get(t.dataId);if(this.state.numTensors--,t.dtype==="string"&&(this.state.numStringTensors--,this.state.numBytes-=n.bytes),t.dtype!=="complex64"&&t.dtype!=="string"){const r=t.size*te(t.dtype);this.state.numBytes-=r}n.backend.disposeData(t.dataId)&&this.removeDataId(t.dataId,n.backend)}disposeVariables(){for(const t in this.state.registeredVariables){const n=this.state.registeredVariables[t];this.disposeVariable(n)}}disposeVariable(t){this.disposeTensor(t),this.state.registeredVariables[t.name]!=null&&delete this.state.registeredVariables[t.name]}memory(){const t=this.backend.memory();return t.numTensors=this.state.numTensors,t.numDataBuffers=this.state.numDataBuffers,t.numBytes=this.state.numBytes,this.state.numStringTensors>0&&(t.unreliable=!0,t.reasons==null&&(t.reasons=[]),t.reasons.push("Memory usage by string tensors is approximate (2 bytes per character)")),t}async profile(t){this.state.profiling=!0;const n=this.state.numBytes,r=this.state.numTensors;this.state.activeProfile.kernels=[],this.state.activeProfile.result=await t(),this.state.profiling=!1,this.state.activeProfile.peakBytes=Math.max(...this.state.activeProfile.kernels.map(s=>s.totalBytesSnapshot)),this.state.activeProfile.newBytes=this.state.numBytes-n,this.state.activeProfile.newTensors=this.state.numTensors-r;for(const s of this.state.activeProfile.kernels)s.kernelTimeMs=await s.kernelTimeMs,s.extraInfo=await s.extraInfo;return this.state.activeProfile}isTapeOn(){return this.state.gradientDepth>0&&this.state.kernelDepth===0}addTapeNode(t,n,r,s,o,i){const a={id:this.state.nextTapeNodeId++,kernelName:t,inputs:n,outputs:r,saved:o},l=Be(t);l!=null&&(s=l.gradFunc),s!=null&&(a.gradient=u=>(u=u.map((d,f)=>{if(d==null){const h=r[f],g=Mt(h.size,h.dtype);return this.makeTensor(g,h.shape,h.dtype)}return d}),s(u.length>1?u:u[0],o,i))),this.state.activeTape.push(a)}keep(t){return t.kept=!0,t}startTape(){this.state.gradientDepth===0&&(this.state.activeTape=[]),this.state.gradientDepth++}endTape(){this.state.gradientDepth--}startScope(t){const n={track:[],name:"unnamed scope",id:this.state.nextScopeId++};t&&(n.name=t),this.state.scopeStack.push(n),this.state.activeScope=n}endScope(t){const n=Ie(t),r=new Set(n.map(o=>o.id));for(let o=0;o<this.state.activeScope.track.length;o++){const i=this.state.activeScope.track[o];!i.kept&&!r.has(i.id)&&i.dispose()}const s=this.state.scopeStack.pop();this.state.activeScope=this.state.scopeStack.length===0?null:this.state.scopeStack[this.state.scopeStack.length-1],n.forEach(o=>{!o.kept&&o.scopeId===s.id&&this.track(o)})}gradients(t,n,r,s=!1){if(k(n.length>0,()=>"gradients() received an empty list of xs."),r!=null&&r.dtype!=="float32")throw new Error(`dy must have 'float32' dtype, but has '${r.dtype}'`);const o=this.scopedRun(()=>this.startTape(),()=>this.endTape(),()=>this.tidy("forward",t));k(o instanceof Q,()=>"The result y returned by f() must be a tensor.");const i=Yr(this.state.activeTape,n,o);if(!s&&i.length===0&&n.length>0)throw new Error("Cannot compute gradient of y=f(x) with respect to x. Make sure that the f you passed encloses all operations that lead from x to y.");return this.tidy("backward",()=>{const a={};a[o.id]=r??cs(o.shape),Jr(a,i,u=>this.tidy(u),us);const l=n.map(u=>a[u.id]);return this.state.gradientDepth===0&&(this.state.activeTape.forEach(u=>{for(const d of u.saved)d.dispose()}),this.state.activeTape=null),{value:o,grads:l}})}customGrad(t){return k(ee(t),()=>"The f passed in customGrad(f) must be a function."),(...n)=>{k(n.every(a=>a instanceof Q),()=>"The args passed in customGrad(f)(x1, x2,...) must all be tensors");let r;const s={};n.forEach((a,l)=>{s[l]=a});const o=(a,l)=>(r=t(...n,l),k(r.value instanceof Q,()=>"The function f passed in customGrad(f) must return an object where `obj.value` is a tensor"),k(ee(r.gradFunc),()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function."),r.value),i=(a,l)=>{const u=r.gradFunc(a,l),d=Array.isArray(u)?u:[u];k(d.length===n.length,()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function that returns the same number of tensors as inputs passed to f(...)."),k(d.every(h=>h instanceof Q),()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function that returns a list of only tensors.");const f={};return d.forEach((h,g)=>{f[g]=()=>h}),f};return this.runKernelFunc({forwardFunc:o,backwardsFunc:i,inputs:s})}}readSync(t){return this.state.tensorInfo.get(t).backend.readSync(t)}read(t){return this.state.tensorInfo.get(t).backend.read(t)}readToGPU(t,n){return this.state.tensorInfo.get(t).backend.readToGPU(t,n)}async time(t){const n=xt(),r=await this.backend.time(t);return r.wallMs=xt()-n,r}track(t){return this.state.activeScope!=null&&(t.scopeId=this.state.activeScope.id,this.state.activeScope.track.push(t)),t}get registeredVariables(){return this.state.registeredVariables}reset(){this.pendingBackendInitId++,this.state.dispose(),this.ENV.reset(),this.state=new Pe;for(const t in this.registry)this.disposeRegisteredKernels(t),this.registry[t].dispose(),delete this.registry[t];this.backendName=null,this.backendInstance=null,this.pendingBackendInit=null}}Et.nextTensorId=0;Et.nextVariableId=0;function cs(e){const t=tn(O(e),"float32");return $.makeTensor(t,e,"float32")}function gn(){const e=nn();if(e._tfengine==null){const t=new yr(e);e._tfengine=new Et(t)}return Ir(e._tfengine.ENV),ns(()=>e._tfengine),e._tfengine}const $=gn();function us(e,t){const n={a:e,b:t};return $.runKernel(Tr,n)}/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */function fs(){return typeof navigator<"u"&&navigator!=null}let ce;function hs(e){ce=e}function ds(e){if(ce!==void 0)return ce;if(e||fs()){if(e||(e=navigator),e.product==="ReactNative")return!0;const t=e.userAgent||e.vendor||(typeof window<"u"?window.opera:"");if(!t){const n=e;return n.userAgentData&&n.userAgentData.mobile}return/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(t)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(t.substr(0,4))}return!1}function pn(){return typeof window<"u"&&window.document!=null||typeof WorkerGlobalScope<"u"}const Xc=Object.freeze(Object.defineProperty({__proto__:null,isBrowser:pn,isMobile:ds,mockIsMobile:hs},Symbol.toStringTag,{value:"Module"}));/**
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
 */const H=F();H.registerFlag("DEBUG",()=>!1,e=>{e&&console.warn("Debugging mode is ON. The output of every math call will be downloaded to CPU and checked for NaNs. This significantly impacts performance.")});H.registerFlag("IS_BROWSER",()=>pn());H.registerFlag("IS_NODE",()=>typeof process<"u"&&typeof process.versions<"u"&&typeof process.versions.node<"u");H.registerFlag("IS_CHROME",()=>typeof navigator<"u"&&navigator!=null&&navigator.userAgent!=null&&/Chrome/.test(navigator.userAgent)&&/Google Inc/.test(navigator.vendor));H.registerFlag("PROD",()=>!1);H.registerFlag("TENSORLIKE_CHECK_SHAPE_CONSISTENCY",()=>H.getBool("DEBUG"));H.registerFlag("DEPRECATION_WARNINGS_ENABLED",()=>!0);H.registerFlag("IS_TEST",()=>!1);H.registerFlag("CHECK_COMPUTATION_FOR_ERRORS",()=>!0);H.registerFlag("WRAP_TO_IMAGEBITMAP",()=>!1);H.registerFlag("ENGINE_COMPILE_ONLY",()=>!1);H.registerFlag("CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU",()=>!1);H.registerFlag("USE_SETTIMEOUTCUSTOM",()=>!1);/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function mn(e,t){let n=e;if(rt(e))return t==="string"?[]:[e.length];if(!Array.isArray(e))return[];const r=[];for(;Array.isArray(n)||rt(n)&&t!=="string";)r.push(n.length),n=n[0];return Array.isArray(e)&&F().getBool("TENSORLIKE_CHECK_SHAPE_CONSISTENCY")&&wn(e,r,[]),r}function wn(e,t,n){if(n=n||[],!Array.isArray(e)&&!rt(e)){k(t.length===0,()=>`Element arr[${n.join("][")}] is a primitive, but should be an array/TypedArray of ${t[0]} elements`);return}k(t.length>0,()=>`Element arr[${n.join("][")}] should be a primitive, but is an array of ${e.length} elements`),k(e.length===t[0],()=>`Element arr[${n.join("][")}] should have ${t[0]} elements, but has ${e.length} elements`);const r=t.slice(1);for(let s=0;s<e.length;++s)wn(e[s],r,n.concat(s))}function Ce(e,t,n,r){if(e!=="string_or_numeric"){if(e==null)throw new Error("Expected dtype cannot be null.");if(e!=="numeric"&&e!==t||e==="numeric"&&t==="string")throw new Error(`Argument '${n}' passed to '${r}' must be ${e} tensor, but got ${t} tensor`)}}function U(e,t,n,r="numeric"){if(e instanceof Q)return Ce(r,e.dtype,t,n),e;let s=qt(e);if(s!=="string"&&["bool","int32","float32"].indexOf(r)>=0&&(s=r),Ce(r,s,t,n),e==null||!rt(e)&&!Array.isArray(e)&&typeof e!="number"&&typeof e!="boolean"&&typeof e!="string"){const l=e==null?"null":e.constructor.name;throw new Error(`Argument '${t}' passed to '${n}' must be a Tensor or TensorLike, but got '${l}'`)}const o=mn(e,s);!rt(e)&&!Array.isArray(e)&&(e=[e]);const a=s!=="string"?jt(e,s):_t(e,[],!0);return $.makeTensor(a,o,s)}function Yc(e,t,n,r="numeric"){if(!Array.isArray(e))throw new Error(`Argument ${t} passed to ${n} must be a \`Tensor[]\` or \`TensorLike[]\``);return e.map((o,i)=>U(o,`${t}[${i}]`,n,r))}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const gs="__op";function X(e){const t=Object.keys(e);if(t.length!==1)throw new Error(`Please provide an object with a single key (operation name) mapping to a function. Got an object with ${t.length} keys.`);let n=t[0];const r=e[n];n.endsWith("_")&&(n=n.substring(0,n.length-1)),n=n+gs;const s=(...o)=>{$.startScope(n);try{const i=r(...o);return ye(i)&&console.error("Cannot return a Promise inside of tidy."),$.endScope(i),i}catch(i){throw $.endScope(null),i}};return Object.defineProperty(s,"name",{value:n,configurable:!0}),s}/**
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
 */function ps(e,t){const n=U(e,"real","complex"),r=U(t,"imag","complex");je(n.shape,r.shape,`real and imag shapes, ${n.shape} and ${r.shape}, must match in call to tf.complex().`);const s={real:n,imag:r};return $.runKernel(Ar,s)}const ms=X({complex_:ps});/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function ws(e,t,n,r){if(r==null&&(r=qt(e)),r==="complex64")throw new Error("Cannot construct a complex64 tensor directly. Please use tf.complex(real, imag).");if(!rt(e)&&!Array.isArray(e)&&typeof e!="number"&&typeof e!="boolean"&&typeof e!="string")throw new Error("values passed to tensor(values) must be a number/boolean/string or an array of numbers/booleans/strings, or a TypedArray");if(t!=null){we(t);const s=O(t),o=O(n);k(s===o,()=>`Based on the provided shape, [${t}], the tensor should have ${s} values but has ${o}`);for(let i=0;i<n.length;++i){const a=n[i],l=i===n.length-1?a!==O(t.slice(i)):!0;k(n[i]===t[i]||!l,()=>`Error creating a new Tensor. Inferred shape (${n}) does not match the provided shape (${t}). `)}}return!rt(e)&&!Array.isArray(e)&&(e=[e]),t=t||n,e=r!=="string"?jt(e,r):_t(e,[],!0),$.makeTensor(e,t,r)}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function Yt(e,t,n){const r=mn(e,n);return ws(e,t,r,n)}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const Ue={float32:4,float16:2,int32:4,uint16:2,uint8:1,bool:1,complex64:8};/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const Gt=4;async function Jc(e,t){const n=[],r=[],s=Array.isArray(e)?e.map(i=>i.name):Object.keys(e);for(let i=0;i<s.length;++i){const a=s[i],l=Array.isArray(e)?e[i].tensor:e[a];if(l.dtype!=="float32"&&l.dtype!=="int32"&&l.dtype!=="bool"&&l.dtype!=="string"&&l.dtype!=="complex64")throw new Error(`Unsupported dtype in weight '${a}': ${l.dtype}`);const u={name:a,shape:l.shape,dtype:l.dtype};if(l.dtype==="string"){const d=new Promise(async f=>{const h=await l.bytes(),g=h.reduce((I,S)=>I+S.length,0)+Gt*h.length,y=new Uint8Array(g);let w=0;for(let I=0;I<h.length;I++){const S=h[I],T=new Uint8Array(new Uint32Array([S.length]).buffer);y.set(T,w),w+=Gt,y.set(S,w),w+=S.length}f(y)});r.push(d)}else r.push(l.data());t!=null&&(u.group=t),n.push(u)}const o=await Promise.all(r);return{data:ys(o),specs:n}}function Qc(e,t){const n={};let r,s=0;for(const o of t){const i=o.name,a=o.dtype,l=o.shape,u=O(l);let d;if("quantization"in o){const f=o.quantization;if(f.dtype==="uint8"||f.dtype==="uint16"){if(!("min"in f&&"scale"in f))throw new Error(`Weight ${o.name} with quantization ${f.dtype} doesn't have corresponding metadata min and scale.`)}else if(f.dtype==="float16"){if(a!=="float32")throw new Error(`Weight ${o.name} is quantized with ${f.dtype} which only supports weights of type float32 not ${a}.`)}else throw new Error(`Weight ${o.name} has unknown quantization dtype ${f.dtype}. Supported quantization dtypes are: 'uint8', 'uint16', and 'float16'.`);const h=Ue[f.dtype],g=e.slice(s,s+u*h),y=f.dtype==="uint8"?new Uint8Array(g):new Uint16Array(g);if(a==="float32")if(f.dtype==="uint8"||f.dtype==="uint16"){d=new Float32Array(y.length);for(let w=0;w<y.length;w++){const I=y[w];d[w]=I*f.scale+f.min}}else if(f.dtype==="float16")r===void 0&&(r=As()),d=r(y);else throw new Error(`Unsupported quantization type ${f.dtype} for weight type float32.`);else if(a==="int32"){if(f.dtype!=="uint8"&&f.dtype!=="uint16")throw new Error(`Unsupported quantization type ${f.dtype} for weight type int32.`);d=new Int32Array(y.length);for(let w=0;w<y.length;w++){const I=y[w];d[w]=Math.round(I*f.scale+f.min)}}else throw new Error(`Unsupported dtype in weight '${i}': ${a}`);s+=u*h}else if(a==="string"){const f=O(o.shape);d=[];for(let h=0;h<f;h++){const g=new Uint32Array(e.slice(s,s+Gt))[0];s+=Gt;const y=new Uint8Array(e.slice(s,s+g));d.push(y),s+=g}}else{const f=Ue[a],h=e.slice(s,s+u*f);if(a==="float32")d=new Float32Array(h);else if(a==="int32")d=new Int32Array(h);else if(a==="bool")d=new Uint8Array(h);else if(a==="complex64"){d=new Float32Array(h);const g=new Float32Array(d.length/2),y=new Float32Array(d.length/2);for(let S=0;S<g.length;S++)g[S]=d[S*2],y[S]=d[S*2+1];const w=Yt(g,l,"float32"),I=Yt(y,l,"float32");n[i]=ms(w,I),w.dispose(),I.dispose()}else throw new Error(`Unsupported dtype in weight '${i}': ${a}`);s+=u*f}a!=="complex64"&&(n[i]=Yt(d,l,a))}return n}function ys(e){if(e===null)throw new Error(`Invalid input value: ${JSON.stringify(e)}`);let t=0;const n=[];e.forEach(o=>{if(t+=o.byteLength,n.push(o.byteLength===o.buffer.byteLength?o:new o.constructor(o)),!(o instanceof Float32Array||o instanceof Int32Array||o instanceof Uint8Array))throw new Error(`Unsupported TypedArray subtype: ${o.constructor.name}`)});const r=new Uint8Array(t);let s=0;return n.forEach(o=>{r.set(new Uint8Array(o.buffer),s),s+=o.byteLength}),r.buffer}const ke=typeof Buffer<"u"&&(typeof Blob>"u"||typeof atob>"u"||typeof btoa>"u");function Ge(e){return ke?Buffer.byteLength(e):new Blob([e]).size}function bs(e){if(ke)return Buffer.from(e).toString("base64");const t=new Uint8Array(e);let n="";for(let r=0,s=t.length;r<s;r++)n+=String.fromCharCode(t[r]);return btoa(n)}function Ss(e){if(ke){const r=Buffer.from(e,"base64");return r.buffer.slice(r.byteOffset,r.byteOffset+r.byteLength)}const t=atob(e),n=new Uint8Array(t.length);for(let r=0;r<t.length;++r)n.set([t.charCodeAt(r)],r);return n.buffer}function tu(e){if(e.length===1)return e[0];let t=0;e.forEach(s=>{t+=s.byteLength});const n=new Uint8Array(t);let r=0;return e.forEach(s=>{n.set(new Uint8Array(s),r),r+=s.byteLength}),n.buffer}function eu(e){for(e=e.trim();e.endsWith("/");)e=e.slice(0,e.length-1);const n=e.split("/");return n[n.length-1]}function nu(e,t){const n={modelTopology:e.modelTopology,format:e.format,generatedBy:e.generatedBy,convertedBy:e.convertedBy,weightsManifest:t};return e.signature!=null&&(n.signature=e.signature),e.userDefinedMetadata!=null&&(n.userDefinedMetadata=e.userDefinedMetadata),e.modelInitializer!=null&&(n.modelInitializer=e.modelInitializer),e.trainingConfig!=null&&(n.trainingConfig=e.trainingConfig),n}function Es(e,t,n){const r={modelTopology:e.modelTopology,format:e.format,generatedBy:e.generatedBy,convertedBy:e.convertedBy};if(e.trainingConfig!=null&&(r.trainingConfig=e.trainingConfig),e.weightsManifest!=null){if(!t)throw new Error("modelJSON has weightsManifest but weightSpecs is null");if(!n)throw new Error("modelJSON has weightsManifest but weightData is null");r.weightSpecs=t,r.weightData=n}return e.signature!=null&&(r.signature=e.signature),e.userDefinedMetadata!=null&&(r.userDefinedMetadata=e.userDefinedMetadata),e.modelInitializer!=null&&(r.modelInitializer=e.modelInitializer),r}async function ru(e,t){let n,r;return e.weightsManifest!=null&&([n,r]=await t(e.weightsManifest)),Es(e,n,r)}function yn(e){if(e.modelTopology instanceof ArrayBuffer)throw new Error("Expected JSON model topology, received ArrayBuffer.");return{dateSaved:new Date,modelTopologyType:"JSON",modelTopologyBytes:e.modelTopology==null?0:Ge(JSON.stringify(e.modelTopology)),weightSpecsBytes:e.weightSpecs==null?0:Ge(JSON.stringify(e.weightSpecs)),weightDataBytes:e.weightData==null?0:e.weightData.byteLength}}function su(e){const t=[];for(const n of e)t.push(...n.weights);return t}function Is(){const e=n=>{let r=n<<13,s=0;for(;(r&8388608)===0;)s-=8388608,r<<=1;return r&=-8388609,s+=947912704,r|s},t=new Uint32Array(2048);t[0]=0;for(let n=1;n<1024;n++)t[n]=e(n);for(let n=1024;n<2048;n++)t[n]=939524096+(n-1024<<13);return t}function ks(){const e=new Uint32Array(64);e[0]=0,e[31]=1199570944,e[32]=2147483648,e[63]=3347054592;for(let t=1;t<31;t++)e[t]=t<<23;for(let t=33;t<63;t++)e[t]=2147483648+(t-32<<23);return e}function Ts(){const e=new Uint32Array(64);for(let t=0;t<64;t++)e[t]=1024;return e[0]=e[32]=0,e}function As(){const e=Is(),t=ks(),n=Ts();return r=>{const s=new ArrayBuffer(4*r.length),o=new Uint32Array(s);for(let i=0;i<r.length;i++){const a=r[i],l=e[n[a>>10]+(a&1023)]+t[a>>10];o[i]=l}return new Float32Array(s)}}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */class R{constructor(){this.saveRouters=[],this.loadRouters=[]}static getInstance(){return R.instance==null&&(R.instance=new R),R.instance}static registerSaveRouter(t){R.getInstance().saveRouters.push(t)}static registerLoadRouter(t){R.getInstance().loadRouters.push(t)}static getSaveHandlers(t){return R.getHandlers(t,"save")}static getLoadHandlers(t,n){return R.getHandlers(t,"load",n)}static getHandlers(t,n,r){const s=[];return(n==="load"?R.getInstance().loadRouters:R.getInstance().saveRouters).forEach(i=>{const a=i(t,r);a!==null&&s.push(a)}),s}}const ou=e=>R.registerSaveRouter(e),iu=e=>R.registerLoadRouter(e),au=e=>R.getSaveHandlers(e),lu=(e,t)=>R.getLoadHandlers(e,t);/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const ue="tensorflowjs",fe=1,ct="models_store",ot="model_info_store";function bn(){if(!F().getBool("IS_BROWSER"))throw new Error("Failed to obtain IndexedDB factory because the current environmentis not a web browser.");const e=typeof window>"u"?self:window,t=e.indexedDB||e.mozIndexedDB||e.webkitIndexedDB||e.msIndexedDB||e.shimIndexedDB;if(t==null)throw new Error("The current browser does not appear to support IndexedDB.");return t}function he(e){const t=e.result;t.createObjectStore(ct,{keyPath:"modelPath"}),t.createObjectStore(ot,{keyPath:"modelPath"})}class ht{constructor(t){if(this.indexedDB=bn(),t==null||!t)throw new Error("For IndexedDB, modelPath must not be null, undefined or empty.");this.modelPath=t}async save(t){if(t.modelTopology instanceof ArrayBuffer)throw new Error("BrowserLocalStorage.save() does not support saving model topology in binary formats yet.");return this.databaseAction(this.modelPath,t)}async load(){return this.databaseAction(this.modelPath)}databaseAction(t,n){return new Promise((r,s)=>{const o=this.indexedDB.open(ue,fe);o.onupgradeneeded=()=>he(o),o.onsuccess=()=>{const i=o.result;if(n==null){const a=i.transaction(ct,"readonly"),u=a.objectStore(ct).get(this.modelPath);u.onsuccess=()=>{if(u.result==null)return i.close(),s(new Error(`Cannot find model with path '${this.modelPath}' in IndexedDB.`));r(u.result.modelArtifacts)},u.onerror=d=>(i.close(),s(u.error)),a.oncomplete=()=>i.close()}else{const a=yn(n),l=i.transaction(ot,"readwrite");let u=l.objectStore(ot);const d=u.put({modelPath:this.modelPath,modelArtifactsInfo:a});let f;d.onsuccess=()=>{f=i.transaction(ct,"readwrite");const g=f.objectStore(ct).put({modelPath:this.modelPath,modelArtifacts:n,modelArtifactsInfo:a});g.onsuccess=()=>r({modelArtifactsInfo:a}),g.onerror=y=>{u=l.objectStore(ot);const w=u.delete(this.modelPath);w.onsuccess=()=>(i.close(),s(g.error)),w.onerror=I=>(i.close(),s(g.error))}},d.onerror=h=>(i.close(),s(d.error)),l.oncomplete=()=>{f==null?i.close():f.oncomplete=()=>i.close()}}},o.onerror=i=>s(o.error)})}}ht.URL_SCHEME="indexeddb://";const Sn=e=>F().getBool("IS_BROWSER")&&!Array.isArray(e)&&e.startsWith(ht.URL_SCHEME)?$s(e.slice(ht.URL_SCHEME.length)):null;R.registerSaveRouter(Sn);R.registerLoadRouter(Sn);function $s(e){return new ht(e)}function Fs(e){return e.startsWith(ht.URL_SCHEME)?e.slice(ht.URL_SCHEME.length):e}class Ms{constructor(){this.indexedDB=bn()}async listModels(){return new Promise((t,n)=>{const r=this.indexedDB.open(ue,fe);r.onupgradeneeded=()=>he(r),r.onsuccess=()=>{const s=r.result,o=s.transaction(ot,"readonly"),a=o.objectStore(ot).getAll();a.onsuccess=()=>{const l={};for(const u of a.result)l[u.modelPath]=u.modelArtifactsInfo;t(l)},a.onerror=l=>(s.close(),n(a.error)),o.oncomplete=()=>s.close()},r.onerror=s=>n(r.error)})}async removeModel(t){return t=Fs(t),new Promise((n,r)=>{const s=this.indexedDB.open(ue,fe);s.onupgradeneeded=()=>he(s),s.onsuccess=()=>{const o=s.result,i=o.transaction(ot,"readwrite"),a=i.objectStore(ot),l=a.get(t);let u;l.onsuccess=()=>{if(l.result==null)return o.close(),r(new Error(`Cannot find model with path '${t}' in IndexedDB.`));{const d=a.delete(t),f=()=>{u=o.transaction(ct,"readwrite");const g=u.objectStore(ct).delete(t);g.onsuccess=()=>n(l.result.modelArtifactsInfo),g.onerror=y=>r(l.error)};d.onsuccess=f,d.onerror=h=>(f(),o.close(),r(l.error))}},l.onerror=d=>(o.close(),r(l.error)),i.oncomplete=()=>{u==null?o.close():u.oncomplete=()=>o.close()}},s.onerror=o=>r(s.error)})}}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const nt="/",mt="tensorflowjs_models",En="info",vs="model_topology",xs="weight_specs",_s="weight_data",Ds="model_metadata";function In(e){return{info:[mt,e,En].join(nt),topology:[mt,e,vs].join(nt),weightSpecs:[mt,e,xs].join(nt),weightData:[mt,e,_s].join(nt),modelMetadata:[mt,e,Ds].join(nt)}}function kn(e){for(const t of Object.values(e))window.localStorage.removeItem(t)}function Bs(e){const t=e.split(nt);if(t.length<3)throw new Error(`Invalid key format: ${e}`);return t.slice(1,t.length-1).join(nt)}function Rs(e){return e.startsWith(dt.URL_SCHEME)?e.slice(dt.URL_SCHEME.length):e}class dt{constructor(t){if(!F().getBool("IS_BROWSER")||typeof window>"u"||typeof window.localStorage>"u")throw new Error("The current environment does not support local storage.");if(this.LS=window.localStorage,t==null||!t)throw new Error("For local storage, modelPath must not be null, undefined or empty.");this.modelPath=t,this.keys=In(this.modelPath)}async save(t){if(t.modelTopology instanceof ArrayBuffer)throw new Error("BrowserLocalStorage.save() does not support saving model topology in binary formats yet.");{const n=JSON.stringify(t.modelTopology),r=JSON.stringify(t.weightSpecs),s=yn(t);try{this.LS.setItem(this.keys.info,JSON.stringify(s)),this.LS.setItem(this.keys.topology,n),this.LS.setItem(this.keys.weightSpecs,r),this.LS.setItem(this.keys.weightData,bs(t.weightData));const o={format:t.format,generatedBy:t.generatedBy,convertedBy:t.convertedBy,signature:t.signature!=null?t.signature:void 0,userDefinedMetadata:t.userDefinedMetadata!=null?t.userDefinedMetadata:void 0,modelInitializer:t.modelInitializer!=null?t.modelInitializer:void 0,trainingConfig:t.trainingConfig!=null?t.trainingConfig:void 0};return this.LS.setItem(this.keys.modelMetadata,JSON.stringify(o)),{modelArtifactsInfo:s}}catch{throw kn(this.keys),new Error(`Failed to save model '${this.modelPath}' to local storage: size quota being exceeded is a possible cause of this failure: modelTopologyBytes=${s.modelTopologyBytes}, weightSpecsBytes=${s.weightSpecsBytes}, weightDataBytes=${s.weightDataBytes}.`)}}}async load(){const t=JSON.parse(this.LS.getItem(this.keys.info));if(t==null)throw new Error(`In local storage, there is no model with name '${this.modelPath}'`);if(t.modelTopologyType!=="JSON")throw new Error("BrowserLocalStorage does not support loading non-JSON model topology yet.");const n={},r=JSON.parse(this.LS.getItem(this.keys.topology));if(r==null)throw new Error(`In local storage, the topology of model '${this.modelPath}' is missing.`);n.modelTopology=r;const s=JSON.parse(this.LS.getItem(this.keys.weightSpecs));if(s==null)throw new Error(`In local storage, the weight specs of model '${this.modelPath}' are missing.`);n.weightSpecs=s;const o=this.LS.getItem(this.keys.modelMetadata);if(o!=null){const a=JSON.parse(o);n.format=a.format,n.generatedBy=a.generatedBy,n.convertedBy=a.convertedBy,a.signature!=null&&(n.signature=a.signature),a.userDefinedMetadata!=null&&(n.userDefinedMetadata=a.userDefinedMetadata),a.modelInitializer!=null&&(n.modelInitializer=a.modelInitializer),a.trainingConfig!=null&&(n.trainingConfig=a.trainingConfig)}const i=this.LS.getItem(this.keys.weightData);if(i==null)throw new Error(`In local storage, the binary weight values of model '${this.modelPath}' are missing.`);return n.weightData=Ss(i),n}}dt.URL_SCHEME="localstorage://";const Tn=e=>F().getBool("IS_BROWSER")&&!Array.isArray(e)&&e.startsWith(dt.URL_SCHEME)?Ns(e.slice(dt.URL_SCHEME.length)):null;R.registerSaveRouter(Tn);R.registerLoadRouter(Tn);function Ns(e){return new dt(e)}class Os{constructor(){k(F().getBool("IS_BROWSER"),()=>"Current environment is not a web browser"),k(typeof window>"u"||typeof window.localStorage<"u",()=>"Current browser does not appear to support localStorage"),this.LS=window.localStorage}async listModels(){const t={},n=mt+nt,r=nt+En;for(let s=0;s<this.LS.length;++s){const o=this.LS.key(s);if(o.startsWith(n)&&o.endsWith(r)){const i=Bs(o);t[i]=JSON.parse(this.LS.getItem(o))}}return t}async removeModel(t){t=Rs(t);const n=In(t);if(this.LS.getItem(n.info)==null)throw new Error(`Cannot find model at path '${t}'`);const r=JSON.parse(this.LS.getItem(n.info));return kn(n),r}}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const yt="://";class W{constructor(){this.managers={}}static getInstance(){return W.instance==null&&(W.instance=new W),W.instance}static registerManager(t,n){k(t!=null,()=>"scheme must not be undefined or null."),t.endsWith(yt)&&(t=t.slice(0,t.indexOf(yt))),k(t.length>0,()=>"scheme must not be an empty string.");const r=W.getInstance();k(r.managers[t]==null,()=>`A model store manager is already registered for scheme '${t}'.`),r.managers[t]=n}static getManager(t){const n=W.getInstance().managers[t];if(n==null)throw new Error(`Cannot find model manager for scheme '${t}'`);return n}static getSchemes(){return Object.keys(W.getInstance().managers)}}function Ot(e){if(e.indexOf(yt)===-1)throw new Error(`The url string provided does not contain a scheme. Supported schemes are: ${W.getSchemes().join(",")}`);return{scheme:e.split(yt)[0],path:e.split(yt)[1]}}async function An(e,t,n=!1){k(e!==t,()=>`Old path and new path are the same: '${e}'`);const r=R.getLoadHandlers(e);k(r.length>0,()=>`Copying failed because no load handler is found for source URL ${e}.`),k(r.length<2,()=>`Copying failed because more than one (${r.length}) load handlers for source URL ${e}.`);const s=r[0],o=R.getSaveHandlers(t);k(o.length>0,()=>`Copying failed because no save handler is found for destination URL ${t}.`),k(o.length<2,()=>`Copying failed because more than one (${r.length}) save handlers for destination URL ${t}.`);const i=o[0],a=Ot(e).scheme,l=Ot(e).path,u=a===Ot(e).scheme,d=await s.load();n&&u&&await W.getManager(a).removeModel(l);const f=await i.save(d);return n&&!u&&await W.getManager(a).removeModel(l),f.modelArtifactsInfo}async function cu(){const e=W.getSchemes(),t={};for(const n of e){const r=await W.getManager(n).listModels();for(const s in r){const o=n+yt+s;t[o]=r[s]}}return t}async function uu(e){const t=Ot(e);return W.getManager(t.scheme).removeModel(t.path)}async function fu(e,t){return An(e,t,!1)}async function hu(e,t){return An(e,t,!0)}/**
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
 */class Ls{constructor(){this.messageName="setTimeoutCustom",this.functionRefs=[],this.handledMessageCount=0,this.hasEventListener=!1}fetch(t,n){return fetch(t,n)}now(){return performance.now()}encode(t,n){if(n!=="utf-8"&&n!=="utf8")throw new Error(`Browser's encoder only supports utf-8, but got ${n}`);return this.textEncoder==null&&(this.textEncoder=new TextEncoder),this.textEncoder.encode(t)}decode(t,n){return new TextDecoder(n).decode(t)}setTimeoutCustom(t,n){if(!window||!F().getBool("USE_SETTIMEOUTCUSTOM")){setTimeout(t,n);return}this.functionRefs.push(t),setTimeout(()=>{window.postMessage({name:this.messageName,index:this.functionRefs.length-1},"*")},n),this.hasEventListener||(this.hasEventListener=!0,window.addEventListener("message",r=>{if(r.source===window&&r.data.name===this.messageName){r.stopPropagation();const s=this.functionRefs[r.data.index];s(),this.handledMessageCount++,this.handledMessageCount===this.functionRefs.length&&(this.functionRefs=[],this.handledMessageCount=0)}},!0))}}if(F().get("IS_BROWSER")){F().setPlatform("browser",new Ls);try{W.registerManager(dt.URL_SCHEME,new Os)}catch{}try{W.registerManager(ht.URL_SCHEME,new Ms)}catch{}}/**
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
 */const Ps={importFetch:()=>require("node-fetch")};let Jt;class Cs{constructor(){this.util=require("util"),this.textEncoder=new this.util.TextEncoder}fetch(t,n){return F().global.fetch!=null?F().global.fetch(t,n):(Jt==null&&(Jt=Ps.importFetch()),Jt(t,n))}now(){const t=process.hrtime();return t[0]*1e3+t[1]/1e6}encode(t,n){if(n!=="utf-8"&&n!=="utf8")throw new Error(`Node built-in encoder only supports utf-8, but got ${n}`);return this.textEncoder.encode(t)}decode(t,n){return t.length===0?"":new this.util.TextDecoder(n).decode(t)}}F().get("IS_NODE")&&!F().get("IS_BROWSER")&&F().setPlatform("node",new Cs);/**
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
 */function de(e,t="float32",n){return t=t||"float32",we(e),new es(e,t,n)}/**
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
 */function Us(e,t){const n=U(e,"x","cast");if(!Ze(t))throw new Error(`Failed to cast to unknown dtype ${t}`);if(t==="string"&&n.dtype!=="string"||t!=="string"&&n.dtype==="string")throw new Error("Only strings can be casted to strings");const r={x:n},s={dtype:t};return $.runKernel(rn,r,s)}const $n=X({cast_:Us});/**
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
 */function Gs(e){const n={x:U(e,"x","clone","string_or_numeric")};return $.runKernel(sn,n)}const Ws=X({clone_:Gs});/**
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
 */function Vs(e,t=!1){console.log(e.toString(t))}/**
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
 */gn();const zs={buffer:de,cast:$n,clone:Ws,print:Vs};rs(zs);/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function du(){F().set("PROD",!0)}function gu(){F().set("DEBUG",!0)}function pu(){F().set("DEPRECATION_WARNINGS_ENABLED",!1),console.warn("TensorFlow.js deprecation warnings have been disabled.")}function mu(e){F().getBool("DEPRECATION_WARNINGS_ENABLED")&&console.warn(e+" You can disable deprecation warnings with tf.disableDeprecationWarnings().")}function wu(){$.disposeVariables()}function yu(){return $}function bu(){return $.memory()}function Su(e){return $.profile(e)}function Eu(e,t){return $.tidy(e,t)}function Iu(e){Ie(e).forEach(n=>n.dispose())}function ku(e){return $.keep(e)}function Tu(e){return $.time(e)}function Au(e){return $.setBackend(e)}function $u(){return $.ready()}function Fu(){return $.backendName}function Mu(e){$.removeBackend(e)}function vu(e){return $.findBackend(e)}function xu(e){return $.findBackendFactory(e)}function _u(e,t,n=1){return $.registerBackend(e,t,n)}function Du(){return $.backend}function Bu(e,t){F().setPlatform(e,t)}/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */function Fn(e,t){const n=e.length,r=[];for(let s=0;s<n;s++){const o=n-1-s,i=e[o]||1;(t[t.length-1-s]||1)>1&&i===1&&r.unshift(o)}return r}function Te(e,t){const n=[];for(let r=0;r<t.length;r++){const s=e[e.length-r-1],o=t.length-r-1,i=t[o];(s==null||s===1&&i>1)&&n.unshift(o)}return n}function Mn(e,t){const n=[],r=Math.max(e.length,t.length);for(let s=0;s<r;s++){let o=e[e.length-s-1];o==null&&(o=1);let i=t[t.length-s-1];if(i==null&&(i=1),o===1)n.unshift(i);else if(i===1)n.unshift(o);else if(o!==i){const a=`Operands could not be broadcast together with shapes ${e} and ${t}.`;throw Error(a)}else n.unshift(o)}return n}const Ru=Object.freeze(Object.defineProperty({__proto__:null,assertAndGetBroadcastShape:Mn,getBroadcastDims:Fn,getReductionAxes:Te},Symbol.toStringTag,{value:"Module"}));function vn(e,t){const n=e.shape.length,r=t.shape.length;if(n<1)throw new Error(`tf.gatherND() expects the input to be rank 1 or higher, but the rank was ${n}.`);if(r<1)throw new Error(`tf.gatherND() expects the indices to be rank 1 or higher, but the rank was ${r}.`);if(t.dtype!=="int32")throw new Error(`tf.gatherND() expects the indices to be int32 type, but the dtype was ${t.dtype}.`);if(t.shape[r-1]>n)throw new Error(`index innermost dimension length must be <= tensor rank; saw: ${t.shape[r-1]} vs. ${n}`);if(O(e.shape)===0)throw new Error(`Requested more than 0 entries, but input is empty. Input shape: ${e.shape}.`);const s=t.shape,o=s[s.length-1];let i=1;for(let f=0;f<s.length-1;++f)i*=s[f];const a=e.shape,l=s.slice();l.pop();let u=1;for(let f=o;f<n;++f)u*=a[f],l.push(a[f]);const d=[...gt(e.shape).map(f=>f/u),1].slice(0,o);return[l,i,u,d]}const Nu=Object.freeze(Object.defineProperty({__proto__:null,prepareAndValidate:vn},Symbol.toStringTag,{value:"Module"}));function Ae(e,t,n){const r=t.rank>1?t.shape[t.rank-1]:1,s=t.rank>1?t.rank-1:1,o=`Must have updates.shape = indices.shape[:batchDim] + shape[sliceDim:], got updates.shape: ${n.shape}, indices.shape: ${t.shape}, shape: ${e}, sliceDim: ${r}, and batchDim: ${s}.`;if(n.rank<s)throw new Error(o+` update.rank < ${s}. `);if(e.length<r+(n.rank-s))throw new Error(o+` Output shape length < ${r+(n.rank-s)}`);if(n.rank!==s+e.length-r)throw new Error(o+` update.rank != ${s+e.length-r}`);for(let i=0;i<s;++i)if(n.shape[i]!==t.shape[i])throw new Error(o+` updates.shape[${i}] (${n.shape[i]}) != indices.shape[${i}] (${t.shape[i]}).`);for(let i=0;i<n.rank-s;++i)if(n.shape[i+s]!==e[i+r])throw new Error(o+` updates.shape[${i+s}] (${n.shape[i+s]}) != shape[${i+s}] (${e[i+s]})`)}function xn(e,t,n){if(t.rank<1)throw new Error(`tf.scatterND() expects the indices to be rank 1 or higher, but the rank was ${t.rank}.`);if(e.rank<1)throw new Error(`tf.scatterND() expects the updates to be rank 1 or higher, but the rank was ${e.rank}.`);if(t.dtype!=="int32")throw new Error(`The dtype of 'indices' should be int32, but got dtype: ${t.dtype}`);if(n.length<1)throw new Error(`Output rank must be greater or equal to 1, but got shape: ${n}`);if(n.length===0){if(t.size===0)throw new Error(`Indices specified for empty output. indices shape: ${t.shape}`);if(e.size===0)throw new Error(`Updates specified for empty output. updates shape: ${e.shape}`)}Ae(n,t,e)}function _n(e,t,n){const r=t.shape.length,s=r>1?t.shape[r-1]:1,o=n.length;let i=1;for(let f=s;f<o;++f)i*=n[f];const a=s<1?1:s,l=O(t.shape)/a,u=[...gt(n.slice(0,s)),1],d=O(n);return{sliceRank:s,numUpdates:l,sliceSize:i,strides:u,outputSize:d}}const Ou=Object.freeze(Object.defineProperty({__proto__:null,calculateShapes:_n,validateInput:xn,validateUpdateShape:Ae},Symbol.toStringTag,{value:"Module"}));/**
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
 */const ge=-2,qs=-1;function Dn(e,t,n){const r=e.shape.length;k(r===t.length,()=>`Error in slice${r}D: Length of begin ${t} must match the rank of the array (${r}).`),k(r===n.length,()=>`Error in slice${r}D: Length of size ${n} must match the rank of the array (${r}).`);for(let s=0;s<r;++s)k(t[s]+n[s]<=e.shape[s],()=>`Error in slice${r}D: begin[${s}] + size[${s}] (${t[s]+n[s]}) would overflow input.shape[${s}] (${e.shape[s]})`)}function js(e){const t=[];let n=0;for(;e>0;)e&1&&t.push(n),e/=2,n++;return t}function Hs(e,t,n){const r=[];for(let s=0;s<e.length;s++)r[s]=Math.ceil((t[s]-e[s])/n[s]);return r}function Bn(e,t,n,r){const s=[...e];for(let o=s.length;o<r.length;o++)s.push(1);for(let o=0;o<n;o++)o===0?s[t]=1:(s.splice(t,0,1),s.pop());return s}function Rn(e,t,n){return n<=e?n:n-(t-1)}function Nn(e,t){const n=[];for(let r=0;r<e;r++)n.push(t+r);return n}function Ks(e,t,n,r,s,o,i,a,l){const u=e.length;let d=new Array(u),f=new Array(u),h=new Array(u);if(t.length&&n>0){const g=t[0],y=n+1;d=On(i,g,y,r,e),f=Ln(a,g,y,s,e),h=Bn(o,g,y,e)}else for(let g=0;g<u;g++)d[g]=Cn(i,r,o,e,g,l),f[g]=Un(a,s,o,e,g,l),h[g]=Pn(o,g,l);return{begin:d,end:f,strides:h}}function On(e,t,n,r,s){const o=[...s],i=Nn(n,t);for(let a=0;a<o.length;a++)if(i.indexOf(a)>-1)o[a]=0;else{const l=Rn(t,n,a);let u=r[l];e&1<<l&&(u=0),o[a]=u}return o}function Ln(e,t,n,r,s){const o=[...s],i=Nn(n,t);for(let a=0;a<o.length;a++)if(i.indexOf(a)>-1)o[a]=Number.MAX_SAFE_INTEGER;else{const l=Rn(t,n,a);let u=r[l];e&1<<l&&(u=Number.MAX_SAFE_INTEGER),o[a]=u}for(let a=0;a<o.length;a++){const l=s[a];o[a]<0&&(o[a]+=l),o[a]=Ft(0,o[a],s[a])}return o}function Pn(e,t,n){let r=e[t];return(n&1<<t||r==null)&&(r=1),r}function Cn(e,t,n,r,s,o){let i=t[s];const a=n[s]||1;(e&1<<s||o&1<<s||i==null)&&(a>0?i=Number.MIN_SAFE_INTEGER:i=Number.MAX_SAFE_INTEGER);const l=r[s];return i<0&&(i+=l),i=Ft(0,i,l-1),i}function Un(e,t,n,r,s,o){let i=t[s];const a=n[s]||1;(e&1<<s||o&1<<s||i==null)&&(a>0?i=Number.MAX_SAFE_INTEGER:i=Number.MIN_SAFE_INTEGER);const l=r[s];return i<0&&(i+=l),a>0?i=Ft(0,i,l):i=Ft(-1,i,l-1),i}function Gn(e,t,n){let r=n.length;for(let s=0;s<n.length;s++)if(n[s]>1){r=s;break}for(let s=r+1;s<n.length;s++)if(t[s]>0||n[s]!==e[s])return!1;return!0}function Wn(e,t){let n=e.length>0?e[e.length-1]:1;for(let r=0;r<e.length-1;r++)n+=e[r]*t[r];return n}function Vn(e,t,n){let r;const s=e.shape.length;typeof t=="number"?r=[t,...new Array(s-1).fill(0)]:t.length<s?r=t.concat(new Array(s-t.length).fill(0)):r=t.slice(),r.forEach(i=>{k(i!==-1,()=>"slice() does not support negative begin indexing.")});let o;return n==null?o=new Array(s).fill(-1):typeof n=="number"?o=[n,...new Array(s-1).fill(-1)]:n.length<s?o=n.concat(new Array(s-n.length).fill(-1)):o=n,o=o.map((i,a)=>i>=0?i:(k(i===-1,()=>`Negative size values should be exactly -1 but got ${i} for the slice() size at index ${a}.`),e.shape[a]-r[a])),[r,o]}function Zs(e,t,n,r,s,o,i,a,l){let u;if(r==null?(u=new Array(t.length),u.fill(1)):u=r,i!=null&&(i&i-1)!==0)throw new Error("Multiple ellipses in slice is not allowed.");let d=!1;const f={dims:u.length,numAddAxisAfterEllipsis:0,begin:t.slice(),end:n.slice(),strides:u.slice(),beginMask:s,endMask:o,ellipsisMask:i,newAxisMask:a,shrinkAxisMask:l};for(let b=0;b<f.dims;b++)d&&(1<<b&a)!==0&&f.numAddAxisAfterEllipsis++,1<<b&i&&(d=!0);d||(f.ellipsisMask|=1<<f.dims,f.dims++);const h={dims:e.length,beginMask:0,endMask:0,beginValid:!1,endValid:!1};Xs(f,h);let g=!0,y=!0,w=!0;const I=[],S=[];for(let b=0;b<e.length;++b){if(h.strides[b]===0)throw Error(`strides[${b}] must be non-zero`);const M=!!(h.shrinkAxisMask&1<<b),x=e[b];if(x===-1){I.push(M?1:-1);continue}const z=[h.beginMask&1<<b,h.endMask&1<<b],q=[h.strides[b]>0?0:-1,h.strides[b]>0?x:x-1];if(M&&h.strides[b]<=0)throw Error("only stride 1 allowed on non-range indexing.");w=w&&h.strides[b]===1;const B=!!(h.beginMask&1<<b&&h.endMask&1<<b);if(h.beginValid&&h.endValid){if(M){const E=h.begin[b]<0?x+h.begin[b]:h.begin[b];if(h.begin[b]=E,h.end[b]=h.begin[b]+1,E<0||E>=x)throw Error(`slice index ${h.begin[b]} of dimension ${b} out of bounds.`)}else h.begin[b]=We(h.begin[b],0,h.strides[b],x,z,q),h.end[b]=We(h.end[b],1,h.strides[b],x,z,q);const c=h.strides[b]===1&&h.begin[b]===0&&h.end[b]===x;g=g&&c,y=y&&(b===0&&h.strides[b]===1||c)}else g=g&&h.strides[b]===1&&B,y=y&&(b===0&&h.strides[b]===1||B);let m,p=!1;if(h.beginValid&&h.endValid?(m=h.end[b]-h.begin[b],p=!0):M?(m=1,p=!0):B&&x>=0&&(h.strides[b]<0?m=-x:m=x,p=!0),p){let c;m===0||m<0!=h.strides[b]<0?c=0:c=Math.trunc(m/h.strides[b])+(m%h.strides[b]!==0?1:0),I.push(c)}else I.push(-1)}for(let b=0;b<h.finalShapeGatherIndices.length;++b){const M=h.finalShapeGatherIndices[b];M>=0?S.push(I[M]):M===ge&&S.push(1)}return{finalShapeSparse:S.filter((b,M)=>h.finalShapeGatherIndices[M]!==ge),finalShape:S,isIdentity:g,sliceDim0:y,isSimpleSlice:w,begin:h.begin,end:h.end,strides:h.strides}}function Xs(e,t){t.beginMask=0,t.endMask=0,t.shrinkAxisMask=0;let n=0;t.beginValid=e.begin!=null,t.endValid=e.end!=null,t.begin=new Array(t.dims),t.end=new Array(t.dims),t.strides=new Array(t.dims),t.finalShapeGatherIndices=[],t.finalShapeGatherIndicesSparse=[],t.inputShapeGatherIndicesSparse=new Array(t.dims);for(let r=0;r<e.dims;r++)if(1<<r&e.ellipsisMask){const s=Math.min(t.dims-(e.dims-r)+1+e.numAddAxisAfterEllipsis,t.dims);for(;n<s;n++)t.begin[n]=0,t.end[n]=0,t.strides[n]=1,t.beginMask|=1<<n,t.endMask|=1<<n,t.finalShapeGatherIndices.push(n),t.finalShapeGatherIndicesSparse.push(-1),t.inputShapeGatherIndicesSparse[n]=r}else if(1<<r&e.newAxisMask)t.finalShapeGatherIndices.push(ge),t.finalShapeGatherIndicesSparse.push(-1);else{if(n===t.begin.length)throw Error(`Index out of range using input dim ${n}; input has only ${t.dims} dims, ${t.begin.length}.`);e.begin!=null&&(t.begin[n]=e.begin[r]),e.end!=null&&(t.end[n]=e.end[r]),t.strides[n]=e.strides[r],e.beginMask&1<<r&&(t.beginMask|=1<<n),e.endMask&1<<r&&(t.endMask|=1<<n),e.shrinkAxisMask&1<<r?(t.finalShapeGatherIndices.push(qs),t.finalShapeGatherIndicesSparse.push(-1),t.shrinkAxisMask|=1<<n):(t.finalShapeGatherIndices.push(n),t.finalShapeGatherIndicesSparse.push(r)),t.inputShapeGatherIndicesSparse[n]=r,n++}}function We(e,t,n,r,s,o){if(s[t])return n>0?o[t]:o[t+1&1];{const i=e<0?r+e:e;return i<o[0]?o[0]:i>o[1]?o[1]:i}}const Ys=Object.freeze(Object.defineProperty({__proto__:null,assertParamsValid:Dn,computeFlatOffset:Wn,computeOutShape:Hs,getNormalizedAxes:Ks,isSliceContinous:Gn,maskToAxes:js,parseSliceParams:Vn,sliceInfo:Zs,startForAxis:Cn,startIndicesWithElidedDims:On,stopForAxis:Un,stopIndicesWithElidedDims:Ln,stridesForAxis:Pn,stridesWithElidedDims:Bn},Symbol.toStringTag,{value:"Module"}));/**
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
 */function Js(e,t){let n=U(e,"a","mul"),r=U(t,"b","mul");[n,r]=hn(n,r);const s={a:n,b:r};return $.runKernel(Mr,s)}const Qs=X({mul_:Js});/**
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
 */function to(e,t,n,r,s="NHWC",o){const i=e[3],a=[...t,i],l=qn(s);return $e(e,a,n,o,r,null,null,l)}function eo(e,t,n,r,s,o,i="channelsLast"){const[a,l]=Wt(t);let u;if(i==="channelsLast")u=[a,l,e[3],e[3]];else if(i==="channelsFirst")u=[a,l,e[1],e[1]];else throw new Error(`Unknown dataFormat ${i}`);return $e(e,u,n,r,s,o,!1,i)}function no(e,t,n,r,s,o,i="NDHWC"){const[a,l,u]=pe(t);let d,f;if(i==="NDHWC")f="channelsLast",d=[a,l,u,e[4],e[4]];else if(i==="NCDHW")f="channelsFirst",d=[a,l,u,e[1],e[1]];else throw new Error(`Unknown dataFormat ${i}`);return zn(e,d,n,r,s,!1,f,o)}function $e(e,t,n,r,s,o,i=!1,a="channelsLast"){let[l,u,d,f]=[-1,-1,-1,-1];if(a==="channelsLast")[l,u,d,f]=e;else if(a==="channelsFirst")[l,f,u,d]=e;else throw new Error(`Unknown dataFormat ${a}`);const[h,g,,y]=t,[w,I]=Wt(n),[S,T]=Wt(r),b=bt(h,S),M=bt(g,T),{padInfo:x,outHeight:z,outWidth:q}=oo(s,u,d,w,I,b,M,o,a),B=i?y*f:y;let m;return a==="channelsFirst"?m=[l,B,z,q]:a==="channelsLast"&&(m=[l,z,q,B]),{batchSize:l,dataFormat:a,inHeight:u,inWidth:d,inChannels:f,outHeight:z,outWidth:q,outChannels:B,padInfo:x,strideHeight:w,strideWidth:I,filterHeight:h,filterWidth:g,effectiveFilterHeight:b,effectiveFilterWidth:M,dilationHeight:S,dilationWidth:T,inShape:e,outShape:m,filterShape:t}}function zn(e,t,n,r,s,o=!1,i="channelsLast",a){let[l,u,d,f,h]=[-1,-1,-1,-1,-1];if(i==="channelsLast")[l,u,d,f,h]=e;else if(i==="channelsFirst")[l,h,u,d,f]=e;else throw new Error(`Unknown dataFormat ${i}`);const[g,y,w,,I]=t,[S,T,b]=pe(n),[M,x,z]=pe(r),q=bt(g,M),B=bt(y,x),m=bt(w,z),{padInfo:p,outDepth:c,outHeight:E,outWidth:A}=io(s,u,d,f,S,T,b,q,B,m,a),D=o?I*h:I;let v;return i==="channelsFirst"?v=[l,D,c,E,A]:i==="channelsLast"&&(v=[l,c,E,A,D]),{batchSize:l,dataFormat:i,inDepth:u,inHeight:d,inWidth:f,inChannels:h,outDepth:c,outHeight:E,outWidth:A,outChannels:D,padInfo:p,strideDepth:S,strideHeight:T,strideWidth:b,filterDepth:g,filterHeight:y,filterWidth:w,effectiveFilterDepth:q,effectiveFilterHeight:B,effectiveFilterWidth:m,dilationDepth:M,dilationHeight:x,dilationWidth:z,inShape:e,outShape:v,filterShape:t}}function ro(e,t,n,r,s){r==null&&(r=Fe(e,t,n));const o=e[0],i=e[1],a=ft((o-t+2*r)/n+1,s),l=ft((i-t+2*r)/n+1,s);return[a,l]}function so(e,t,n,r,s,o){s==null&&(s=Fe(e,t,r));const i=e[0],a=e[1],l=e[2],u=ft((i-t+2*s)/r+1,o),d=ft((a-t+2*s)/r+1,o),f=ft((l-t+2*s)/r+1,o);return[u,d,f,n]}function Fe(e,t,n,r=1){const s=bt(t,r);return Math.floor((e[0]*(n-1)-n+s)/2)}function Wt(e){return typeof e=="number"?[e,e,e]:e.length===2?[e[0],e[1],1]:e}function pe(e){return typeof e=="number"?[e,e,e]:e}function bt(e,t){return t<=1?e:e+(e-1)*(t-1)}function oo(e,t,n,r,s,o,i,a,l){let u,d,f;if(typeof e=="number"){u={top:e,bottom:e,left:e,right:e,type:e===0?"VALID":"NUMBER"};const g=ro([t,n],o,r,e,a);d=g[0],f=g[1]}else if(e==="same"){d=Math.ceil(t/r),f=Math.ceil(n/s);const h=Math.max(0,(d-1)*r+o-t),g=Math.max(0,(f-1)*s+i-n),y=Math.floor(h/2),w=h-y,I=Math.floor(g/2),S=g-I;u={top:y,bottom:w,left:I,right:S,type:"SAME"}}else if(e==="valid")u={top:0,bottom:0,left:0,right:0,type:"VALID"},d=Math.ceil((t-o+1)/r),f=Math.ceil((n-i+1)/s);else if(typeof e=="object"){const h=l==="channelsLast"?e[1][0]:e[2][0],g=l==="channelsLast"?e[1][1]:e[2][1],y=l==="channelsLast"?e[2][0]:e[3][0],w=l==="channelsLast"?e[2][1]:e[3][1];u={top:h,bottom:g,left:y,right:w,type:h===0&&g===0&&y===0&&w===0?"VALID":"EXPLICIT"},d=ft((t-o+h+g)/r+1,a),f=ft((n-i+y+w)/s+1,a)}else throw Error(`Unknown padding parameter: ${e}`);return{padInfo:u,outHeight:d,outWidth:f}}function io(e,t,n,r,s,o,i,a,l,u,d){let f,h,g,y;if(typeof e=="number"){f={top:e,bottom:e,left:e,right:e,front:e,back:e,type:e===0?"VALID":"NUMBER"};const I=so([t,n,r,1],a,1,s,e,d);h=I[0],g=I[1],y=I[2]}else if(e==="same"){h=Math.ceil(t/s),g=Math.ceil(n/o),y=Math.ceil(r/i);const w=(h-1)*s+a-t,I=(g-1)*o+l-n,S=(y-1)*i+u-r,T=Math.floor(w/2),b=w-T,M=Math.floor(I/2),x=I-M,z=Math.floor(S/2),q=S-z;f={top:M,bottom:x,left:z,right:q,front:T,back:b,type:"SAME"}}else if(e==="valid")f={top:0,bottom:0,left:0,right:0,front:0,back:0,type:"VALID"},h=Math.ceil((t-a+1)/s),g=Math.ceil((n-l+1)/o),y=Math.ceil((r-u+1)/i);else throw Error(`Unknown padding parameter: ${e}`);return{padInfo:f,outDepth:h,outHeight:g,outWidth:y}}function ft(e,t){if(!t)return Math.trunc(e);switch(t){case"round":return Math.round(e);case"ceil":return Math.ceil(e);case"floor":return Math.floor(e);default:throw new Error(`Unknown roundingMode ${t}`)}}function me(e){const[t,n,r]=Wt(e);return t===1&&n===1&&r===1}function ao(e,t){return me(e)||me(t)}function qn(e){if(e==="NHWC")return"channelsLast";if(e==="NCHW")return"channelsFirst";throw new Error(`Unknown dataFormat ${e}`)}function lo(e,t,n){if(n!=null){if(typeof t=="string")throw Error(`Error in ${e}: pad must be an integer when using dimRoundingMode ${n} but got pad ${t}.`);if(typeof t=="number")k(Pt(t),()=>`Error in ${e}: pad must be an integer when using dimRoundingMode ${n} but got pad ${t}.`);else if(typeof t=="object")t.forEach(r=>{r.forEach(s=>{k(Pt(s),()=>`Error in ${e}: pad must be an integer when using dimRoundingMode ${n} but got pad ${s}.`)})});else throw Error(`Error in ${e}: Unknown padding parameter: ${t}`)}}/**
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
 */function co(e,t){const r={x:U(e,"x","reshape","string_or_numeric")},s={shape:t};return $.runKernel(_r,r,s)}const uo=X({reshape_:co});/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function fo(e){const n={x:U(e,"x","sigmoid","float32")};return $.runKernel(Rr,n)}const ho=X({sigmoid_:fo});/**
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
 */function go(e){const n={x:U(e,"x","elu","float32")};return $.runKernel($r,n)}const po=X({elu_:go});/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */function Me(e,t){for(let n=0;n<e.length;++n)if(e[e.length-n-1]!==t-1-n)return!1;return!0}function jn(e,t,n){const r=e.length+t.length,s=[];let o=0,i=0;for(let a=0;a<r;a++)n.indexOf(a)===-1?s.push(e[o++]):s.push(t[i++]);return s}function mo(e,t){const n=[],r=e.length;for(let o=0;o<r;o++)t.indexOf(o)===-1&&n.push(e[o]);const s=t.map(o=>e[o]);return[n,s]}function wo(e,t){const n=t.map(r=>1);return jn(e,n,t)}function yo(e,t,n){k(Me(t,n),()=>`${e} supports only inner-most axes for now. Got axes ${t} and rank-${n} input.`)}function bo(e,t){if(Me(e,t))return null;const n=[];for(let r=0;r<t;++r)e.indexOf(r)===-1&&n.push(r);return e.forEach(r=>n.push(r)),n}function So(e){return e.map((t,n)=>[n,t]).sort((t,n)=>t[1]-n[1]).map(t=>t[0])}function Eo(e,t){const n=[];for(let r=t-e;r<t;++r)n.push(r);return n}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function Io(e,t=null,n=!1){let r=U(e,"x","sum");r.dtype==="bool"&&(r=$n(r,"int32"));const s={x:r},o={axis:t,keepDims:n};return $.runKernel(Nr,s,o)}const ko=X({sum_:Io});/**
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
 */function To(e,t=.2){const r={x:U(e,"x","leakyRelu")},s={alpha:t};return $.runKernel(Fr,r,s)}const Ao=X({leakyRelu_:To});/**
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
 */function $o(e,t){const n=U(e,"x","prelu"),r=U(t,"alpha","prelu"),s={x:n,alpha:r};return $.runKernel(vr,s)}const Fo=X({prelu_:$o}),Mo={},vo=Object.freeze(Object.defineProperty({__proto__:null,default:Mo},Symbol.toStringTag,{value:"Module"})),Lu=Zn(vo);/**
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
 */function xo(e){const n={x:U(e,"x","relu")};return $.runKernel(xr,n)}const _o=X({relu_:xo});/**
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
 */function Do(e){const n={x:U(e,"x","relu6")};return $.runKernel(Dr,n)}const Bo=X({relu6_:Do});/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function Ro(e,t=0){const r={x:U(e,"x","step")},s={alpha:t};return $.runKernel(Or,r,s)}const No=X({step_:Ro});/**
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
 */function Oo(e,t,n){if(n==null||n==="linear")return e;if(n==="relu")return Qs(e,No(t));throw new Error(`Cannot compute gradient for fused activation ${n}.`)}function Lo(e,t){let n=t;const r=Te(e.shape,t.shape);return r.length>0&&(n=ko(n,r)),uo(n,e.shape)}function Po(e,t,n,r){if(t==="linear")return e;if(t==="relu")return _o(e);if(t==="elu")return po(e);if(t==="relu6")return Bo(e);if(t==="prelu")return Fo(e,n);if(t==="leakyrelu")return Ao(e,r);if(t==="sigmoid")return ho(e);throw new Error(`Unknown fused activation ${t}.`)}const Co=(e,t)=>!(e>0)||t==="linear";/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */function Uo(e,t){const n=e[0].length;e.forEach((s,o)=>{k(s.length===n,()=>`Error in concat${n}D: rank of tensors[${o}] must be the same as the rank of the rest (${n})`)}),k(t>=0&&t<n,()=>`Error in concat${n}D: axis must be between 0 and ${n-1}.`);const r=e[0];e.forEach((s,o)=>{for(let i=0;i<n;i++)k(i===t||s[i]===r[i],()=>`Error in concat${n}D: Shape of tensors[${o}] (${s}) does not match the shape of the rest (${r}) along the non-concatenated axis ${o}.`)})}function Go(e,t){const n=e[0].slice();for(let r=1;r<e.length;r++)n[t]+=e[r][t];return n}/**
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
 */var et;(function(e){e[e.FIRST_DIM_SIZE=0]="FIRST_DIM_SIZE",e[e.VALUE_ROWIDS=1]="VALUE_ROWIDS",e[e.ROW_LENGTHS=2]="ROW_LENGTHS",e[e.ROW_SPLITS=3]="ROW_SPLITS",e[e.ROW_LIMITS=4]="ROW_LIMITS",e[e.ROW_STARTS=5]="ROW_STARTS"})(et||(et={}));function Wo(e,t,n){let r=new Array;if(n==null&&t==null)return r;if(t==null)for(;r.length<e+n.length;)r.push(-1);else r=t.slice();if(n==null)return r;if(e+n.length!==r.length)throw new Error(`rt input.shape and shape=${t} are incompatible: rt input.rank = ${e+n.length}, but shape.rank = ${r.length}`);for(let s=1;s<n.length;++s){const o=n[s],i=r[r.length-n.length+s],a=r[i];if(o>=0)if(a>=0){if(a!==o)throw new Error(`rt input.shape and shape=${t} are incompatible: rt input.shape[${s+e}] = ${o} but shape[${s+e}] = ${a}`)}else r[i]=o}return r}function Vo(e){const t={FIRST_DIM_SIZE:et.FIRST_DIM_SIZE,VALUE_ROWIDS:et.VALUE_ROWIDS,ROW_LENGTHS:et.ROW_LENGTHS,ROW_SPLITS:et.ROW_SPLITS,ROW_LIMITS:et.ROW_LIMITS,ROW_STARTS:et.ROW_STARTS},n=[];for(const r of e)if(r in t)n.push(t[r]);else break;return n}function zo(e){return e.length===0?0:e[0]===et.FIRST_DIM_SIZE?e.length-1:e.length}function qo(e,t){if(e==null||t==null)return;const n=e.length,r=t.length;if(n>=r)throw new Error(`defaultValue.shape=${e} and ragged tensor flatValues.shape=${t}, are incompatible: defaultValue.rank = ${n} must be less than ragged tensor input flatValues.rank = ${r})`);for(let s=0;s<Math.min(n,r-1);++s){const o=e[s],i=t[s+1];if(o>=0&&i>=0&&o!==1&&o!==i)throw new Error(`defaultValue.shape=${e}, and ragged tensor input flatValues.shape=${t} are incompatible: defaultValue.shape[${s-e.length}] = ${o} but ragged tensor input.flatValues.shape[${s-e.length}] = ${i}`)}}/**
 * @license
 * Copyright 2017 Google LLC. All Rights Reserved.
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
 */const ve=30;function jo(e){return e<=ve?e:Ct(e,Math.floor(Math.sqrt(e)))}/**
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
 */function Ho(e,t,n){const r=n*(typeof e=="number"?e:e[0]),s=t*(typeof e=="number"?e:e[1]);return[r,s]}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function Ko(e,t,n,r=!0){let s=[];if(r)s=s.concat(t.slice(0)),s.push(e[0]/n),s=s.concat(e.slice(1));else{s=s.concat(e[0]);const o=t.length;for(let i=0;i<o;++i)s=s.concat([e[i+1]/t[i],t[i]]);s=s.concat(e.slice(o+1))}return s}function Zo(e,t,n=!0){const r=[];if(n){r.push(t);for(let s=t+1;s<e;++s)s<=2*t?(r.push(s),r.push(s-(t+1))):r.push(s)}else{const s=[],o=[];for(let i=1;i<e;++i)i>=t*2+1||i%2===1?o.push(i):s.push(i);r.push(...s),r.push(0),r.push(...o)}return r}function Xo(e,t,n,r=!0){const s=[];r?s.push(e[0]/n):s.push(e[0]*n);for(let o=1;o<e.length;++o)o<=t.length?r?s.push(t[o-1]*e[o]):s.push(e[o]/t[o-1]):s.push(e[o]);return s}function Yo(e,t){const n=[0];for(let r=0;r<t;++r)n.push(e[r][0]);return n}function Jo(e,t,n){const r=e.slice(0,1);for(let s=0;s<n;++s)r.push(e[s+1]-t[s][0]-t[s][1]);return r}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const Qo=1.7580993408473768,ti=1.0507009873554805;/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */const ei=.3275911,ni=.254829592,ri=-.284496736,si=1.421413741,oi=-1.453152027,ii=1.061405429;/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function ai(e,t){if(e.length!==t.length)throw new Error(`Cannot merge real and imag arrays of different lengths. real:${e.length}, imag: ${t.length}.`);const n=new Float32Array(e.length*2);for(let r=0;r<n.length;r+=2)n[r]=e[r/2],n[r+1]=t[r/2];return n}function li(e){const t=new Float32Array(e.length/2),n=new Float32Array(e.length/2);for(let r=0;r<e.length;r+=2)t[r/2]=e[r],n[r/2]=e[r+1];return{real:t,imag:n}}function ci(e){const t=Math.ceil(e.length/4),n=new Float32Array(t),r=new Float32Array(t);for(let s=0;s<e.length;s+=4)n[Math.floor(s/4)]=e[s],r[Math.floor(s/4)]=e[s+1];return{real:n,imag:r}}function ui(e){const t=Math.floor(e.length/4),n=new Float32Array(t),r=new Float32Array(t);for(let s=2;s<e.length;s+=4)n[Math.floor(s/4)]=e[s],r[Math.floor(s/4)]=e[s+1];return{real:n,imag:r}}function fi(e,t){const n=e[t*2],r=e[t*2+1];return{real:n,imag:r}}function hi(e,t,n,r){e[r*2]=t,e[r*2+1]=n}function di(e,t){const n=new Float32Array(e/2),r=new Float32Array(e/2);for(let s=0;s<Math.ceil(e/2);s++){const o=(t?2:-2)*Math.PI*(s/e);n[s]=Math.cos(o),r[s]=Math.sin(o)}return{real:n,imag:r}}function gi(e,t,n){const r=(n?2:-2)*Math.PI*(e/t),s=Math.cos(r),o=Math.sin(r);return{real:s,imag:o}}/**
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
 */const Qt="->",pi=/->/g,Ve=",",ze="...";function mi(e,t){e=e.replace(/\s/g,"");const n=(e.length-e.replace(pi,"").length)/Qt.length;if(n<1)throw new Error("Equations without an arrow are not supported.");if(n>1)throw new Error(`Equation must contain exactly one arrow ("${Qt}").`);const[r,s]=e.split(Qt);k(r.indexOf(ze)===-1,()=>`The ellipsis notation ("${ze}") is not supported yet.`);const o=r.split(Ve),i=o.length;if(t!==i)throw new Error(`Expected ${i} input tensors, received ${t}`);if(i>2)throw new Error("Support for more than 2 input tensors is not implemented yet.");const a=[];for(let h=0;h<s.length;++h){const g=s[h];if(!o.some(y=>y.indexOf(g)!==-1))throw new Error(`Output subscripts contain the label ${g} not present in the input subscripts.`);a.indexOf(g)===-1&&a.push(g)}for(let h=0;h<r.length;++h){const g=r[h];a.indexOf(g)===-1&&g!==Ve&&a.push(g)}const l=new Array(o.length);for(let h=0;h<i;++h){if(new Set(o[h].split("")).size!==o[h].length)throw new Error(`Found duplicate axes in input component ${o[h]}. Support for duplicate axes in input is not implemented yet.`);l[h]=[];for(let g=0;g<o[h].length;++g)l[h].push(a.indexOf(o[h][g]))}const u=a.length,d=s.length,f=[];for(let h=d;h<u;++h)f.push(h);return{allDims:a,summedDims:f,idDims:l}}function wi(e,t){let n=new Array(e);n.fill(-1);for(let s=0;s<t.length;++s)n[t[s]]=s;const r=[];for(let s=0;s<e;++s)n[s]===-1&&r.push(s);return n=n.filter(s=>s!==-1),{permutationIndices:n,expandDims:r}}function yi(e,t,n){const r=new Array(e);for(let s=0;s<n.length;++s){const o=n[s].shape;for(let i=0;i<t[s].length;++i)r[t[s][i]]===void 0?r[t[s][i]]=o[i]:k(r[t[s][i]]===o[i],()=>`Expected dimension ${r[t[s][i]]} at axis ${i} of input shaped ${JSON.stringify(o)}, but got dimension ${o[i]}`)}}function bi(e,t){const n=e,r=[];let s=0;e.length===0&&n.push(-1),s=e.length+1;for(let i=0;i<s;++i)r.push([]);const o=[];for(let i=0;i<n.length;++i){const a=n[i],l=Ei(t,a);for(const u of l)o.indexOf(u)===-1&&(r[i].push(u),o.push(u))}return{path:n,steps:r}}function Si(e){return e.every((t,n)=>t===n)}function Ei(e,t){const n=[];for(let r=0;r<e.length;++r)(e[r].length===0||e[r].indexOf(t)!==-1||t===-1)&&n.push(r);return n}function Ii(e,t,n=0){let r=[];if(typeof t=="number")k(e.shape[n]%t===0,()=>"Number of splits must evenly divide the axis."),r=new Array(t).fill(e.shape[n]/t);else{const s=t.reduce((i,a)=>(a===-1&&(i+=1),i),0);k(s<=1,()=>"There should be only one negative value in split array.");const o=t.indexOf(-1);if(o!==-1){const i=t.reduce((a,l)=>l>0?a+l:a);t[o]=e.shape[n]-i}k(e.shape[n]===t.reduce((i,a)=>i+a),()=>"The sum of sizes must match the size of the axis dimension."),r=t}return r}/**
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
 */function ki(e){return`Received SparseTensor with denseShape[0] = 0 but
  indices.shape[0] = ${e}`}function Ti(e,t){return`indices(${e}, 0) is invalid: ${t} < 0`}function Ai(e,t,n){return`indices(${e}, 0) is invalid: ${t} >= ${n}`}/**
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
 */function $i(e,t){return`only one output dimension may be -1, not both ${e} and ${t}`}function Fi(e,t){return`size ${e} must be non-negative, not ${t}`}function Mi(){return"reshape cannot infer the missing input size for an empty tensor unless all specified input sizes are non-zero"}function vi(e,t){const n=O(e),r=O(t);return`Input to reshape is a SparseTensor with ${n}
  dense values, but the requested shape requires a multiple of ${r}. inputShape=${e} outputShape= ${t}`}function xi(e,t){const n=O(e),r=O(t);return`Input to reshape is a tensor with ${n} dense values, but the requested shape has ${r}. inputShape=${e} outputShape=${t}`}/**
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
 */function _i(){return"segment ids must be >= 0"}function Di(){return"segment ids are not increasing"}function Bi(e,t){return`Segment id ${e} out of range [0, ${t}), possibly because segmentIds input is not sorted.`}function Ri(e,t,n){return`Bad: indices[${e}] == ${t} out of range [0, ${n})`}/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function Ni(e,t){let n=!1,r;for(e<=ve?(r=e,n=!0):r=Ct(e,Math.floor(Math.sqrt(e)));!n;)r>t||r===e?n=!0:r=Ct(e,r+1);return r}function Oi(e,t,n){const r=[],s=e.length;for(let o=0;o<s;o++)o!==t?r.push(e[o]):r.push(n);return r}function Li(e,t,n,r){const s=t.shape.length,o=e.shape.length;if(r!==0&&(r<-s||r>s))throw new Error(`Expect batchDims in the range of [-${s}, ${s}], but got ${r}`);if(r<0&&(r+=s),r>o)throw new Error(`batchDims (${r}) must be less than rank(x) (
    ${o}).`);if(n<r)throw new Error(`batchDims (${r}) must be less than or equal to axis (${n}).`);for(let f=0;f<r;++f)if(e.shape[f]!==t.shape[f])throw new Error(`x.shape[${f}]: ${e.shape[f]} should be equal to indices.shape[${f}]: ${t.shape[f]}.`);const i=e.shape[n],a=[];let l=1,u=1,d=1;for(let f=0;f<r;++f)a.push(e.shape[f]),l*=e.shape[f];for(let f=r;f<n;f++)a.push(e.shape[f]),u*=e.shape[f];for(let f=r;f<s;f++)a.push(t.shape[f]);for(let f=n+1;f<o;f++)a.push(e.shape[f]),d*=e.shape[f];return{batchSize:l,sliceSize:d,outerSize:u,dimSize:i,outputShape:a}}const Pi=Object.freeze(Object.defineProperty({__proto__:null,collectGatherOpShapeInfo:Li,computeOutShape:Oi,segOpComputeOptimalWindowSize:Ni},Symbol.toStringTag,{value:"Module"}));/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
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
 */function xe(e){try{return e.map(t=>Ut(t))}catch(t){throw new Error(`Failed to decode encoded string bytes into utf-8, error: ${t}`)}}function Hn(e){return e.map(t=>ut(t))}const Pu=Object.freeze(Object.defineProperty({__proto__:null,ERF_A1:ni,ERF_A2:ri,ERF_A3:si,ERF_A4:oi,ERF_A5:ii,ERF_P:ei,PARALLELIZE_THRESHOLD:ve,get RowPartitionType(){return et},SELU_SCALE:ti,SELU_SCALEALPHA:Qo,applyActivation:Po,assertAndGetBroadcastShape:Mn,assertAxesAreInnerMostDims:yo,assertParamsConsistent:Uo,assignToTypedArray:hi,axesAreInnerMostDims:Me,calculateShapes:_n,checkEinsumDimSizes:yi,checkPadOnDimRoundingMode:lo,combineLocations:jn,combineRaggedTensorToTensorShapes:Wo,complexWithEvenIndex:ci,complexWithOddIndex:ui,computeConv2DInfo:$e,computeConv3DInfo:zn,computeDefaultPad:Fe,computeDilation2DInfo:to,computeOptimalWindowSize:jo,computeOutAndReduceShapes:mo,computeOutShape:Go,computePool2DInfo:eo,computePool3DInfo:no,convertConv2DDataFormat:qn,decodeEinsumEquation:mi,eitherStridesOrDilationsAreOne:ao,expandShapeToKeepDim:wo,exponent:gi,exponents:di,fromStringArrayToUint8:Hn,fromUint8ToStringArray:xe,getAxesPermutation:bo,getBroadcastDims:Fn,getComplexWithIndex:fi,getEinsumComputePath:bi,getEinsumPermutation:wi,getFusedBiasGradient:Lo,getFusedDyActivation:Oo,getImageCenter:Ho,getInnerMostAxes:Eo,getPermuted:Zo,getRaggedRank:zo,getReductionAxes:Te,getReshaped:Ko,getReshapedPermuted:Xo,getRowPartitionTypesHelper:Vo,getSliceBeginCoords:Yo,getSliceSize:Jo,getSparseFillEmptyRowsIndicesDenseShapeMismatch:ki,getSparseFillEmptyRowsNegativeIndexErrorMessage:Ti,getSparseFillEmptyRowsOutOfRangeIndexErrorMessage:Ai,getSparseReshapeEmptyTensorZeroOutputDimErrorMessage:Mi,getSparseReshapeInputOutputMismatchErrorMessage:xi,getSparseReshapeInputOutputMultipleErrorMessage:vi,getSparseReshapeMultipleNegativeOneOutputDimErrorMessage:$i,getSparseReshapeNegativeOutputDimErrorMessage:Fi,getSparseSegmentReductionIndicesOutOfRangeErrorMessage:Ri,getSparseSegmentReductionNegativeSegmentIdsErrorMessage:_i,getSparseSegmentReductionNonIncreasingSegmentIdsErrorMessage:Di,getSparseSegmentReductionSegmentIdOutOfRangeErrorMessage:Bi,getUndoAxesPermutation:So,isIdentityPermutation:Si,log:Lr,mergeRealAndImagArrays:ai,prepareAndValidate:vn,prepareSplitSize:Ii,segment_util:Pi,shouldFuse:Co,slice_util:Ys,splitRealAndImagArrays:li,tupleValuesAreOne:me,upcastType:Ee,validateDefaultValueShape:qo,validateInput:xn,validateUpdateShape:Ae,warn:st},Symbol.toStringTag,{value:"Module"}));/**
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
 */function Ci(e,t){Array.isArray(e)||(e=[e]),e.forEach(n=>{n!=null&&k(n.dtype!=="complex64",()=>`${t} does not support complex64 tensors in the CPU backend.`)})}/**
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
 */function Cu(e,t,n,r){const s=It(n,O(t));if(r&&n!=="string"){let o=0;e.forEach(i=>{const a=O(i.shape);s.set(i.vals,o),o+=a})}else{let o=0;e.forEach(i=>{const a=n==="string"?xe(i.vals):i.vals;let l=0;for(let u=0;u<i.shape[0];++u){const d=u*t[1]+o;for(let f=0;f<i.shape[1];++f)s[d+f]=a[l++]}o+=i.shape[1]})}return s}/**
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
 */function Uu(e,t,n,r){const s=e===t,o=e<t&&n<0,i=t<e&&n>1;if(s||o||i)return Mt(0,r);const a=Math.abs(Math.ceil((t-e)/n)),l=Mt(a,r);t<e&&n===1&&(n=-1),l[0]=e;for(let u=1;u<l.length;u++)l[u]=l[u-1]+n;return l}/**
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
 */function Ui(e,t,n,r,s){const o=Gn(r,t,n),i=O(n),a=gt(r);if(o){const f=Wn(t,a);return s==="string"?e.slice(f,f+i):e.subarray(f,f+i)}const l=s==="string"?xe(e):e,u=de(r,s,l),d=de(n,s);for(let f=0;f<d.size;++f){const h=d.indexToLoc(f),g=h.map((y,w)=>y+t[w]);d.set(u.get(...g),...h)}return s==="string"?Hn(d.values):d.values}function Gi(e){const{inputs:t,backend:n,attrs:r}=e,{x:s}=t,{begin:o,size:i}=r;Ci(s,"slice");const[a,l]=Vn(s,o,i);Dn(s,a,l);const u=n.data.get(s.dataId).values,d=Ui(u,a,l,s.shape,s.dtype);return n.makeTensorInfo(l,s.dtype,d)}const Gu={kernelName:Br,backendName:"cpu",kernelFunc:Gi};/**
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
 */class Wi{constructor(t,n,r,s,o,i){this.separator=ut(t),this.nGramWidths=n,this.leftPad=ut(r),this.rightPad=ut(s),this.padWidth=o,this.preserveShort=i}getPadWidth(t){return Math.min(this.padWidth<0?t-1:this.padWidth,t-1)}getNumNGrams(t,n){const r=this.getPadWidth(n);return Math.max(0,t+2*r-n+1)}createNGrams(t,n,r,s,o,i){for(let a=0;a<o;++a){const l=this.getPadWidth(i),u=Math.max(0,l-a),d=Math.max(0,l-(o-(a+1))),f=i-(u+d),h=n+(u>0?0:a-l);let g=0;g+=u*this.leftPad.length;for(let T=0;T<f;++T)g+=t[h+T].length;g+=d*this.rightPad.length;const y=u+d+f-1;g+=y*this.separator.length,r[s+a]=new Uint8Array(g);const w=r[s+a];let I=0;const S=T=>T.forEach(b=>w[I++]=b);for(let T=0;T<u;++T)S(this.leftPad),S(this.separator);for(let T=0;T<f-1;++T)S(t[h+T]),S(this.separator);if(f>0){S(t[h+f-1]);for(let T=0;T<d;++T)S(this.separator),S(this.rightPad)}else{for(let T=0;T<d-1;++T)S(this.rightPad),S(this.separator);S(this.rightPad)}}}compute(t,n){const r=t.length,s=n.length;if(s>0){let l=n[0];if(l!==0)throw new Error(`First split value must be 0, got ${l}`);for(let u=1;u<s;++u){let d=n[u]>=l;if(d=d&&n[u]<=r,!d)throw new Error(`Invalid split value ${n[u]}, must be in [${l}, ${r}]`);l=n[u]}if(l!==r)throw new Error(`Last split value must be data size. Expected ${r}, got ${l}`)}const o=s-1,i=It("int32",s);if(r===0||s===0){const l=new Array(r);for(let u=0;u<=o;++u)i[u]=0;return[l,i]}i[0]=0;for(let l=1;l<=o;++l){const u=n[l]-n[l-1];let d=0;this.nGramWidths.forEach(f=>{d+=this.getNumNGrams(u,f)}),this.preserveShort&&u>0&&d===0&&(d=1),i[l]=i[l-1]+d}const a=new Array(i[o]);for(let l=0;l<o;++l){const u=n[l];let d=i[l];if(this.nGramWidths.forEach(f=>{const h=n[l+1]-n[l],g=this.getNumNGrams(h,f);this.createNGrams(t,u,a,d,g,f),d+=g}),this.preserveShort&&d===i[l]){const f=n[l+1]-n[l];if(f===0)continue;const h=f+2*this.padWidth;this.createNGrams(t,u,a,d,1,h)}}return[a,i]}}function Wu(e,t,n,r,s,o,i,a){return new Wi(n,r,s,o,i,a).compute(e,t)}/**
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
 */function Vi(e,t,n,r){if(!e.length)return;if(t.length===0){for(let o=0;o<e.length;++o)r.push(e.subarray(o,o+1));return}if(t.length===1){const o=t[0];let i=e.indexOf(o);for(;i!==-1;){const a=e.subarray(0,i);(!n||a.length!==0)&&r.push(a),e=e.subarray(i+1),i=e.indexOf(o)}(!n||e.length!==0)&&r.push(e);return}let s=0;for(let o=0;o<e.length+1;o++)if(o===e.length||t.indexOf(e[o])!==-1){const i=e.subarray(s,o);(!n||i.length!==0)&&r.push(i),s=o+1}}function Vu(e,t,n){const r=e.length,s=[];let o=0,i=0;const a=new Array(r);for(let h=0;h<r;++h){const g=s.length;Vi(e[h],t,n,s);const y=s.length-g;a[h]=y,o+=y,i=Math.max(i,y)}const l=It("int32",o*2),u=new Array(o),d=[r,i];let f=0;for(let h=0;h<r;++h)for(let g=0;g<a[h];++g)l[f*2]=h,l[f*2+1]=g,u[f]=s[f],++f;return[l,u,d]}/**
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
 */function zu(e,t){const n=It("int32",e.length);for(let r=0;r<e.length;++r)n[r]=un(e[r]).modulo(t).getLowBitsUnsigned();return n}export{Ia as $,ji as A,ea as B,na as C,sa as D,$ as E,Pc as F,ra as G,oa as H,aa as I,la as J,ia as K,ca as L,ua as M,fa as N,da as O,ha as P,rn as Q,ga as R,pa as S,Q as T,Ar as U,ma as V,wa as W,ya as X,ba as Y,Sa as Z,Ea as _,k as a,kl as a$,ka as a0,Ta as a1,Aa as a2,Ma as a3,$a as a4,Fa as a5,qi as a6,va as a7,xa as a8,_a as a9,tl as aA,el as aB,nl as aC,sn as aD,rl as aE,sl as aF,ol as aG,il as aH,Qn as aI,yl as aJ,bl as aK,Fr as aL,al as aM,ll as aN,cl as aO,ul as aP,fl as aQ,ml as aR,hl as aS,dl as aT,gl as aU,pl as aV,wl as aW,Sl as aX,Il as aY,Tl as aZ,Al as a_,Da as aa,Ba as ab,Ra as ac,Na as ad,La as ae,Oa as af,en as ag,Ca as ah,$r as ai,Ua as aj,yr as ak,Wa as al,Ga as am,Va as an,za as ao,qa as ap,ja as aq,Ha as ar,Ka as as,Za as at,Xa as au,Ya as av,Gc as aw,Wc as ax,Qa as ay,Ja as az,$n as b,Ic as b$,$l as b0,El as b1,Fl as b2,Ml as b3,vl as b4,xl as b5,_l as b6,Dl as b7,Mr as b8,Bl as b9,Yl as bA,tc as bB,Cc as bC,ec as bD,nc as bE,rc as bF,sc as bG,oc as bH,ic as bI,Rr as bJ,cc as bK,ac as bL,lc as bM,Br as bN,gc as bO,uc as bP,hc as bQ,pc as bR,mc as bS,wc as bT,yc as bU,bc as bV,dc as bW,fc as bX,Ec as bY,Sc as bZ,Or as b_,Nl as ba,Ol as bb,Ll as bc,Rl as bd,gs as be,Cl as bf,Pl as bg,Ul as bh,Gl as bi,Wl as bj,Vl as bk,vr as bl,zl as bm,ql as bn,jl as bo,Hl as bp,Le as bq,Kl as br,Pa as bs,Zl as bt,xr as bu,Dr as bv,_r as bw,Jl as bx,Ql as by,Xl as bz,U as c,Zc as c$,kc as c0,Tc as c1,Ac as c2,$c as c3,Nr as c4,Fc as c5,Mc as c6,es as c7,vc as c8,xc as c9,xu as cA,Nu as cB,Fu as cC,Be as cD,ne as cE,ku as cF,Ao as cG,bu as cH,Qs as cI,Fo as cJ,Vs as cK,Su as cL,$u as cM,_u as cN,Vc as cO,Pr as cP,_o as cQ,Bo as cR,Mu as cS,Ou as cT,Au as cU,Bu as cV,ho as cW,Ys as cX,No as cY,ko as cZ,Kc as c_,_c as ca,Dc as cb,Bc as cc,Rc as cd,Nc as ce,Oc as cf,se as cg,Lc as ch,Uc as ci,Du as cj,Pu as ck,Ru as cl,de as cm,Ws as cn,ms as co,jc as cp,mu as cq,Xc as cr,pu as cs,Iu as ct,wu as cu,po as cv,gu as cw,du as cx,yu as cy,vu as cz,ut as d,nu as d$,Tu as d0,qc as d1,zc as d2,Ee as d3,Hc as d4,Mn as d5,He as d6,bo as d7,Eo as d8,yo as d9,Ho as dA,_n as dB,Ai as dC,Ti as dD,ki as dE,xi as dF,vi as dG,Fi as dH,$i as dI,Mi as dJ,_i as dK,Ri as dL,Bi as dM,Di as dN,Ii as dO,Zs as dP,Hs as dQ,Wu as dR,Vu as dS,zu as dT,Lu as dU,xt as dV,te as dW,ru as dX,tu as dY,eu as dZ,R as d_,mo as da,wo as db,eo as dc,fr as dd,Vn as de,Gn as df,gt as dg,Wn as dh,Ui as di,Ko as dj,Zo as dk,Xo as dl,Yo as dm,Jo as dn,Uo as dp,Go as dq,Cu as dr,Hn as ds,qn as dt,$e as du,So as dv,vn as dw,Li as dx,je as dy,Uu as dz,F as e,zn as e$,yn as e0,Ue as e1,Qc as e2,su as e3,fu as e4,Jc as e5,lu as e6,Es as e7,au as e8,cu as e9,ss as eA,Je as eB,qe as eC,wt as eD,ye as eE,Ie as eF,as as eG,st as eH,ai as eI,Ut as eJ,Ci as eK,Fn as eL,wr as eM,mr as eN,gr as eO,jt as eP,xe as eQ,It as eR,qr as eS,Vo as eT,zo as eU,et as eV,qo as eW,Wo as eX,Lt as eY,no as eZ,Gi as e_,hu as ea,iu as eb,ou as ec,uu as ed,hn as ee,or as ef,ws as eg,ao as eh,lo as ei,Yc as ej,Pt as ek,ee as el,Mt as em,tn as en,hr as eo,is as ep,xn as eq,dr as er,Co as es,Po as et,Oo as eu,me as ev,Lo as ew,Te as ex,Qo as ey,ti as ez,mn as f,to as f0,pr as f1,mi as f2,yi as f3,bi as f4,wi as f5,Si as f6,ii as f7,oi as f8,si as f9,ri as fa,ni as fb,ei as fc,fi as fd,li as fe,ci as ff,ui as fg,di as fh,hi as fi,gi as fj,qt as fk,Ft as fl,Gu as fm,lr as fn,er as fo,$t as fp,ds as fq,ur as fr,nr as fs,pn as ft,jo as fu,Dn as fv,Oi as fw,Ni as fx,De as g,Vt as h,zt as i,rt as j,_t as k,Eu as l,Hr as m,Hi as n,X as o,Ki as p,Tr as q,uo as r,O as s,Yt as t,Zi as u,Xi as v,Yi as w,Ji as x,Qi as y,ta as z};
