function Kn(t,e){return e.forEach(function(n){n&&typeof n!="string"&&!Array.isArray(n)&&Object.keys(n).forEach(function(r){if(r!=="default"&&!(r in t)){var s=Object.getOwnPropertyDescriptor(n,r);Object.defineProperty(t,r,s.get?s:{enumerable:!0,get:function(){return n[r]}})}})}),Object.freeze(t)}/**
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
 */const Zn=1e-7,Xn=1e-4;class Vi{constructor(e,n){this.backend=e,this.dataMover=n,this.data=new WeakMap,this.dataIdsCount=0}get(e){return this.data.has(e)||this.dataMover.moveData(this.backend,e),this.data.get(e)}set(e,n){this.dataIdsCount++,this.data.set(e,n)}has(e){return this.data.has(e)}delete(e){return this.dataIdsCount--,this.data.delete(e)}numDataIds(){return this.dataIdsCount}}class Yn{refCount(e){return Z("refCount")}incRef(e){return Z("incRef")}timerAvailable(){return!0}time(e){return Z("time")}read(e){return Z("read")}readSync(e){return Z("readSync")}readToGPU(e,n){return Z("readToGPU")}numDataIds(){return Z("numDataIds")}disposeData(e,n){return Z("disposeData")}write(e,n,r){return Z("write")}move(e,n,r,s,o){return Z("move")}memory(){return Z("memory")}floatPrecision(){return Z("floatPrecision")}epsilon(){return this.floatPrecision()===32?Zn:Xn}dispose(){return Z("dispose")}}function Z(t){throw new Error(`'${t}' not yet implemented or not found in the registry. This kernel may not be supported by the tfjs backend you have chosen`)}/**
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
 */function qt(t){let e=t.length,n=0;for(;e>0;)n=Math.random()*e|0,e--,Le(t,e,n)}function Jn(t,e){if(t.length!==e.length)throw new Error(`Array sizes must match to be shuffled together First array length was ${t.length}Second array length was ${e.length}`);let n=t.length,r=0;for(;n>0;)r=Math.random()*n|0,n--,Le(t,n,r),Le(e,n,r)}function $e(t,e,n){return Math.max(t,Math.min(e,n))}function Qn(t){return t%2===0?t:t+1}function Le(t,e,n){const r=t[e];t[e]=t[n],t[n]=r}function er(t){let e=0;for(let n=0;n<t.length;n++)e+=t[n];return e}function tr(t,e){const n=Math.random();return e*n+(1-n)*t}function nr(t,e){let n=0;for(let r=0;r<t.length;r++){const s=Number(t[r])-Number(e[r]);n+=s*s}return n}function k(t,e){if(!t)throw new Error(typeof e=="string"?e:e())}function jt(t,e,n=""){k(ze(t,e),()=>n+` Shapes ${t} and ${e} must match`)}function rr(t){k(t!=null,()=>"The input to the tensor constructor must be a non-null value.")}function xe(t,e=[],n=!1){if(e==null&&(e=[]),Array.isArray(t)||re(t)&&!n)for(let r=0;r<t.length;++r)xe(t[r],e,n);else e.push(t);return e}function O(t){if(t.length===0)return 1;let e=t[0];for(let n=1;n<t.length;n++)e*=t[n];return e}function sr(t){return t.length===0}function ze(t,e){if(t===e)return!0;if(t==null||e==null||t.length!==e.length)return!1;for(let n=0;n<t.length;n++)if(t[n]!==e[n])return!1;return!0}function Pe(t){return t%1===0}function or(t){if(Math.tanh!=null)return Math.tanh(t);if(t===1/0)return 1;if(t===-1/0)return-1;{const e=Math.exp(2*t);return(e-1)/(e+1)}}function ir(t){const e=Math.ceil(Math.sqrt(t));return[e,Math.ceil(t/e)]}function ar(t){const e=new Uint32Array(t);for(let n=0;n<t;++n)e[n]=n;return qt(e),e}function Fe(t,e){return e<=t.length?t:t+" ".repeat(e-t.length)}function lr(t,e=s=>0,n,r=setTimeout){return new Promise((s,o)=>{let i=0;const a=()=>{if(t()){s();return}i++;const l=e(i);if(n!=null&&i>=n){o();return}r(a,l)};a()})}function cr(t,e){let n=1,r=-1;for(let o=0;o<t.length;++o)if(t[o]>=0)n*=t[o];else if(t[o]===-1){if(r!==-1)throw Error(`Shapes can only have 1 implicit size. Found -1 at dim ${r} and dim ${o}`);r=o}else if(t[o]<0)throw Error(`Shapes can not be < 0. Found ${t[o]} at dim ${o}`);if(r===-1){if(e>0&&e!==n)throw Error(`Size(${e}) must match the product of shape ${t}`);return t}if(n===0)throw Error(`Cannot infer the missing size in [${t}] when there are 0 elements`);if(e%n!==0)throw Error(`The implicit shape can't be a fractional number. Got ${e} / ${n}`);const s=t.slice();return s[r]=e/n,s}function Ht(t,e){const n=e.length;return t=t==null?e.map((r,s)=>s):[].concat(t),k(t.every(r=>r>=-n&&r<n),()=>`All values in axis param must be in range [-${n}, ${n}) but got axis ${t}`),k(t.every(r=>Pe(r)),()=>`All values in axis param must be integers but got axis ${t}`),t.map(r=>r<0?n+r:r)}function ur(t,e){const n=[],r=[],s=e!=null&&Array.isArray(e)&&e.length===0,o=e==null||s?null:Ht(e,t).sort();let i=0;for(let a=0;a<t.length;++a){if(o!=null){if(o[i]===a&&t[a]!==1)throw new Error(`Can't squeeze axis ${a} since its dim '${t[a]}' is not 1`);(o[i]==null||o[i]>a)&&t[a]===1&&(n.push(t[a]),r.push(a)),o[i]<=a&&i++}t[a]!==1&&(n.push(t[a]),r.push(a))}return{newShape:n,keptDims:r}}function fr(t,e){let n=null;if(t==null||t==="float32")n=new Float32Array(e);else if(t==="int32")n=new Int32Array(e);else if(t==="bool")n=new Uint8Array(e);else throw new Error(`Unknown data type ${t}`);return n}function Ie(t,e){let n=null;if(t==null||t==="float32")n=new Float32Array(e);else if(t==="int32")n=new Int32Array(e);else if(t==="bool")n=new Uint8Array(e);else if(t==="string")n=new Array(e);else throw new Error(`Unknown data type ${t}`);return n}function Kt(t,e){for(let n=0;n<t.length;n++){const r=t[n];if(isNaN(r)||!isFinite(r))throw Error(`A tensor of type ${e} being uploaded contains ${r}.`)}}function Zt(t){return t==="bool"||t==="complex64"||t==="float32"||t==="int32"||t==="string"}function hr(t,e){return!(e==="complex64"||e==="float32"&&t!=="complex64"||e==="int32"&&t!=="float32"&&t!=="complex64"||e==="bool"&&t==="bool")}function re(t){return t instanceof Float32Array||t instanceof Int32Array||t instanceof Uint8Array||t instanceof Uint8ClampedArray}function et(t){if(t==="float32"||t==="int32")return 4;if(t==="complex64")return 8;if(t==="bool")return 1;throw new Error(`Unknown dtype ${t}`)}function Xt(t){if(t==null)return 0;let e=0;return t.forEach(n=>e+=n.length),e}function Ve(t){return typeof t=="string"||t instanceof String}function Yt(t){return typeof t=="boolean"}function Jt(t){return typeof t=="number"}function qe(t){return Array.isArray(t)?qe(t[0]):t instanceof Float32Array?"float32":t instanceof Int32Array||t instanceof Uint8Array||t instanceof Uint8ClampedArray?"int32":Jt(t)?"float32":Ve(t)?"string":Yt(t)?"bool":"float32"}function tt(t){return!!(t&&t.constructor&&t.call&&t.apply)}function Ce(t,e){for(let n=e;n<t;++n)if(t%n===0)return n;return t}function ge(t){const e=t.length;if(e<2)return[];const n=new Array(e-1);n[e-2]=t[e-1];for(let r=e-3;r>=0;--r)n[r]=n[r+1]*t[r+1];return n}function Qt(t,e,n,r=!1){const s=new Array;if(e.length===1){const o=e[0]*(r?2:1);for(let i=0;i<o;i++)s[i]=n[t+i]}else{const o=e[0],i=e.slice(1),a=i.reduce((l,u)=>l*u)*(r?2:1);for(let l=0;l<o;l++)s[l]=Qt(t+l*a,i,n,r)}return s}function we(t,e,n=!1){if(t.length===0)return e[0];const r=t.reduce((s,o)=>s*o)*(n?2:1);if(r===0)return[];if(r!==e.length)throw new Error(`[${t}] does not match the input size ${e.length}${n?" for a complex tensor":""}.`);return Qt(0,t,e,n)}function en(t,e){const n=ve(t,e);for(let r=0;r<n.length;r++)n[r]=1;return n}function ve(t,e){if(e==null||e==="float32"||e==="complex64")return new Float32Array(t);if(e==="int32")return new Int32Array(t);if(e==="bool")return new Uint8Array(t);throw new Error(`Unknown data type ${e}`)}function dr(t,e){const n=t.reduce((r,s)=>r*s,1);if(e==null||e==="float32")return we(t,new Float32Array(n));if(e==="int32")return we(t,new Int32Array(n));if(e==="bool")return we(t,new Uint8Array(n));throw new Error(`Unknown data type ${e}`)}function wt(t){t.forEach(e=>{k(Number.isInteger(e)&&e>=0,()=>`Tensor must have a shape comprised of positive integers but got shape [${t}].`)})}function gr(t,e,n){if(e===0)return 0;if(e===1)return t[0];let r=t[t.length-1];for(let s=0;s<t.length-1;++s)r+=n[s]*t[s];return r}function pr(t,e,n){if(e===0)return[];if(e===1)return[t];const r=new Array(e);for(let s=0;s<r.length-1;++s)r[s]=Math.floor(t/n[s]),t-=r[s]*n[s];return r[r.length-1]=t,r}function yt(t){return t&&t.then&&typeof t.then=="function"}/**
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
 */const xt="tfjsflags";class mr{constructor(e){this.global=e,this.flags={},this.flagRegistry={},this.urlFlags={},this.getQueryParams=wr,this.populateURLFlags()}setPlatform(e,n){this.platform!=null&&($().getBool("IS_TEST")||$().getBool("PROD")||console.warn(`Platform ${this.platformName} has already been set. Overwriting the platform with ${e}.`)),this.platformName=e,this.platform=n}registerFlag(e,n,r){if(this.flagRegistry[e]={evaluationFn:n,setHook:r},this.urlFlags[e]!=null){const s=this.urlFlags[e];$().getBool("IS_TEST")||$().getBool("PROD")||console.warn(`Setting feature override from URL ${e}: ${s}.`),this.set(e,s)}}async getAsync(e){return e in this.flags?this.flags[e]:(this.flags[e]=await this.evaluateFlag(e),this.flags[e])}get(e){if(e in this.flags)return this.flags[e];const n=this.evaluateFlag(e);if(yt(n))throw new Error(`Flag ${e} cannot be synchronously evaluated. Please use getAsync() instead.`);return this.flags[e]=n,this.flags[e]}getNumber(e){return this.get(e)}getBool(e){return this.get(e)}getFlags(){return this.flags}get features(){return this.flags}set(e,n){if(this.flagRegistry[e]==null)throw new Error(`Cannot set flag ${e} as it has not been registered.`);this.flags[e]=n,this.flagRegistry[e].setHook!=null&&this.flagRegistry[e].setHook(n)}evaluateFlag(e){if(this.flagRegistry[e]==null)throw new Error(`Cannot evaluate flag '${e}': no evaluation function found.`);return this.flagRegistry[e].evaluationFn()}setFlags(e){this.flags=Object.assign({},e)}reset(){this.flags={},this.urlFlags={},this.populateURLFlags()}populateURLFlags(){if(typeof this.global>"u"||typeof this.global.location>"u"||typeof this.global.location.search>"u")return;const e=this.getQueryParams(this.global.location.search);xt in e&&e[xt].split(",").forEach(r=>{const[s,o]=r.split(":");this.urlFlags[s]=br(s,o)})}}function wr(t){const e={};return t.replace(/[?&]([^=?&]+)(?:=([^&]*))?/g,(n,...r)=>(yr(e,r[0],r[1]),r.join("="))),e}function yr(t,e,n){t[decodeURIComponent(e)]=decodeURIComponent(n||"")}function br(t,e){if(e=e.toLowerCase(),e==="true"||e==="false")return e==="true";if(`${+e}`===e)return+e;throw new Error(`Could not parse value flag value ${e} for flag ${t}.`)}function $(){return tn}let tn=null;function Sr(t){tn=t}/**
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
 */let He;function nn(){if(He==null){let t;if(typeof window<"u")t=window;else if(typeof global<"u")t=global;else if(typeof process<"u")t=process;else if(typeof self<"u")t=self;else throw new Error("Could not find a global object");He=t}return He}function Er(){const t=nn();return t._tfGlobals==null&&(t._tfGlobals=new Map),t._tfGlobals}function bt(t,e){const n=Er();if(n.has(t))return n.get(t);{const r=e();return n.set(t,r),n.get(t)}}const qi="Abs",ji="Acos",Hi="Acosh",Ir="Add",Ki="AddN",Zi="All",Xi="Any",Yi="ArgMax",Ji="ArgMin",Qi="Asin",ea="Asinh",ta="Atan",na="Atanh",ra="Atan2",sa="AvgPool",oa="AvgPoolGrad",ia="AvgPool3D",aa="AvgPool3DGrad",la="BatchMatMul",ca="BatchToSpaceND",ua="Bincount",fa="BroadcastTo",ha="BroadcastArgs",rn="Cast",da="Ceil",ga="ClipByValue",kr="Complex",pa="ComplexAbs",ma="Concat",wa="Conv2D",ya="Conv2DBackpropFilter",ba="Conv2DBackpropInput",Sa="Conv3D",Ea="Conv3DBackpropFilterV2",Ia="Conv3DBackpropInputV2",ka="Cos",Aa="Cosh",Ta="Cumprod",Fa="Cumsum",$a="CropAndResize",va="DenseBincount",Ma="DepthToSpace",Da="DepthwiseConv2dNative",xa="DepthwiseConv2dNativeBackpropFilter",Ra="DepthwiseConv2dNativeBackpropInput",_a="Diag",Ba="Dilation2D",Na="Dilation2DBackpropInput",Oa="Dilation2DBackpropFilter",La="RealDiv",Pa="Einsum",Ar="Elu",Ca="EluGrad",Ua="Erf",Ga="Equal",Wa="Exp",za="ExpandDims",Va="Expm1",qa="FFT",ja="Fill",Ha="FlipLeftRight",Ka="Floor",Za="FloorDiv",Xa="FusedBatchNorm",Ya="GatherV2",Ja="GatherNd",Qa="Greater",el="GreaterEqual",sn="Identity",tl="IFFT",nl="Imag",rl="IsFinite",sl="IsInf",ol="IsNan",Tr="LeakyRelu",il="Less",al="LessEqual",ll="LinSpace",cl="Log",ul="Log1p",fl="LogicalAnd",hl="LogicalNot",dl="LogicalOr",gl="LogicalXor",pl="LogSoftmax",ml="LowerBound",wl="LRN",yl="LRNGrad",bl="Max",Sl="Maximum",El="MaxPool",Il="MaxPoolGrad",kl="MaxPool3D",Al="MaxPool3DGrad",Tl="MaxPoolWithArgmax",Fl="Mean",$l="Min",vl="Minimum",Ml="MirrorPad",Dl="Mod",xl="Multinomial",Fr="Multiply",Rl="Neg",_l="NotEqual",Bl="NonMaxSuppressionV3",Nl="NonMaxSuppressionV4",Ol="NonMaxSuppressionV5",Ll="OnesLike",Pl="OneHot",Cl="Pack",Ul="PadV2",Gl="Pool",Wl="Pow",$r="Prelu",zl="Prod",Vl="RaggedGather",ql="RaggedTensorToTensor",jl="Range",Hl="Real",Kl="Reciprocal",vr="Relu",Mr="Reshape",Zl="ResizeNearestNeighbor",Xl="ResizeNearestNeighborGrad",Yl="ResizeBilinear",Jl="ResizeBilinearGrad",Dr="Relu6",Ql="Reverse",ec="Round",tc="Rsqrt",nc="ScatterNd",rc="SearchSorted",sc="Select",oc="Selu",xr="Slice",ic="Sin",ac="Sinh",lc="Sign",Rr="Sigmoid",cc="Softplus",uc="Sqrt",_r="Sum",fc="SpaceToBatchND",hc="SplitV",dc="Softmax",gc="SparseFillEmptyRows",pc="SparseReshape",mc="SparseSegmentMean",wc="SparseSegmentSum",yc="SparseToDense",bc="SquaredDifference",Sc="Square",Ec="StridedSlice",Ic="StringNGrams",kc="StringSplit",Ac="StringToHashBucketFast",Tc="Sub",Fc="Tan",$c="Tanh",vc="Tile",Mc="TopK",Dc="Transform",xc="Transpose",Rc="Unique",_c="Unpack",Bc="UnsortedSegmentSum",Nc="UpperBound",Oc="ZerosLike",Br="Step",Lc="FromPixels",Pc="RotateWithOffset",Cc="_FusedMatMul",Uc="FusedConv2D",Gc="FusedDepthwiseConv2D";/**
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
 */function se(...t){$().getBool("IS_TEST")||$().getBool("PROD")||console.warn(...t)}function Nr(...t){$().getBool("IS_TEST")||$().getBool("PROD")||console.log(...t)}/**
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
 */const Se=bt("kernelRegistry",()=>new Map),Me=bt("gradRegistry",()=>new Map);function Rt(t,e){const n=St(t,e);return Se.get(n)}function _t(t){return Me.get(t)}function nt(t){const e=Se.entries(),n=[];for(;;){const{done:r,value:s}=e.next();if(r)break;const[o,i]=s,[a]=o.split("_");a===t&&n.push(i)}return n}function Or(t){const{kernelName:e,backendName:n}=t,r=St(e,n);Se.has(r)&&se(`The kernel '${e}' for backend '${n}' is already registered`),Se.set(r,t)}function Wc(t){const{kernelName:e}=t;Me.has(e)&&$().getBool("DEBUG")&&se(`Overriding the gradient for '${e}'`),Me.set(e,t)}function zc(t,e){const n=St(t,e);if(!Se.has(n))throw new Error(`The kernel '${t}' for backend '${e}' is not registered`);Se.delete(n)}function Vc(t){if(!Me.has(t))throw new Error(`The gradient '${t}' for backend is not registered`);Me.delete(t)}function qc(t,e){nt(t).forEach(r=>{const s=Object.assign({},r,{backendName:e});Or(s)})}function St(t,e){return`${e}_${t}`}var jc=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};function Lr(t){return t&&t.__esModule&&Object.prototype.hasOwnProperty.call(t,"default")?t.default:t}function Pr(t){if(Object.prototype.hasOwnProperty.call(t,"__esModule"))return t;var e=t.default;if(typeof e=="function"){var n=function r(){return this instanceof r?Reflect.construct(e,arguments,this.constructor):e.apply(this,arguments)};n.prototype=e.prototype}else n={};return Object.defineProperty(n,"__esModule",{value:!0}),Object.keys(t).forEach(function(r){var s=Object.getOwnPropertyDescriptor(t,r);Object.defineProperty(n,r,s.get?s:{enumerable:!0,get:function(){return t[r]}})}),n}var Ke,Bt;function Cr(){if(Bt)return Ke;Bt=1,Ke=e;var t=null;try{t=new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0,1,13,2,96,0,1,127,96,4,127,127,127,127,1,127,3,7,6,0,1,1,1,1,1,6,6,1,127,1,65,0,11,7,50,6,3,109,117,108,0,1,5,100,105,118,95,115,0,2,5,100,105,118,95,117,0,3,5,114,101,109,95,115,0,4,5,114,101,109,95,117,0,5,8,103,101,116,95,104,105,103,104,0,0,10,191,1,6,4,0,35,0,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,126,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,127,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,128,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,129,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,130,34,4,66,32,135,167,36,0,32,4,167,11])),{}).exports}catch{}function e(p,c,E){this.low=p|0,this.high=c|0,this.unsigned=!!E}e.prototype.__isLong__,Object.defineProperty(e.prototype,"__isLong__",{value:!0});function n(p){return(p&&p.__isLong__)===!0}e.isLong=n;var r={},s={};function o(p,c){var E,T,R;return c?(p>>>=0,(R=0<=p&&p<256)&&(T=s[p],T)?T:(E=a(p,(p|0)<0?-1:0,!0),R&&(s[p]=E),E)):(p|=0,(R=-128<=p&&p<128)&&(T=r[p],T)?T:(E=a(p,p<0?-1:0,!1),R&&(r[p]=E),E))}e.fromInt=o;function i(p,c){if(isNaN(p))return c?A:S;if(c){if(p<0)return A;if(p>=y)return q}else{if(p<=-w)return _;if(p+1>=w)return V}return p<0?i(-p,c).neg():a(p%g|0,p/g|0,c)}e.fromNumber=i;function a(p,c,E){return new e(p,c,E)}e.fromBits=a;var l=Math.pow;function u(p,c,E){if(p.length===0)throw Error("empty string");if(p==="NaN"||p==="Infinity"||p==="+Infinity"||p==="-Infinity")return S;if(typeof c=="number"?(E=c,c=!1):c=!!c,E=E||10,E<2||36<E)throw RangeError("radix");var T;if((T=p.indexOf("-"))>0)throw Error("interior hyphen");if(T===0)return u(p.substring(1),c,E).neg();for(var R=i(l(E,8)),M=S,L=0;L<p.length;L+=8){var j=Math.min(8,p.length-L),Y=parseInt(p.substring(L,L+j),E);if(j<8){var G=i(l(E,j));M=M.mul(G).add(i(Y))}else M=M.mul(R),M=M.add(i(Y))}return M.unsigned=c,M}e.fromString=u;function d(p,c){return typeof p=="number"?i(p,c):typeof p=="string"?u(p,c):a(p.low,p.high,typeof c=="boolean"?c:p.unsigned)}e.fromValue=d;var f=65536,h=1<<24,g=f*f,y=g*g,w=y/2,I=o(h),S=o(0);e.ZERO=S;var A=o(0,!0);e.UZERO=A;var b=o(1);e.ONE=b;var v=o(1,!0);e.UONE=v;var D=o(-1);e.NEG_ONE=D;var V=a(-1,2147483647,!1);e.MAX_VALUE=V;var q=a(-1,-1,!0);e.MAX_UNSIGNED_VALUE=q;var _=a(0,-2147483648,!1);e.MIN_VALUE=_;var m=e.prototype;return m.toInt=function(){return this.unsigned?this.low>>>0:this.low},m.toNumber=function(){return this.unsigned?(this.high>>>0)*g+(this.low>>>0):this.high*g+(this.low>>>0)},m.toString=function(c){if(c=c||10,c<2||36<c)throw RangeError("radix");if(this.isZero())return"0";if(this.isNegative())if(this.eq(_)){var E=i(c),T=this.div(E),R=T.mul(E).sub(this);return T.toString(c)+R.toInt().toString(c)}else return"-"+this.neg().toString(c);for(var M=i(l(c,6),this.unsigned),L=this,j="";;){var Y=L.div(M),G=L.sub(Y.mul(M)).toInt()>>>0,N=G.toString(c);if(L=Y,L.isZero())return N+j;for(;N.length<6;)N="0"+N;j=""+N+j}},m.getHighBits=function(){return this.high},m.getHighBitsUnsigned=function(){return this.high>>>0},m.getLowBits=function(){return this.low},m.getLowBitsUnsigned=function(){return this.low>>>0},m.getNumBitsAbs=function(){if(this.isNegative())return this.eq(_)?64:this.neg().getNumBitsAbs();for(var c=this.high!=0?this.high:this.low,E=31;E>0&&(c&1<<E)==0;E--);return this.high!=0?E+33:E+1},m.isZero=function(){return this.high===0&&this.low===0},m.eqz=m.isZero,m.isNegative=function(){return!this.unsigned&&this.high<0},m.isPositive=function(){return this.unsigned||this.high>=0},m.isOdd=function(){return(this.low&1)===1},m.isEven=function(){return(this.low&1)===0},m.equals=function(c){return n(c)||(c=d(c)),this.unsigned!==c.unsigned&&this.high>>>31===1&&c.high>>>31===1?!1:this.high===c.high&&this.low===c.low},m.eq=m.equals,m.notEquals=function(c){return!this.eq(c)},m.neq=m.notEquals,m.ne=m.notEquals,m.lessThan=function(c){return this.comp(c)<0},m.lt=m.lessThan,m.lessThanOrEqual=function(c){return this.comp(c)<=0},m.lte=m.lessThanOrEqual,m.le=m.lessThanOrEqual,m.greaterThan=function(c){return this.comp(c)>0},m.gt=m.greaterThan,m.greaterThanOrEqual=function(c){return this.comp(c)>=0},m.gte=m.greaterThanOrEqual,m.ge=m.greaterThanOrEqual,m.compare=function(c){if(n(c)||(c=d(c)),this.eq(c))return 0;var E=this.isNegative(),T=c.isNegative();return E&&!T?-1:!E&&T?1:this.unsigned?c.high>>>0>this.high>>>0||c.high===this.high&&c.low>>>0>this.low>>>0?-1:1:this.sub(c).isNegative()?-1:1},m.comp=m.compare,m.negate=function(){return!this.unsigned&&this.eq(_)?_:this.not().add(b)},m.neg=m.negate,m.add=function(c){n(c)||(c=d(c));var E=this.high>>>16,T=this.high&65535,R=this.low>>>16,M=this.low&65535,L=c.high>>>16,j=c.high&65535,Y=c.low>>>16,G=c.low&65535,N=0,J=0,C=0,K=0;return K+=M+G,C+=K>>>16,K&=65535,C+=R+Y,J+=C>>>16,C&=65535,J+=T+j,N+=J>>>16,J&=65535,N+=E+L,N&=65535,a(C<<16|K,N<<16|J,this.unsigned)},m.subtract=function(c){return n(c)||(c=d(c)),this.add(c.neg())},m.sub=m.subtract,m.multiply=function(c){if(this.isZero())return S;if(n(c)||(c=d(c)),t){var E=t.mul(this.low,this.high,c.low,c.high);return a(E,t.get_high(),this.unsigned)}if(c.isZero())return S;if(this.eq(_))return c.isOdd()?_:S;if(c.eq(_))return this.isOdd()?_:S;if(this.isNegative())return c.isNegative()?this.neg().mul(c.neg()):this.neg().mul(c).neg();if(c.isNegative())return this.mul(c.neg()).neg();if(this.lt(I)&&c.lt(I))return i(this.toNumber()*c.toNumber(),this.unsigned);var T=this.high>>>16,R=this.high&65535,M=this.low>>>16,L=this.low&65535,j=c.high>>>16,Y=c.high&65535,G=c.low>>>16,N=c.low&65535,J=0,C=0,K=0,_e=0;return _e+=L*N,K+=_e>>>16,_e&=65535,K+=M*N,C+=K>>>16,K&=65535,K+=L*G,C+=K>>>16,K&=65535,C+=R*N,J+=C>>>16,C&=65535,C+=M*G,J+=C>>>16,C&=65535,C+=L*Y,J+=C>>>16,C&=65535,J+=T*N+R*G+M*Y+L*j,J&=65535,a(K<<16|_e,J<<16|C,this.unsigned)},m.mul=m.multiply,m.divide=function(c){if(n(c)||(c=d(c)),c.isZero())throw Error("division by zero");if(t){if(!this.unsigned&&this.high===-2147483648&&c.low===-1&&c.high===-1)return this;var E=(this.unsigned?t.div_u:t.div_s)(this.low,this.high,c.low,c.high);return a(E,t.get_high(),this.unsigned)}if(this.isZero())return this.unsigned?A:S;var T,R,M;if(this.unsigned){if(c.unsigned||(c=c.toUnsigned()),c.gt(this))return A;if(c.gt(this.shru(1)))return v;M=A}else{if(this.eq(_)){if(c.eq(b)||c.eq(D))return _;if(c.eq(_))return b;var L=this.shr(1);return T=L.div(c).shl(1),T.eq(S)?c.isNegative()?b:D:(R=this.sub(c.mul(T)),M=T.add(R.div(c)),M)}else if(c.eq(_))return this.unsigned?A:S;if(this.isNegative())return c.isNegative()?this.neg().div(c.neg()):this.neg().div(c).neg();if(c.isNegative())return this.div(c.neg()).neg();M=S}for(R=this;R.gte(c);){T=Math.max(1,Math.floor(R.toNumber()/c.toNumber()));for(var j=Math.ceil(Math.log(T)/Math.LN2),Y=j<=48?1:l(2,j-48),G=i(T),N=G.mul(c);N.isNegative()||N.gt(R);)T-=Y,G=i(T,this.unsigned),N=G.mul(c);G.isZero()&&(G=b),M=M.add(G),R=R.sub(N)}return M},m.div=m.divide,m.modulo=function(c){if(n(c)||(c=d(c)),t){var E=(this.unsigned?t.rem_u:t.rem_s)(this.low,this.high,c.low,c.high);return a(E,t.get_high(),this.unsigned)}return this.sub(this.div(c).mul(c))},m.mod=m.modulo,m.rem=m.modulo,m.not=function(){return a(~this.low,~this.high,this.unsigned)},m.and=function(c){return n(c)||(c=d(c)),a(this.low&c.low,this.high&c.high,this.unsigned)},m.or=function(c){return n(c)||(c=d(c)),a(this.low|c.low,this.high|c.high,this.unsigned)},m.xor=function(c){return n(c)||(c=d(c)),a(this.low^c.low,this.high^c.high,this.unsigned)},m.shiftLeft=function(c){return n(c)&&(c=c.toInt()),(c&=63)===0?this:c<32?a(this.low<<c,this.high<<c|this.low>>>32-c,this.unsigned):a(0,this.low<<c-32,this.unsigned)},m.shl=m.shiftLeft,m.shiftRight=function(c){return n(c)&&(c=c.toInt()),(c&=63)===0?this:c<32?a(this.low>>>c|this.high<<32-c,this.high>>c,this.unsigned):a(this.high>>c-32,this.high>=0?0:-1,this.unsigned)},m.shr=m.shiftRight,m.shiftRightUnsigned=function(c){if(n(c)&&(c=c.toInt()),c&=63,c===0)return this;var E=this.high;if(c<32){var T=this.low;return a(T>>>c|E<<32-c,E>>>c,this.unsigned)}else return c===32?a(E,0,this.unsigned):a(E>>>c-32,0,this.unsigned)},m.shru=m.shiftRightUnsigned,m.shr_u=m.shiftRightUnsigned,m.toSigned=function(){return this.unsigned?a(this.low,this.high,!1):this},m.toUnsigned=function(){return this.unsigned?this:a(this.low,this.high,!0)},m.toBytes=function(c){return c?this.toBytesLE():this.toBytesBE()},m.toBytesLE=function(){var c=this.high,E=this.low;return[E&255,E>>>8&255,E>>>16&255,E>>>24,c&255,c>>>8&255,c>>>16&255,c>>>24]},m.toBytesBE=function(){var c=this.high,E=this.low;return[c>>>24,c>>>16&255,c>>>8&255,c&255,E>>>24,E>>>16&255,E>>>8&255,E&255]},e.fromBytes=function(c,E,T){return T?e.fromBytesLE(c,E):e.fromBytesBE(c,E)},e.fromBytesLE=function(c,E){return new e(c[0]|c[1]<<8|c[2]<<16|c[3]<<24,c[4]|c[5]<<8|c[6]<<16|c[7]<<24,E)},e.fromBytesBE=function(c,E){return new e(c[4]<<24|c[5]<<16|c[6]<<8|c[7],c[0]<<24|c[1]<<16|c[2]<<8|c[3],E)},Ke}var on=Cr(),an=Lr(on),Ur=Kn({__proto__:null,default:an},[on]);/**
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
 */const le=an||Ur;function Re(t){return le.fromString(t,!0,16)}const ln=Re("c3a5c85c97cb3127"),ae=Re("b492b66fbe98f273"),z=Re("9ae16a3b2f90404f");function rt(t){return t.xor(t.shru(47))}function cn(t,e,n){const r=t.slice(e,e+n);return le.fromBytes(Array.from(r),!0,!0)}function x(t,e){return cn(t,e,8)}function Nt(t,e){return cn(t,e,4)}function P(t,e){return e===0?t:t.shru(e).or(t.shl(64-e))}function ie(t,e,n=Re("9ddfea08eb382d69")){let r=t.xor(e).mul(n);r=r.xor(r.shru(47));let s=e.xor(r).mul(n);return s=s.xor(s.shru(47)),s=s.mul(n),s}function Gr(t,e,n,r,s,o){s=s.add(t),o=P(o.add(s).add(r),21);const i=s;return s=s.add(e),s=s.add(n),o=o.add(P(s,44)),[s.add(r),o.add(i)]}function Be(t,e,n,r){return Gr(x(t,e),x(t,e+8),x(t,e+16),x(t,e+24),n,r)}function Wr(t,e=t.length){if(e>=8){const n=z.add(e*2),r=x(t,0).add(z),s=x(t,e-8),o=P(s,37).mul(n).add(r),i=P(r,25).add(s).mul(n);return ie(o,i,n)}if(e>=4){const n=z.add(e*2),r=Nt(t,0);return ie(r.shl(3).add(e),Nt(t,e-4),n)}if(e>0){const n=t[0],r=t[e>>1],s=t[e-1],o=n+(r<<8),i=e+(s<<2);return rt(z.mul(o).xor(ln.mul(i))).mul(z)}return z}function zr(t,e=t.length){const n=z.add(e*2),r=x(t,0).mul(ae),s=x(t,8),o=x(t,e-8).mul(n),i=x(t,e-16).mul(z);return ie(P(r.add(s),43).add(P(o,30)).add(i),r.add(P(s.add(z),18)).add(o),n)}function Vr(t,e=t.length){const n=z.add(e*2),r=x(t,0).mul(z),s=x(t,8),o=x(t,e-8).mul(n),i=x(t,e-16).mul(z),a=P(r.add(s),43).add(P(o,30)).add(i),l=ie(a,r.add(P(s.add(z),18)).add(o),n),u=x(t,16).mul(n),d=x(t,24),f=a.add(x(t,e-32)).mul(n),h=l.add(x(t,e-24)).mul(n);return ie(P(u.add(d),43).add(P(f,30)).add(h),u.add(P(d.add(r),18)).add(f),n)}function un(t,e=t.length){const n=le.fromNumber(81,!0);if(e<=32)return e<=16?Wr(t,e):zr(t,e);if(e<=64)return Vr(t,e);let r=n,s=n.mul(ae).add(113),o=rt(s.mul(z).add(113)).mul(z),i=[le.UZERO,le.UZERO],a=[le.UZERO,le.UZERO];r=r.mul(z).add(x(t,0));let l=0;const u=(e-1>>6)*64,d=u+(e-1&63)-63;do r=P(r.add(s).add(i[0]).add(x(t,l+8)),37).mul(ae),s=P(s.add(i[1]).add(x(t,l+48)),42).mul(ae),r=r.xor(a[1]),s=s.add(i[0]).add(x(t,l+40)),o=P(o.add(a[0]),33).mul(ae),i=Be(t,l,i[1].mul(ae),r.add(a[0])),a=Be(t,l+32,o.add(a[1]),s.add(x(t,l+16))),[o,r]=[r,o],l+=64;while(l!==u);const f=ae.add(o.and(255).shl(1));return l=d,a[0]=a[0].add(e-1&63),i[0]=i[0].add(a[0]),a[0]=a[0].add(i[0]),r=P(r.add(s).add(i[0]).add(x(t,l+8)),37).mul(f),s=P(s.add(i[1]).add(x(t,l+48)),42).mul(f),r=r.xor(a[1].mul(9)),s=s.add(i[0].mul(9).add(x(t,l+40))),o=P(o.add(a[0]),33).mul(f),i=Be(t,l,i[1].mul(f),r.add(a[0])),a=Be(t,l+32,o.add(a[1]),s.add(x(t,l+16))),[o,r]=[r,o],ie(ie(i[0],a[0],f).add(rt(s).mul(ln)).add(o),ie(i[1],a[1],f).add(r),f)}/**
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
 */function qr(t,e){return e==="string"?ue(t):je([t],e)}function jr(t,e){return t instanceof Float32Array&&e==="float32"||t instanceof Int32Array&&e==="int32"||t instanceof Uint8Array&&e==="bool"}function je(t,e){if(e==="string")throw new Error("Cannot convert a string[] to a TypedArray");if(Array.isArray(t)&&(t=xe(t)),$().getBool("DEBUG")&&Kt(t,e),jr(t,e))return t;if(e==null||e==="float32"||e==="complex64")return new Float32Array(t);if(e==="int32")return new Int32Array(t);if(e==="bool"){const n=new Uint8Array(t.length);for(let r=0;r<n.length;++r)Math.round(t[r])!==0&&(n[r]=1);return n}else throw new Error(`Unknown data type ${e}`)}function De(){return $().platform.now()}function Hr(t,e){return $().platform.fetch(t,e)}function ue(t,e="utf-8"){return e=e||"utf-8",$().platform.encode(t,e)}function Ue(t,e="utf-8"){return e=e||"utf-8",$().platform.decode(t,e)}var Hc=Object.freeze({__proto__:null,arraysEqual:ze,assert:k,assertNonNegativeIntegerDimensions:wt,assertNonNull:rr,assertShapesMatch:jt,bytesFromStringArray:Xt,bytesPerElement:et,checkConversionForErrors:Kt,clamp:$e,computeStrides:ge,createScalarValue:qr,createShuffledIndices:ar,decodeString:Ue,distSquared:nr,encodeString:ue,fetch:Hr,fingerPrint64:un,flatten:xe,getArrayFromDType:Ie,getTypedArrayFromDType:fr,hasEncodingLoss:hr,hexToLong:Re,indexToLoc:pr,inferDtype:qe,inferFromImplicitShape:cr,isBoolean:Yt,isFunction:tt,isInt:Pe,isNumber:Jt,isPromise:yt,isScalarShape:sr,isString:Ve,isTypedArray:re,isValidDtype:Zt,locToIndex:gr,makeOnesTypedArray:en,makeZerosNestedTypedArray:dr,makeZerosTypedArray:ve,nearestDivisor:Ce,nearestLargerEven:Qn,now:De,parseAxisParam:Ht,randUniform:tr,repeatedTry:lr,rightPad:Fe,shuffle:qt,shuffleCombo:Jn,sizeFromShape:O,sizeToSquarishShape:ir,squeezeShape:ur,sum:er,swap:Le,tanh:or,toNestedArray:we,toTypedArray:je});/**
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
 */class Kr{constructor(e,n){this.backendTimer=e,this.logger=n,n==null&&(this.logger=new Xr)}profileKernel(e,n,r){let s;const o=()=>{s=r()};let i;const a=De();if(this.backendTimer.timerAvailable())i=this.backendTimer.time(o);else{o();for(const u of s)u.dataSync();i=Promise.resolve({kernelMs:De()-a})}if($().getBool("CHECK_COMPUTATION_FOR_ERRORS"))for(let u=0;u<s.length;u++){const d=s[u];d.data().then(f=>{Zr(f,d.dtype,e)})}return{kernelName:e,outputs:s,inputs:n,timeMs:i.then(u=>u.kernelMs),extraInfo:i.then(u=>u.getExtraProfileInfo!=null?u.getExtraProfileInfo():"")}}logKernelProfile(e){const{kernelName:n,outputs:r,timeMs:s,inputs:o,extraInfo:i}=e;r.forEach(a=>{Promise.all([a.data(),s,i]).then(l=>{this.logger.logKernelProfile(n,a,l[0],l[1],o,l[2])})})}}function Zr(t,e,n){if(e!=="float32")return!1;for(let r=0;r<t.length;r++){const s=t[r];if(isNaN(s)||!isFinite(s))return console.warn(`Found ${s} in the result of '${n}'`),!0}return!1}class Xr{logKernelProfile(e,n,r,s,o,i){const a=typeof s=="number"?Fe(`${s}ms`,9):s.error,l=Fe(e,25),u=n.rank,d=n.size,f=Fe(n.shape.toString(),14);let h="";for(const g in o){const y=o[g];if(y!=null){const w=y.shape||n.shape,I=w.length;h+=`${g}: ${I}D ${I>0?w:""} `}}console.log(`%c${l}	%c${a}	%c${u}D ${f}	%c${d}	%c${h}	%c${i}`,"font-weight:bold","color:red","color:blue","color: orange","color: green","color: steelblue")}}/**
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
 */function Yr(t,e,n){const r={},s={};for(let l=0;l<e.length;l++)r[e[l].id]=!0;for(let l=0;l<t.length;l++){const u=t[l],d=u.inputs;for(const f in d){const h=d[f];let g=!1;for(let y=0;y<e.length;y++)if(r[h.id]){u.outputs.forEach(w=>r[w.id]=!0),g=!0,s[u.id]=!0;break}if(g)break}}const o={};o[n.id]=!0;const i={};for(let l=t.length-1;l>=0;l--){const u=t[l],d=u.inputs;for(let f=0;f<u.outputs.length;f++)if(o[u.outputs[f].id]){for(const h in d)o[d[h].id]=!0,i[u.id]=!0;break}}const a=[];for(let l=0;l<t.length;l++){const u=t[l];if(s[u.id]&&i[u.id]){const d={};for(const h in u.inputs){const g=u.inputs[h];r[g.id]&&(d[h]=g)}const f=Object.assign({},u);f.inputs=d,f.outputs=u.outputs,a.push(f)}}return a}function Jr(t,e,n,r){for(let s=e.length-1;s>=0;s--){const o=e[s],i=[];if(o.outputs.forEach(l=>{const u=t[l.id];u!=null?i.push(u):i.push(null)}),o.gradient==null)throw new Error(`Cannot compute gradient: gradient function not found for ${o.kernelName}.`);const a=o.gradient(i);for(const l in o.inputs){if(!(l in a))throw new Error(`Cannot backprop through input ${l}. Available gradients found: ${Object.keys(a)}.`);const u=n(()=>a[l]());if(u.dtype!=="float32")throw new Error(`Error in gradient for op ${o.kernelName}. The gradient of input ${l} must have 'float32' dtype, but has '${u.dtype}'`);const d=o.inputs[l];if(!ze(u.shape,d.shape))throw new Error(`Error in gradient for op ${o.kernelName}. The gradient of input '${l}' has shape '${u.shape}', which does not match the shape of the input '${d.shape}'`);if(t[d.id]==null)t[d.id]=u;else{const f=t[d.id];t[d.id]=r(f,u),f.dispose()}}}}/**
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
 */const Ot=20,ke=3,Ze=7;function Qr(t,e,n,r){const s=ge(e),o=es(t,e,n,s),i=e.length,a=Ne(t,e,n,s,o),l=["Tensor"];return r&&(l.push(`  dtype: ${n}`),l.push(`  rank: ${i}`),l.push(`  shape: [${e}]`),l.push("  values:")),l.push(a.map(u=>"    "+u).join(`
`)),l.join(`
`)}function es(t,e,n,r){const s=O(e),o=r[r.length-1],i=new Array(o).fill(0),a=e.length,l=n==="complex64"?Te(t):t;if(a>1)for(let u=0;u<s/o;u++){const d=u*o;for(let f=0;f<o;f++)i[f]=Math.max(i[f],Ae(l[d+f],0,n).length)}return i}function Ae(t,e,n){let r;return Array.isArray(t)?r=`${parseFloat(t[0].toFixed(Ze))} + ${parseFloat(t[1].toFixed(Ze))}j`:Ve(t)?r=`'${t}'`:n==="bool"?r=fn(t):r=parseFloat(t.toFixed(Ze)).toString(),Fe(r,e)}function fn(t){return t===0?"false":"true"}function Ne(t,e,n,r,s,o=!0){const i=n==="complex64"?2:1,a=e[0],l=e.length;if(l===0){if(n==="complex64"){const w=Te(t);return[Ae(w[0],0,n)]}return n==="bool"?[fn(t[0])]:[t[0].toString()]}if(l===1){if(a>Ot){const I=ke*i;let S=Array.from(t.slice(0,I)),A=Array.from(t.slice((a-ke)*i,a*i));return n==="complex64"&&(S=Te(S),A=Te(A)),["["+S.map((b,v)=>Ae(b,s[v],n)).join(", ")+", ..., "+A.map((b,v)=>Ae(b,s[a-ke+v],n)).join(", ")+"]"]}return["["+(n==="complex64"?Te(t):Array.from(t)).map((I,S)=>Ae(I,s[S],n)).join(", ")+"]"]}const u=e.slice(1),d=r.slice(1),f=r[0]*i,h=[];if(a>Ot){for(let w=0;w<ke;w++){const I=w*f,S=I+f;h.push(...Ne(t.slice(I,S),u,n,d,s,!1))}h.push("...");for(let w=a-ke;w<a;w++){const I=w*f,S=I+f;h.push(...Ne(t.slice(I,S),u,n,d,s,w===a-1))}}else for(let w=0;w<a;w++){const I=w*f,S=I+f;h.push(...Ne(t.slice(I,S),u,n,d,s,w===a-1))}const g=l===2?",":"";h[0]="["+h[0]+g;for(let w=1;w<h.length-1;w++)h[w]=" "+h[w]+g;let y=`,
`;for(let w=2;w<l;w++)y+=`
`;return h[h.length-1]=" "+h[h.length-1]+"]"+(o?"":y),h}function Te(t){const e=[];for(let n=0;n<t.length;n+=2)e.push([t[n],t[n+1]]);return e}/**
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
 */class ts{constructor(e,n,r){if(this.dtype=n,this.shape=e.slice(),this.size=O(e),r!=null){const s=r.length;k(s===this.size,()=>`Length of values '${s}' does not match the size inferred by the shape '${this.size}'.`)}if(n==="complex64")throw new Error("complex64 dtype TensorBuffers are not supported. Please create a TensorBuffer for the real and imaginary parts separately and call tf.complex(real, imag).");this.values=r||Ie(n,this.size),this.strides=ge(e)}set(e,...n){n.length===0&&(n=[0]),k(n.length===this.rank,()=>`The number of provided coordinates (${n.length}) must match the rank (${this.rank})`);const r=this.locToIndex(n);this.values[r]=e}get(...e){e.length===0&&(e=[0]);let n=0;for(const s of e){if(s<0||s>=this.shape[n]){const o=`Requested out of range element at ${e}.   Buffer shape=${this.shape}`;throw new Error(o)}n++}let r=e[e.length-1];for(let s=0;s<e.length-1;++s)r+=this.strides[s]*e[s];return this.values[r]}locToIndex(e){if(this.rank===0)return 0;if(this.rank===1)return e[0];let n=e[e.length-1];for(let r=0;r<e.length-1;++r)n+=this.strides[r]*e[r];return n}indexToLoc(e){if(this.rank===0)return[];if(this.rank===1)return[e];const n=new Array(this.shape.length);for(let r=0;r<n.length-1;++r)n[r]=Math.floor(e/this.strides[r]),e-=n[r]*this.strides[r];return n[n.length-1]=e,n}get rank(){return this.shape.length}toTensor(){return ee().makeTensor(this.values,this.shape,this.dtype)}}let ee=null,pe=null;function ns(t){ee=t}function rs(t){pe=t}class Q{constructor(e,n,r,s){this.kept=!1,this.isDisposedInternal=!1,this.shape=e.slice(),this.dtype=n||"float32",this.size=O(e),this.strides=ge(e),this.dataId=r,this.id=s,this.rankType=this.rank<5?this.rank.toString():"higher"}get rank(){return this.shape.length}async buffer(){const e=await this.data();return pe.buffer(this.shape,this.dtype,e)}bufferSync(){return pe.buffer(this.shape,this.dtype,this.dataSync())}async array(){const e=await this.data();return we(this.shape,e,this.dtype==="complex64")}arraySync(){return we(this.shape,this.dataSync(),this.dtype==="complex64")}async data(){this.throwIfDisposed();const e=ee().read(this.dataId);if(this.dtype==="string"){const n=await e;try{return n.map(r=>Ue(r))}catch{throw new Error("Failed to decode the string bytes into utf-8. To get the original bytes, call tensor.bytes().")}}return e}dataToGPU(e){return this.throwIfDisposed(),ee().readToGPU(this.dataId,e)}dataSync(){this.throwIfDisposed();const e=ee().readSync(this.dataId);if(this.dtype==="string")try{return e.map(n=>Ue(n))}catch{throw new Error("Failed to decode the string bytes into utf-8. To get the original bytes, call tensor.bytes().")}return e}async bytes(){this.throwIfDisposed();const e=await ee().read(this.dataId);return this.dtype==="string"?e:new Uint8Array(e.buffer)}dispose(){this.isDisposed||(ee().disposeTensor(this),this.isDisposedInternal=!0)}get isDisposed(){return this.isDisposedInternal}throwIfDisposed(){if(this.isDisposed)throw new Error("Tensor is disposed.")}print(e=!1){return pe.print(this,e)}clone(){return this.throwIfDisposed(),pe.clone(this)}toString(e=!1){const n=this.dataSync();return Qr(n,this.shape,this.dtype,e)}cast(e){return this.throwIfDisposed(),pe.cast(this,e)}variable(e=!0,n,r){return this.throwIfDisposed(),ee().makeVariable(this,e,n,r)}}Object.defineProperty(Q,Symbol.hasInstance,{value:t=>!!t&&t.data!=null&&t.dataSync!=null&&t.throwIfDisposed!=null});function ss(){return bt("Tensor",()=>Q)}ss();class st extends Q{constructor(e,n,r,s){super(e.shape,e.dtype,e.dataId,s),this.trainable=n,this.name=r}assign(e){if(e.dtype!==this.dtype)throw new Error(`dtype of the new value (${e.dtype}) and previous value (${this.dtype}) must match`);if(!ze(e.shape,this.shape))throw new Error(`shape of the new value (${e.shape}) and previous value (${this.shape}) must match`);ee().disposeTensor(this),this.dataId=e.dataId,ee().incRef(this,null)}dispose(){ee().disposeVariable(this),this.isDisposedInternal=!0}}Object.defineProperty(st,Symbol.hasInstance,{value:t=>t instanceof Q&&t.assign!=null&&t.assign instanceof Function});/**
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
 */var Lt;(function(t){t.R0="R0",t.R1="R1",t.R2="R2",t.R3="R3",t.R4="R4",t.R5="R5",t.R6="R6"})(Lt||(Lt={}));var ot;(function(t){t.float32="float32",t.int32="int32",t.bool="int32",t.complex64="complex64"})(ot||(ot={}));var it;(function(t){t.float32="float32",t.int32="int32",t.bool="bool",t.complex64="complex64"})(it||(it={}));var at;(function(t){t.float32="float32",t.int32="float32",t.bool="float32",t.complex64="complex64"})(at||(at={}));var lt;(function(t){t.float32="complex64",t.int32="complex64",t.bool="complex64",t.complex64="complex64"})(lt||(lt={}));const os={float32:at,int32:ot,bool:it,complex64:lt};function Et(t,e){if(t==="string"||e==="string"){if(t==="string"&&e==="string")return"string";throw new Error(`Can not upcast ${t} with ${e}`)}return os[t][e]}function Kc(t){return Et(t,"int32")}/**
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
 */function hn(t,e){if(t.dtype===e.dtype)return[t,e];const n=Et(t.dtype,e.dtype);return[t.cast(n),e.cast(n)]}function is(t,e){k(t.dtype===e.dtype,()=>`The dtypes of the first(${t.dtype}) and second(${e.dtype}) input must match`)}function as(t,e){return e.some(n=>n.id===t.id)}function It(t){const e=[];return dn(t,e,new Set),e}function dn(t,e,n){if(t==null)return;if(t instanceof Q){e.push(t);return}if(!ls(t))return;const r=t;for(const s in r){const o=r[s];n.has(o)||(n.add(o),dn(o,e,n))}}function ls(t){return Array.isArray(t)||typeof t=="object"}var Zc=Object.freeze({__proto__:null,assertTypesMatch:is,getTensorsInContainer:It,isTensorInList:as,makeTypesMatch:hn});/**
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
 */function Xe(t){return t.kernelName!=null}class Pt{constructor(){this.registeredVariables={},this.nextTapeNodeId=0,this.numBytes=0,this.numTensors=0,this.numStringTensors=0,this.numDataBuffers=0,this.gradientDepth=0,this.kernelDepth=0,this.scopeStack=[],this.numDataMovesStack=[],this.nextScopeId=0,this.tensorInfo=new WeakMap,this.profiling=!1,this.activeProfile={newBytes:0,newTensors:0,peakBytes:0,kernels:[],result:null,get kernelNames(){return Array.from(new Set(this.kernels.map(e=>e.name)))}}}dispose(){for(const e in this.registeredVariables)this.registeredVariables[e].dispose()}}class Ee{constructor(e){this.ENV=e,this.registry={},this.registryFactory={},this.pendingBackendInitId=0,this.state=new Pt}async ready(){if(this.pendingBackendInit!=null)return this.pendingBackendInit.then(()=>{});if(this.backendInstance!=null)return;const e=this.getSortedBackends();for(let n=0;n<e.length;n++){const r=e[n];if(await this.initializeBackend(r).success){await this.setBackend(r);return}}throw new Error("Could not initialize any backends, all backend initializations failed.")}get backend(){if(this.pendingBackendInit!=null)throw new Error(`Backend '${this.backendName}' has not yet been initialized. Make sure to await tf.ready() or await tf.setBackend() before calling other methods`);if(this.backendInstance==null){const{name:e,asyncInit:n}=this.initializeBackendsAndReturnBest();if(n)throw new Error(`The highest priority backend '${e}' has not yet been initialized. Make sure to await tf.ready() or await tf.setBackend() before calling other methods`);this.setBackend(e)}return this.backendInstance}backendNames(){return Object.keys(this.registryFactory)}findBackend(e){if(!(e in this.registry))if(e in this.registryFactory){const{asyncInit:n}=this.initializeBackend(e);if(n)return null}else return null;return this.registry[e]}findBackendFactory(e){return e in this.registryFactory?this.registryFactory[e].factory:null}registerBackend(e,n,r=1){return e in this.registryFactory?(se(`${e} backend was already registered. Reusing existing backend factory.`),!1):(this.registryFactory[e]={factory:n,priority:r},!0)}async setBackend(e){if(this.registryFactory[e]==null)throw new Error(`Backend name '${e}' not found in registry`);if(this.backendName=e,this.registry[e]==null){this.backendInstance=null;const{success:n,asyncInit:r}=this.initializeBackend(e);if(!(r?await n:n))return!1}return this.backendInstance=this.registry[e],this.setupRegisteredKernels(),this.profiler=new Kr(this.backendInstance),!0}setupRegisteredKernels(){nt(this.backendName).forEach(n=>{n.setupFunc!=null&&n.setupFunc(this.backendInstance)})}disposeRegisteredKernels(e){nt(e).forEach(r=>{r.disposeFunc!=null&&r.disposeFunc(this.registry[e])})}initializeBackend(e){const n=this.registryFactory[e];if(n==null)throw new Error(`Cannot initialize backend ${e}, no registration found.`);try{const r=n.factory();if(r&&!(r instanceof Yn)&&typeof r.then=="function"){const s=++this.pendingBackendInitId,o=r.then(i=>s<this.pendingBackendInitId?!1:(this.registry[e]=i,this.pendingBackendInit=null,!0)).catch(i=>(s<this.pendingBackendInitId||(this.pendingBackendInit=null,se(`Initialization of backend ${e} failed`),se(i.stack||i.message)),!1));return this.pendingBackendInit=o,{success:o,asyncInit:!0}}else return this.registry[e]=r,{success:!0,asyncInit:!1}}catch(r){return se(`Initialization of backend ${e} failed`),se(r.stack||r.message),{success:!1,asyncInit:!1}}}removeBackend(e){if(!(e in this.registryFactory))throw new Error(`${e} backend not found in registry`);this.backendName===e&&this.pendingBackendInit!=null&&this.pendingBackendInitId++,e in this.registry&&(this.disposeRegisteredKernels(e),this.registry[e].dispose(),delete this.registry[e]),delete this.registryFactory[e],this.backendName===e&&(this.pendingBackendInit=null,this.backendName=null,this.backendInstance=null)}getSortedBackends(){if(Object.keys(this.registryFactory).length===0)throw new Error("No backend found in registry.");return Object.keys(this.registryFactory).sort((e,n)=>this.registryFactory[n].priority-this.registryFactory[e].priority)}initializeBackendsAndReturnBest(){const e=this.getSortedBackends();for(let n=0;n<e.length;n++){const r=e[n],{success:s,asyncInit:o}=this.initializeBackend(r);if(o||s)return{name:r,asyncInit:o}}throw new Error("Could not initialize any backends, all backend initializations failed.")}moveData(e,n){const r=this.state.tensorInfo.get(n),s=r.backend,o=this.readSync(n),i=s.refCount(n);s.disposeData(n,!0),r.backend=e,e.move(n,o,r.shape,r.dtype,i),this.shouldCheckForMemLeaks()&&this.state.numDataMovesStack[this.state.numDataMovesStack.length-1]++}tidy(e,n){let r=null;if(n==null){if(typeof e!="function")throw new Error("Please provide a function to tidy()");n=e}else{if(typeof e!="string"&&!(e instanceof String))throw new Error("When calling with two arguments, the first argument to tidy() must be a string");if(typeof n!="function")throw new Error("When calling with two arguments, the 2nd argument to tidy() must be a function");r=e}let s;return this.scopedRun(()=>this.startScope(r),()=>this.endScope(s),()=>(s=n(),s instanceof Promise&&console.error("Cannot return a Promise inside of tidy."),s))}scopedRun(e,n,r){e();try{const s=r();return n(),s}catch(s){throw n(),s}}nextTensorId(){return Ee.nextTensorId++}nextVariableId(){return Ee.nextVariableId++}clone(e){const n=F.runKernel(sn,{x:e}),r={x:e},s=i=>({x:()=>{const a="float32",l={x:i},u={dtype:a};return F.runKernel(rn,l,u)}}),o=[];return this.addTapeNode(this.state.activeScope.name,r,[n],s,o,{}),n}runKernel(e,n,r){if(this.backendName==null&&this.backend,!(Rt(e,this.backendName)!=null))throw new Error(`Kernel '${e}' not registered for backend '${this.backendName}'`);return this.runKernelFunc({kernelName:e,inputs:n,attrs:r})}shouldCheckForMemLeaks(){return this.ENV.getBool("IS_TEST")}checkKernelForMemLeak(e,n,r){const s=this.backend.numDataIds();let o=0;r.forEach(l=>{o+=l.dtype==="complex64"?3:1});const i=this.state.numDataMovesStack[this.state.numDataMovesStack.length-1],a=s-n-o-i;if(a>0)throw new Error(`Backend '${this.backendName}' has an internal memory leak (${a} data ids) after running '${e}'`)}runKernelFunc(e){let n,r=[];const s=this.isTapeOn(),o=this.state.numBytes,i=this.state.numTensors;this.shouldCheckForMemLeaks()&&this.state.numDataMovesStack.push(0);let a;this.backendName==null&&this.backend;let l;const u=Xe(e)?e.kernelName:this.state.activeScope!=null?this.state.activeScope.name:"";if(Xe(e)){const{kernelName:y,inputs:w,attrs:I}=e;this.backendName==null&&this.backend;const S=Rt(y,this.backendName);k(S!=null,()=>`Cannot find registered kernel '${y}' for backend '${this.backendName}'`),a=()=>{const A=this.backend.numDataIds();l=S.kernelFunc({inputs:w,attrs:I,backend:this.backend});const b=Array.isArray(l)?l:[l];this.shouldCheckForMemLeaks()&&this.checkKernelForMemLeak(y,A,b);const v=b.map(D=>D.rank!=null?D:this.makeTensorFromTensorInfo(D));if(s){const D=this.getTensorsForGradient(y,w,v);r=this.saveTensorsForBackwardMode(D)}return v}}else{const{forwardFunc:y}=e,w=I=>{s&&(r=I.map(S=>this.keep(this.clone(S))))};a=()=>{const I=this.backend.numDataIds();l=this.tidy(()=>y(this.backend,w));const S=Array.isArray(l)?l:[l];return this.shouldCheckForMemLeaks()&&this.checkKernelForMemLeak(u,I,S),S}}const{inputs:d,attrs:f}=e,h=Xe(e)?null:e.backwardsFunc;let g;return this.scopedRun(()=>this.state.kernelDepth++,()=>this.state.kernelDepth--,()=>{!this.ENV.getBool("DEBUG")&&!this.state.profiling?n=a():(g=this.profiler.profileKernel(u,d,()=>a()),this.ENV.getBool("DEBUG")&&this.profiler.logKernelProfile(g),n=g.outputs)}),s&&this.addTapeNode(u,d,n,h,r,f),this.state.profiling&&this.state.activeProfile.kernels.push({name:u,bytesAdded:this.state.numBytes-o,totalBytesSnapshot:this.state.numBytes,tensorsAdded:this.state.numTensors-i,totalTensorsSnapshot:this.state.numTensors,inputShapes:Object.keys(d).map(y=>d[y]!=null?d[y].shape:null),outputShapes:n.map(y=>y.shape),kernelTimeMs:g.timeMs,extraInfo:g.extraInfo}),Array.isArray(l)?n:n[0]}saveTensorsForBackwardMode(e){return e.map(r=>this.keep(this.clone(r)))}getTensorsForGradient(e,n,r){const s=_t(e);if(s!=null){const o=s.inputsToSave||[],i=s.outputsToSave||[];let a;s.saveAllInputs?(k(Array.isArray(n),()=>"saveAllInputs is true, expected inputs to be an array."),a=Object.keys(n).map(u=>n[u])):a=o.map(u=>n[u]);const l=r.filter((u,d)=>i[d]);return a.concat(l)}return[]}makeTensor(e,n,r,s){if(e==null)throw new Error("Values passed to engine.makeTensor() are null");r=r||"float32",s=s||this.backend;let o=e;r==="string"&&Ve(e[0])&&(o=e.map(l=>ue(l)));const i=s.write(o,n,r),a=new Q(n,r,i,this.nextTensorId());if(this.trackTensor(a,s),r==="string"){const l=this.state.tensorInfo.get(i),u=Xt(o);this.state.numBytes+=u-l.bytes,l.bytes=u}return a}makeTensorFromDataId(e,n,r,s){r=r||"float32";const o={dataId:e,shape:n,dtype:r};return this.makeTensorFromTensorInfo(o,s)}makeTensorFromTensorInfo(e,n){const{dataId:r,shape:s,dtype:o}=e,i=new Q(s,o,r,this.nextTensorId());return this.trackTensor(i,n),i}makeVariable(e,n=!0,r,s){r=r||this.nextVariableId().toString(),s!=null&&s!==e.dtype&&(e=e.cast(s));const o=new st(e,n,r,this.nextTensorId());if(this.state.registeredVariables[o.name]!=null)throw new Error(`Variable with name ${o.name} was already registered`);return this.state.registeredVariables[o.name]=o,this.incRef(o,this.backend),o}trackTensor(e,n){this.state.numTensors++,e.dtype==="string"&&this.state.numStringTensors++;let r=0;e.dtype!=="complex64"&&e.dtype!=="string"&&(r=e.size*et(e.dtype)),this.state.numBytes+=r,this.state.tensorInfo.has(e.dataId)||(this.state.numDataBuffers++,this.state.tensorInfo.set(e.dataId,{backend:n||this.backend,dtype:e.dtype,shape:e.shape,bytes:r})),e instanceof st||this.track(e)}incRef(e,n){this.trackTensor(e,n),this.backend.incRef(e.dataId)}removeDataId(e,n){this.state.tensorInfo.has(e)&&this.state.tensorInfo.get(e).backend===n&&(this.state.tensorInfo.delete(e),this.state.numDataBuffers--)}disposeTensor(e){if(!this.state.tensorInfo.has(e.dataId))return;const n=this.state.tensorInfo.get(e.dataId);if(this.state.numTensors--,e.dtype==="string"&&(this.state.numStringTensors--,this.state.numBytes-=n.bytes),e.dtype!=="complex64"&&e.dtype!=="string"){const r=e.size*et(e.dtype);this.state.numBytes-=r}n.backend.disposeData(e.dataId)&&this.removeDataId(e.dataId,n.backend)}disposeVariables(){for(const e in this.state.registeredVariables){const n=this.state.registeredVariables[e];this.disposeVariable(n)}}disposeVariable(e){this.disposeTensor(e),this.state.registeredVariables[e.name]!=null&&delete this.state.registeredVariables[e.name]}memory(){const e=this.backend.memory();return e.numTensors=this.state.numTensors,e.numDataBuffers=this.state.numDataBuffers,e.numBytes=this.state.numBytes,this.state.numStringTensors>0&&(e.unreliable=!0,e.reasons==null&&(e.reasons=[]),e.reasons.push("Memory usage by string tensors is approximate (2 bytes per character)")),e}async profile(e){this.state.profiling=!0;const n=this.state.numBytes,r=this.state.numTensors;this.state.activeProfile.kernels=[],this.state.activeProfile.result=await e(),this.state.profiling=!1,this.state.activeProfile.peakBytes=Math.max(...this.state.activeProfile.kernels.map(s=>s.totalBytesSnapshot)),this.state.activeProfile.newBytes=this.state.numBytes-n,this.state.activeProfile.newTensors=this.state.numTensors-r;for(const s of this.state.activeProfile.kernels)s.kernelTimeMs=await s.kernelTimeMs,s.extraInfo=await s.extraInfo;return this.state.activeProfile}isTapeOn(){return this.state.gradientDepth>0&&this.state.kernelDepth===0}addTapeNode(e,n,r,s,o,i){const a={id:this.state.nextTapeNodeId++,kernelName:e,inputs:n,outputs:r,saved:o},l=_t(e);l!=null&&(s=l.gradFunc),s!=null&&(a.gradient=u=>(u=u.map((d,f)=>{if(d==null){const h=r[f],g=ve(h.size,h.dtype);return this.makeTensor(g,h.shape,h.dtype)}return d}),s(u.length>1?u:u[0],o,i))),this.state.activeTape.push(a)}keep(e){return e.kept=!0,e}startTape(){this.state.gradientDepth===0&&(this.state.activeTape=[]),this.state.gradientDepth++}endTape(){this.state.gradientDepth--}startScope(e){const n={track:[],name:"unnamed scope",id:this.state.nextScopeId++};e&&(n.name=e),this.state.scopeStack.push(n),this.state.activeScope=n}endScope(e){const n=It(e),r=new Set(n.map(o=>o.id));for(let o=0;o<this.state.activeScope.track.length;o++){const i=this.state.activeScope.track[o];!i.kept&&!r.has(i.id)&&i.dispose()}const s=this.state.scopeStack.pop();this.state.activeScope=this.state.scopeStack.length===0?null:this.state.scopeStack[this.state.scopeStack.length-1],n.forEach(o=>{!o.kept&&o.scopeId===s.id&&this.track(o)})}gradients(e,n,r,s=!1){if(k(n.length>0,()=>"gradients() received an empty list of xs."),r!=null&&r.dtype!=="float32")throw new Error(`dy must have 'float32' dtype, but has '${r.dtype}'`);const o=this.scopedRun(()=>this.startTape(),()=>this.endTape(),()=>this.tidy("forward",e));k(o instanceof Q,()=>"The result y returned by f() must be a tensor.");const i=Yr(this.state.activeTape,n,o);if(!s&&i.length===0&&n.length>0)throw new Error("Cannot compute gradient of y=f(x) with respect to x. Make sure that the f you passed encloses all operations that lead from x to y.");return this.tidy("backward",()=>{const a={};a[o.id]=r??cs(o.shape),Jr(a,i,u=>this.tidy(u),us);const l=n.map(u=>a[u.id]);return this.state.gradientDepth===0&&(this.state.activeTape.forEach(u=>{for(const d of u.saved)d.dispose()}),this.state.activeTape=null),{value:o,grads:l}})}customGrad(e){return k(tt(e),()=>"The f passed in customGrad(f) must be a function."),(...n)=>{k(n.every(a=>a instanceof Q),()=>"The args passed in customGrad(f)(x1, x2,...) must all be tensors");let r;const s={};n.forEach((a,l)=>{s[l]=a});const o=(a,l)=>(r=e(...n,l),k(r.value instanceof Q,()=>"The function f passed in customGrad(f) must return an object where `obj.value` is a tensor"),k(tt(r.gradFunc),()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function."),r.value),i=(a,l)=>{const u=r.gradFunc(a,l),d=Array.isArray(u)?u:[u];k(d.length===n.length,()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function that returns the same number of tensors as inputs passed to f(...)."),k(d.every(h=>h instanceof Q),()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function that returns a list of only tensors.");const f={};return d.forEach((h,g)=>{f[g]=()=>h}),f};return this.runKernelFunc({forwardFunc:o,backwardsFunc:i,inputs:s})}}readSync(e){return this.state.tensorInfo.get(e).backend.readSync(e)}read(e){return this.state.tensorInfo.get(e).backend.read(e)}readToGPU(e,n){return this.state.tensorInfo.get(e).backend.readToGPU(e,n)}async time(e){const n=De(),r=await this.backend.time(e);return r.wallMs=De()-n,r}track(e){return this.state.activeScope!=null&&(e.scopeId=this.state.activeScope.id,this.state.activeScope.track.push(e)),e}get registeredVariables(){return this.state.registeredVariables}reset(){this.pendingBackendInitId++,this.state.dispose(),this.ENV.reset(),this.state=new Pt;for(const e in this.registry)this.disposeRegisteredKernels(e),this.registry[e].dispose(),delete this.registry[e];this.backendName=null,this.backendInstance=null,this.pendingBackendInit=null}}Ee.nextTensorId=0;Ee.nextVariableId=0;function cs(t){const e=en(O(t),"float32");return F.makeTensor(e,t,"float32")}function gn(){const t=nn();if(t._tfengine==null){const e=new mr(t);t._tfengine=new Ee(e)}return Sr(t._tfengine.ENV),ns(()=>t._tfengine),t._tfengine}const F=gn();function us(t,e){const n={a:t,b:e};return F.runKernel(Ir,n)}/**
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
 */function fs(){return typeof navigator<"u"&&navigator!=null}let ct;function hs(t){ct=t}function ds(t){if(ct!==void 0)return ct;if(t||fs()){if(t||(t=navigator),t.product==="ReactNative")return!0;const e=t.userAgent||t.vendor||(typeof window<"u"?window.opera:"");if(!e){const n=t;return n.userAgentData&&n.userAgentData.mobile}return/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(e)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(e.substr(0,4))}return!1}function pn(){return typeof window<"u"&&window.document!=null||typeof WorkerGlobalScope<"u"}var Xc=Object.freeze({__proto__:null,isBrowser:pn,isMobile:ds,mockIsMobile:hs});/**
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
 */const H=$();H.registerFlag("DEBUG",()=>!1,t=>{t&&console.warn("Debugging mode is ON. The output of every math call will be downloaded to CPU and checked for NaNs. This significantly impacts performance.")});H.registerFlag("IS_BROWSER",()=>pn());H.registerFlag("IS_NODE",()=>typeof process<"u"&&typeof process.versions<"u"&&typeof process.versions.node<"u");H.registerFlag("IS_CHROME",()=>typeof navigator<"u"&&navigator!=null&&navigator.userAgent!=null&&/Chrome/.test(navigator.userAgent)&&/Google Inc/.test(navigator.vendor));H.registerFlag("PROD",()=>!1);H.registerFlag("TENSORLIKE_CHECK_SHAPE_CONSISTENCY",()=>H.getBool("DEBUG"));H.registerFlag("DEPRECATION_WARNINGS_ENABLED",()=>!0);H.registerFlag("IS_TEST",()=>!1);H.registerFlag("CHECK_COMPUTATION_FOR_ERRORS",()=>!0);H.registerFlag("WRAP_TO_IMAGEBITMAP",()=>!1);H.registerFlag("ENGINE_COMPILE_ONLY",()=>!1);H.registerFlag("CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU",()=>!1);H.registerFlag("USE_SETTIMEOUTCUSTOM",()=>!1);/**
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
 */function mn(t,e){let n=t;if(re(t))return e==="string"?[]:[t.length];if(!Array.isArray(t))return[];const r=[];for(;Array.isArray(n)||re(n)&&e!=="string";)r.push(n.length),n=n[0];return Array.isArray(t)&&$().getBool("TENSORLIKE_CHECK_SHAPE_CONSISTENCY")&&wn(t,r,[]),r}function wn(t,e,n){if(n=n||[],!Array.isArray(t)&&!re(t)){k(e.length===0,()=>`Element arr[${n.join("][")}] is a primitive, but should be an array/TypedArray of ${e[0]} elements`);return}k(e.length>0,()=>`Element arr[${n.join("][")}] should be a primitive, but is an array of ${t.length} elements`),k(t.length===e[0],()=>`Element arr[${n.join("][")}] should have ${e[0]} elements, but has ${t.length} elements`);const r=e.slice(1);for(let s=0;s<t.length;++s)wn(t[s],r,n.concat(s))}function Ct(t,e,n,r){if(t!=="string_or_numeric"){if(t==null)throw new Error("Expected dtype cannot be null.");if(t!=="numeric"&&t!==e||t==="numeric"&&e==="string")throw new Error(`Argument '${n}' passed to '${r}' must be ${t} tensor, but got ${e} tensor`)}}function U(t,e,n,r="numeric"){if(t instanceof Q)return Ct(r,t.dtype,e,n),t;let s=qe(t);if(s!=="string"&&["bool","int32","float32"].indexOf(r)>=0&&(s=r),Ct(r,s,e,n),t==null||!re(t)&&!Array.isArray(t)&&typeof t!="number"&&typeof t!="boolean"&&typeof t!="string"){const l=t==null?"null":t.constructor.name;throw new Error(`Argument '${e}' passed to '${n}' must be a Tensor or TensorLike, but got '${l}'`)}const o=mn(t,s);!re(t)&&!Array.isArray(t)&&(t=[t]);const a=s!=="string"?je(t,s):xe(t,[],!0);return F.makeTensor(a,o,s)}function Yc(t,e,n,r="numeric"){if(!Array.isArray(t))throw new Error(`Argument ${e} passed to ${n} must be a \`Tensor[]\` or \`TensorLike[]\``);return t.map((o,i)=>U(o,`${e}[${i}]`,n,r))}/**
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
 */const gs="__op";function X(t){const e=Object.keys(t);if(e.length!==1)throw new Error(`Please provide an object with a single key (operation name) mapping to a function. Got an object with ${e.length} keys.`);let n=e[0];const r=t[n];n.endsWith("_")&&(n=n.substring(0,n.length-1)),n=n+gs;const s=(...o)=>{F.startScope(n);try{const i=r(...o);return yt(i)&&console.error("Cannot return a Promise inside of tidy."),F.endScope(i),i}catch(i){throw F.endScope(null),i}};return Object.defineProperty(s,"name",{value:n,configurable:!0}),s}/**
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
 */function ps(t,e){const n=U(t,"real","complex"),r=U(e,"imag","complex");jt(n.shape,r.shape,`real and imag shapes, ${n.shape} and ${r.shape}, must match in call to tf.complex().`);const s={real:n,imag:r};return F.runKernel(kr,s)}const ms=X({complex_:ps});/**
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
 */function ws(t,e,n,r){if(r==null&&(r=qe(t)),r==="complex64")throw new Error("Cannot construct a complex64 tensor directly. Please use tf.complex(real, imag).");if(!re(t)&&!Array.isArray(t)&&typeof t!="number"&&typeof t!="boolean"&&typeof t!="string")throw new Error("values passed to tensor(values) must be a number/boolean/string or an array of numbers/booleans/strings, or a TypedArray");if(e!=null){wt(e);const s=O(e),o=O(n);k(s===o,()=>`Based on the provided shape, [${e}], the tensor should have ${s} values but has ${o}`);for(let i=0;i<n.length;++i){const a=n[i],l=i===n.length-1?a!==O(e.slice(i)):!0;k(n[i]===e[i]||!l,()=>`Error creating a new Tensor. Inferred shape (${n}) does not match the provided shape (${e}). `)}}return!re(t)&&!Array.isArray(t)&&(t=[t]),e=e||n,t=r!=="string"?je(t,r):xe(t,[],!0),F.makeTensor(t,e,r)}/**
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
 */function Ye(t,e,n){const r=mn(t,n);return ws(t,e,r,n)}/**
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
 */const Ut={float32:4,float16:2,int32:4,uint16:2,uint8:1,bool:1,complex64:8};/**
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
 */const Ge=4;async function Jc(t,e){const n=[],r=[],s=Array.isArray(t)?t.map(i=>i.name):Object.keys(t);for(let i=0;i<s.length;++i){const a=s[i],l=Array.isArray(t)?t[i].tensor:t[a];if(l.dtype!=="float32"&&l.dtype!=="int32"&&l.dtype!=="bool"&&l.dtype!=="string"&&l.dtype!=="complex64")throw new Error(`Unsupported dtype in weight '${a}': ${l.dtype}`);const u={name:a,shape:l.shape,dtype:l.dtype};if(l.dtype==="string"){const d=new Promise(async f=>{const h=await l.bytes(),g=h.reduce((I,S)=>I+S.length,0)+Ge*h.length,y=new Uint8Array(g);let w=0;for(let I=0;I<h.length;I++){const S=h[I],A=new Uint8Array(new Uint32Array([S.length]).buffer);y.set(A,w),w+=Ge,y.set(S,w),w+=S.length}f(y)});r.push(d)}else r.push(l.data());e!=null&&(u.group=e),n.push(u)}const o=await Promise.all(r);return{data:ys(o),specs:n}}function Qc(t,e){const n={};let r,s=0;for(const o of e){const i=o.name,a=o.dtype,l=o.shape,u=O(l);let d;if("quantization"in o){const f=o.quantization;if(f.dtype==="uint8"||f.dtype==="uint16"){if(!("min"in f&&"scale"in f))throw new Error(`Weight ${o.name} with quantization ${f.dtype} doesn't have corresponding metadata min and scale.`)}else if(f.dtype==="float16"){if(a!=="float32")throw new Error(`Weight ${o.name} is quantized with ${f.dtype} which only supports weights of type float32 not ${a}.`)}else throw new Error(`Weight ${o.name} has unknown quantization dtype ${f.dtype}. Supported quantization dtypes are: 'uint8', 'uint16', and 'float16'.`);const h=Ut[f.dtype],g=t.slice(s,s+u*h),y=f.dtype==="uint8"?new Uint8Array(g):new Uint16Array(g);if(a==="float32")if(f.dtype==="uint8"||f.dtype==="uint16"){d=new Float32Array(y.length);for(let w=0;w<y.length;w++){const I=y[w];d[w]=I*f.scale+f.min}}else if(f.dtype==="float16")r===void 0&&(r=Ts()),d=r(y);else throw new Error(`Unsupported quantization type ${f.dtype} for weight type float32.`);else if(a==="int32"){if(f.dtype!=="uint8"&&f.dtype!=="uint16")throw new Error(`Unsupported quantization type ${f.dtype} for weight type int32.`);d=new Int32Array(y.length);for(let w=0;w<y.length;w++){const I=y[w];d[w]=Math.round(I*f.scale+f.min)}}else throw new Error(`Unsupported dtype in weight '${i}': ${a}`);s+=u*h}else if(a==="string"){const f=O(o.shape);d=[];for(let h=0;h<f;h++){const g=new Uint32Array(t.slice(s,s+Ge))[0];s+=Ge;const y=new Uint8Array(t.slice(s,s+g));d.push(y),s+=g}}else{const f=Ut[a],h=t.slice(s,s+u*f);if(a==="float32")d=new Float32Array(h);else if(a==="int32")d=new Int32Array(h);else if(a==="bool")d=new Uint8Array(h);else if(a==="complex64"){d=new Float32Array(h);const g=new Float32Array(d.length/2),y=new Float32Array(d.length/2);for(let S=0;S<g.length;S++)g[S]=d[S*2],y[S]=d[S*2+1];const w=Ye(g,l,"float32"),I=Ye(y,l,"float32");n[i]=ms(w,I),w.dispose(),I.dispose()}else throw new Error(`Unsupported dtype in weight '${i}': ${a}`);s+=u*f}a!=="complex64"&&(n[i]=Ye(d,l,a))}return n}function ys(t){if(t===null)throw new Error(`Invalid input value: ${JSON.stringify(t)}`);let e=0;const n=[];t.forEach(o=>{if(e+=o.byteLength,n.push(o.byteLength===o.buffer.byteLength?o:new o.constructor(o)),!(o instanceof Float32Array||o instanceof Int32Array||o instanceof Uint8Array))throw new Error(`Unsupported TypedArray subtype: ${o.constructor.name}`)});const r=new Uint8Array(e);let s=0;return n.forEach(o=>{r.set(new Uint8Array(o.buffer),s),s+=o.byteLength}),r.buffer}const kt=typeof Buffer<"u"&&(typeof Blob>"u"||typeof atob>"u"||typeof btoa>"u");function Gt(t){return kt?Buffer.byteLength(t):new Blob([t]).size}function bs(t){if(kt)return Buffer.from(t).toString("base64");const e=new Uint8Array(t);let n="";for(let r=0,s=e.length;r<s;r++)n+=String.fromCharCode(e[r]);return btoa(n)}function Ss(t){if(kt){const r=Buffer.from(t,"base64");return r.buffer.slice(r.byteOffset,r.byteOffset+r.byteLength)}const e=atob(t),n=new Uint8Array(e.length);for(let r=0;r<e.length;++r)n.set([e.charCodeAt(r)],r);return n.buffer}function eu(t){if(t.length===1)return t[0];let e=0;t.forEach(s=>{e+=s.byteLength});const n=new Uint8Array(e);let r=0;return t.forEach(s=>{n.set(new Uint8Array(s),r),r+=s.byteLength}),n.buffer}function tu(t){for(t=t.trim();t.endsWith("/");)t=t.slice(0,t.length-1);const n=t.split("/");return n[n.length-1]}function nu(t,e){const n={modelTopology:t.modelTopology,format:t.format,generatedBy:t.generatedBy,convertedBy:t.convertedBy,weightsManifest:e};return t.signature!=null&&(n.signature=t.signature),t.userDefinedMetadata!=null&&(n.userDefinedMetadata=t.userDefinedMetadata),t.modelInitializer!=null&&(n.modelInitializer=t.modelInitializer),t.trainingConfig!=null&&(n.trainingConfig=t.trainingConfig),n}function Es(t,e,n){const r={modelTopology:t.modelTopology,format:t.format,generatedBy:t.generatedBy,convertedBy:t.convertedBy};if(t.trainingConfig!=null&&(r.trainingConfig=t.trainingConfig),t.weightsManifest!=null){if(!e)throw new Error("modelJSON has weightsManifest but weightSpecs is null");if(!n)throw new Error("modelJSON has weightsManifest but weightData is null");r.weightSpecs=e,r.weightData=n}return t.signature!=null&&(r.signature=t.signature),t.userDefinedMetadata!=null&&(r.userDefinedMetadata=t.userDefinedMetadata),t.modelInitializer!=null&&(r.modelInitializer=t.modelInitializer),r}async function ru(t,e){let n,r;return t.weightsManifest!=null&&([n,r]=await e(t.weightsManifest)),Es(t,n,r)}function yn(t){if(t.modelTopology instanceof ArrayBuffer)throw new Error("Expected JSON model topology, received ArrayBuffer.");return{dateSaved:new Date,modelTopologyType:"JSON",modelTopologyBytes:t.modelTopology==null?0:Gt(JSON.stringify(t.modelTopology)),weightSpecsBytes:t.weightSpecs==null?0:Gt(JSON.stringify(t.weightSpecs)),weightDataBytes:t.weightData==null?0:t.weightData.byteLength}}function su(t){const e=[];for(const n of t)e.push(...n.weights);return e}function Is(){const t=n=>{let r=n<<13,s=0;for(;(r&8388608)===0;)s-=8388608,r<<=1;return r&=-8388609,s+=947912704,r|s},e=new Uint32Array(2048);e[0]=0;for(let n=1;n<1024;n++)e[n]=t(n);for(let n=1024;n<2048;n++)e[n]=939524096+(n-1024<<13);return e}function ks(){const t=new Uint32Array(64);t[0]=0,t[31]=1199570944,t[32]=2147483648,t[63]=3347054592;for(let e=1;e<31;e++)t[e]=e<<23;for(let e=33;e<63;e++)t[e]=2147483648+(e-32<<23);return t}function As(){const t=new Uint32Array(64);for(let e=0;e<64;e++)t[e]=1024;return t[0]=t[32]=0,t}function Ts(){const t=Is(),e=ks(),n=As();return r=>{const s=new ArrayBuffer(4*r.length),o=new Uint32Array(s);for(let i=0;i<r.length;i++){const a=r[i],l=t[n[a>>10]+(a&1023)]+e[a>>10];o[i]=l}return new Float32Array(s)}}/**
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
 */class B{constructor(){this.saveRouters=[],this.loadRouters=[]}static getInstance(){return B.instance==null&&(B.instance=new B),B.instance}static registerSaveRouter(e){B.getInstance().saveRouters.push(e)}static registerLoadRouter(e){B.getInstance().loadRouters.push(e)}static getSaveHandlers(e){return B.getHandlers(e,"save")}static getLoadHandlers(e,n){return B.getHandlers(e,"load",n)}static getHandlers(e,n,r){const s=[];return(n==="load"?B.getInstance().loadRouters:B.getInstance().saveRouters).forEach(i=>{const a=i(e,r);a!==null&&s.push(a)}),s}}const ou=t=>B.registerSaveRouter(t),iu=t=>B.registerLoadRouter(t),au=t=>B.getSaveHandlers(t),lu=(t,e)=>B.getLoadHandlers(t,e);/**
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
 */const ut="tensorflowjs",ft=1,ce="models_store",oe="model_info_store";function bn(){if(!$().getBool("IS_BROWSER"))throw new Error("Failed to obtain IndexedDB factory because the current environmentis not a web browser.");const t=typeof window>"u"?self:window,e=t.indexedDB||t.mozIndexedDB||t.webkitIndexedDB||t.msIndexedDB||t.shimIndexedDB;if(e==null)throw new Error("The current browser does not appear to support IndexedDB.");return e}function ht(t){const e=t.result;e.createObjectStore(ce,{keyPath:"modelPath"}),e.createObjectStore(oe,{keyPath:"modelPath"})}class he{constructor(e){if(this.indexedDB=bn(),e==null||!e)throw new Error("For IndexedDB, modelPath must not be null, undefined or empty.");this.modelPath=e}async save(e){if(e.modelTopology instanceof ArrayBuffer)throw new Error("BrowserLocalStorage.save() does not support saving model topology in binary formats yet.");return this.databaseAction(this.modelPath,e)}async load(){return this.databaseAction(this.modelPath)}databaseAction(e,n){return new Promise((r,s)=>{const o=this.indexedDB.open(ut,ft);o.onupgradeneeded=()=>ht(o),o.onsuccess=()=>{const i=o.result;if(n==null){const a=i.transaction(ce,"readonly"),u=a.objectStore(ce).get(this.modelPath);u.onsuccess=()=>{if(u.result==null)return i.close(),s(new Error(`Cannot find model with path '${this.modelPath}' in IndexedDB.`));r(u.result.modelArtifacts)},u.onerror=d=>(i.close(),s(u.error)),a.oncomplete=()=>i.close()}else{const a=yn(n),l=i.transaction(oe,"readwrite");let u=l.objectStore(oe);const d=u.put({modelPath:this.modelPath,modelArtifactsInfo:a});let f;d.onsuccess=()=>{f=i.transaction(ce,"readwrite");const g=f.objectStore(ce).put({modelPath:this.modelPath,modelArtifacts:n,modelArtifactsInfo:a});g.onsuccess=()=>r({modelArtifactsInfo:a}),g.onerror=y=>{u=l.objectStore(oe);const w=u.delete(this.modelPath);w.onsuccess=()=>(i.close(),s(g.error)),w.onerror=I=>(i.close(),s(g.error))}},d.onerror=h=>(i.close(),s(d.error)),l.oncomplete=()=>{f==null?i.close():f.oncomplete=()=>i.close()}}},o.onerror=i=>s(o.error)})}}he.URL_SCHEME="indexeddb://";const Sn=t=>$().getBool("IS_BROWSER")&&!Array.isArray(t)&&t.startsWith(he.URL_SCHEME)?Fs(t.slice(he.URL_SCHEME.length)):null;B.registerSaveRouter(Sn);B.registerLoadRouter(Sn);function Fs(t){return new he(t)}function $s(t){return t.startsWith(he.URL_SCHEME)?t.slice(he.URL_SCHEME.length):t}class vs{constructor(){this.indexedDB=bn()}async listModels(){return new Promise((e,n)=>{const r=this.indexedDB.open(ut,ft);r.onupgradeneeded=()=>ht(r),r.onsuccess=()=>{const s=r.result,o=s.transaction(oe,"readonly"),a=o.objectStore(oe).getAll();a.onsuccess=()=>{const l={};for(const u of a.result)l[u.modelPath]=u.modelArtifactsInfo;e(l)},a.onerror=l=>(s.close(),n(a.error)),o.oncomplete=()=>s.close()},r.onerror=s=>n(r.error)})}async removeModel(e){return e=$s(e),new Promise((n,r)=>{const s=this.indexedDB.open(ut,ft);s.onupgradeneeded=()=>ht(s),s.onsuccess=()=>{const o=s.result,i=o.transaction(oe,"readwrite"),a=i.objectStore(oe),l=a.get(e);let u;l.onsuccess=()=>{if(l.result==null)return o.close(),r(new Error(`Cannot find model with path '${e}' in IndexedDB.`));{const d=a.delete(e),f=()=>{u=o.transaction(ce,"readwrite");const g=u.objectStore(ce).delete(e);g.onsuccess=()=>n(l.result.modelArtifactsInfo),g.onerror=y=>r(l.error)};d.onsuccess=f,d.onerror=h=>(f(),o.close(),r(l.error))}},l.onerror=d=>(o.close(),r(l.error)),i.oncomplete=()=>{u==null?o.close():u.oncomplete=()=>o.close()}},s.onerror=o=>r(s.error)})}}/**
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
 */const ne="/",me="tensorflowjs_models",En="info",Ms="model_topology",Ds="weight_specs",xs="weight_data",Rs="model_metadata";function In(t){return{info:[me,t,En].join(ne),topology:[me,t,Ms].join(ne),weightSpecs:[me,t,Ds].join(ne),weightData:[me,t,xs].join(ne),modelMetadata:[me,t,Rs].join(ne)}}function kn(t){for(const e of Object.values(t))window.localStorage.removeItem(e)}function _s(t){const e=t.split(ne);if(e.length<3)throw new Error(`Invalid key format: ${t}`);return e.slice(1,e.length-1).join(ne)}function Bs(t){return t.startsWith(de.URL_SCHEME)?t.slice(de.URL_SCHEME.length):t}class de{constructor(e){if(!$().getBool("IS_BROWSER")||typeof window>"u"||typeof window.localStorage>"u")throw new Error("The current environment does not support local storage.");if(this.LS=window.localStorage,e==null||!e)throw new Error("For local storage, modelPath must not be null, undefined or empty.");this.modelPath=e,this.keys=In(this.modelPath)}async save(e){if(e.modelTopology instanceof ArrayBuffer)throw new Error("BrowserLocalStorage.save() does not support saving model topology in binary formats yet.");{const n=JSON.stringify(e.modelTopology),r=JSON.stringify(e.weightSpecs),s=yn(e);try{this.LS.setItem(this.keys.info,JSON.stringify(s)),this.LS.setItem(this.keys.topology,n),this.LS.setItem(this.keys.weightSpecs,r),this.LS.setItem(this.keys.weightData,bs(e.weightData));const o={format:e.format,generatedBy:e.generatedBy,convertedBy:e.convertedBy,signature:e.signature!=null?e.signature:void 0,userDefinedMetadata:e.userDefinedMetadata!=null?e.userDefinedMetadata:void 0,modelInitializer:e.modelInitializer!=null?e.modelInitializer:void 0,trainingConfig:e.trainingConfig!=null?e.trainingConfig:void 0};return this.LS.setItem(this.keys.modelMetadata,JSON.stringify(o)),{modelArtifactsInfo:s}}catch{throw kn(this.keys),new Error(`Failed to save model '${this.modelPath}' to local storage: size quota being exceeded is a possible cause of this failure: modelTopologyBytes=${s.modelTopologyBytes}, weightSpecsBytes=${s.weightSpecsBytes}, weightDataBytes=${s.weightDataBytes}.`)}}}async load(){const e=JSON.parse(this.LS.getItem(this.keys.info));if(e==null)throw new Error(`In local storage, there is no model with name '${this.modelPath}'`);if(e.modelTopologyType!=="JSON")throw new Error("BrowserLocalStorage does not support loading non-JSON model topology yet.");const n={},r=JSON.parse(this.LS.getItem(this.keys.topology));if(r==null)throw new Error(`In local storage, the topology of model '${this.modelPath}' is missing.`);n.modelTopology=r;const s=JSON.parse(this.LS.getItem(this.keys.weightSpecs));if(s==null)throw new Error(`In local storage, the weight specs of model '${this.modelPath}' are missing.`);n.weightSpecs=s;const o=this.LS.getItem(this.keys.modelMetadata);if(o!=null){const a=JSON.parse(o);n.format=a.format,n.generatedBy=a.generatedBy,n.convertedBy=a.convertedBy,a.signature!=null&&(n.signature=a.signature),a.userDefinedMetadata!=null&&(n.userDefinedMetadata=a.userDefinedMetadata),a.modelInitializer!=null&&(n.modelInitializer=a.modelInitializer),a.trainingConfig!=null&&(n.trainingConfig=a.trainingConfig)}const i=this.LS.getItem(this.keys.weightData);if(i==null)throw new Error(`In local storage, the binary weight values of model '${this.modelPath}' are missing.`);return n.weightData=Ss(i),n}}de.URL_SCHEME="localstorage://";const An=t=>$().getBool("IS_BROWSER")&&!Array.isArray(t)&&t.startsWith(de.URL_SCHEME)?Ns(t.slice(de.URL_SCHEME.length)):null;B.registerSaveRouter(An);B.registerLoadRouter(An);function Ns(t){return new de(t)}class Os{constructor(){k($().getBool("IS_BROWSER"),()=>"Current environment is not a web browser"),k(typeof window>"u"||typeof window.localStorage<"u",()=>"Current browser does not appear to support localStorage"),this.LS=window.localStorage}async listModels(){const e={},n=me+ne,r=ne+En;for(let s=0;s<this.LS.length;++s){const o=this.LS.key(s);if(o.startsWith(n)&&o.endsWith(r)){const i=_s(o);e[i]=JSON.parse(this.LS.getItem(o))}}return e}async removeModel(e){e=Bs(e);const n=In(e);if(this.LS.getItem(n.info)==null)throw new Error(`Cannot find model at path '${e}'`);const r=JSON.parse(this.LS.getItem(n.info));return kn(n),r}}/**
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
 */const ye="://";class W{constructor(){this.managers={}}static getInstance(){return W.instance==null&&(W.instance=new W),W.instance}static registerManager(e,n){k(e!=null,()=>"scheme must not be undefined or null."),e.endsWith(ye)&&(e=e.slice(0,e.indexOf(ye))),k(e.length>0,()=>"scheme must not be an empty string.");const r=W.getInstance();k(r.managers[e]==null,()=>`A model store manager is already registered for scheme '${e}'.`),r.managers[e]=n}static getManager(e){const n=W.getInstance().managers[e];if(n==null)throw new Error(`Cannot find model manager for scheme '${e}'`);return n}static getSchemes(){return Object.keys(W.getInstance().managers)}}function Oe(t){if(t.indexOf(ye)===-1)throw new Error(`The url string provided does not contain a scheme. Supported schemes are: ${W.getSchemes().join(",")}`);return{scheme:t.split(ye)[0],path:t.split(ye)[1]}}async function Tn(t,e,n=!1){k(t!==e,()=>`Old path and new path are the same: '${t}'`);const r=B.getLoadHandlers(t);k(r.length>0,()=>`Copying failed because no load handler is found for source URL ${t}.`),k(r.length<2,()=>`Copying failed because more than one (${r.length}) load handlers for source URL ${t}.`);const s=r[0],o=B.getSaveHandlers(e);k(o.length>0,()=>`Copying failed because no save handler is found for destination URL ${e}.`),k(o.length<2,()=>`Copying failed because more than one (${r.length}) save handlers for destination URL ${e}.`);const i=o[0],a=Oe(t).scheme,l=Oe(t).path,u=a===Oe(t).scheme,d=await s.load();n&&u&&await W.getManager(a).removeModel(l);const f=await i.save(d);return n&&!u&&await W.getManager(a).removeModel(l),f.modelArtifactsInfo}async function cu(){const t=W.getSchemes(),e={};for(const n of t){const r=await W.getManager(n).listModels();for(const s in r){const o=n+ye+s;e[o]=r[s]}}return e}async function uu(t){const e=Oe(t);return W.getManager(e.scheme).removeModel(e.path)}async function fu(t,e){return Tn(t,e,!1)}async function hu(t,e){return Tn(t,e,!0)}/**
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
 */class Ls{constructor(){this.messageName="setTimeoutCustom",this.functionRefs=[],this.handledMessageCount=0,this.hasEventListener=!1}fetch(e,n){return fetch(e,n)}now(){return performance.now()}encode(e,n){if(n!=="utf-8"&&n!=="utf8")throw new Error(`Browser's encoder only supports utf-8, but got ${n}`);return this.textEncoder==null&&(this.textEncoder=new TextEncoder),this.textEncoder.encode(e)}decode(e,n){return new TextDecoder(n).decode(e)}setTimeoutCustom(e,n){if(!window||!$().getBool("USE_SETTIMEOUTCUSTOM")){setTimeout(e,n);return}this.functionRefs.push(e),setTimeout(()=>{window.postMessage({name:this.messageName,index:this.functionRefs.length-1},"*")},n),this.hasEventListener||(this.hasEventListener=!0,window.addEventListener("message",r=>{if(r.source===window&&r.data.name===this.messageName){r.stopPropagation();const s=this.functionRefs[r.data.index];s(),this.handledMessageCount++,this.handledMessageCount===this.functionRefs.length&&(this.functionRefs=[],this.handledMessageCount=0)}},!0))}}if($().get("IS_BROWSER")){$().setPlatform("browser",new Ls);try{W.registerManager(de.URL_SCHEME,new Os)}catch{}try{W.registerManager(he.URL_SCHEME,new vs)}catch{}}/**
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
 */const Ps={importFetch:()=>require("node-fetch")};let Je;class Cs{constructor(){this.util=require("util"),this.textEncoder=new this.util.TextEncoder}fetch(e,n){return $().global.fetch!=null?$().global.fetch(e,n):(Je==null&&(Je=Ps.importFetch()),Je(e,n))}now(){const e=process.hrtime();return e[0]*1e3+e[1]/1e6}encode(e,n){if(n!=="utf-8"&&n!=="utf8")throw new Error(`Node built-in encoder only supports utf-8, but got ${n}`);return this.textEncoder.encode(e)}decode(e,n){return e.length===0?"":new this.util.TextDecoder(n).decode(e)}}$().get("IS_NODE")&&!$().get("IS_BROWSER")&&$().setPlatform("node",new Cs);/**
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
 */function dt(t,e="float32",n){return e=e||"float32",wt(t),new ts(t,e,n)}/**
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
 */function Us(t,e){const n=U(t,"x","cast");if(!Zt(e))throw new Error(`Failed to cast to unknown dtype ${e}`);if(e==="string"&&n.dtype!=="string"||e!=="string"&&n.dtype==="string")throw new Error("Only strings can be casted to strings");const r={x:n},s={dtype:e};return F.runKernel(rn,r,s)}const Fn=X({cast_:Us});/**
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
 */function Gs(t){const n={x:U(t,"x","clone","string_or_numeric")};return F.runKernel(sn,n)}const Ws=X({clone_:Gs});/**
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
 */function zs(t,e=!1){console.log(t.toString(e))}/**
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
 */gn();const Vs={buffer:dt,cast:Fn,clone:Ws,print:zs};rs(Vs);/**
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
 */function du(){$().set("PROD",!0)}function gu(){$().set("DEBUG",!0)}function pu(){$().set("DEPRECATION_WARNINGS_ENABLED",!1),console.warn("TensorFlow.js deprecation warnings have been disabled.")}function mu(t){$().getBool("DEPRECATION_WARNINGS_ENABLED")&&console.warn(t+" You can disable deprecation warnings with tf.disableDeprecationWarnings().")}function wu(){F.disposeVariables()}function yu(){return F}function bu(){return F.memory()}function Su(t){return F.profile(t)}function Eu(t,e){return F.tidy(t,e)}function Iu(t){It(t).forEach(n=>n.dispose())}function ku(t){return F.keep(t)}function Au(t){return F.time(t)}function Tu(t){return F.setBackend(t)}function Fu(){return F.ready()}function $u(){return F.backendName}function vu(t){F.removeBackend(t)}function Mu(t){return F.findBackend(t)}function Du(t){return F.findBackendFactory(t)}function xu(t,e,n=1){return F.registerBackend(t,e,n)}function Ru(){return F.backend}function _u(t,e){$().setPlatform(t,e)}/**
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
 */function $n(t,e){const n=t.length,r=[];for(let s=0;s<n;s++){const o=n-1-s,i=t[o]||1;(e[e.length-1-s]||1)>1&&i===1&&r.unshift(o)}return r}function At(t,e){const n=[];for(let r=0;r<e.length;r++){const s=t[t.length-r-1],o=e.length-r-1,i=e[o];(s==null||s===1&&i>1)&&n.unshift(o)}return n}function vn(t,e){const n=[],r=Math.max(t.length,e.length);for(let s=0;s<r;s++){let o=t[t.length-s-1];o==null&&(o=1);let i=e[e.length-s-1];if(i==null&&(i=1),o===1)n.unshift(i);else if(i===1)n.unshift(o);else if(o!==i){const a=`Operands could not be broadcast together with shapes ${t} and ${e}.`;throw Error(a)}else n.unshift(o)}return n}var Bu=Object.freeze({__proto__:null,assertAndGetBroadcastShape:vn,getBroadcastDims:$n,getReductionAxes:At});function Mn(t,e){const n=t.shape.length,r=e.shape.length;if(n<1)throw new Error(`tf.gatherND() expects the input to be rank 1 or higher, but the rank was ${n}.`);if(r<1)throw new Error(`tf.gatherND() expects the indices to be rank 1 or higher, but the rank was ${r}.`);if(e.dtype!=="int32")throw new Error(`tf.gatherND() expects the indices to be int32 type, but the dtype was ${e.dtype}.`);if(e.shape[r-1]>n)throw new Error(`index innermost dimension length must be <= tensor rank; saw: ${e.shape[r-1]} vs. ${n}`);if(O(t.shape)===0)throw new Error(`Requested more than 0 entries, but input is empty. Input shape: ${t.shape}.`);const s=e.shape,o=s[s.length-1];let i=1;for(let f=0;f<s.length-1;++f)i*=s[f];const a=t.shape,l=s.slice();l.pop();let u=1;for(let f=o;f<n;++f)u*=a[f],l.push(a[f]);const d=[...ge(t.shape).map(f=>f/u),1].slice(0,o);return[l,i,u,d]}var Nu=Object.freeze({__proto__:null,prepareAndValidate:Mn});function Tt(t,e,n){const r=e.rank>1?e.shape[e.rank-1]:1,s=e.rank>1?e.rank-1:1,o=`Must have updates.shape = indices.shape[:batchDim] + shape[sliceDim:], got updates.shape: ${n.shape}, indices.shape: ${e.shape}, shape: ${t}, sliceDim: ${r}, and batchDim: ${s}.`;if(n.rank<s)throw new Error(o+` update.rank < ${s}. `);if(t.length<r+(n.rank-s))throw new Error(o+` Output shape length < ${r+(n.rank-s)}`);if(n.rank!==s+t.length-r)throw new Error(o+` update.rank != ${s+t.length-r}`);for(let i=0;i<s;++i)if(n.shape[i]!==e.shape[i])throw new Error(o+` updates.shape[${i}] (${n.shape[i]}) != indices.shape[${i}] (${e.shape[i]}).`);for(let i=0;i<n.rank-s;++i)if(n.shape[i+s]!==t[i+r])throw new Error(o+` updates.shape[${i+s}] (${n.shape[i+s]}) != shape[${i+s}] (${t[i+s]})`)}function Dn(t,e,n){if(e.rank<1)throw new Error(`tf.scatterND() expects the indices to be rank 1 or higher, but the rank was ${e.rank}.`);if(t.rank<1)throw new Error(`tf.scatterND() expects the updates to be rank 1 or higher, but the rank was ${t.rank}.`);if(e.dtype!=="int32")throw new Error(`The dtype of 'indices' should be int32, but got dtype: ${e.dtype}`);if(n.length<1)throw new Error(`Output rank must be greater or equal to 1, but got shape: ${n}`);if(n.length===0){if(e.size===0)throw new Error(`Indices specified for empty output. indices shape: ${e.shape}`);if(t.size===0)throw new Error(`Updates specified for empty output. updates shape: ${t.shape}`)}Tt(n,e,t)}function xn(t,e,n){const r=e.shape.length,s=r>1?e.shape[r-1]:1,o=n.length;let i=1;for(let f=s;f<o;++f)i*=n[f];const a=s<1?1:s,l=O(e.shape)/a,u=[...ge(n.slice(0,s)),1],d=O(n);return{sliceRank:s,numUpdates:l,sliceSize:i,strides:u,outputSize:d}}var Ou=Object.freeze({__proto__:null,calculateShapes:xn,validateInput:Dn,validateUpdateShape:Tt});/**
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
 */const gt=-2,qs=-1;function Rn(t,e,n){const r=t.shape.length;k(r===e.length,()=>`Error in slice${r}D: Length of begin ${e} must match the rank of the array (${r}).`),k(r===n.length,()=>`Error in slice${r}D: Length of size ${n} must match the rank of the array (${r}).`);for(let s=0;s<r;++s)k(e[s]+n[s]<=t.shape[s],()=>`Error in slice${r}D: begin[${s}] + size[${s}] (${e[s]+n[s]}) would overflow input.shape[${s}] (${t.shape[s]})`)}function js(t){const e=[];let n=0;for(;t>0;)t&1&&e.push(n),t/=2,n++;return e}function Hs(t,e,n){const r=[];for(let s=0;s<t.length;s++)r[s]=Math.ceil((e[s]-t[s])/n[s]);return r}function _n(t,e,n,r){const s=[...t];for(let o=s.length;o<r.length;o++)s.push(1);for(let o=0;o<n;o++)o===0?s[e]=1:(s.splice(e,0,1),s.pop());return s}function Bn(t,e,n){return n<=t?n:n-(e-1)}function Nn(t,e){const n=[];for(let r=0;r<t;r++)n.push(e+r);return n}function Ks(t,e,n,r,s,o,i,a,l){const u=t.length;let d=new Array(u),f=new Array(u),h=new Array(u);if(e.length&&n>0){const g=e[0],y=n+1;d=On(i,g,y,r,t),f=Ln(a,g,y,s,t),h=_n(o,g,y,t)}else for(let g=0;g<u;g++)d[g]=Cn(i,r,o,t,g,l),f[g]=Un(a,s,o,t,g,l),h[g]=Pn(o,g,l);return{begin:d,end:f,strides:h}}function On(t,e,n,r,s){const o=[...s],i=Nn(n,e);for(let a=0;a<o.length;a++)if(i.indexOf(a)>-1)o[a]=0;else{const l=Bn(e,n,a);let u=r[l];t&1<<l&&(u=0),o[a]=u}return o}function Ln(t,e,n,r,s){const o=[...s],i=Nn(n,e);for(let a=0;a<o.length;a++)if(i.indexOf(a)>-1)o[a]=Number.MAX_SAFE_INTEGER;else{const l=Bn(e,n,a);let u=r[l];t&1<<l&&(u=Number.MAX_SAFE_INTEGER),o[a]=u}for(let a=0;a<o.length;a++){const l=s[a];o[a]<0&&(o[a]+=l),o[a]=$e(0,o[a],s[a])}return o}function Pn(t,e,n){let r=t[e];return(n&1<<e||r==null)&&(r=1),r}function Cn(t,e,n,r,s,o){let i=e[s];const a=n[s]||1;(t&1<<s||o&1<<s||i==null)&&(a>0?i=Number.MIN_SAFE_INTEGER:i=Number.MAX_SAFE_INTEGER);const l=r[s];return i<0&&(i+=l),i=$e(0,i,l-1),i}function Un(t,e,n,r,s,o){let i=e[s];const a=n[s]||1;(t&1<<s||o&1<<s||i==null)&&(a>0?i=Number.MAX_SAFE_INTEGER:i=Number.MIN_SAFE_INTEGER);const l=r[s];return i<0&&(i+=l),a>0?i=$e(0,i,l):i=$e(-1,i,l-1),i}function Gn(t,e,n){let r=n.length;for(let s=0;s<n.length;s++)if(n[s]>1){r=s;break}for(let s=r+1;s<n.length;s++)if(e[s]>0||n[s]!==t[s])return!1;return!0}function Wn(t,e){let n=t.length>0?t[t.length-1]:1;for(let r=0;r<t.length-1;r++)n+=t[r]*e[r];return n}function zn(t,e,n){let r;const s=t.shape.length;typeof e=="number"?r=[e,...new Array(s-1).fill(0)]:e.length<s?r=e.concat(new Array(s-e.length).fill(0)):r=e.slice(),r.forEach(i=>{k(i!==-1,()=>"slice() does not support negative begin indexing.")});let o;return n==null?o=new Array(s).fill(-1):typeof n=="number"?o=[n,...new Array(s-1).fill(-1)]:n.length<s?o=n.concat(new Array(s-n.length).fill(-1)):o=n,o=o.map((i,a)=>i>=0?i:(k(i===-1,()=>`Negative size values should be exactly -1 but got ${i} for the slice() size at index ${a}.`),t.shape[a]-r[a])),[r,o]}function Zs(t,e,n,r,s,o,i,a,l){let u;if(r==null?(u=new Array(e.length),u.fill(1)):u=r,i!=null&&(i&i-1)!==0)throw new Error("Multiple ellipses in slice is not allowed.");let d=!1;const f={dims:u.length,numAddAxisAfterEllipsis:0,begin:e.slice(),end:n.slice(),strides:u.slice(),beginMask:s,endMask:o,ellipsisMask:i,newAxisMask:a,shrinkAxisMask:l};for(let b=0;b<f.dims;b++)d&&(1<<b&a)!==0&&f.numAddAxisAfterEllipsis++,1<<b&i&&(d=!0);d||(f.ellipsisMask|=1<<f.dims,f.dims++);const h={dims:t.length,beginMask:0,endMask:0,beginValid:!1,endValid:!1};Xs(f,h);let g=!0,y=!0,w=!0;const I=[],S=[];for(let b=0;b<t.length;++b){if(h.strides[b]===0)throw Error(`strides[${b}] must be non-zero`);const v=!!(h.shrinkAxisMask&1<<b),D=t[b];if(D===-1){I.push(v?1:-1);continue}const V=[h.beginMask&1<<b,h.endMask&1<<b],q=[h.strides[b]>0?0:-1,h.strides[b]>0?D:D-1];if(v&&h.strides[b]<=0)throw Error("only stride 1 allowed on non-range indexing.");w=w&&h.strides[b]===1;const _=!!(h.beginMask&1<<b&&h.endMask&1<<b);if(h.beginValid&&h.endValid){if(v){const E=h.begin[b]<0?D+h.begin[b]:h.begin[b];if(h.begin[b]=E,h.end[b]=h.begin[b]+1,E<0||E>=D)throw Error(`slice index ${h.begin[b]} of dimension ${b} out of bounds.`)}else h.begin[b]=Wt(h.begin[b],0,h.strides[b],D,V,q),h.end[b]=Wt(h.end[b],1,h.strides[b],D,V,q);const c=h.strides[b]===1&&h.begin[b]===0&&h.end[b]===D;g=g&&c,y=y&&(b===0&&h.strides[b]===1||c)}else g=g&&h.strides[b]===1&&_,y=y&&(b===0&&h.strides[b]===1||_);let m,p=!1;if(h.beginValid&&h.endValid?(m=h.end[b]-h.begin[b],p=!0):v?(m=1,p=!0):_&&D>=0&&(h.strides[b]<0?m=-D:m=D,p=!0),p){let c;m===0||m<0!=h.strides[b]<0?c=0:c=Math.trunc(m/h.strides[b])+(m%h.strides[b]!==0?1:0),I.push(c)}else I.push(-1)}for(let b=0;b<h.finalShapeGatherIndices.length;++b){const v=h.finalShapeGatherIndices[b];v>=0?S.push(I[v]):v===gt&&S.push(1)}return{finalShapeSparse:S.filter((b,v)=>h.finalShapeGatherIndices[v]!==gt),finalShape:S,isIdentity:g,sliceDim0:y,isSimpleSlice:w,begin:h.begin,end:h.end,strides:h.strides}}function Xs(t,e){e.beginMask=0,e.endMask=0,e.shrinkAxisMask=0;let n=0;e.beginValid=t.begin!=null,e.endValid=t.end!=null,e.begin=new Array(e.dims),e.end=new Array(e.dims),e.strides=new Array(e.dims),e.finalShapeGatherIndices=[],e.finalShapeGatherIndicesSparse=[],e.inputShapeGatherIndicesSparse=new Array(e.dims);for(let r=0;r<t.dims;r++)if(1<<r&t.ellipsisMask){const s=Math.min(e.dims-(t.dims-r)+1+t.numAddAxisAfterEllipsis,e.dims);for(;n<s;n++)e.begin[n]=0,e.end[n]=0,e.strides[n]=1,e.beginMask|=1<<n,e.endMask|=1<<n,e.finalShapeGatherIndices.push(n),e.finalShapeGatherIndicesSparse.push(-1),e.inputShapeGatherIndicesSparse[n]=r}else if(1<<r&t.newAxisMask)e.finalShapeGatherIndices.push(gt),e.finalShapeGatherIndicesSparse.push(-1);else{if(n===e.begin.length)throw Error(`Index out of range using input dim ${n}; input has only ${e.dims} dims, ${e.begin.length}.`);t.begin!=null&&(e.begin[n]=t.begin[r]),t.end!=null&&(e.end[n]=t.end[r]),e.strides[n]=t.strides[r],t.beginMask&1<<r&&(e.beginMask|=1<<n),t.endMask&1<<r&&(e.endMask|=1<<n),t.shrinkAxisMask&1<<r?(e.finalShapeGatherIndices.push(qs),e.finalShapeGatherIndicesSparse.push(-1),e.shrinkAxisMask|=1<<n):(e.finalShapeGatherIndices.push(n),e.finalShapeGatherIndicesSparse.push(r)),e.inputShapeGatherIndicesSparse[n]=r,n++}}function Wt(t,e,n,r,s,o){if(s[e])return n>0?o[e]:o[e+1&1];{const i=t<0?r+t:t;return i<o[0]?o[0]:i>o[1]?o[1]:i}}var Ys=Object.freeze({__proto__:null,assertParamsValid:Rn,computeFlatOffset:Wn,computeOutShape:Hs,getNormalizedAxes:Ks,isSliceContinous:Gn,maskToAxes:js,parseSliceParams:zn,sliceInfo:Zs,startForAxis:Cn,startIndicesWithElidedDims:On,stopForAxis:Un,stopIndicesWithElidedDims:Ln,stridesForAxis:Pn,stridesWithElidedDims:_n});/**
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
 */function Js(t,e){let n=U(t,"a","mul"),r=U(e,"b","mul");[n,r]=hn(n,r);const s={a:n,b:r};return F.runKernel(Fr,s)}const Qs=X({mul_:Js});/**
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
 */function eo(t,e,n,r,s="NHWC",o){const i=t[3],a=[...e,i],l=qn(s);return Ft(t,a,n,o,r,null,null,l)}function to(t,e,n,r,s,o,i="channelsLast"){const[a,l]=We(e);let u;if(i==="channelsLast")u=[a,l,t[3],t[3]];else if(i==="channelsFirst")u=[a,l,t[1],t[1]];else throw new Error(`Unknown dataFormat ${i}`);return Ft(t,u,n,r,s,o,!1,i)}function no(t,e,n,r,s,o,i="NDHWC"){const[a,l,u]=pt(e);let d,f;if(i==="NDHWC")f="channelsLast",d=[a,l,u,t[4],t[4]];else if(i==="NCDHW")f="channelsFirst",d=[a,l,u,t[1],t[1]];else throw new Error(`Unknown dataFormat ${i}`);return Vn(t,d,n,r,s,!1,f,o)}function Ft(t,e,n,r,s,o,i=!1,a="channelsLast"){let[l,u,d,f]=[-1,-1,-1,-1];if(a==="channelsLast")[l,u,d,f]=t;else if(a==="channelsFirst")[l,f,u,d]=t;else throw new Error(`Unknown dataFormat ${a}`);const[h,g,,y]=e,[w,I]=We(n),[S,A]=We(r),b=be(h,S),v=be(g,A),{padInfo:D,outHeight:V,outWidth:q}=oo(s,u,d,w,I,b,v,o,a),_=i?y*f:y;let m;return a==="channelsFirst"?m=[l,_,V,q]:a==="channelsLast"&&(m=[l,V,q,_]),{batchSize:l,dataFormat:a,inHeight:u,inWidth:d,inChannels:f,outHeight:V,outWidth:q,outChannels:_,padInfo:D,strideHeight:w,strideWidth:I,filterHeight:h,filterWidth:g,effectiveFilterHeight:b,effectiveFilterWidth:v,dilationHeight:S,dilationWidth:A,inShape:t,outShape:m,filterShape:e}}function Vn(t,e,n,r,s,o=!1,i="channelsLast",a){let[l,u,d,f,h]=[-1,-1,-1,-1,-1];if(i==="channelsLast")[l,u,d,f,h]=t;else if(i==="channelsFirst")[l,h,u,d,f]=t;else throw new Error(`Unknown dataFormat ${i}`);const[g,y,w,,I]=e,[S,A,b]=pt(n),[v,D,V]=pt(r),q=be(g,v),_=be(y,D),m=be(w,V),{padInfo:p,outDepth:c,outHeight:E,outWidth:T}=io(s,u,d,f,S,A,b,q,_,m,a),R=o?I*h:I;let M;return i==="channelsFirst"?M=[l,R,c,E,T]:i==="channelsLast"&&(M=[l,c,E,T,R]),{batchSize:l,dataFormat:i,inDepth:u,inHeight:d,inWidth:f,inChannels:h,outDepth:c,outHeight:E,outWidth:T,outChannels:R,padInfo:p,strideDepth:S,strideHeight:A,strideWidth:b,filterDepth:g,filterHeight:y,filterWidth:w,effectiveFilterDepth:q,effectiveFilterHeight:_,effectiveFilterWidth:m,dilationDepth:v,dilationHeight:D,dilationWidth:V,inShape:t,outShape:M,filterShape:e}}function ro(t,e,n,r,s){r==null&&(r=$t(t,e,n));const o=t[0],i=t[1],a=fe((o-e+2*r)/n+1,s),l=fe((i-e+2*r)/n+1,s);return[a,l]}function so(t,e,n,r,s,o){s==null&&(s=$t(t,e,r));const i=t[0],a=t[1],l=t[2],u=fe((i-e+2*s)/r+1,o),d=fe((a-e+2*s)/r+1,o),f=fe((l-e+2*s)/r+1,o);return[u,d,f,n]}function $t(t,e,n,r=1){const s=be(e,r);return Math.floor((t[0]*(n-1)-n+s)/2)}function We(t){return typeof t=="number"?[t,t,t]:t.length===2?[t[0],t[1],1]:t}function pt(t){return typeof t=="number"?[t,t,t]:t}function be(t,e){return e<=1?t:t+(t-1)*(e-1)}function oo(t,e,n,r,s,o,i,a,l){let u,d,f;if(typeof t=="number"){u={top:t,bottom:t,left:t,right:t,type:t===0?"VALID":"NUMBER"};const g=ro([e,n],o,r,t,a);d=g[0],f=g[1]}else if(t==="same"){d=Math.ceil(e/r),f=Math.ceil(n/s);const h=Math.max(0,(d-1)*r+o-e),g=Math.max(0,(f-1)*s+i-n),y=Math.floor(h/2),w=h-y,I=Math.floor(g/2),S=g-I;u={top:y,bottom:w,left:I,right:S,type:"SAME"}}else if(t==="valid")u={top:0,bottom:0,left:0,right:0,type:"VALID"},d=Math.ceil((e-o+1)/r),f=Math.ceil((n-i+1)/s);else if(typeof t=="object"){const h=l==="channelsLast"?t[1][0]:t[2][0],g=l==="channelsLast"?t[1][1]:t[2][1],y=l==="channelsLast"?t[2][0]:t[3][0],w=l==="channelsLast"?t[2][1]:t[3][1];u={top:h,bottom:g,left:y,right:w,type:h===0&&g===0&&y===0&&w===0?"VALID":"EXPLICIT"},d=fe((e-o+h+g)/r+1,a),f=fe((n-i+y+w)/s+1,a)}else throw Error(`Unknown padding parameter: ${t}`);return{padInfo:u,outHeight:d,outWidth:f}}function io(t,e,n,r,s,o,i,a,l,u,d){let f,h,g,y;if(typeof t=="number"){f={top:t,bottom:t,left:t,right:t,front:t,back:t,type:t===0?"VALID":"NUMBER"};const I=so([e,n,r,1],a,1,s,t,d);h=I[0],g=I[1],y=I[2]}else if(t==="same"){h=Math.ceil(e/s),g=Math.ceil(n/o),y=Math.ceil(r/i);const w=(h-1)*s+a-e,I=(g-1)*o+l-n,S=(y-1)*i+u-r,A=Math.floor(w/2),b=w-A,v=Math.floor(I/2),D=I-v,V=Math.floor(S/2),q=S-V;f={top:v,bottom:D,left:V,right:q,front:A,back:b,type:"SAME"}}else if(t==="valid")f={top:0,bottom:0,left:0,right:0,front:0,back:0,type:"VALID"},h=Math.ceil((e-a+1)/s),g=Math.ceil((n-l+1)/o),y=Math.ceil((r-u+1)/i);else throw Error(`Unknown padding parameter: ${t}`);return{padInfo:f,outDepth:h,outHeight:g,outWidth:y}}function fe(t,e){if(!e)return Math.trunc(t);switch(e){case"round":return Math.round(t);case"ceil":return Math.ceil(t);case"floor":return Math.floor(t);default:throw new Error(`Unknown roundingMode ${e}`)}}function mt(t){const[e,n,r]=We(t);return e===1&&n===1&&r===1}function ao(t,e){return mt(t)||mt(e)}function qn(t){if(t==="NHWC")return"channelsLast";if(t==="NCHW")return"channelsFirst";throw new Error(`Unknown dataFormat ${t}`)}function lo(t,e,n){if(n!=null){if(typeof e=="string")throw Error(`Error in ${t}: pad must be an integer when using dimRoundingMode ${n} but got pad ${e}.`);if(typeof e=="number")k(Pe(e),()=>`Error in ${t}: pad must be an integer when using dimRoundingMode ${n} but got pad ${e}.`);else if(typeof e=="object")e.forEach(r=>{r.forEach(s=>{k(Pe(s),()=>`Error in ${t}: pad must be an integer when using dimRoundingMode ${n} but got pad ${s}.`)})});else throw Error(`Error in ${t}: Unknown padding parameter: ${e}`)}}/**
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
 */function co(t,e){const r={x:U(t,"x","reshape","string_or_numeric")},s={shape:e};return F.runKernel(Mr,r,s)}const uo=X({reshape_:co});/**
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
 */function fo(t){const n={x:U(t,"x","sigmoid","float32")};return F.runKernel(Rr,n)}const ho=X({sigmoid_:fo});/**
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
 */function go(t){const n={x:U(t,"x","elu","float32")};return F.runKernel(Ar,n)}const po=X({elu_:go});/**
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
 */function vt(t,e){for(let n=0;n<t.length;++n)if(t[t.length-n-1]!==e-1-n)return!1;return!0}function jn(t,e,n){const r=t.length+e.length,s=[];let o=0,i=0;for(let a=0;a<r;a++)n.indexOf(a)===-1?s.push(t[o++]):s.push(e[i++]);return s}function mo(t,e){const n=[],r=t.length;for(let o=0;o<r;o++)e.indexOf(o)===-1&&n.push(t[o]);const s=e.map(o=>t[o]);return[n,s]}function wo(t,e){const n=e.map(r=>1);return jn(t,n,e)}function yo(t,e,n){k(vt(e,n),()=>`${t} supports only inner-most axes for now. Got axes ${e} and rank-${n} input.`)}function bo(t,e){if(vt(t,e))return null;const n=[];for(let r=0;r<e;++r)t.indexOf(r)===-1&&n.push(r);return t.forEach(r=>n.push(r)),n}function So(t){return t.map((e,n)=>[n,e]).sort((e,n)=>e[1]-n[1]).map(e=>e[0])}function Eo(t,e){const n=[];for(let r=e-t;r<e;++r)n.push(r);return n}/**
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
 */function Io(t,e=null,n=!1){let r=U(t,"x","sum");r.dtype==="bool"&&(r=Fn(r,"int32"));const s={x:r},o={axis:e,keepDims:n};return F.runKernel(_r,s,o)}const ko=X({sum_:Io});/**
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
 */function Ao(t,e=.2){const r={x:U(t,"x","leakyRelu")},s={alpha:e};return F.runKernel(Tr,r,s)}const To=X({leakyRelu_:Ao});/**
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
 */function Fo(t,e){const n=U(t,"x","prelu"),r=U(e,"alpha","prelu"),s={x:n,alpha:r};return F.runKernel($r,s)}const $o=X({prelu_:Fo});var vo={},Mo=Object.freeze({__proto__:null,default:vo}),Lu=Pr(Mo);/**
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
 */function Do(t){const n={x:U(t,"x","relu")};return F.runKernel(vr,n)}const xo=X({relu_:Do});/**
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
 */function Ro(t){const n={x:U(t,"x","relu6")};return F.runKernel(Dr,n)}const _o=X({relu6_:Ro});/**
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
 */function Bo(t,e=0){const r={x:U(t,"x","step")},s={alpha:e};return F.runKernel(Br,r,s)}const No=X({step_:Bo});/**
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
 */function Oo(t,e,n){if(n==null||n==="linear")return t;if(n==="relu")return Qs(t,No(e));throw new Error(`Cannot compute gradient for fused activation ${n}.`)}function Lo(t,e){let n=e;const r=At(t.shape,e.shape);return r.length>0&&(n=ko(n,r)),uo(n,t.shape)}function Po(t,e,n,r){if(e==="linear")return t;if(e==="relu")return xo(t);if(e==="elu")return po(t);if(e==="relu6")return _o(t);if(e==="prelu")return $o(t,n);if(e==="leakyrelu")return To(t,r);if(e==="sigmoid")return ho(t);throw new Error(`Unknown fused activation ${e}.`)}const Co=(t,e)=>!(t>0)||e==="linear";/**
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
 */function Uo(t,e){const n=t[0].length;t.forEach((s,o)=>{k(s.length===n,()=>`Error in concat${n}D: rank of tensors[${o}] must be the same as the rank of the rest (${n})`)}),k(e>=0&&e<n,()=>`Error in concat${n}D: axis must be between 0 and ${n-1}.`);const r=t[0];t.forEach((s,o)=>{for(let i=0;i<n;i++)k(i===e||s[i]===r[i],()=>`Error in concat${n}D: Shape of tensors[${o}] (${s}) does not match the shape of the rest (${r}) along the non-concatenated axis ${o}.`)})}function Go(t,e){const n=t[0].slice();for(let r=1;r<t.length;r++)n[e]+=t[r][e];return n}/**
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
 */var te;(function(t){t[t.FIRST_DIM_SIZE=0]="FIRST_DIM_SIZE",t[t.VALUE_ROWIDS=1]="VALUE_ROWIDS",t[t.ROW_LENGTHS=2]="ROW_LENGTHS",t[t.ROW_SPLITS=3]="ROW_SPLITS",t[t.ROW_LIMITS=4]="ROW_LIMITS",t[t.ROW_STARTS=5]="ROW_STARTS"})(te||(te={}));function Wo(t,e,n){let r=new Array;if(n==null&&e==null)return r;if(e==null)for(;r.length<t+n.length;)r.push(-1);else r=e.slice();if(n==null)return r;if(t+n.length!==r.length)throw new Error(`rt input.shape and shape=${e} are incompatible: rt input.rank = ${t+n.length}, but shape.rank = ${r.length}`);for(let s=1;s<n.length;++s){const o=n[s],i=r[r.length-n.length+s],a=r[i];if(o>=0)if(a>=0){if(a!==o)throw new Error(`rt input.shape and shape=${e} are incompatible: rt input.shape[${s+t}] = ${o} but shape[${s+t}] = ${a}`)}else r[i]=o}return r}function zo(t){const e={FIRST_DIM_SIZE:te.FIRST_DIM_SIZE,VALUE_ROWIDS:te.VALUE_ROWIDS,ROW_LENGTHS:te.ROW_LENGTHS,ROW_SPLITS:te.ROW_SPLITS,ROW_LIMITS:te.ROW_LIMITS,ROW_STARTS:te.ROW_STARTS},n=[];for(const r of t)if(r in e)n.push(e[r]);else break;return n}function Vo(t){return t.length===0?0:t[0]===te.FIRST_DIM_SIZE?t.length-1:t.length}function qo(t,e){if(t==null||e==null)return;const n=t.length,r=e.length;if(n>=r)throw new Error(`defaultValue.shape=${t} and ragged tensor flatValues.shape=${e}, are incompatible: defaultValue.rank = ${n} must be less than ragged tensor input flatValues.rank = ${r})`);for(let s=0;s<Math.min(n,r-1);++s){const o=t[s],i=e[s+1];if(o>=0&&i>=0&&o!==1&&o!==i)throw new Error(`defaultValue.shape=${t}, and ragged tensor input flatValues.shape=${e} are incompatible: defaultValue.shape[${s-t.length}] = ${o} but ragged tensor input.flatValues.shape[${s-t.length}] = ${i}`)}}/**
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
 */const Mt=30;function jo(t){return t<=Mt?t:Ce(t,Math.floor(Math.sqrt(t)))}/**
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
 */function Ho(t,e,n){const r=n*(typeof t=="number"?t:t[0]),s=e*(typeof t=="number"?t:t[1]);return[r,s]}/**
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
 */function Ko(t,e,n,r=!0){let s=[];if(r)s=s.concat(e.slice(0)),s.push(t[0]/n),s=s.concat(t.slice(1));else{s=s.concat(t[0]);const o=e.length;for(let i=0;i<o;++i)s=s.concat([t[i+1]/e[i],e[i]]);s=s.concat(t.slice(o+1))}return s}function Zo(t,e,n=!0){const r=[];if(n){r.push(e);for(let s=e+1;s<t;++s)s<=2*e?(r.push(s),r.push(s-(e+1))):r.push(s)}else{const s=[],o=[];for(let i=1;i<t;++i)i>=e*2+1||i%2===1?o.push(i):s.push(i);r.push(...s),r.push(0),r.push(...o)}return r}function Xo(t,e,n,r=!0){const s=[];r?s.push(t[0]/n):s.push(t[0]*n);for(let o=1;o<t.length;++o)o<=e.length?r?s.push(e[o-1]*t[o]):s.push(t[o]/e[o-1]):s.push(t[o]);return s}function Yo(t,e){const n=[0];for(let r=0;r<e;++r)n.push(t[r][0]);return n}function Jo(t,e,n){const r=t.slice(0,1);for(let s=0;s<n;++s)r.push(t[s+1]-e[s][0]-e[s][1]);return r}/**
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
 */const Qo=1.7580993408473768,ei=1.0507009873554805;/**
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
 */const ti=.3275911,ni=.254829592,ri=-.284496736,si=1.421413741,oi=-1.453152027,ii=1.061405429;/**
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
 */function ai(t,e){if(t.length!==e.length)throw new Error(`Cannot merge real and imag arrays of different lengths. real:${t.length}, imag: ${e.length}.`);const n=new Float32Array(t.length*2);for(let r=0;r<n.length;r+=2)n[r]=t[r/2],n[r+1]=e[r/2];return n}function li(t){const e=new Float32Array(t.length/2),n=new Float32Array(t.length/2);for(let r=0;r<t.length;r+=2)e[r/2]=t[r],n[r/2]=t[r+1];return{real:e,imag:n}}function ci(t){const e=Math.ceil(t.length/4),n=new Float32Array(e),r=new Float32Array(e);for(let s=0;s<t.length;s+=4)n[Math.floor(s/4)]=t[s],r[Math.floor(s/4)]=t[s+1];return{real:n,imag:r}}function ui(t){const e=Math.floor(t.length/4),n=new Float32Array(e),r=new Float32Array(e);for(let s=2;s<t.length;s+=4)n[Math.floor(s/4)]=t[s],r[Math.floor(s/4)]=t[s+1];return{real:n,imag:r}}function fi(t,e){const n=t[e*2],r=t[e*2+1];return{real:n,imag:r}}function hi(t,e,n,r){t[r*2]=e,t[r*2+1]=n}function di(t,e){const n=new Float32Array(t/2),r=new Float32Array(t/2);for(let s=0;s<Math.ceil(t/2);s++){const o=(e?2:-2)*Math.PI*(s/t);n[s]=Math.cos(o),r[s]=Math.sin(o)}return{real:n,imag:r}}function gi(t,e,n){const r=(n?2:-2)*Math.PI*(t/e),s=Math.cos(r),o=Math.sin(r);return{real:s,imag:o}}/**
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
 */const Qe="->",pi=/->/g,zt=",",Vt="...";function mi(t,e){t=t.replace(/\s/g,"");const n=(t.length-t.replace(pi,"").length)/Qe.length;if(n<1)throw new Error("Equations without an arrow are not supported.");if(n>1)throw new Error(`Equation must contain exactly one arrow ("${Qe}").`);const[r,s]=t.split(Qe);k(r.indexOf(Vt)===-1,()=>`The ellipsis notation ("${Vt}") is not supported yet.`);const o=r.split(zt),i=o.length;if(e!==i)throw new Error(`Expected ${i} input tensors, received ${e}`);if(i>2)throw new Error("Support for more than 2 input tensors is not implemented yet.");const a=[];for(let h=0;h<s.length;++h){const g=s[h];if(!o.some(y=>y.indexOf(g)!==-1))throw new Error(`Output subscripts contain the label ${g} not present in the input subscripts.`);a.indexOf(g)===-1&&a.push(g)}for(let h=0;h<r.length;++h){const g=r[h];a.indexOf(g)===-1&&g!==zt&&a.push(g)}const l=new Array(o.length);for(let h=0;h<i;++h){if(new Set(o[h].split("")).size!==o[h].length)throw new Error(`Found duplicate axes in input component ${o[h]}. Support for duplicate axes in input is not implemented yet.`);l[h]=[];for(let g=0;g<o[h].length;++g)l[h].push(a.indexOf(o[h][g]))}const u=a.length,d=s.length,f=[];for(let h=d;h<u;++h)f.push(h);return{allDims:a,summedDims:f,idDims:l}}function wi(t,e){let n=new Array(t);n.fill(-1);for(let s=0;s<e.length;++s)n[e[s]]=s;const r=[];for(let s=0;s<t;++s)n[s]===-1&&r.push(s);return n=n.filter(s=>s!==-1),{permutationIndices:n,expandDims:r}}function yi(t,e,n){const r=new Array(t);for(let s=0;s<n.length;++s){const o=n[s].shape;for(let i=0;i<e[s].length;++i)r[e[s][i]]===void 0?r[e[s][i]]=o[i]:k(r[e[s][i]]===o[i],()=>`Expected dimension ${r[e[s][i]]} at axis ${i} of input shaped ${JSON.stringify(o)}, but got dimension ${o[i]}`)}}function bi(t,e){const n=t,r=[];let s=0;t.length===0&&n.push(-1),s=t.length+1;for(let i=0;i<s;++i)r.push([]);const o=[];for(let i=0;i<n.length;++i){const a=n[i],l=Ei(e,a);for(const u of l)o.indexOf(u)===-1&&(r[i].push(u),o.push(u))}return{path:n,steps:r}}function Si(t){return t.every((e,n)=>e===n)}function Ei(t,e){const n=[];for(let r=0;r<t.length;++r)(t[r].length===0||t[r].indexOf(e)!==-1||e===-1)&&n.push(r);return n}function Ii(t,e,n=0){let r=[];if(typeof e=="number")k(t.shape[n]%e===0,()=>"Number of splits must evenly divide the axis."),r=new Array(e).fill(t.shape[n]/e);else{const s=e.reduce((i,a)=>(a===-1&&(i+=1),i),0);k(s<=1,()=>"There should be only one negative value in split array.");const o=e.indexOf(-1);if(o!==-1){const i=e.reduce((a,l)=>l>0?a+l:a);e[o]=t.shape[n]-i}k(t.shape[n]===e.reduce((i,a)=>i+a),()=>"The sum of sizes must match the size of the axis dimension."),r=e}return r}/**
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
 */function ki(t){return`Received SparseTensor with denseShape[0] = 0 but
  indices.shape[0] = ${t}`}function Ai(t,e){return`indices(${t}, 0) is invalid: ${e} < 0`}function Ti(t,e,n){return`indices(${t}, 0) is invalid: ${e} >= ${n}`}/**
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
 */function Fi(t,e){return`only one output dimension may be -1, not both ${t} and ${e}`}function $i(t,e){return`size ${t} must be non-negative, not ${e}`}function vi(){return"reshape cannot infer the missing input size for an empty tensor unless all specified input sizes are non-zero"}function Mi(t,e){const n=O(t),r=O(e);return`Input to reshape is a SparseTensor with ${n}
  dense values, but the requested shape requires a multiple of ${r}. inputShape=${t} outputShape= ${e}`}function Di(t,e){const n=O(t),r=O(e);return`Input to reshape is a tensor with ${n} dense values, but the requested shape has ${r}. inputShape=${t} outputShape=${e}`}/**
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
 */function xi(){return"segment ids must be >= 0"}function Ri(){return"segment ids are not increasing"}function _i(t,e){return`Segment id ${t} out of range [0, ${e}), possibly because segmentIds input is not sorted.`}function Bi(t,e,n){return`Bad: indices[${t}] == ${e} out of range [0, ${n})`}/**
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
 */function Ni(t,e){let n=!1,r;for(t<=Mt?(r=t,n=!0):r=Ce(t,Math.floor(Math.sqrt(t)));!n;)r>e||r===t?n=!0:r=Ce(t,r+1);return r}function Oi(t,e,n){const r=[],s=t.length;for(let o=0;o<s;o++)o!==e?r.push(t[o]):r.push(n);return r}function Li(t,e,n,r){const s=e.shape.length,o=t.shape.length;if(r!==0&&(r<-s||r>s))throw new Error(`Expect batchDims in the range of [-${s}, ${s}], but got ${r}`);if(r<0&&(r+=s),r>o)throw new Error(`batchDims (${r}) must be less than rank(x) (
    ${o}).`);if(n<r)throw new Error(`batchDims (${r}) must be less than or equal to axis (${n}).`);for(let f=0;f<r;++f)if(t.shape[f]!==e.shape[f])throw new Error(`x.shape[${f}]: ${t.shape[f]} should be equal to indices.shape[${f}]: ${e.shape[f]}.`);const i=t.shape[n],a=[];let l=1,u=1,d=1;for(let f=0;f<r;++f)a.push(t.shape[f]),l*=t.shape[f];for(let f=r;f<n;f++)a.push(t.shape[f]),u*=t.shape[f];for(let f=r;f<s;f++)a.push(e.shape[f]);for(let f=n+1;f<o;f++)a.push(t.shape[f]),d*=t.shape[f];return{batchSize:l,sliceSize:d,outerSize:u,dimSize:i,outputShape:a}}var Pi=Object.freeze({__proto__:null,collectGatherOpShapeInfo:Li,computeOutShape:Oi,segOpComputeOptimalWindowSize:Ni});/**
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
 */function Dt(t){try{return t.map(e=>Ue(e))}catch(e){throw new Error(`Failed to decode encoded string bytes into utf-8, error: ${e}`)}}function Hn(t){return t.map(e=>ue(e))}var Pu=Object.freeze({__proto__:null,ERF_A1:ni,ERF_A2:ri,ERF_A3:si,ERF_A4:oi,ERF_A5:ii,ERF_P:ti,PARALLELIZE_THRESHOLD:Mt,get RowPartitionType(){return te},SELU_SCALE:ei,SELU_SCALEALPHA:Qo,applyActivation:Po,assertAndGetBroadcastShape:vn,assertAxesAreInnerMostDims:yo,assertParamsConsistent:Uo,assignToTypedArray:hi,axesAreInnerMostDims:vt,calculateShapes:xn,checkEinsumDimSizes:yi,checkPadOnDimRoundingMode:lo,combineLocations:jn,combineRaggedTensorToTensorShapes:Wo,complexWithEvenIndex:ci,complexWithOddIndex:ui,computeConv2DInfo:Ft,computeConv3DInfo:Vn,computeDefaultPad:$t,computeDilation2DInfo:eo,computeOptimalWindowSize:jo,computeOutAndReduceShapes:mo,computeOutShape:Go,computePool2DInfo:to,computePool3DInfo:no,convertConv2DDataFormat:qn,decodeEinsumEquation:mi,eitherStridesOrDilationsAreOne:ao,expandShapeToKeepDim:wo,exponent:gi,exponents:di,fromStringArrayToUint8:Hn,fromUint8ToStringArray:Dt,getAxesPermutation:bo,getBroadcastDims:$n,getComplexWithIndex:fi,getEinsumComputePath:bi,getEinsumPermutation:wi,getFusedBiasGradient:Lo,getFusedDyActivation:Oo,getImageCenter:Ho,getInnerMostAxes:Eo,getPermuted:Zo,getRaggedRank:Vo,getReductionAxes:At,getReshaped:Ko,getReshapedPermuted:Xo,getRowPartitionTypesHelper:zo,getSliceBeginCoords:Yo,getSliceSize:Jo,getSparseFillEmptyRowsIndicesDenseShapeMismatch:ki,getSparseFillEmptyRowsNegativeIndexErrorMessage:Ai,getSparseFillEmptyRowsOutOfRangeIndexErrorMessage:Ti,getSparseReshapeEmptyTensorZeroOutputDimErrorMessage:vi,getSparseReshapeInputOutputMismatchErrorMessage:Di,getSparseReshapeInputOutputMultipleErrorMessage:Mi,getSparseReshapeMultipleNegativeOneOutputDimErrorMessage:Fi,getSparseReshapeNegativeOutputDimErrorMessage:$i,getSparseSegmentReductionIndicesOutOfRangeErrorMessage:Bi,getSparseSegmentReductionNegativeSegmentIdsErrorMessage:xi,getSparseSegmentReductionNonIncreasingSegmentIdsErrorMessage:Ri,getSparseSegmentReductionSegmentIdOutOfRangeErrorMessage:_i,getUndoAxesPermutation:So,isIdentityPermutation:Si,log:Nr,mergeRealAndImagArrays:ai,prepareAndValidate:Mn,prepareSplitSize:Ii,segment_util:Pi,shouldFuse:Co,slice_util:Ys,splitRealAndImagArrays:li,tupleValuesAreOne:mt,upcastType:Et,validateDefaultValueShape:qo,validateInput:Dn,validateUpdateShape:Tt,warn:se});/**
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
 */function Ci(t,e){Array.isArray(t)||(t=[t]),t.forEach(n=>{n!=null&&k(n.dtype!=="complex64",()=>`${e} does not support complex64 tensors in the CPU backend.`)})}/**
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
 */function Cu(t,e,n,r){const s=Ie(n,O(e));if(r&&n!=="string"){let o=0;t.forEach(i=>{const a=O(i.shape);s.set(i.vals,o),o+=a})}else{let o=0;t.forEach(i=>{const a=n==="string"?Dt(i.vals):i.vals;let l=0;for(let u=0;u<i.shape[0];++u){const d=u*e[1]+o;for(let f=0;f<i.shape[1];++f)s[d+f]=a[l++]}o+=i.shape[1]})}return s}/**
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
 */function Uu(t,e,n,r){const s=t===e,o=t<e&&n<0,i=e<t&&n>1;if(s||o||i)return ve(0,r);const a=Math.abs(Math.ceil((e-t)/n)),l=ve(a,r);e<t&&n===1&&(n=-1),l[0]=t;for(let u=1;u<l.length;u++)l[u]=l[u-1]+n;return l}/**
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
 */function Ui(t,e,n,r,s){const o=Gn(r,e,n),i=O(n),a=ge(r);if(o){const f=Wn(e,a);return s==="string"?t.slice(f,f+i):t.subarray(f,f+i)}const l=s==="string"?Dt(t):t,u=dt(r,s,l),d=dt(n,s);for(let f=0;f<d.size;++f){const h=d.indexToLoc(f),g=h.map((y,w)=>y+e[w]);d.set(u.get(...g),...h)}return s==="string"?Hn(d.values):d.values}function Gi(t){const{inputs:e,backend:n,attrs:r}=t,{x:s}=e,{begin:o,size:i}=r;Ci(s,"slice");const[a,l]=zn(s,o,i);Rn(s,a,l);const u=n.data.get(s.dataId).values,d=Ui(u,a,l,s.shape,s.dtype);return n.makeTensorInfo(l,s.dtype,d)}const Gu={kernelName:xr,backendName:"cpu",kernelFunc:Gi};/**
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
 */class Wi{constructor(e,n,r,s,o,i){this.separator=ue(e),this.nGramWidths=n,this.leftPad=ue(r),this.rightPad=ue(s),this.padWidth=o,this.preserveShort=i}getPadWidth(e){return Math.min(this.padWidth<0?e-1:this.padWidth,e-1)}getNumNGrams(e,n){const r=this.getPadWidth(n);return Math.max(0,e+2*r-n+1)}createNGrams(e,n,r,s,o,i){for(let a=0;a<o;++a){const l=this.getPadWidth(i),u=Math.max(0,l-a),d=Math.max(0,l-(o-(a+1))),f=i-(u+d),h=n+(u>0?0:a-l);let g=0;g+=u*this.leftPad.length;for(let A=0;A<f;++A)g+=e[h+A].length;g+=d*this.rightPad.length;const y=u+d+f-1;g+=y*this.separator.length,r[s+a]=new Uint8Array(g);const w=r[s+a];let I=0;const S=A=>A.forEach(b=>w[I++]=b);for(let A=0;A<u;++A)S(this.leftPad),S(this.separator);for(let A=0;A<f-1;++A)S(e[h+A]),S(this.separator);if(f>0){S(e[h+f-1]);for(let A=0;A<d;++A)S(this.separator),S(this.rightPad)}else{for(let A=0;A<d-1;++A)S(this.rightPad),S(this.separator);S(this.rightPad)}}}compute(e,n){const r=e.length,s=n.length;if(s>0){let l=n[0];if(l!==0)throw new Error(`First split value must be 0, got ${l}`);for(let u=1;u<s;++u){let d=n[u]>=l;if(d=d&&n[u]<=r,!d)throw new Error(`Invalid split value ${n[u]}, must be in [${l}, ${r}]`);l=n[u]}if(l!==r)throw new Error(`Last split value must be data size. Expected ${r}, got ${l}`)}const o=s-1,i=Ie("int32",s);if(r===0||s===0){const l=new Array(r);for(let u=0;u<=o;++u)i[u]=0;return[l,i]}i[0]=0;for(let l=1;l<=o;++l){const u=n[l]-n[l-1];let d=0;this.nGramWidths.forEach(f=>{d+=this.getNumNGrams(u,f)}),this.preserveShort&&u>0&&d===0&&(d=1),i[l]=i[l-1]+d}const a=new Array(i[o]);for(let l=0;l<o;++l){const u=n[l];let d=i[l];if(this.nGramWidths.forEach(f=>{const h=n[l+1]-n[l],g=this.getNumNGrams(h,f);this.createNGrams(e,u,a,d,g,f),d+=g}),this.preserveShort&&d===i[l]){const f=n[l+1]-n[l];if(f===0)continue;const h=f+2*this.padWidth;this.createNGrams(e,u,a,d,1,h)}}return[a,i]}}function Wu(t,e,n,r,s,o,i,a){return new Wi(n,r,s,o,i,a).compute(t,e)}/**
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
 */function zi(t,e,n,r){if(!t.length)return;if(e.length===0){for(let o=0;o<t.length;++o)r.push(t.subarray(o,o+1));return}if(e.length===1){const o=e[0];let i=t.indexOf(o);for(;i!==-1;){const a=t.subarray(0,i);(!n||a.length!==0)&&r.push(a),t=t.subarray(i+1),i=t.indexOf(o)}(!n||t.length!==0)&&r.push(t);return}let s=0;for(let o=0;o<t.length+1;o++)if(o===t.length||e.indexOf(t[o])!==-1){const i=t.subarray(s,o);(!n||i.length!==0)&&r.push(i),s=o+1}}function zu(t,e,n){const r=t.length,s=[];let o=0,i=0;const a=new Array(r);for(let h=0;h<r;++h){const g=s.length;zi(t[h],e,n,s);const y=s.length-g;a[h]=y,o+=y,i=Math.max(i,y)}const l=Ie("int32",o*2),u=new Array(o),d=[r,i];let f=0;for(let h=0;h<r;++h)for(let g=0;g<a[h];++g)l[f*2]=h,l[f*2+1]=g,u[f]=s[f],++f;return[l,u,d]}/**
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
 */function Vu(t,e){const n=Ie("int32",t.length);for(let r=0;r<t.length;++r)n[r]=un(t[r]).modulo(e).getLowBitsUnsigned();return n}export{Sa as $,qi as A,Qi as B,ea as C,ta as D,F as E,Lc as F,ra as G,na as H,sa as I,ia as J,aa as K,oa as L,la as M,ca as N,ua as O,ha as P,fa as Q,rn as R,da as S,Q as T,ga as U,kr as V,pa as W,ma as X,wa as Y,ya as Z,ba as _,k as a,Al as a$,Ea as a0,Ia as a1,ka as a2,Aa as a3,$a as a4,Ta as a5,Fa as a6,Vi as a7,va as a8,Ma as a9,Ya as aA,Qa as aB,el as aC,tl as aD,sn as aE,nl as aF,rl as aG,sl as aH,ol as aI,Yn as aJ,wl as aK,yl as aL,Tr as aM,il as aN,al as aO,ll as aP,cl as aQ,ul as aR,pl as aS,fl as aT,hl as aU,dl as aV,gl as aW,ml as aX,bl as aY,El as aZ,kl as a_,Da as aa,xa as ab,Ra as ac,_a as ad,Ba as ae,Oa as af,Na as ag,tn as ah,Pa as ai,Ar as aj,Ca as ak,mr as al,Ga as am,Ua as an,Wa as ao,za as ap,Va as aq,qa as ar,ja as as,Ha as at,Ka as au,Za as av,Xa as aw,Uc as ax,Gc as ay,Ja as az,Fn as b,Br as b$,Il as b0,Tl as b1,Sl as b2,Fl as b3,$l as b4,vl as b5,Ml as b6,Dl as b7,xl as b8,Fr as b9,Zl as bA,Xl as bB,Ql as bC,Pc as bD,ec as bE,tc as bF,nc as bG,rc as bH,sc as bI,oc as bJ,Rr as bK,lc as bL,ic as bM,ac as bN,xr as bO,dc as bP,cc as bQ,fc as bR,gc as bS,pc as bT,mc as bU,wc as bV,yc as bW,hc as bX,uc as bY,Sc as bZ,bc as b_,Rl as ba,Bl as bb,Nl as bc,Ol as bd,_l as be,gs as bf,Pl as bg,Ll as bh,Cl as bi,Ul as bj,Gl as bk,Wl as bl,$r as bm,zl as bn,Vl as bo,ql as bp,jl as bq,Lt as br,Hl as bs,La as bt,Kl as bu,vr as bv,Dr as bw,Mr as bx,Yl as by,Jl as bz,U as c,Zc as c$,Ec as c0,Ic as c1,kc as c2,Ac as c3,Tc as c4,_r as c5,Fc as c6,$c as c7,ts as c8,vc as c9,Mu as cA,Du as cB,Nu as cC,$u as cD,_t as cE,nt as cF,ku as cG,To as cH,bu as cI,Qs as cJ,$o as cK,zs as cL,Su as cM,Fu as cN,xu as cO,Wc as cP,Or as cQ,xo as cR,_o as cS,vu as cT,Ou as cU,_u as cV,ho as cW,Ys as cX,No as cY,ko as cZ,Kc as c_,Mc as ca,Dc as cb,xc as cc,Rc as cd,_c as ce,Bc as cf,Nc as cg,st as ch,Oc as ci,Cc as cj,Ru as ck,Pu as cl,Bu as cm,dt as cn,Ws as co,ms as cp,qc as cq,mu as cr,Xc as cs,pu as ct,Iu as cu,wu as cv,po as cw,gu as cx,du as cy,yu as cz,ue as d,eu as d$,Au as d0,Vc as d1,zc as d2,Et as d3,Hc as d4,vn as d5,Ht as d6,bo as d7,Eo as d8,yo as d9,Ho as dA,xn as dB,Ti as dC,Ai as dD,ki as dE,Di as dF,Mi as dG,$i as dH,Fi as dI,vi as dJ,xi as dK,Bi as dL,_i as dM,Ri as dN,Ii as dO,Zs as dP,Hs as dQ,Wu as dR,zu as dS,Vu as dT,Lu as dU,jc as dV,Lr as dW,De as dX,et as dY,Pr as dZ,ru as d_,mo as da,wo as db,to as dc,cr as dd,zn as de,Gn as df,ge as dg,Wn as dh,Ui as di,Ko as dj,Zo as dk,Xo as dl,Yo as dm,Jo as dn,Uo as dp,Go as dq,Cu as dr,Hn as ds,qn as dt,Ft as du,So as dv,Mn as dw,Li as dx,jt as dy,Uu as dz,$ as e,Le as e$,tu as e0,B as e1,nu as e2,yn as e3,Ut as e4,Qc as e5,su as e6,fu as e7,Jc as e8,lu as e9,At as eA,Qo as eB,ei as eC,ss as eD,Jt as eE,qt as eF,we as eG,yt as eH,It as eI,as as eJ,se as eK,ai as eL,Ue as eM,Ci as eN,$n as eO,pr as eP,gr as eQ,hr as eR,je as eS,Dt as eT,Ie as eU,qr as eV,zo as eW,Vo as eX,te as eY,qo as eZ,Wo as e_,Es as ea,au as eb,cu as ec,hu as ed,iu as ee,ou as ef,uu as eg,hn as eh,rr as ei,ws as ej,ao as ek,lo as el,Yc as em,Pe as en,tt as eo,ve as ep,en as eq,ur as er,is as es,Dn as et,fr as eu,Co as ev,Po as ew,Oo as ex,mt as ey,Lo as ez,mn as f,no as f0,Gi as f1,Vn as f2,eo as f3,dr as f4,mi as f5,yi as f6,bi as f7,wi as f8,Si as f9,Ni as fA,ii as fa,oi as fb,si as fc,ri as fd,ni as fe,ti as ff,fi as fg,li as fh,ci as fi,ui as fj,di as fk,hi as fl,gi as fm,qe as fn,$e as fo,Gu as fp,ir as fq,Qn as fr,Fe as fs,ds as ft,lr as fu,er as fv,pn as fw,jo as fx,Rn as fy,Oi as fz,Rt as g,ze as h,Ve as i,re as j,xe as k,Eu as l,Hr as m,Tu as n,X as o,ji as p,Hi as q,uo as r,O as s,Ye as t,Ir as u,Ki as v,Zi as w,Xi as x,Yi as y,Ji as z};
